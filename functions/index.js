// functions/index.js
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { GoogleGenAI, Type, Modality } = require("@google/genai");

admin.initializeApp();
const db = admin.firestore();

// --- Engångs-migrering: organizations.displayScreens[] -> subcollection ---
// Anropa via callable: migrateOrgCollections({ dryRun?: boolean, orgId?: string, migrateChannels?: boolean })

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

exports.migrateOrgCollections = onCall(async (request) => {
  // Enkla skydd – anpassa till din auth-modell
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required.");
  }
  // Exempel: kräver custom claim admin === true (ta bort om du inte använder detta)
  if (!(request.auth.token && request.auth.token.admin === true)) {
    // kommentera bort raden nedan om du inte använder admin-claim
    // throw new HttpsError("permission-denied", "Admin only.");
  }

  const { orgId: onlyOrgId, migrateChannels = false, dryRun = false } = request.data || {};

  // Hämta orgs att migrera
  let orgDocs = [];
  if (onlyOrgId) {
    const doc = await db.collection("organizations").doc(onlyOrgId).get();
    if (!doc.exists) throw new HttpsError("not-found", `Organization ${onlyOrgId} not found.`);
    orgDocs = [doc];
  } else {
    const snap = await db.collection("organizations").get();
    orgDocs = snap.docs;
  }

  const results = [];

  for (const orgDoc of orgDocs) {
    const orgId = orgDoc.id;
    const org = orgDoc.data() || {};
    const screensArr = Array.isArray(org.displayScreens) ? org.displayScreens.filter(s => s && s.id) : [];
    const channelsArr = Array.isArray(org.channels) ? org.channels.filter(c => c && c.id) : [];

    let screensMigrated = 0;
    let channelsMigrated = 0;

    // ---- Skärmar -> subcollection displayScreens ----
    if (screensArr.length) {
      const groups = chunk(screensArr, 450); // under batch-limit 500
      for (const group of groups) {
        const batch = db.batch();
        for (const s of group) {
          const ref = db
            .collection("organizations")
            .doc(orgId)
            .collection("displayScreens")
            .doc(String(s.id));
          batch.set(ref, s, { merge: true });
        }
        if (!dryRun) await batch.commit();
        screensMigrated += group.length;
      }
    }

    // ---- (Valfritt) Kanaler -> subcollection channels ----
    if (migrateChannels && channelsArr.length) {
      const groups = chunk(channelsArr, 450);
      for (const group of groups) {
        const batch = db.batch();
        for (const c of group) {
          const ref = db
            .collection("organizations")
            .doc(orgId)
            .collection("channels")
            .doc(String(c.id));
          batch.set(ref, c, { merge: true });
        }
        if (!dryRun) await batch.commit();
        channelsMigrated += group.length;
      }
    }

    results.push({
      orgId,
      screensMigrated,
      ...(migrateChannels ? { channelsMigrated } : {}),
    });

    console.log(
      `[migrateOrgCollections] ${orgId}: screens=${screensMigrated}` +
        (migrateChannels ? `, channels=${channelsMigrated}` : "")
    );
  }

  return {
    dryRun,
    organizations: results,
    message: dryRun ? "Dry-run klart. Inga writes gjordes." : "Migrering klar.",
  };
});


/* ------------------------------------------------------------------ */
/*                            Hjälpfunktioner                          */
/* ------------------------------------------------------------------ */

// Konverterar Timestamp/Date/ISO/ms till giltig Date, annars null
function toDateSafe(value) {
  if (!value) return null; // null/undefined/""/0
  try {
    if (typeof value === "object" && value !== null && "toDate" in value) {
      const d = value.toDate();
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (value instanceof Date) {
      return Number.isFinite(value.getTime()) ? value : null;
    }
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
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

// Returnerar {year, month, day, hour, minute} i given tidszon, eller null
function getPartsInTz(date, timeZone) {
  const fmtOpts = {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  };
  try {
    const arr = new Intl.DateTimeFormat("en-US", fmtOpts).formatToParts(date);
    return arr.reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  } catch (e) {
    console.error("getPartsInTz error for tz", timeZone, e);
    return null;
  }
}

// Veckodag 1..7 (Mon..Sun) i given TZ
function getWeekdayInTzNumber(date, timeZone) {
  try {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
    const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    return map[wd] || null;
  } catch (e) {
    console.error("getWeekdayInTzNumber error for tz", timeZone, e);
    return null;
  }
}

// Normaliserar tidszon (fallback Europe/Stockholm)
function normalizeTimeZone(tz) {
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat("en-US", { timeZone: tz || "Europe/Stockholm" });
    return tz || "Europe/Stockholm";
  } catch {
    return "Europe/Stockholm";
  }
}

/* ------------------------------------------------------------------ */
/*                             Testfunktion                            */
/* ------------------------------------------------------------------ */

exports.testFunction = onCall((request) => {
  console.log("Test function called by:", request.auth ? request.auth.uid : "unauthenticated user");
  return { message: "Hej från molnet! Kopplingen fungerar.", timestamp: new Date().toISOString() };
});

/* ------------------------------------------------------------------ */
/*                         Användar–inbjudan                           */
/* ------------------------------------------------------------------ */

exports.inviteUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Du måste vara inloggad för att lägga till användare.");
  }
  const { organizationId, email } = request.data || {};
  if (!organizationId || !email) {
    throw new HttpsError("invalid-argument", "Saknar nödvändig information (organisation eller e-post).");
  }

  try {
    const existing = await db.collection("users").where("email", "==", email).limit(1).get();
    if (!existing.empty) {
      throw new HttpsError("already-exists", "Denna administratör finns redan.");
    }

    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (err) {
      if (err && err.code === "auth/user-not-found") {
        userRecord = await admin.auth().createUser({ email, emailVerified: false });
      } else {
        throw err;
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
    if (error && error.code && String(error.code).startsWith("auth/")) {
      throw new HttpsError("invalid-argument", "Ogiltig e-postadress.");
    }
    console.error("Error in inviteUser:", error);
    throw new HttpsError("internal", "Ett oväntat fel inträffade. Försök igen.");
  }
});

/* ------------------------------------------------------------------ */
/*                     AI Automation – Scheduler v2                    */
/* ------------------------------------------------------------------ */

exports.runAiAutomations = onSchedule(
  {
    schedule: "every 15 minutes",
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (event) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const now = toDateSafe(event && event.time) || new Date();
      const lastCheck = new Date(now.getTime() - 15 * 60 * 1000);
      console.log(`[Scheduler] Running AI Automations check at ${now.toISOString()}`);

      const orgs = await db.collection("organizations").get();
      if (orgs.empty) {
        console.log("[Scheduler] No organizations found.");
        return;
      }

      const perOrg = orgs.docs.map(async (orgDoc) => {
        const org = orgDoc.data() || {};
        const orgId = orgDoc.id;
        const orgName = org.name || orgId;

        const automations = Array.isArray(org.aiAutomations) ? org.aiAutomations : [];
        if (automations.length === 0) return;

        // --------------------------------------------------------------
        // HÄMTA SKÄRMAR (stöder både subcollection och array-fält)
        // --------------------------------------------------------------
        let displayScreens = [];

        // 1) Försök subcollection: organizations/{orgId}/displayScreens
        try {
          const screensSnap = await db
            .collection("organizations")
            .doc(orgId)
            .collection("displayScreens")
            .get();

          displayScreens = screensSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {
          console.warn(`[Org: ${orgId}] Could not read subcollection displayScreens:`, e);
        }

        // 2) Fallback till array-fält på org-dokumentet (nuvarande struktur)
        if (Array.isArray(org.displayScreens)) {
          const fromArray = org.displayScreens
            .filter((s) => s && s.id)
            .map((s) => ({ ...s }));

          // slå ihop utan dubbletter (prioritera subcollection om båda finns)
          const byId = new Map(displayScreens.map((s) => [s.id, s]));
          for (const s of fromArray) {
            if (!byId.has(s.id)) byId.set(s.id, s);
          }
          displayScreens = Array.from(byId.values());
        }

        if (displayScreens.length === 0) {
          console.log(`[Org: ${orgId}] No display screens found (subcollection or array).`);
        }
        // --------------------------------------------------------------

        let hasChanges = false;
        const newSuggestions = [];
        const updatedAutomations = JSON.parse(JSON.stringify(automations));

        for (const automation of updatedAutomations) {
          if (!automation || automation.isEnabled === false) {
            console.log(`[Automation: ${automation?.id || "no-id"}] Skipping: Disabled/invalid.`);
            continue;
          }

          const tz = normalizeTimeZone(automation.timezone);
          const parsed = parseTimeHM(automation.timeOfDay);
          if (!parsed) {
            console.log(`[Automation: ${automation.id}] Skipping: Invalid timeOfDay "${automation.timeOfDay}".`);
            continue;
          }

          const nowParts = getPartsInTz(now, tz);
          const lastCheckParts = getPartsInTz(lastCheck, tz);
          if (!nowParts || !lastCheckParts) {
            console.log(`[Automation: ${automation.id}] Skipping: Could not get TZ parts (tz="${tz}").`);
            continue;
          }

          const nowMinutes = Number(nowParts.hour) * 60 + Number(nowParts.minute);
          const lastCheckMinutes = Number(lastCheckParts.hour) * 60 + Number(lastCheckParts.minute);
          const scheduledMinutes = parsed.hour * 60 + parsed.minute;

          const dayRolledOver =
            nowParts.day !== lastCheckParts.day ||
            nowParts.month !== lastCheckParts.month ||
            nowParts.year !== lastCheckParts.year;

          let timeMatched = false;
          if (dayRolledOver) {
            timeMatched = scheduledMinutes > lastCheckMinutes || scheduledMinutes <= nowMinutes;
          } else {
            timeMatched = scheduledMinutes > lastCheckMinutes && scheduledMinutes <= nowMinutes;
          }
          if (!timeMatched) {
            console.log(
              `[Automation: ${automation.id}] Skipping: Time (${automation.timeOfDay} ${tz}) not in the 15-min window.`
            );
            continue;
          }

          // Frekvenskontroll
          const weekday = getWeekdayInTzNumber(now, tz); // 1..7
          const dayOfMonth = Number(nowParts.day);
          if (!weekday) {
            console.log(`[Automation: ${automation.id}] Skipping: Could not resolve weekday in "${tz}".`);
            continue;
          }

          let frequencyMatched = false;
          switch (automation.frequency) {
            case "daily":
              frequencyMatched = true;
              break;
            case "weekly":
              frequencyMatched = weekday === Number(automation.dayOfWeek);
              break;
            case "monthly":
              frequencyMatched = dayOfMonth === Number(automation.dayOfMonth);
              break;
            default:
              console.log(`[Automation: ${automation.id}] Skipping: Unknown frequency "${automation.frequency}".`);
          }
          if (!frequencyMatched) {
            console.log(`[Automation: ${automation.id}] Skipping: Frequency did not match.`);
            continue;
          }

          // lastRunAt – tolerera ogiltiga värden
          const lastRun = toDateSafe(automation.lastRunAt);
          if (automation.lastRunAt && !lastRun) {
            console.log(
              `[Automation: ${automation.id}] Found invalid lastRunAt, treating as never run:`,
              automation.lastRunAt
            );
          }
          if (lastRun) {
            // <<< DEBUG: visa vad backend faktiskt läser och jämför i rätt tidszon
            console.log(`[Automation: ${automation.id}] DEBUG lastRunAt raw:`, automation.lastRunAt);
            const lastRunParts = getPartsInTz(lastRun, tz);
            console.log(
              `[Automation: ${automation.id}] DEBUG compare`,
              JSON.stringify({ tz, nowParts, lastRunParts })
            );
            // >>> END DEBUG

            if (!lastRunParts) {
              console.log(`[Automation: ${automation.id}] Skipping: Could not get TZ parts for lastRunAt.`);
              continue;
            }
            const alreadyToday =
              String(lastRunParts.year) === String(nowParts.year) &&
              String(lastRunParts.month) === String(nowParts.month) &&
              String(lastRunParts.day) === String(nowParts.day);
            if (alreadyToday) {
              console.log(`[Automation: ${automation.id}] Skipping: Already ran today in ${tz}.`);
              continue;
            }
          }

          console.log(
            `[Automation: ${automation.id}] TRIGGERED. Generating content for "${automation.name}" in org "${orgName}"`
          );

          try {
            // Feedback-historik
            const history = (org.suggestedPosts || [])
              .filter((p) => p.automationId === automation.id)
              .slice(-10);
            const approved = history.filter(
              (p) => p.status === "approved" || p.status === "edited-and-published"
            );
            const rejected = history.filter((p) => p.status === "rejected");

            let feedbackContext = "No feedback history available yet.";
            if (approved.length > 0 || rejected.length > 0) {
              feedbackContext =
                `Here is a summary of the user's feedback on previous suggestions for this automation:\n` +
                (approved.length
                  ? `- The user LIKED and APPROVED these (emulate this style):\n${approved
                      .map((p) => `  - Headline: "${p.postData.headline}"`)
                      .join("\n")}\n`
                  : "") +
                (rejected.length
                  ? `- The user DISLIKED and REJECTED these (avoid this style):\n${rejected
                      .map((p) => `  - Headline: "${p.postData.headline}"`)
                      .join("\n")}\n`
                  : "");
            }

            const styleProfileContext = org.styleProfile?.summary
              ? `User's style profile:\n---\n${org.styleProfile.summary}\n---\n`
              : "";

            const prompt = `You are an expert creative director for "${orgName}", a company in the ${
              Array.isArray(org.businessType) ? org.businessType.join(", ") : String(org.businessType || "")
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
1. 'headline' (SWEDISH)
2. 'body' (SWEDISH)
3. 'imagePrompt' (ENGLISH, empty if layout 'text-only')
4. 'layout' in ['text-only','image-fullscreen','image-left','image-right']
5. 'backgroundColor'
6. 'textColor'
7. 'imageOverlayEnabled' (boolean)
8. 'textAlign'
9. 'textAnimation'`;

            const textGen = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: prompt,
            });

            let jsonString = String(textGen.text || "").trim();
            if (jsonString.startsWith("```json")) jsonString = jsonString.slice(7);
            if (jsonString.endsWith("```")) jsonString = jsonString.slice(0, -3);

            let postDetails = {};
            try {
              postDetails = JSON.parse(jsonString);
            } catch (e) {
              console.warn(
                `[Automation: ${automation.id}] Could not parse AI JSON. Skipping this run.`,
                (e && e.message) || e
              );
              continue;
            }

            const targetScreenIds = Array.isArray(automation.targetScreenIds)
              ? automation.targetScreenIds
              : [];

            for (const screenId of targetScreenIds) {
              const screen = displayScreens.find((s) => s.id === screenId);
              if (!screen) {
                console.log(`[Automation: ${automation.id}] Skipping screen ${screenId}: Not found.`);
                continue;
              }

              let imageUrl;
              if (postDetails.layout !== "text-only" && postDetails.imagePrompt) {
                try {
                  const img = await ai.models.generateImages({
                    model: "imagen-4.0-generate-001",
                    prompt: postDetails.imagePrompt,
                    config: {
                      numberOfImages: 1,
                      outputMimeType: "image/jpeg",
                      aspectRatio: screen.aspectRatio,
                    },
                  });
                  if (img.generatedImages && img.generatedImages.length > 0) {
                    imageUrl = `data:image/jpeg;base64,${img.generatedImages[0].image.imageBytes}`;
                  }
                } catch (imgErr) {
                  console.warn(
                    `[Automation: ${automation.id}] Image generation failed; proceeding with text-only.`,
                    (imgErr && imgErr.message) || imgErr
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
                imageUrl,
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

            automation.lastRunAt = now.toISOString();
            hasChanges = true;
          } catch (err) {
            console.error(
              `[Automation: ${automation.id}] CRITICAL ERROR during generation for org ${orgId}:`,
              err
            );
          }
        }

        if (hasChanges) {
          console.log(
            `[Org: ${orgId}] Updating Firestore with ${newSuggestions.length} new suggestion(s).`
          );
          try {
            const updatePayload = { aiAutomations: updatedAutomations };
            if (newSuggestions.length > 0) {
              updatePayload.suggestedPosts = admin.firestore.FieldValue.arrayUnion(...newSuggestions);
            }
            await db.collection("organizations").doc(orgId).update(updatePayload);
            console.log(`[Org: ${orgId}] Firestore updated successfully.`);
          } catch (updateError) {
            console.error(`[Org: ${orgId}] FAILED to update Firestore:`, updateError);
          }
        }
      });

      await Promise.all(perOrg);
      console.log("[Scheduler] AI Automations check finished.");
    } catch (err) {
      console.error("runAiAutomations top-level error:", err);
    }
  }
);

/* ------------------------------------------------------------------ */
/*                Media-cleanup när post tas bort (v2)                 */
/* ------------------------------------------------------------------ */

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
    (post.subImages || []).forEach((si) => si?.imageUrl && urls.add(si.imageUrl));
    (post.collageItems || []).forEach((ci) => {
      if (ci?.imageUrl) urls.add(ci.imageUrl);
      if (ci?.videoUrl) urls.add(ci.videoUrl);
    });

    urls.forEach((url) => {
      if (typeof url === "string" && url.includes("firebasestorage.googleapis.com")) {
        const pathRegex = /o\/(.+)\?alt=media/;
        const match = url.match(pathRegex);
        if (match?.[1]) {
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
    console.log(`Cleanup complete. Attempted to delete ${deletionPromises.length} files.`);
    return { message: `Cleaned up media for post.` };
  }
);

/* ------------------------------------------------------------------ */
/*                              Gemini proxy                           */
/* ------------------------------------------------------------------ */

exports.gemini = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in to use the AI service.");
    }

    const { action, params } = request.data || {};
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
                properties: { headline: { type: Type.STRING }, body: { type: Type.STRING } },
                required: ["headline", "body"],
              },
            },
          });
          return JSON.parse(String(response.text || "").trim());
        }

        case "generateCompletePost": {
          const { userPrompt, organizationName, aspectRatio } = params;

          const textGen = await ai.models.generateContent({
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

          const content = JSON.parse(String(textGen.text || "").trim());

          const imageResponse = await ai.models.generateImages({
            model: "imagen-4.0-generate-001",
            prompt: content.imagePrompt,
            config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio },
          });

          if (!imageResponse.generatedImages || imageResponse.generatedImages.length === 0) {
            throw new HttpsError("not-found", "AI:n kunde inte generera en bild.");
          }

          const imageUrl = `data:image/jpeg;base64,${imageResponse.generatedImages[0].image.imageBytes}`;
          return { headline: content.headline, body: content.body, imageUrl };
        }

        case "generateHeadlineSuggestions": {
          const { body, existingHeadlines } = params;
          const prompt =
            `You are an expert copywriter. Body: --- ${body} --- ` +
            (existingHeadlines && existingHeadlines.length
              ? `Avoid these: "${existingHeadlines.join('", "')}".`
              : "");
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: { headlines: { type: Type.ARRAY, items: { type: Type.STRING } } },
                required: ["headlines"],
              },
            },
          });
          const obj = JSON.parse(String(response.text || "").trim());
          return obj.headlines;
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
                properties: { headline: { type: Type.STRING }, body: { type: Type.STRING } },
                required: ["headline", "body"],
              },
            },
          });
          return JSON.parse(String(response.text || "").trim());
        }

        case "generateDisplayPostImage": {
          const { prompt, aspectRatio } = params;
          const apiPrompt = `Create a high-quality, professional marketing image. Idea: "${prompt}"`;
          const resp = await ai.models.generateImages({
            model: "imagen-4.0-generate-001",
            prompt: apiPrompt,
            config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio },
          });
          if (resp.generatedImages && resp.generatedImages.length > 0) {
            const base64ImageBytes = resp.generatedImages[0].image.imageBytes;
            return `data:image/jpeg;base64,${base64ImageBytes}`;
          }
          throw new HttpsError("not-found", "AI did not generate an image.");
        }

        case "editDisplayPostImage": {
          const { base64ImageData, mimeType, prompt, logo } = params;
          const parts = [{ inlineData: { data: base64ImageData, mimeType } }, { text: prompt }];
          if (logo && logo.data && logo.mimeType) {
            parts.push({ inlineData: { data: logo.data, mimeType: logo.mimeType } });
          }
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: { parts },
            config: { responseModalities: [Modality.IMAGE] },
          });
          const cand =
            (response.candidates &&
              response.candidates[0] &&
              response.candidates[0].content &&
              response.candidates[0].content.parts) ||
            [];
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
            `Verksamhetstyp: ${Array.isArray(businessType) ? businessType.join(", ") : businessType || "Ej spec"}\n` +
            `Beskrivning: "${businessDescription || "Ej spec"}".\n` +
            `Mål: "${userPrompt}".\n` +
            `Svara med en JSON-array med ${postCount} objekt: ` +
            `{ internalTitle, headline, body, durationSeconds(10-20), layout['text-only'|'image-fullscreen'|'image-left'|'image-right'], ` +
            `imagePrompt(SVENSKA) eller userMediaIndex (använd ETT av dem).}`;

          const parts = [{ text: prompt }];
          if (Array.isArray(userMedia)) {
            userMedia.forEach((m) => {
              if (m && m.data && m.mimeType) {
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
          const prompt = `You are a creative marketing expert. Generate headline+body ideas for "${eventName}".`;
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

          while (!operation.done) {
            await new Promise((r) => setTimeout(r, 10000));
            operation = await ai.operations.getVideosOperation({ operation });
          }
          const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
          if (!downloadLink) throw new HttpsError("not-found", "AI:n returnerade ingen video.");

          const videoResponse = await fetch(`${downloadLink}&key=${process.env.GEMINI_API_KEY}`);
          if (!videoResponse.ok) {
            throw new HttpsError("internal", `Kunde inte hämta videofilen. Status: ${videoResponse.statusText}`);
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
        throw new HttpsError("permission-denied", "Försöket blockerades av säkerhetsskäl. Prova en annan text.");
      }
      throw new HttpsError("internal", "Ett fel inträffade hos AI-tjänsten.");
    }
  }
);

/* ------------------------------------------------------------------ */
/*                  Veckovis städning av orphaned media               */
/* ------------------------------------------------------------------ */

function getPathFromUrl(url) {
  if (!url || !url.includes("firebasestorage.googleapis.com")) return null;
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/o/")[1];
    if (seg) return decodeURIComponent(seg.split("?")[0]);
  } catch (e) {
    console.error(`Could not parse storage URL: ${url}`, e);
  }
  return null;
}

async function cleanupOrg(org) {
  const orgId = org.id;
  const usedPaths = new Set();

  if (org.logoUrlLight) {
    const p = getPathFromUrl(org.logoUrlLight);
    if (p) usedPaths.add(p);
  }
  if (org.logoUrlDark) {
    const p = getPathFromUrl(org.logoUrlDark);
    if (p) usedPaths.add(p);
  }

  const mediaLib = await db.collection("organizations").doc(orgId).collection("mediaLibrary").get();
  mediaLib.forEach((doc) => {
    const item = doc.data();
    if (item.url) {
      const p = getPathFromUrl(item.url);
      if (p) usedPaths.add(p);
    }
  });

  const screensSnap = await db.collection("organizations").doc(orgId).collection("displayScreens").get();
  for (const screenDoc of screensSnap.docs) {
    const postsSnap = await screenDoc.ref.collection("posts").get();
    postsSnap.forEach((postDoc) => {
      const post = postDoc.data();
      if (post.imageUrl) {
        const p = getPathFromUrl(post.imageUrl);
        if (p) usedPaths.add(p);
      }
      if (post.videoUrl) {
        const p = getPathFromUrl(post.videoUrl);
        if (p) usedPaths.add(p);
      }
      if (post.backgroundVideoUrl) {
        const p = getPathFromUrl(post.backgroundVideoUrl);
        if (p) usedPaths.add(p);
      }
      (post.subImages || []).forEach((sub) => {
        if (sub?.imageUrl) {
          const p = getPathFromUrl(sub.imageUrl);
          if (p) usedPaths.add(p);
        }
      });
      (post.collageItems || []).forEach((item) => {
        if (item?.imageUrl) {
          const p = getPathFromUrl(item.imageUrl);
          if (p) usedPaths.add(p);
        }
        if (item?.videoUrl) {
          const p = getPathFromUrl(item.videoUrl);
          if (p) usedPaths.add(p);
        }
      });
    });
  }
  usedPaths.delete(null);

  const bucket = admin.storage().bucket();
  const prefixes = [`organizations/${orgId}/images/`, `organizations/${orgId}/videos/`];
  let allFiles = [];
  for (const prefix of prefixes) {
    const [files] = await bucket.getFiles({ prefix });
    allFiles = allFiles.concat(files);
  }

  const deletionPromises = [];
  const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
  let orphanedCount = 0;

  for (const file of allFiles) {
    if (!usedPaths.has(file.name)) {
      orphanedCount++;
      const [metadata] = await file.getMetadata();
      const created = new Date(metadata.timeCreated).getTime();
      if (created < twoDaysAgo) {
        console.log(`[${orgId}] Deleting orphaned file: ${file.name}`);
        deletionPromises.push(file.delete());
      } else {
        console.log(`[${orgId}] Skipping recent orphaned file (grace period): ${file.name}`);
      }
    }
  }

  const results = await Promise.allSettled(deletionPromises);
  const deleted = results.filter((r) => r.status === "fulfilled").length;
  console.log(
    `[${org.name || orgId}] Cleanup finished. Found ${orphanedCount} potential orphans. Deleted ${deleted} files.`
  );
  return deleted;
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
    const orgs = await db.collection("organizations").get();
    if (orgs.empty) {
      console.log("No organizations found to clean up.");
      return null;
    }

    const results = await Promise.allSettled(orgs.docs.map((d) => cleanupOrg({ ...d.data(), id: d.id })));

    results.forEach((res, i) => {
      const orgDoc = orgs.docs[i];
      const orgName = orgDoc.data().name || orgDoc.id;
      if (res.status === "fulfilled") {
        if (res.value > 0) {
          console.log(`Successfully cleaned org "${orgName}". Deleted ${res.value} files.`);
        }
      } else {
        console.error(`Failed to clean org "${orgName}":`, res.reason);
      }
    });

    console.log("Weekly orphaned media cleanup job finished.");
    return null;
  }
);

exports.testOrphanedMediaCleanup = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to run this test.");
  }
  const { organizationId } = request.data || {};
  let totalDeleted = 0;
  let message = "";

  if (organizationId) {
    console.log(`Manually running cleanup for single organization: ${organizationId}`);
    const orgDoc = await db.collection("organizations").doc(organizationId).get();
    if (!orgDoc.exists) {
      throw new HttpsError("not-found", `Organization ${organizationId} not found.`);
    }
    totalDeleted = await cleanupOrg({ ...orgDoc.data(), id: orgDoc.id });
    message = `Manual cleanup for "${(orgDoc.data() && orgDoc.data().name) || orgDoc.id}" finished. Total files deleted: ${totalDeleted}.`;
  } else {
    console.log("Manually running cleanup for ALL organizations.");
    const orgs = await db.collection("organizations").get();
    const results = await Promise.allSettled(orgs.docs.map((d) => cleanupOrg({ ...d.data(), id: d.id })));
    totalDeleted = results
      .filter((r) => r.status === "fulfilled")
      .reduce((sum, r) => sum + (r.value || 0), 0);
    message = `Manual cleanup for all organizations finished. Total files deleted: ${totalDeleted}.`;
  }

  console.log(message);
  return { message, deletedCount: totalDeleted };
});