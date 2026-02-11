// functions/index.js
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentDeleted, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { randomUUID } from "crypto";

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";

const app = initializeApp();
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

const storage = getStorage(app);
const auth = getAuth(app);

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
  // console.log(`[Automation:${aid}] ${msg}`, extra ? JSON.stringify(extra) : "");
}

/* ------------------------------------------------------------------ */
/*                             Testfunktion                            */
/* ------------------------------------------------------------------ */

export const testFunction = onCall({ cors: true }, (request) => {
  console.log("Test function called by:", request.auth ? request.auth.uid : "unauthenticated user");
  return { message: "Hej från molnet! Kopplingen fungerar.", timestamp: new Date().toISOString() };
});

/* ------------------------------------------------------------------ */
/*                       Röstchatt-konfiguration                       */
/* ------------------------------------------------------------------ */

export const getVoiceServerConfig = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: ["VOICE_SERVER_URL"],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const voiceServerUrl = process.env.VOICE_SERVER_URL;
    if (!voiceServerUrl) {
      throw new HttpsError("internal", "The voice service is not configured correctly.");
    }
    return { url: voiceServerUrl };
  }
);

/* ------------------------------------------------------------------ */
/*                         Användar–inbjudan                           */
/* ------------------------------------------------------------------ */

export const inviteUser = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Du måste vara inloggad för att lägga till användare.");
  }
  const data = request.data || {};
  const organizationId = data.organizationId;
  const email = data.email;
  if (!organizationId || !email) {
    throw new HttpsError("invalid-argument", "Saknar nödvändig information.");
  }

  try {
    const existing = await db.collection("users").where("email", "==", email).limit(1).get();
    if (!existing.empty) {
      throw new HttpsError("already-exists", "Denna administratör finns redan.");
    }

    let userRecord;
    try {
      userRecord = await getAuth().getUserByEmail(email);
    } catch (err) {
      if (err && err.code === "auth/user-not-found") {
        userRecord = await getAuth().createUser({ email, emailVerified: false });
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
    throw new HttpsError("internal", "Ett oväntat fel inträffade.");
  }
});

/* ------------------------------------------------------------------ */
/*                  Video Generation                                   */
/* ------------------------------------------------------------------ */

export const initiateVideoGeneration = onCall(
  {
    timeoutSeconds: 60,
    secrets: ["API_KEY"],
    cors: true,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");

    const { prompt, image } = request.data;
    const API_KEY = process.env.API_KEY;

    if (!API_KEY) throw new HttpsError("internal", "Service configuration error.");

    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const model = "veo-3.1-fast-generate-preview";
      
      let imagePart = undefined;
      if (image && image.imageBytes && image.mimeType) {
          imagePart = {
              imageBytes: image.imageBytes,
              mimeType: image.mimeType
          };
      }

      const operation = await ai.models.generateVideos({
        model,
        prompt,
        image: imagePart,
        config: { numberOfVideos: 1 },
      });

      const operationName = operation.name || (operation).operation?.name;
      if (!operationName) throw new Error("No operation name returned from Google AI.");

      return { success: true, operationName };

    } catch (error) {
      console.error("Video initiation failed:", error);
      throw new HttpsError("internal", error.message || "Failed to start video generation.");
    }
  }
);

export const saveGeneratedVideo = onCall(
  {
    timeoutSeconds: 300,
    memory: "1GiB",
    secrets: ["API_KEY"],
    cors: true,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");

    const { videoUri, orgId, postId, screenId } = request.data;
    const API_KEY = process.env.API_KEY;

    if (!videoUri || !orgId || !postId || !screenId) throw new HttpsError("invalid-argument", "Missing parameters.");

    try {
        const separator = videoUri.includes("?") ? "&" : "?";
        const downloadUrl = `${videoUri}${separator}key=${API_KEY}`;
        
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
        const buffer = await response.arrayBuffer();

        const bucket = storage.bucket();
        const fileName = `organizations/${orgId}/post_assets/${postId}/ai-video-${Date.now()}.mp4`;
        const file = bucket.file(fileName);
        const token = randomUUID();

        await file.save(Buffer.from(buffer), {
            metadata: {
                contentType: "video/mp4",
                metadata: { firebaseStorageDownloadTokens: token }
            }
        });

        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${token}`;

        const postRef = db.collection("organizations").doc(orgId).collection("displayScreens").doc(screenId);
        const orgRef = db.collection("organizations").doc(orgId);
        
        let aiPrompt = "AI Video";
        try {
            const opSnap = await db.collection("organizations").doc(orgId).collection("videoOperations")
                .where('postId', '==', postId).orderBy('createdAt', 'desc').limit(1).get();
            if (!opSnap.empty) {
                aiPrompt = opSnap.docs[0].data().prompt || "AI Video";
            }
        } catch (e) {
            console.warn("Could not fetch prompt info", e);
        }

        await db.runTransaction(async (t) => {
            const doc = await t.get(postRef);
            if (!doc.exists) throw new Error("Screen not found");
            
            const postData = doc.data();
            const posts = postData.posts || [];
            const idx = posts.findIndex(p => p.id === postId);
            
            if (idx > -1) {
                posts[idx].videoUrl = publicUrl;
                posts[idx].isAiGeneratedVideo = true;
                delete posts[idx].imageUrl;
                delete posts[idx].isAiGeneratedImage;
                t.update(postRef, { posts });
            }

            const newMediaItem = {
                id: `media-ai-video-${Date.now()}`,
                type: 'video',
                url: publicUrl,
                internalTitle: `AI: ${aiPrompt.slice(0, 30)}...`,
                createdAt: new Date().toISOString(),
                createdBy: 'ai',
                aiPrompt: aiPrompt
            };
            
            t.update(orgRef, {
                mediaLibrary: FieldValue.arrayUnion(newMediaItem)
            });
        });

        return { success: true, videoUrl: publicUrl };

    } catch (error) {
        console.error("Error saving video:", error);
        throw new HttpsError("internal", error.message || "Failed to save video.");
    }
  }
);

/* ------------------------------------------------------------------ */
/*                         Organization Deletion                       */
/* ------------------------------------------------------------------ */

export const deleteOrganization = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");

    const uid = request.auth.uid;
    const { organizationId } = request.data;

    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists || (userDoc.data().role !== "systemowner")) {
        throw new HttpsError("permission-denied", "Only system owners can delete organizations.");
    }
    
    const orgRef = db.collection("organizations").doc(organizationId);
    const batch = db.batch();

    const subcollections = ["displayScreens", "suggestedPosts", "instagramStories", "videoOperations"];
    for (const sub of subcollections) {
        const subcollectionRef = orgRef.collection(sub);
        const snapshot = await subcollectionRef.get();
        if (!snapshot.empty) {
            snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        }
    }
    
    batch.delete(orgRef);

    const usersQuery = db.collection("users").where("organizationId", "==", organizationId);
    const usersSnapshot = await usersQuery.get();
    const userIdsToDelete = [];
    if (!usersSnapshot.empty) {
        usersSnapshot.forEach((doc) => {
            userIdsToDelete.push(doc.id);
            batch.delete(doc.ref);
        });
    }

    const pairingCodesQuery = db.collection("screenPairingCodes").where("organizationId", "==", organizationId);
    const pairingCodesSnapshot = await pairingCodesQuery.get();
    if (!pairingCodesSnapshot.empty) {
        pairingCodesSnapshot.forEach((doc) => batch.delete(doc.ref));
    }

    await batch.commit();

    if (userIdsToDelete.length > 0) {
        try {
            await getAuth().deleteUsers(userIdsToDelete);
        } catch (error) {
            console.error("Error deleting auth users:", error);
        }
    }

    const bucket = getStorage().bucket();
    const prefix = `organizations/${organizationId}/`;
    try {
        await bucket.deleteFiles({ prefix });
    } catch (error) {
        if (error.code !== 404) console.error("Error deleting storage files:", error);
    }
    
    return { success: true };
});

/* ------------------------------------------------------------------ */
/*                     AI Automation – Scheduler                       */
/* ------------------------------------------------------------------ */

async function runAutomationsOnce(orgIdFilter) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const now = new Date();
  const lastCheck = new Date(now.getTime() - 15 * 60 * 1000);

  const orgsSnap = orgIdFilter
    ? [await db.collection("organizations").doc(orgIdFilter).get()]
    : (await db.collection("organizations").get()).docs;

  if (!orgsSnap.length) return;

  const perOrg = orgsSnap.map(async (orgDoc) => {
    const org = orgDoc.data() || {};
    const orgId = orgDoc.id;
    const orgName = org.brandName || org.name || orgId;
    const automations = Array.isArray(org.aiAutomations) ? org.aiAutomations : [];
    if (automations.length === 0) return;

    let displayScreens = [];
    try {
      const screensSnap = await db.collection("organizations").doc(orgId).collection("displayScreens").get();
      displayScreens = screensSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) { /* ignore */ }

    // Fallback to array if subcollection empty (old format)
    if (displayScreens.length === 0 && Array.isArray(org.displayScreens)) {
       displayScreens = org.displayScreens;
    }

    let hasChanges = false;
    const newSuggestions = [];
    const updatedAutomations = JSON.parse(JSON.stringify(automations));

    for (const automation of updatedAutomations) {
      if (!automation || automation.isEnabled === false) continue;

      const tz = normalizeTimeZone(automation.timezone);
      const parsed = parseTimeHM(automation.timeOfDay);
      if (!parsed) continue;

      const nowParts = getPartsInTz(now, tz);
      const lastCheckParts = getPartsInTz(lastCheck, tz);
      if (!nowParts || !lastCheckParts) continue;

      const nowMinutes = Number(nowParts.hour) * 60 + Number(nowParts.minute);
      const lastCheckMinutes = Number(lastCheckParts.hour) * 60 + Number(lastCheckParts.minute);
      const scheduledMinutes = parsed.hour * 60 + parsed.minute;

      const dayRolledOver = nowParts.day !== lastCheckParts.day;
      let timeMatched = false;
      if (dayRolledOver) {
        timeMatched = scheduledMinutes >= lastCheckMinutes || scheduledMinutes <= nowMinutes;
      } else {
        timeMatched = scheduledMinutes >= lastCheckMinutes && scheduledMinutes <= nowMinutes;
      }
      if (!timeMatched) continue;

      // Frequency Checks
      const weekday = getWeekdayInTzNumber(now, tz);
      const dayOfMonth = Number(nowParts.day);
      let frequencyMatched = false;
      switch (automation.frequency) {
        case "daily": frequencyMatched = true; break;
        case "weekly": frequencyMatched = weekday === Number(automation.dayOfWeek); break;
        case "monthly": frequencyMatched = dayOfMonth === Number(automation.dayOfMonth); break;
      }
      if (!frequencyMatched) continue;

      // Already ran today?
      const lastRun = toDateSafe(automation.lastRunAt);
      if (lastRun) {
        const lastRunParts = getPartsInTz(lastRun, tz);
        const alreadyToday = String(lastRunParts.day) === String(nowParts.day);
        if (alreadyToday) continue;
      }

      try {
        // --- Enhanced Prompt Construction based on Preferences ---
        const preferredLayout = automation.preferredLayout || 'auto';
        const imageStyle = automation.imageStyle || 'professional photography';
        
        let layoutConstraint = "";
        if (preferredLayout === 'text-only') layoutConstraint = "Force layout to 'text-only'. Do not request an image.";
        else if (preferredLayout !== 'auto') layoutConstraint = `Force layout to '${preferredLayout}'.`;
        
        const styleInstruction = imageStyle ? `Image Style: ${imageStyle}.` : "";
        let prompt = "";

        // CHECK IF REMIXING
        if (automation.remixBasePostId) {
            let basePost = null;
            // Search all screens for the post
            for (const screen of displayScreens) {
                if (screen.posts) {
                    basePost = screen.posts.find(p => p.id === automation.remixBasePostId);
                    if (basePost) break;
                }
            }

            if (basePost) {
                prompt = `You are an expert creative director for "${orgName}". Branding Color: ${org.primaryColor}.
                REMIX TASK: Take the following existing post and create a fresh variation of it.
                Original Headline: "${basePost.headline || ''}"
                Original Body: "${basePost.body || ''}"
                Variation Instruction: "${automation.topic || 'Make it fresh and engaging'}"
                
                Keep the core message but change the wording and visual angle.
                ${layoutConstraint}
                ${styleInstruction}
                Generate the new post data. Respond ONLY with a JSON object:
                { "headline": "SWEDISH", "body": "SWEDISH", "imagePrompt": "ENGLISH (NO TEXT, describe the image subject)", "layout": "text-only|image-fullscreen|image-left|image-right", "backgroundColor": "...", "textColor": "..." }`;
            } else {
                console.warn(`Automation ${automation.id} failed: Base post ${automation.remixBasePostId} not found.`);
                continue; // Skip if post missing
            }
        } else {
            // STANDARD CREATION
            prompt = `You are an expert creative director for "${orgName}". Automation Topic: "${automation.topic}". Branding Color: ${org.primaryColor}.
            ${layoutConstraint}
            ${styleInstruction}
            Generate a complete post. Respond ONLY with a JSON object:
            { "headline": "SWEDISH", "body": "SWEDISH", "imagePrompt": "ENGLISH (NO TEXT, describe the image subject)", "layout": "text-only|image-fullscreen|image-left|image-right", "backgroundColor": "...", "textColor": "..." }`;
        }

        const textGen = await ai.models.generateContent({
          model: "gemini-3-pro-preview",
          contents: prompt,
        });

        let jsonString = String((textGen && textGen.text) || "").trim().replace(/^```json/, "").replace(/```$/, "");
        const postDetails = JSON.parse(jsonString);

        let targetScreenIds = automation.targetScreenIds || [];
        if (!targetScreenIds.length) targetScreenIds = displayScreens.map(s => s.id);

        for (const screenId of targetScreenIds) {
          const screen = displayScreens.find((s) => s.id === screenId);
          if (!screen) continue;

          let imageUrl;
          // Generate image if layout is not text-only AND prompt returned imagePrompt
          if (postDetails.layout !== "text-only" && postDetails.imagePrompt) {
            try {
              // Append the style to the image prompt for consistency
              const fullImagePrompt = `${postDetails.imagePrompt}. Style: ${imageStyle}.`;
              
              const img = await ai.models.generateImages({
                model: "imagen-4.0-generate-001",
                prompt: fullImagePrompt,
                config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio: screen.aspectRatio },
              });
              if (img.generatedImages) imageUrl = `data:image/jpeg;base64,${img.generatedImages[0].image.imageBytes}`;
            } catch (imgErr) { /* ignore */ }
          }

          const newPostData = {
            internalTitle: `AI: ${postDetails.headline || "Förslag"}`,
            headline: postDetails.headline,
            body: postDetails.body,
            layout: postDetails.layout,
            backgroundColor: postDetails.backgroundColor,
            textColor: postDetails.textColor,
            imageUrl,
            isAiGeneratedImage: !!imageUrl,
          };

          newSuggestions.push({
            id: `sugg-${Date.now()}-${Math.random()}`,
            automationId: automation.id,
            targetScreenId: screenId,
            status: "pending",
            postData: newPostData,
          });
        }

        automation.lastRunAt = now.toISOString();
        hasChanges = true;
      } catch (err) {
        console.error(`Automation error for ${orgId}:`, err);
      }
    }

    if (hasChanges) {
      const orgRef = db.collection("organizations").doc(orgId);
      const batch = db.batch();
      for (const sugg of newSuggestions) {
        const suggRef = orgRef.collection("suggestedPosts").doc(sugg.id);
        batch.set(suggRef, { ...sugg, createdAt: FieldValue.serverTimestamp() });
      }
      batch.update(orgRef, { aiAutomations: updatedAutomations });
      await batch.commit();
    }
  });

  await Promise.all(perOrg);
}

export const runAiAutomations = onSchedule(
  {
    schedule: "0,15,30,45 * * * *",
    timeZone: "Europe/Stockholm",
    secrets: ["API_KEY"],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    try { await runAutomationsOnce(); } catch (e) { console.error(e); }
  }
);

export const runAiAutomationsNow = onCall({ cors: true, secrets: ["API_KEY"] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
  if (!process.env.API_KEY) throw new HttpsError("failed-precondition", "Missing API Key.");
  await runAutomationsOnce(request.data.orgId);
  return { ok: true };
});

/* ------------------------------------------------------------------ */
/*                              Gemini Proxy                           */
/* ------------------------------------------------------------------ */

export const gemini = onCall(
  {
    region: "us-central1",
    cors: true,
    secrets: ["API_KEY"],
    timeoutSeconds: 540,
  },
  async (request) => {
    try {
        if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
        
        const { action, params } = request.data || {};
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new HttpsError("failed-precondition", "API Key missing.");

        const ai = new GoogleGenAI({ apiKey });

        switch (action) {
            case "generateContent": {
              const response = await ai.models.generateContent({
                model: params.model,
                contents: params.contents,
                config: params.config,
              });
              return { text: response.text };
            }

            case "generateImages": {
              const response = await ai.models.generateImages({
                model: params.model,
                prompt: params.prompt,
                config: params.config,
              });
              
              if (!response.generatedImages?.length) throw new HttpsError("not-found", "No image generated.");
              
              return { 
                  imageBytes: response.generatedImages[0].image.imageBytes,
                  mimeType: 'image/jpeg' 
              };
            }

            case "getVideosOperation": {
                if (!params.operation) throw new HttpsError("invalid-argument", "Missing operation.");
                return await ai.operations.getVideosOperation({ operation: params.operation });
            }

            case "analyzeBrandFromWebsite": {
                if (!params.url) throw new HttpsError("invalid-argument", "URL required.");
                
                const response = await ai.models.generateContent({
                    model: "gemini-3-pro-preview",
                    contents: `
                        Analyze the brand identity of this website: ${params.url}.
                        Extract the following information:
                        1. Primary brand color (Hex code). If multiple, choose the most dominant.
                        2. Secondary brand color (Hex code).
                        3. Font style for headlines (categorize as 'sans', 'serif', 'display', or 'script').
                        4. Font style for body text (categorize as 'sans' or 'serif').
                        5. A concise business description (max 2 sentences) in Swedish.
                        6. 3-5 short phrases or keywords from the site that capture the tone of voice (in Swedish).
                        7. A list of 1-3 business type keywords (e.g. Café, Butik, Frisör, Konsult) in Swedish.
                        8. The URL of the main logo image found on the website. Prefer a direct image link (png/jpg/svg).

                        Use Google Search to visit the site and analyze its visual style and content.
                    `,
                    config: {
                        tools: [{googleSearch: {}}],
                        responseMimeType: "application/json",
                        responseSchema: params.schema
                    }
                });
                
                return { text: response.text };
            }

            // --- Specialized Handlers (kept for compatibility) ---

            case "formatPageWithAI": {
              const response = await ai.models.generateContent({ 
                  model: "gemini-2.5-flash", 
                  contents: `Format to Markdown: ${params.rawContent}` 
              });
              return (response && response.text) || "";
            }

            case "generatePageContentFromPrompt": {
              const response = await ai.models.generateContent({ 
                  model: "gemini-3-pro-preview", 
                  contents: `Write info page in Swedish Markdown based on: ${params.userPrompt}` 
              });
              return (response && response.text) || "";
            }

            case "generateDisplayPostContent": {
              const response = await ai.models.generateContent({
                model: "gemini-3-pro-preview",
                contents: `Copywriter for "${params.organizationName}". Idea: ${params.userPrompt}. JSON: {headline, body}`,
                config: { responseMimeType: "application/json" },
              });
              return JSON.parse(response.text || "{}");
            }

            case "generateHeadlineSuggestions": {
              const response = await ai.models.generateContent({
                model: "gemini-3-pro-preview",
                contents: `5 headline suggestions for: "${params.body}". Avoid: ${JSON.stringify(params.existingHeadlines)}. JSON: {headlines:[]}`,
                config: { responseMimeType: "application/json" },
              });
              return JSON.parse(response.text || "{}").headlines || [];
            }

            case "refineDisplayPostContent": {
              const response = await ai.models.generateContent({
                model: "gemini-3-pro-preview",
                contents: `Refine text. Headline: ${params.content.headline}, Body: ${params.content.body}. Command: ${params.command}. JSON: {headline, body}`,
                config: { responseMimeType: "application/json" },
              });
              return JSON.parse(response.text || "{}");
            }

            case "generateDisplayPostImage": {
              const resp = await ai.models.generateImages({
                model: "imagen-4.0-generate-001",
                prompt: params.prompt + " NO TEXT.",
                config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio: params.aspectRatio },
              });
              if (resp.generatedImages?.length) return `data:image/jpeg;base64,${resp.generatedImages[0].image.imageBytes}`;
              throw new HttpsError("not-found", "No image.");
            }

            case "editDisplayPostImage": {
                // Editing uses GenerateContent with image input
                const parts = [
                    { inlineData: { data: params.base64ImageData, mimeType: params.mimeType } },
                    { text: `Perform the following edit on the image: ${params.prompt}` }
                ];
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash-image",
                    contents: { parts },
                    config: { responseModalities: [Modality.IMAGE] },
                });
                const part = response.candidates?.[0]?.content?.parts?.[0];
                if (part?.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                throw new HttpsError("not-found", "No edited image.");
            }

            default:
              throw new HttpsError("invalid-argument", `Unknown action: ${action}`);
        }
    } catch (error) {
        console.error("Gemini proxy error:", error);
        if (error instanceof HttpsError) throw error;
        // Wrap unknown errors to avoid CORS issues on client
        throw new HttpsError("internal", error.message || "Internal AI Error");
    }
  }
);
