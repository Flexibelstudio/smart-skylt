// functions/index.js
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { GoogleGenAI, Type, Modality } = require("@google/genai");

admin.initializeApp();
const db = admin.firestore();

/* --------------------------- Hjälpfunktioner --------------------------- */

// Konverterar olika typer (Timestamp, Date, ISO-sträng, ms-number) till giltig Date eller null
function toDateSafe(value) {
  if (!value) return null; // null/undefined/""
  try {
    // Firestore Timestamp?
    if (typeof value === "object" && typeof value.toDate === "function") {
      const d = value.toDate();
      return isFinite(d.getTime()) ? d : null;
    }
    // Redan Date?
    if (value instanceof Date) {
      return isFinite(value.getTime()) ? value : null;
    }
    // Sträng eller nummer
    const d = new Date(value);
    return isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

// Validerar "HH:mm" → {hour, minute} eller null
function parseTimeHM(hhmm) {
  if (typeof hhmm !== "string") return null;
  const m = hhmm.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

// Weekday-mappning för "en-US" + weekday:"short"
const WEEKDAY_MAP = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Safear Intl.formatToParts för ett visst Date + tidszon.
// Returnerar ett parts-objekt {year, month, day, hour, minute, weekdayNum?, rawWeekday?} eller null vid fel.
function getPartsInTz(date, timeZone, includeWeekday = false) {
  const fmtOpts = {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  };
  if (includeWeekday) fmtOpts.weekday = "short"; // <- giltigt ("long"|"short"|"narrow")
  try {
    const partsArr = new Intl.DateTimeFormat("en-US", fmtOpts).formatToParts(date);
    const parts = partsArr.reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
    const out = {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
    };
    if (includeWeekday) {
      out.rawWeekday = parts.weekday;
      out.weekdayNum = WEEKDAY_MAP[parts.weekday] ?? null; // 1..7
    }
    if (
      !isFinite(out.year) ||
      !isFinite(out.month) ||
      !isFinite(out.day) ||
      !isFinite(out.hour) ||
      !isFinite(out.minute)
    ) {
      return null;
    }
    if (includeWeekday && out.weekdayNum == null) {
      return null;
    }
    return out;
  } catch {
    return null;
  }
}

// Normaliserar en tidszon-sträng (fallback till Europe/Stockholm om ogiltig)
function normalizeTimeZone(tz) {
  try {
    // Testa format för att trigga ev. RangeError
    new Intl.DateTimeFormat("en-US", { timeZone: tz || "Europe/Stockholm" });
    return tz || "Europe/Stockholm";
  } catch {
    return "Europe/Stockholm";
  }
}

/* --------------------------- Testfunktion --------------------------- */

exports.testFunction = onCall((request) => {
  console.log(
    "Test function called by:",
    request.auth ? request.auth.uid : "unauthenticated user"
  );
  return {
    message: "Hej från molnet! Kopplingen fungerar.",
    timestamp: new Date().toISOString(),
  };
});

/* ------------------------ Användar–inbjudan ------------------------ */

exports.inviteUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Du måste vara inloggad för att lägga till användare."
    );
  }
  const { organizationId, email } = request.data;
  if (!organizationId || !email) {
    throw new HttpsError(
      "invalid-argument",
      "Saknar nödvändig information (organisation eller e-post)."
    );
  }

  try {
    const existingUsers = await db
      .collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();
    if (!existingUsers.empty) {
      throw new HttpsError("already-exists", "Denna administratör finns redan.");
    }

    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        userRecord = await admin.auth().createUser({
          email,
          emailVerified: false,
        });
      } else {
        throw error;
      }
    }

    await db.collection("users").doc(userRecord.uid).set({
      email,
      organizationId,
      role: "organizationadmin",
      adminRole: "admin",
    });

    return { success: true, message: "Administratören har lagts till." };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error.code && String(error.code).startsWith("auth/")) {
      throw new HttpsError("invalid-argument", "Ogiltig e-postadress.");
    }
    console.error("Error in inviteUser function:", error);
    throw new HttpsError(
      "internal",
      "Ett oväntat fel inträffade. Försök igen."
    );
  }
});

/* -------------------- AI Automation Scheduler -------------------- */

exports.runAiAutomations = onSchedule(
  {
    schedule: "every 15 minutes",
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (event) => {
    // Toppnivå try/catch för att förhindra total krasch
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      // event.time är ISO-string i v2, men säkra ändå:
      const now = toDateSafe(event.time) || new Date();
      const lastCheckTime = new Date(now.getTime() - 15 * 60 * 1000);
      console.log(
        `[Scheduler] Running AI Automations check at ${now.toISOString()}`
      );

      const orgsSnapshot = await db.collection("organizations").get();
      if (orgsSnapshot.empty) {
        console.log("[Scheduler] No organizations found.");
        return;
      }

      const promises = orgsSnapshot.docs.map(async (orgDoc) => {
        const org = orgDoc.data() || {};
        org.id = org.id || orgDoc.id;

        const automations = Array.isArray(org.aiAutomations)
          ? org.aiAutomations
          : [];

        if (automations.length === 0) return;

        let hasChanges = false;
        const newSuggestions = [];
        // Gör en djupkopia för att kunna mutera säkert
        const updatedAutomations = JSON.parse(JSON.stringify(automations));

        for (const automation of updatedAutomations) {
          // Grundläggande validering
          if (!automation || automation.isEnabled === false) {
            console.log(
              `[Automation: ${automation?.id || "no-id"}] Skipping: Disabled/invalid object.`
            );
            continue;
          }

          const tz = normalizeTimeZone(automation.timezone);
          const t = parseTimeHM(automation.timeOfDay);
          if (!t) {
            console.log(
              `[Automation: ${automation.id}] Skipping: Invalid timeOfDay "${automation.timeOfDay}".`
            );
            continue;
          }

          // Hämta "nu" och "senaste koll" i den valda tidszonen
          const nowParts = getPartsInTz(now, tz, true); // include weekday
          const lastCheckParts = getPartsInTz(lastCheckTime, tz, false);

          if (!nowParts || !lastCheckParts) {
            console.log(
              `[Automation: ${automation.id}] Skipping: Could not get TZ parts (tz="${tz}").`
            );
            continue;
          }

          const nowMinutes = nowParts.hour * 60 + nowParts.minute;
          const lastCheckMinutes = lastCheckParts.hour * 60 + lastCheckParts.minute;
          const scheduledMinutes = t.hour * 60 + t.minute;

          const dayRolledOver =
            nowParts.day !== lastCheckParts.day ||
            nowParts.month !== lastCheckParts.month ||
            nowParts.year !== lastCheckParts.year;

          // Fönster: har scheduledMinutes infallit någon gång mellan lastCheck och now i samma TZ?
          let timeMatched = false;
          if (dayRolledOver) {
            // Över midnatt i TZ: kör om tiden låg efter lastCheck eller upp till now
            timeMatched =
              scheduledMinutes > lastCheckMinutes ||
              scheduledMinutes <= nowMinutes;
          } else {
            timeMatched =
              scheduledMinutes > lastCheckMinutes &&
              scheduledMinutes <= nowMinutes;
          }
          if (!timeMatched) {
            console.log(
              `[Automation: ${automation.id}] Skipping: Time (${automation.timeOfDay} ${tz}) not in the 15-min window.`
            );
            continue;
          }

          // Frekvenskontroll
          const weekday = nowParts.weekdayNum; // 1..7
          const dayOfMonth = nowParts.day;
          let frequencyMatched = false;
          switch (automation.frequency) {
            case "daily":
              frequencyMatched = true;
              break;
            case "weekly":
              if (weekday === Number(automation.dayOfWeek)) frequencyMatched = true;
              break;
            case "monthly":
              if (dayOfMonth === Number(automation.dayOfMonth))
                frequencyMatched = true;
              break;
            default:
              console.log(
                `[Automation: ${automation.id}] Skipping: Unknown frequency "${automation.frequency}".`
              );
              break;
          }
          if (!frequencyMatched) {
            console.log(
              `[Automation: ${automation.id}] Skipping: Frequency did not match.`
            );
            continue;
          }

          // lastRunAt – får aldrig krascha om fältet är "", null, osv.
          const lastRun = toDateSafe(automation.lastRunAt);
          if (automation.lastRunAt && !lastRun) {
            console.log(
              `[Automation: ${automation.id}] Found invalid lastRunAt, treating as never run:`,
              automation.lastRunAt
            );
          }

          if (lastRun) {
            const lastRunParts = getPartsInTz(lastRun, tz, false);
            if (!lastRunParts) {
              console.log(
                `[Automation: ${automation.id}] Skipping: Could not get TZ parts for lastRunAt.`
              );
              continue;
            }
            // Har vi redan kört idag i TZ?
            const alreadyToday =
              lastRunParts.year === nowParts.year &&
              lastRunParts.month === nowParts.month &&
              lastRunParts.day === nowParts.day;
            if (alreadyToday) {
              console.log(
                `[Automation: ${automation.id}] Skipping: Already ran today in ${tz}.`
              );
              continue;
            }
          }

          console.log(
            `[Automation: ${automation.id}] TRIGGERED. Generating content for "${automation.name}" in org "${org.name}"`
          );

          try {
            // Bygg feedback-kontekst
            const history = (org.suggestedPosts || [])
              .filter((p) => p.automationId === automation.id)
              .slice(-10);

            const approved = history.filter(
              (p) => p.status === "approved" || p.status === "edited-and-published"
            );
            const rejected = history.filter((p) => p.status === "rejected");

            let feedbackContext = "No feedback history available yet.";
            if (approved.length > 0 || rejected.length > 0) {
              feedbackContext = `Here is a summary of the user's feedback on previous suggestions for this automation:\n`;
              if (approved.length > 0) {
                feedbackContext += `- The user LIKED and APPROVED these (emulate this style):\n${approved
                  .map((p) => `  - Headline: "${p.postData.headline}"`)
                  .join("\n")}\n`;
              }
              if (rejected.length > 0) {
                feedbackContext += `- The user DISLIKED and REJECTED these (avoid this style):\n${rejected
                  .map((p) => `  - Headline: "${p.postData.headline}"`)
                  .join("\n")}\n`;
              }
            }

            const styleProfileContext = org.styleProfile?.summary
              ? `User's style profile:\n---\n${org.styleProfile.summary}\n---\n`
              : "";

            const prompt = `You are an expert creative director for "${org.name}", a company in the ${
              Array.isArray(org.businessType)
                ? org.businessType.join(", ")
                : String(org.businessType || "")
            } sector.

**Creative Brief**
- Automation Topic: "${automation.topic}"
- Branding: Primary color is ${org.primaryColor}. Use a professional but engaging tone.
- Style Profile: ${styleProfileContext}
- Feedback History: ${feedbackContext}

**Your Task**
Based on all the information above, generate a complete post. Pay close attention to the feedback history to tailor the suggestion to the user's preferences.
Respond ONLY with a JSON object inside a markdown code block (\`\`\`json ... \`\`\`).
The JSON object must contain:
1. 'headline': A short, powerful headline in SWEDISH.
2. 'body': A short body text in SWEDISH.
3. 'imagePrompt': A detailed, creative prompt in ENGLISH for an AI image generator to create a matching, high-quality visual. This should reflect the feedback and style profile. If the layout is 'text-only', this can be an empty string.
4. 'layout': Choose the best layout from 'text-only', 'image-fullscreen', 'image-left', 'image-right'.
5. 'backgroundColor': A color keyword ('primary', 'secondary', 'black', 'white') or a hex code.
6. 'textColor': A color keyword ('black', 'white') or a hex code.
7. 'imageOverlayEnabled': A boolean, typically true for 'image-fullscreen'.
8. 'textAlign': 'left', 'center', or 'right'.
9. 'textAnimation': 'none', 'typewriter', 'fade-up-word', 'blur-in'.`;

            const textGenResponse = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: prompt,
            });

            let jsonString = String(textGenResponse.text || "").trim();
            if (jsonString.startsWith("```json")) jsonString = jsonString.slice(7);
            if (jsonString.endsWith("```")) jsonString = jsonString.slice(0, -3);

            let postDetails = {};
            try {
              postDetails = JSON.parse(jsonString);
            } catch (e) {
              console.warn(
                `[Automation: ${automation.id}] Could not parse AI JSON. Skipping this run.`,
                e?.message || e
              );
              continue;
            }

            const targetScreenIds = Array.isArray(automation.targetScreenIds)
              ? automation.targetScreenIds
              : [];
            const displayScreens = Array.isArray(org.displayScreens)
              ? org.displayScreens
              : [];

            for (const screenId of targetScreenIds) {
              const screen = displayScreens.find((s) => s.id === screenId);
              if (!screen) {
                console.log(
                  `[Automation: ${automation.id}] Skipping screen ${screenId}: Not found.`
                );
                continue;
              }

              let imageUrl;
              if (postDetails.layout !== "text-only" && postDetails.imagePrompt) {
                try {
                  const imageResponse = await ai.models.generateImages({
                    model: "imagen-4.0-generate-001",
                    prompt: postDetails.imagePrompt,
                    config: {
                      numberOfImages: 1,
                      outputMimeType: "image/jpeg",
                      aspectRatio: screen.aspectRatio,
                    },
                  });
                  if (
                    imageResponse.generatedImages &&
                    imageResponse.generatedImages.length > 0
                  ) {
                    imageUrl = `data:image/jpeg;base64,${imageResponse.generatedImages[0].image.imageBytes}`;
                  }
                } catch (imgErr) {
                  console.warn(
                    `[Automation: ${automation.id}] Image generation failed; proceeding with text-only.`,
                    imgErr?.message || imgErr
                  );
                }
              }

              const newPostData = {
                id: `sugg-post-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
                internalTitle: `AI: ${postDetails.headline || "Förslag"}`,
                headline: postDetails.headline || "",
                body: postDetails.body || "",
                layout: postDetails.layout || "text-only",
                durationSeconds: 15,
                backgroundColor: postDetails.backgroundColor || "primary",
                textColor: postDetails.textColor || "white",
                imageOverlayEnabled: !!postDetails.imageOverlayEnabled,
                textAlign: postDetails.textAlign || "center",
                textAnimation: postDetails.textAnimation || "none",
                imageUrl: imageUrl,
                isAiGeneratedImage: !!imageUrl,
              };

              newSuggestions.push({
                id: `sugg-${Date.now()}-${Math.random()}`,
                automationId: automation.id,
                targetScreenId: screenId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                status: "pending",
                postData: newPostData,
              });
            }

            // Obs: eftersom aiAutomations är en array i org-dokumentet kan vi inte använda serverTimestamp() direkt i array-objekt.
            // Vi lagrar ISO-sträng – vår parsning hanterar detta säkert.
            automation.lastRunAt = now.toISOString();
            hasChanges = true;
          } catch (err) {
            console.error(
              `[Automation: ${automation.id}] CRITICAL ERROR during generation for org ${org.id}:`,
              err
            );
          }
        }

        if (hasChanges) {
          console.log(
            `[Org: ${org.id}] Updating Firestore with ${newSuggestions.length} new suggestion(s).`
          );
          try {
            const updatePayload = {
              aiAutomations: updatedAutomations,
              suggestedPosts: admin.firestore.FieldValue.arrayUnion(
                ...newSuggestions
              ),
            };
            await db.collection("organizations").doc(org.id).update(updatePayload);
            console.log(`[Org: ${org.id}] Firestore updated successfully.`);
          } catch (updateError) {
            console.error(
              `[Org: ${org.id}] FAILED to update Firestore:`,
              updateError
            );
          }
        }
      });

      await Promise.all(promises);
      console.log("[Scheduler] AI Automations check finished.");
    } catch (err) {
      // Viktigt: svälj felet här så att Cloud Scheduler inte dör
      console.error("runAiAutomations top-level error:", err);
    }
  }
);

/* ------------------ Media–cleanup när post tas bort ------------------ */

exports.cleanupDeletedPostMedia = onDocumentDeleted(
  "organizations/{organizationId}/displayScreens/{screenId}/posts/{postId}",
  async (event) => {
    const post = event.data?.data?.();
    if (!post) {
      console.log(`No data for deleted post ${event.params.postId}.`);
      return null;
    }

    console.log(
      `Post ${event.params.postId} deleted from org ${event.params.organizationId}. Cleaning up media...`
    );

    const storage = admin.storage();
    const bucket = storage.bucket();
    const deletionPromises = [];

    const urls = new Set();
    if (post.imageUrl) urls.add(post.imageUrl);
    if (post.videoUrl) urls.add(post.videoUrl);
    if (post.backgroundVideoUrl) urls.add(post.backgroundVideoUrl);
    if (post.subImages)
      post.subImages.forEach((si) => si?.imageUrl && urls.add(si.imageUrl));
    if (post.collageItems) {
      post.collageItems.forEach((ci) => {
        if (ci?.imageUrl) urls.add(ci.imageUrl);
        if (ci?.videoUrl) urls.add(ci.videoUrl);
      });
    }

    urls.forEach((url) => {
      if (typeof url === "string" && url.includes("firebasestorage.googleapis.com")) {
        const pathRegex = /o\/(.+)\?alt=media/;
        const match = url.match(pathRegex);
        if (match && match[1]) {
          const filePath = decodeURIComponent(match[1]);
          console.log(`Queueing for deletion: ${filePath}`);
          const file = bucket.file(filePath);
          deletionPromises.push(
            file.delete().catch((err) => {
              if (err.code !== 404) {
                console.error(`Failed to delete ${filePath}:`, err.message);
              }
            })
          );
        }
      }
    });

    await Promise.all(deletionPromises);
    console.log(
      `Cleanup complete. Attempted to delete ${deletionPromises.length} files.`
    );
    return { message: `Cleaned up media for post.` };
  }
);

/* ------------------------- (Tillfälligt av) IG ------------------------- */
/*
// Se din originalfil – oförändrat, bara kommenterat.
*/

/* ----------------------------- Gemini proxy ----------------------------- */

exports.gemini = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to use the AI service."
      );
    }

    const { action, params } = request.data;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("CRITICAL: Gemini API Key secret is not available.");
      throw new HttpsError("internal", "AI service is not configured correctly.");
    }

    const ai = new GoogleGenAI({ apiKey });
    console.log(`Received Gemini call for action: ${action}`);

    try {
      switch (action) {
        case "formatPageWithAI": {
          const { rawContent } = params;
          const prompt = `You are a world-class digital content designer... Raw text to transform: --- ${rawContent} ---`;
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
          });
          return response.text;
        }

        case "generatePageContentFromPrompt": {
          const { userPrompt } = params;
          const prompt = `You are a world-class digital content designer... The user's idea/prompt is: --- ${userPrompt} ---`;
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
          });
          return response.text;
        }

        case "generateDisplayPostContent": {
          const { userPrompt, organizationName } = params;
          const prompt = `You are an expert copywriter for "${organizationName}". The user's idea is: --- ${userPrompt} ---`;
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  headline: { type: Type.STRING },
                  body: { type: Type.STRING },
                },
                required: ["headline", "body"],
              },
            },
          });
          return JSON.parse(String(response.text || "").trim());
        }

        case "generateCompletePost": {
          const { userPrompt, organizationName, aspectRatio } = params;

          const textGenResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents:
              `Du är en expert på marknadsföring och copywriting för "${organizationName}". ` +
              `Idé: "${userPrompt}". Svara med JSON {headline, body, imagePrompt (SVENSKA)}.`,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  headline: { type: Type.STRING },
                  body: { type: Type.STRING },
                  imagePrompt: { type: Type.STRING },
                },
                required: ["headline", "body", "imagePrompt"],
              },
            },
          });

          const content = JSON.parse(String(textGenResponse.text || "").trim());

          const imageResponse = await ai.models.generateImages({
            model: "imagen-4.0-generate-001",
            prompt: content.imagePrompt,
            config: {
              numberOfImages: 1,
              outputMimeType: "image/jpeg",
              aspectRatio,
            },
          });

          if (
            !imageResponse.generatedImages ||
            imageResponse.generatedImages.length === 0
          ) {
            throw new HttpsError("not-found", "AI:n kunde inte generera en bild.");
          }

          const imageUrl = `data:image/jpeg;base64,${imageResponse.generatedImages[0].image.imageBytes}`;
          return { headline: content.headline, body: content.body, imageUrl };
        }

        case "generateHeadlineSuggestions": {
          const { body, existingHeadlines } = params;
          const prompt =
            `You are an expert copywriter. Body: --- ${body} --- ` +
            (existingHeadlines?.length
              ? `Avoid these: "${existingHeadlines.join('", "')}".`
              : "");
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  headlines: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ["headlines"],
              },
            },
          });
          const content = JSON.parse(String(response.text || "").trim());
          return content.headlines;
        }

        case "refineDisplayPostContent": {
          const { content, command } = params;
          const commandDescription =
            {
              shorter: "Gör den mer koncis",
              more_formal: "Använd en mer formell ton",
              add_emojis: "Lägg till passande emojis",
              more_casual: "Använd en mer avslappnad ton",
            }[command] || "Förbättra texten";

          const prompt =
            `You are an expert copywriter. Current content: ` +
            `Headline: "${content.headline}", Body: "${content.body}". ` +
            `Command: ${commandDescription}`;

          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  headline: { type: Type.STRING },
                  body: { type: Type.STRING },
                },
                required: ["headline", "body"],
              },
            },
          });
          return JSON.parse(String(response.text || "").trim());
        }

        case "generateDisplayPostImage": {
          const { prompt, aspectRatio } = params;
          const apiPrompt =
            `Create a high-quality, professional marketing image. Idea: "${prompt}"`;
          const response = await ai.models.generateImages({
            model: "imagen-4.0-generate-001",
            prompt: apiPrompt,
            config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio },
          });

          if (response.generatedImages && response.generatedImages.length > 0) {
            const base64ImageBytes = response.generatedImages[0].image.imageBytes;
            return `data:image/jpeg;base64,${base64ImageBytes}`;
          }
          throw new HttpsError("not-found", "AI did not generate an image.");
        }

        case "editDisplayPostImage": {
          const { base64ImageData, mimeType, prompt, logo } = params;
          const parts = [{ inlineData: { data: base64ImageData, mimeType } }, { text: prompt }];
          if (logo?.data && logo?.mimeType) {
            parts.push({ inlineData: { data: logo.data, mimeType: logo.mimeType } });
          }
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: { parts },
            config: { responseModalities: [Modality.IMAGE] },
          });
          const cand = response.candidates?.[0]?.content?.parts || [];
          for (const part of cand) {
            if (part.inlineData) {
              return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
          }
          throw new HttpsError("not-found", "AI did not return an edited image.");
        }

        case "generateDisplayPostCampaign": {
          const {
            userPrompt,
            postCount,
            organizationName,
            userMedia,
            businessType,
            businessDescription,
          } = params;

          const prompt =
            `Du är expert på kampanjer för digitala skyltar för "${organizationName}".\n` +
            `Verksamhetstyp: ${Array.isArray(businessType) ? businessType.join(", ") : (businessType || "Ej spec")}\n` +
            `Beskrivning: "${businessDescription || "Ej spec"}".\n` +
            `Mål: "${userPrompt}".\n` +
            `Svara med en JSON-array med ${postCount} objekt: ` +
            `{ internalTitle, headline, body, durationSeconds(10-20), layout['text-only'|'image-fullscreen'|'image-left'|'image-right'], ` +
            `imagePrompt(SVENSKA) eller userMediaIndex (använd ETT av dem).}`;

          const parts = [{ text: prompt }];
          if (Array.isArray(userMedia)) {
            userMedia.forEach((m) => {
              if (m?.data && m?.mimeType) {
                parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } });
              }
            });
          }

          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts },
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    internalTitle: { type: Type.STRING },
                    headline: { type: Type.STRING },
                    body: { type: Type.STRING },
                    durationSeconds: { type: Type.INTEGER },
                    layout: {
                      type: Type.STRING,
                      enum: ["text-only", "image-fullscreen", "image-left", "image-right"],
                    },
                    imagePrompt: { type: Type.STRING },
                    userMediaIndex: { type: Type.INTEGER },
                  },
                  required: ["internalTitle", "headline", "body", "durationSeconds", "layout"],
                },
              },
            },
          });
          return JSON.parse(String(response.text || "").trim());
        }

        case "generateCampaignIdeasForEvent": {
          const { eventName } = params;
          const prompt =
            `You are a creative marketing expert. Generate headline+body ideas for "${eventName}".`;
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { headline: { type: Type.STRING }, body: { type: Type.STRING } },
                  required: ["headline", "body"],
                },
              },
            },
          });
          return JSON.parse(String(response.text || "").trim());
        }

        case "generateVideoFromPrompt": {
          const { prompt, organizationId, image } = params;
          const imagePart = image ? { imageBytes: image.data, mimeType: image.mimeType } : undefined;

          let operation = await ai.models.generateVideos({
            model: "veo-3.1-fast-generate-preview",
            prompt: `En kort, slagkraftig och professionell video för en digital skylt. ${prompt}`,
            image: imagePart,
            config: { numberOfVideos: 1 },
          });

          // Pollning
          while (!operation.done) {
            await new Promise((r) => setTimeout(r, 10000));
            operation = await ai.operations.getVideosOperation({ operation });
          }
          const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
          if (!downloadLink) throw new HttpsError("not-found", "AI:n returnerade ingen video.");

          const videoResponse = await fetch(`${downloadLink}&key=${process.env.GEMINI_API_KEY}`);
          if (!videoResponse.ok) {
            throw new HttpsError(
              "internal",
              `Kunde inte hämta videofilen. Status: ${videoResponse.statusText}`
            );
          }
          const videoBuffer = await videoResponse.arrayBuffer();

          const bucket = admin.storage().bucket();
          const fileName = `organizations/${organizationId}/videos/ai-video-${Date.now()}.mp4`;
          const file = bucket.file(fileName);
          await file.save(Buffer.from(videoBuffer), { metadata: { contentType: "video/mp4" } });
          await file.makePublic();
          return file.publicUrl();
        }

        default:
          throw new HttpsError("invalid-argument", `Unknown AI action: ${action}`);
      }
    } catch (error) {
      console.error(`Error in Gemini function for action "${action}":`, error);
      if (error instanceof HttpsError) throw error;
      const s = String(error || "").toLowerCase();
      if (s.includes("safety")) {
        throw new HttpsError(
          "permission-denied",
          "Försöket blockerades av säkerhetsskäl. Prova en annan text."
        );
      }
      throw new HttpsError("internal", "Ett fel inträffade hos AI-tjänsten.");
    }
  }
);

/* ------------------- Städa bort orphaned media (weekly) ------------------- */

function getPathFromUrl(url) {
  if (!url || !url.includes("firebasestorage.googleapis.com")) return null;
  try {
    const urlObject = new URL(url);
    const pathSegment = urlObject.pathname.split("/o/")[1];
    if (pathSegment) return decodeURIComponent(pathSegment.split("?")[0]);
  } catch (e) {
    console.error(`Could not parse storage URL: ${url}`, e);
  }
  return null;
}

async function cleanupOrg(org) {
  const orgId = org.id;
  const usedPaths = new Set();

  if (org.logoUrlLight) usedPaths.add(getPathFromUrl(org.logoUrlLight));
  if (org.logoUrlDark) usedPaths.add(getPathFromUrl(org.logoUrlDark));

  const mediaLibrarySnapshot = await db
    .collection("organizations")
    .doc(orgId)
    .collection("mediaLibrary")
    .get();
  mediaLibrarySnapshot.forEach((doc) => {
    const item = doc.data();
    if (item.url) usedPaths.add(getPathFromUrl(item.url));
  });

  const displayScreensSnapshot = await db
    .collection("organizations")
    .doc(orgId)
    .collection("displayScreens")
    .get();

  for (const screenDoc of displayScreensSnapshot.docs) {
    const postsSnapshot = await screenDoc.ref.collection("posts").get();
    postsSnapshot.forEach((postDoc) => {
      const post = postDoc.data();
      if (post.imageUrl) usedPaths.add(getPathFromUrl(post.imageUrl));
      if (post.videoUrl) usedPaths.add(getPathFromUrl(post.videoUrl));
      if (post.backgroundVideoUrl) usedPaths.add(getPathFromUrl(post.backgroundVideoUrl));
      (post.subImages || []).forEach((sub) => {
        if (sub?.imageUrl) usedPaths.add(getPathFromUrl(sub.imageUrl));
      });
      (post.collageItems || []).forEach((item) => {
        if (item?.imageUrl) usedPaths.add(getPathFromUrl(item.imageUrl));
        if (item?.videoUrl) usedPaths.add(getPathFromUrl(item.videoUrl));
      });
    });
  }
  usedPaths.delete(null);

  const bucket = admin.storage().bucket();
  const prefixes = [`organizations/${orgId}/images/`, `organizations/${orgId}/videos/`];
  let allFiles = [];
  for (const prefix of prefixes) {
    const [files] = await bucket.getFiles({ prefix });
    allFiles.push(...files);
  }

  const deletionPromises = [];
  const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
  let orphanedCount = 0;

  for (const file of allFiles) {
    if (!usedPaths.has(file.name)) {
      orphanedCount++;
      const [metadata] = await file.getMetadata();
      const timeCreated = new Date(metadata.timeCreated).getTime();
      if (timeCreated < twoDaysAgo) {
        console.log(`[${orgId}] Deleting orphaned file: ${file.name}`);
        deletionPromises.push(file.delete());
      } else {
        console.log(`[${orgId}] Skipping recent orphaned file (grace period): ${file.name}`);
      }
    }
  }

  const results = await Promise.allSettled(deletionPromises);
  const deletedCount = results.filter((r) => r.status === "fulfilled").length;

  console.log(
    `[${org.name}] Cleanup finished. Found ${orphanedCount} potential orphans. Deleted ${deletedCount} files.`
  );
  return deletedCount;
}

exports.cleanupOrphanedMedia = onSchedule(
  {
    schedule: "every sunday 03:00",
    timeZone: "Europe/Stockholm",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    console.log("Starting weekly orphaned media cleanup job.");
    const orgsSnapshot = await db.collection("organizations").get();
    if (orgsSnapshot.empty) {
      console.log("No organizations found to clean up.");
      return null;
    }

    const cleanupPromises = orgsSnapshot.docs.map((doc) =>
      cleanupOrg({ ...doc.data(), id: doc.id })
    );
    const results = await Promise.allSettled(cleanupPromises);

    results.forEach((result, index) => {
      const orgDoc = orgsSnapshot.docs[index];
      const orgName = orgDoc.data().name || orgDoc.id;
      if (result.status === "fulfilled") {
        if (result.value > 0) {
          console.log(
            `Successfully cleaned org "${orgName}". Deleted ${result.value} files.`
          );
        }
      } else {
        console.error(`Failed to clean org "${orgName}":`, result.reason);
      }
    });

    console.log("Weekly orphaned media cleanup job finished.");
    return null;
  }
);

// Manuell test–endpoint för cleanup
exports.testOrphanedMediaCleanup = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be logged in to run this test."
    );
  }
  const { organizationId } = request.data;
  let totalDeleted = 0;
  let message = "";

  if (organizationId) {
    console.log(`Manually running cleanup for single organization: ${organizationId}`);
    const orgDoc = await db.collection("organizations").doc(organizationId).get();
    if (!orgDoc.exists) {
      throw new HttpsError("not-found", `Organization ${organizationId} not found.`);
    }
    totalDeleted = await cleanupOrg({ ...orgDoc.data(), id: orgDoc.id });
    message = `Manual cleanup for "${orgDoc.data().name || orgDoc.id}" finished. Total files deleted: ${totalDeleted}.`;
  } else {
    console.log("Manually running cleanup for ALL organizations.");
    const orgsSnapshot = await db.collection("organizations").get();
    const cleanupPromises = orgsSnapshot.docs.map((doc) =>
      cleanupOrg({ ...doc.data(), id: doc.id })
    );
    const results = await Promise.allSettled(cleanupPromises);
    totalDeleted = results
      .filter((r) => r.status === "fulfilled")
      .reduce((sum, r) => sum + (r.value || 0), 0);
    message = `Manual cleanup for all organizations finished. Total files deleted: ${totalDeleted}.`;
  }

  console.log(message);
  return { message, deletedCount: totalDeleted };
});
