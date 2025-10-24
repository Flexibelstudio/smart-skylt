// functions/index.js  (ESM, ren JavaScript)
// Kräver: package.json med { "type": "module", "engines": { "node": "20" } }

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { GoogleGenAI, Type, Modality } from "@google/genai";

// --- firebase-admin (modulära imports för ESM) ---
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";

const app = initializeApp();
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

/* ------------------------------------------------------------------ */
/*                       Engångs-migrering (callable)                  */
/* ------------------------------------------------------------------ */

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const migrateOrgCollections = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

  const payload = request.data || {};
  const onlyOrgId = payload.orgId;
  const migrateChannels = !!payload.migrateChannels;
  const dryRun = !!payload.dryRun;

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
    const screensArr = Array.isArray(org.displayScreens)
      ? org.displayScreens.filter((s) => s && s.id)
      : [];
    const channelsArr = Array.isArray(org.channels)
      ? org.channels.filter((c) => c && c.id)
      : [];

    let screensMigrated = 0;
    let channelsMigrated = 0;

    // Skärmar -> subcollection
    if (screensArr.length) {
      for (const group of chunk(screensArr, 450)) {
        const batch = db.batch();
        for (const s of group) {
          const ref = db.collection("organizations").doc(orgId).collection("displayScreens").doc(String(s.id));
          batch.set(ref, s, { merge: true });
        }
        if (!dryRun) await batch.commit();
        screensMigrated += group.length;
      }
    }

    // (Valfritt) Kanaler -> subcollection
    if (migrateChannels && channelsArr.length) {
      for (const group of chunk(channelsArr, 450)) {
        const batch = db.batch();
        for (const c of group) {
          const ref = db.collection("organizations").doc(orgId).collection("channels").doc(String(c.id));
          batch.set(ref, c, { merge: true });
        }
        if (!dryRun) await batch.commit();
        channelsMigrated += group.length;
      }
    }

    results.push({ orgId, screensMigrated, ...(migrateChannels ? { channelsMigrated } : {}) });
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

function toDateSafe(value) {
  if (!value) return null;
  try {
    if (typeof value === "object" && value !== null && "toDate" in value) {
      const d = value.toDate();
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

function parseTimeHM(hhmm) {
  if (typeof hhmm !== "string") return null;
  const m = hhmm.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

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

function normalizeTimeZone(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz || "Europe/Stockholm" });
    return tz || "Europe/Stockholm";
  } catch {
    return "Europe/Stockholm";
  }
}

function dbg(aid, msg, extra) {
  try {
    console.log(`[Automation:${aid}] ${msg}`, extra ? JSON.stringify(extra) : "");
  } catch {
    console.log(`[Automation:${aid}] ${msg}`);
  }
}

/* ------------------------------------------------------------------ */
/*                             Testfunktion                            */
/* ------------------------------------------------------------------ */

export const testFunction = onCall((request) => {
  console.log("Test function called by:", request.auth ? request.auth.uid : "unauthenticated user");
  return { message: "Hej från molnet! Kopplingen fungerar.", timestamp: new Date().toISOString() };
});

/* ------------------------------------------------------------------ */
/*                         Användar–inbjudan                           */
/* ------------------------------------------------------------------ */

export const inviteUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Du måste vara inloggad för att lägga till användare.");
  }
  const data = request.data || {};
  const organizationId = data.organizationId;
  const email = data.email;
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
      userRecord = await auth.getUserByEmail(email);
    } catch (err) {
      if (err && err.code === "auth/user-not-found") {
        userRecord = await auth.createUser({ email, emailVerified: false });
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

async function runAutomationsOnce(orgIdFilter) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const now = new Date();
  const lastCheck = new Date(now.getTime() - 15 * 60 * 1000);
  console.log(`[Scheduler] Running AI Automations check at ${now.toISOString()}`);

  const orgsSnap = orgIdFilter
    ? [await db.collection("organizations").doc(orgIdFilter).get()]
    : (await db.collection("organizations").get()).docs;

  if (!orgsSnap.length || (orgsSnap.length === 1 && !orgsSnap[0].exists)) {
    console.log("[Scheduler] No organizations found.");
    return;
  }

  const perOrg = orgsSnap.map(async (orgDoc) => {
    const org = orgDoc.data() || {};
    const orgId = orgDoc.id;
    const orgName = org.name || orgId;

    const automations = Array.isArray(org.aiAutomations) ? org.aiAutomations : [];
    if (automations.length === 0) return;

    // Hämta skärmar (subcollection + fallback)
    let displayScreens = [];
    try {
      const screensSnap = await db.collection("organizations").doc(orgId).collection("displayScreens").get();
      displayScreens = screensSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn(`[Org: ${orgId}] Could not read subcollection displayScreens:`, e);
    }
    if (Array.isArray(org.displayScreens)) {
      const fromArray = org.displayScreens.filter((s) => s && s.id).map((s) => ({ ...s }));
      const byId = new Map(displayScreens.map((s) => [s.id, s]));
      for (const s of fromArray) if (!byId.has(s.id)) byId.set(s.id, s);
      displayScreens = Array.from(byId.values());
    }
    if (displayScreens.length === 0) {
      console.log(`[Org: ${orgId}] No display screens found (subcollection or array).`);
    }

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
        dbg(automation.id, `Skipping: Invalid timeOfDay`, { timeOfDay: automation.timeOfDay });
        continue;
      }

      const nowParts = getPartsInTz(now, tz);
      const lastCheckParts = getPartsInTz(lastCheck, tz);
      if (!nowParts || !lastCheckParts) {
        dbg(automation.id, `Skipping: could not resolve TZ parts`, { tz });
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
      dbg(automation.id, `Window check`, {
        tz,
        timeOfDay: automation.timeOfDay,
        dayRolledOver,
        windowFrom: `${lastCheckParts.hour}:${lastCheckParts.minute}`,
        windowTo: `${nowParts.hour}:${nowParts.minute}`,
        scheduledMinutes,
        lastCheckMinutes,
        nowMinutes,
        timeMatched,
      });
      if (!timeMatched) {
        dbg(automation.id, `Skipping: outside window`);
        continue;
      }

      const weekday = getWeekdayInTzNumber(now, tz);
      const dayOfMonth = Number(nowParts.day);
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
          dbg(automation.id, `Unknown frequency`, { frequency: automation.frequency });
      }
      dbg(automation.id, `Frequency check`, {
        frequency: automation.frequency,
        weekday,
        dayOfWeek: automation.dayOfWeek,
        dayOfMonth,
        targetDayOfMonth: automation.dayOfMonth,
        frequencyMatched,
      });
      if (!frequencyMatched) {
        dbg(automation.id, `Skipping: frequency did not match`);
        continue;
      }

      const lastRun = toDateSafe(automation.lastRunAt);
      dbg(automation.id, `LastRunAt`, { raw: automation.lastRunAt || null, parsed: lastRun ? lastRun.toISOString() : null });
      if (lastRun) {
        const lastRunParts = getPartsInTz(lastRun, tz);
        const alreadyToday =
          String(lastRunParts.year) === String(nowParts.year) &&
          String(lastRunParts.month) === String(nowParts.month) &&
          String(lastRunParts.day) === String(nowParts.day);
        if (alreadyToday) {
          dbg(automation.id, `Skipping: already ran today in tz`, { tz });
          continue;
        }
      }

      dbg(automation.id, `DisplayScreens loaded`, { count: displayScreens.length });
      console.log(
        `[Automation: ${automation.id}] TRIGGERED. Generating content for "${automation.name}" in org "${orgName}"`
      );

      try {
        const history = (Array.isArray(org.suggestedPosts) ? org.suggestedPosts : [])
          .filter((p) => p.automationId === automation.id)
          .slice(-10);
        const approved = history.filter((p) => p.status === "approved" || p.status === "edited-and-published");
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

        const styleProfileContext =
          org.styleProfile && org.styleProfile.summary
            ? `User's style profile:\n---\n${org.styleProfile.summary}\n---\n`
            : "";

        const prompt =
          `You are an expert creative director for "${orgName}", a company in the ` +
          `${Array.isArray(org.businessType) ? org.businessType.join(", ") : String(org.businessType || "")} sector.\n\n` +
          `**Creative Brief**\n` +
          `- Automation Topic: "${automation.topic}"\n` +
          `- Branding: Primary color is ${org.primaryColor}. Use a professional but engaging tone.\n` +
          `- Style Profile: ${styleProfileContext}\n` +
          `- Feedback History: ${feedbackContext}\n\n` +
          `**Your Task**\n` +
          `Based on all the information above, generate a complete post. Pay close attention to the feedback history to tailor the suggestion to the user's preferences.\n` +
          `Respond ONLY with a JSON object inside a markdown code block (\`\`\`json ... \`\`\`).\n` +
          `The JSON object must contain:\n` +
          `1. 'headline' (SWEDISH)\n` +
          `2. 'body' (SWEDISH)\n` +
          `3. 'imagePrompt' (ENGLISH, empty if layout 'text-only')\n` +
          `4. 'layout' in ['text-only','image-fullscreen','image-left','image-right']\n` +
          `5. 'backgroundColor'\n` +
          `6. 'textColor'\n` +
          `7. 'imageOverlayEnabled' (boolean)\n` +
          `8. 'textAlign'\n` +
          `9. 'textAnimation'`;

        const textGen = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
        });

        let jsonString = String((textGen && textGen.text) || "").trim();
        if (jsonString.startsWith("```json")) jsonString = jsonString.slice(7);
        if (jsonString.endsWith("```")) jsonString = jsonString.slice(0, -3);

        let postDetails = {};
        try {
          postDetails = JSON.parse(jsonString);
        } catch (e) {
          console.warn(`[Automation:${automation.id}] Could not parse AI JSON. Raw response follows ↓`);
          console.warn(jsonString);
          console.warn(`Parse error:`, e && e.message ? e.message : e);
          continue;
        }

        // ---- RESOLVE TARGETS (screens) + DEBUG ----
        let targetScreenIds = Array.isArray(automation.targetScreenIds) ? [...automation.targetScreenIds] : [];

        if (!targetScreenIds.length) {
          targetScreenIds = displayScreens.filter((s) => s && s.active !== false).map((s) => String(s.id));
        }

        targetScreenIds = Array.from(new Set(targetScreenIds));
        console.log(`[Automation:${automation.id}] Targets`, JSON.stringify(targetScreenIds));
        console.log(`[Automation:${automation.id}] DisplayScreens in memory: ${displayScreens.length}`);

// ---- GENERATE PER SCREEN ----
for (const screenId of targetScreenIds) {
  const screen = displayScreens.find((s) => s.id === screenId);
  if (!screen) {
    console.log(`[Automation:${automation.id}] Target screen NOT found in subcollection`, screenId);
    continue;
  }

  // Bildgenerering (om layout kräver bild)
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
        `[Automation:${automation.id}] Image generation failed; proceeding with text-only.`,
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
    createdAt: Timestamp.now(), // <-- ändringen
    status: "pending",
    postData: newPostData,
  });
}

automation.lastRunAt = now.toISOString();
hasChanges = true;

      } catch (err) {
        console.error(`[Automation: ${automation.id}] CRITICAL ERROR during generation for org ${orgId}:`, err);
      }
    }

    if (hasChanges) {
      console.log(`[Org: ${orgId}] Updating Firestore with ${newSuggestions.length} new suggestion(s).`);
      try {
        const updatePayload = { aiAutomations: updatedAutomations };
        if (newSuggestions.length > 0) {
          updatePayload.suggestedPosts = FieldValue.arrayUnion(...newSuggestions);
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
}

export const runAiAutomations = onSchedule(
  {
    schedule: "every 15 minutes",
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    try {
      await runAutomationsOnce();
    } catch (err) {
      console.error("runAiAutomations top-level error:", err);
    }
  }
);

// Manuell trigger för snabbtest
export const runAiAutomationsNow = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Du måste vara inloggad.");
  if (!process.env.GEMINI_API_KEY) throw new HttpsError("failed-precondition", "Saknar GEMINI_API_KEY secret.");
  const data = request.data || {};
  const orgId = data.orgId;
  await runAutomationsOnce(orgId || undefined);
  return { ok: true };
});

/* ------------------------------------------------------------------ */
/*                Media-cleanup när post tas bort (v2)                 */
/* ------------------------------------------------------------------ */

export const cleanupDeletedPostMedia = onDocumentDeleted(
  "organizations/{organizationId}/displayScreens/{screenId}/posts/{postId}",
  async (event) => {
    const post = event.data && event.data.data ? event.data.data() : null;
    if (!post) {
      console.log(`No data for deleted post ${event.params.postId}.`);
      return null;
    }

    console.log(`Post ${event.params.postId} deleted from org ${event.params.organizationId}. Cleaning up media...`);

    const bucket = storage.bucket();
    const deletionPromises = [];

    const urls = new Set();
    if (post.imageUrl) urls.add(post.imageUrl);
    if (post.videoUrl) urls.add(post.videoUrl);
    if (post.backgroundVideoUrl) urls.add(post.backgroundVideoUrl);
    (post.subImages || []).forEach((si) => si && si.imageUrl && urls.add(si.imageUrl));
    (post.collageItems || []).forEach((ci) => {
      if (ci && ci.imageUrl) urls.add(ci.imageUrl);
      if (ci && ci.videoUrl) urls.add(ci.videoUrl);
    });

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
    console.log(`Cleanup complete. Attempted to delete ${deletionPromises.length} files.`);
    return { message: `Cleaned up media for post.` };
  }
);

/* ------------------------------------------------------------------ */
/*                              Gemini proxy                           */
/* ------------------------------------------------------------------ */

export const gemini = onCall(
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

    const data = request.data || {};
    const action = data.action;
    const params = data.params || {};
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
          const rawContent = params.rawContent;
          const prompt = `You are a world-class digital content designer... Raw text to transform: --- ${rawContent} ---`;
          const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
          return (response && response.text) || "";
        }

        case "generatePageContentFromPrompt": {
          const userPrompt = params.userPrompt;
          const prompt = `You are a world-class digital content designer... The user's idea/prompt is: --- ${userPrompt} ---`;
          const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
          return (response && response.text) || "";
        }

        case "generateDisplayPostContent": {
          const userPrompt = params.userPrompt;
          const organizationName = params.organizationName;
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
          return JSON.parse(String((response && response.text) || "").trim() || "{}");
        }

        case "generateCompletePost": {
          const userPrompt = params.userPrompt;
          const organizationName = params.organizationName;
          const aspectRatio = params.aspectRatio;
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

          const content = JSON.parse(String((textGen && textGen.text) || "").trim() || "{}");

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
          const body = params.body;
          const existingHeadlines = Array.isArray(params.existingHeadlines) ? params.existingHeadlines : [];
          const prompt =
            `You are an expert copywriter. Body: --- ${body} --- ` +
            (existingHeadlines.length ? `Avoid these: "${existingHeadlines.join('", "')}".` : "");
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
          const obj = JSON.parse(String((response && response.text) || "").trim() || "{}");
          return obj.headlines || [];
        }

        case "refineDisplayPostContent": {
          const content = params.content || {};
          const command = params.command;
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
          return JSON.parse(String((response && response.text) || "").trim() || "{}");
        }

        case "generateDisplayPostImage": {
          const prompt = params.prompt;
          const aspectRatio = params.aspectRatio;
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
          const base64ImageData = params.base64ImageData;
          const mimeType = params.mimeType;
          const prompt = params.prompt;
          const logo = params.logo;

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
            (response &&
              response.candidates &&
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
          const userPrompt = params.userPrompt;
          const postCount = params.postCount;
          const organizationName = params.organizationName;
          const userMedia = Array.isArray(params.userMedia) ? params.userMedia : [];
          const businessType = params.businessType;
          const businessDescription = params.businessDescription;

          const prompt =
            `Du är expert på kampanjer för digitala skyltar för "${organizationName}".\n` +
            `Verksamhetstyp: ${Array.isArray(businessType) ? businessType.join(", ") : businessType || "Ej spec"}\n` +
            `Beskrivning: "${businessDescription || "Ej spec"}".\n` +
            `Mål: "${userPrompt}".\n` +
            `Svara med en JSON-array med ${postCount} objekt: ` +
            `{ internalTitle, headline, body, durationSeconds(10-20), layout['text-only'|'image-fullscreen'|'image-left'|'image-right'], ` +
            `imagePrompt(SVENSKA) eller userMediaIndex (använd ETT av dem).}`;

          const parts = [{ text: prompt }];
          userMedia.forEach((m) => {
            if (m && m.data && m.mimeType) parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } });
          });

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
          return JSON.parse(String((response && response.text) || "").trim() || "[]");
        }

        case "generateCampaignIdeasForEvent": {
          const eventName = params.eventName;
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
          return JSON.parse(String((response && response.text) || "").trim() || "[]");
        }

        case "generateVideoFromPrompt": {
          const prompt = params.prompt;
          const organizationId = params.organizationId;
          const image = params.image;
          const imagePart = image ? { imageBytes: image.data, mimeType: image.mimeType } : undefined;

          let operation = await ai.models.generateVideos({
            model: "veo-3.1-fast-generate-preview",
            prompt: `En kort, slagkraftig och professionell video för en digital skylt. ${prompt}`,
            image: imagePart,
            config: { numberOfVideos: 1 },
          });

          // Enkel polling
          while (!operation.done) {
            await new Promise((r) => setTimeout(r, 10000));
            operation = await ai.operations.getVideosOperation({ operation });
          }
          const downloadLink =
            operation.response &&
            operation.response.generatedVideos &&
            operation.response.generatedVideos[0] &&
            operation.response.generatedVideos[0].video &&
            operation.response.generatedVideos[0].video.uri;

          if (!downloadLink) throw new HttpsError("not-found", "AI:n returnerade ingen video.");

          const videoResponse = await fetch(`${downloadLink}&key=${process.env.GEMINI_API_KEY}`);
          if (!videoResponse.ok) {
            throw new HttpsError("internal", `Kunde inte hämta videofilen. Status: ${videoResponse.statusText}`);
          }
          const videoBuffer = await videoResponse.arrayBuffer();

          const bucket = storage.bucket();
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
      console.error(`Error in Gemini function for action "${(request.data && request.data.action) || ""}":`, error);
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
    if (item && item.url) {
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
        if (sub && sub.imageUrl) {
          const p = getPathFromUrl(sub.imageUrl);
          if (p) usedPaths.add(p);
        }
      });
      (post.collageItems || []).forEach((item) => {
        if (item && item.imageUrl) {
          const p = getPathFromUrl(item.imageUrl);
          if (p) usedPaths.add(p);
        }
        if (item && item.videoUrl) {
          const p = getPathFromUrl(item.videoUrl);
          if (p) usedPaths.add(p);
        }
      });
    });
  }

  const bucket = storage.bucket();
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

export const cleanupOrphanedMedia = onSchedule(
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
      const orgName = (orgDoc.data() && orgDoc.data().name) || orgDoc.id;
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

export const testOrphanedMediaCleanup = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to run this test.");
  }
  const data = request.data || {};
  const organizationId = data.organizationId;
  let totalDeleted = 0;
  let message = "";

  if (organizationId) {
    console.log(`Manually running cleanup for single organization: ${organizationId}`);
    const orgDoc = await db.collection("organizations").doc(organizationId).get();
    if (!orgDoc.exists) {
      throw new HttpsError("not-found", `Organization ${organizationId} not found.`);
    }
    totalDeleted = await cleanupOrg({ ...orgDoc.data(), id: orgDoc.id });
    message = `Manual cleanup for "${((orgDoc.data() && orgDoc.data().name) || orgDoc.id)}" finished. Total files deleted: ${totalDeleted}.`;
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
