// functions/index.js
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { GoogleGenAI, Modality } from "@google/genai";
import { randomUUID } from "crypto";
import ical from "node-ical";

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";

const app = initializeApp();
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

const storage = getStorage(app);

/* ------------------------------------------------------------------ */
/*                            Hjälpfunktioner                          */
/* ------------------------------------------------------------------ */

/* Klienten lagrar skärmens inlägg som JSON-sträng i _serialized_posts
   (se services/firebaseService.ts). Läs ALLTID inlägg via denna helper. */
const parseScreenPosts = (screenData) => {
  if (!screenData) return [];
  if (typeof screenData._serialized_posts === "string") {
    try { return JSON.parse(screenData._serialized_posts) || []; } catch (e) { return []; }
  }
  return Array.isArray(screenData.posts) ? screenData.posts : [];
};

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

async function fetchSiteBrandData(url) {
    const fetchText = async (u, maxBytes) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(u, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SmartskyltBot/1.0)' },
            });
            if (!res.ok) return null;
            const text = await res.text();
            return text.slice(0, maxBytes);
        } catch { return null; } finally { clearTimeout(timer); }
    };

    const html = await fetchText(url, 400_000);
    if (!html) return null;

    const cssTexts = [html];
    const linkHrefs = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)]
        .map(m => m[1]).slice(0, 3);
    for (const href of linkHrefs) {
        try {
            const cssUrl = new URL(href, url).toString();
            const css = await fetchText(cssUrl, 200_000);
            if (css) cssTexts.push(css);
        } catch { /* ignorera trasiga href */ }
    }

    // Räkna hexfärger, filtrera bort gråskala/nära vitt/svart
    const counts = new Map();
    for (const text of cssTexts) {
        for (const m of text.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
            const hex = m[1].toLowerCase();
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const spread = max - min;
            const sum = r + g + b;
            if (spread < 25 || sum > 720 || sum < 60) continue;
            counts.set(hex, (counts.get(hex) || 0) + 1);
        }
    }
    const colorCandidates = [...counts.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 15)
        .map(([hex, n]) => `#${hex} (${n} förekomster)`);

    const themeColor = (html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-fA-F]{3,6})["']/i) || [])[1] || null;

    const logoCandidates = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)]
        .filter(m => /logo/i.test(m[0])).map(m => { try { return new URL(m[1], url).toString(); } catch { return null; } })
        .filter(Boolean).slice(0, 3);

    const visibleText = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ').slice(0, 5000);

    return { colorCandidates, themeColor, logoCandidates, visibleText };
}

// Central förteckning över AI-modeller. Byt modell HÄR — aldrig i anropen.
const AI_MODELS = {
  TEXT: "gemini-3.5-flash",
  TEXT_LIGHT: "gemini-2.5-flash",
  IMAGE: "gemini-2.5-flash-image",
  IMAGE_GENERATION: "imagen-4.0-generate-001",
  VIDEO: "veo-3.1-fast-generate-preview",
};

// Kreditvikter per åtgärd (text ≈ ören, bild/video är de dyra)
const AI_CREDIT_COSTS = {
  generateContent: 1,
  formatPageWithAI: 1,
  generatePageContentFromPrompt: 1,
  generateDisplayPostContent: 1,
  refineDisplayPostContent: 1,
  generateHeadlineSuggestions: 1,
  generateBodySuggestions: 1,
  analyzeBrandFromWebsite: 5,
  generateImages: 10,
  generateDisplayPostImage: 10,
  editDisplayPostImage: 10,
  initiateVideoGeneration: 100,
  automationSuggestionText: 1,
  automationSuggestionImage: 10,
};

// Best-effort-mätning: får aldrig kasta, aldrig blockera
const trackAiUsage = (orgId, action, credits) => {
  if (!orgId || !credits) return;
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  db.collection("aiUsage").doc(`${orgId}_${month}`).set({
    orgId,
    month,
    totalCredits: FieldValue.increment(credits),
    counts: { [action]: FieldValue.increment(1) },
    updatedAt: new Date().toISOString(),
  }, { merge: true }).catch((e) => console.warn("aiUsage-mätning misslyckades:", e.message));
};

// Kontrollera månadens kreditförbrukning mot organisationens tak.
// Fel i kontrollen får ALDRIG blockera användaren (fail-open).
const checkAiCreditLimit = async (orgId) => {
  if (!orgId || String(orgId).startsWith("uid:")) return; // okänd org → mät men spärra inte
  try {
    const month = new Date().toISOString().slice(0, 7);
    const [usageSnap, orgSnap] = await Promise.all([
      db.collection("aiUsage").doc(`${orgId}_${month}`).get(),
      db.collection("organizations").doc(orgId).get(),
    ]);
    const used = usageSnap.data()?.totalCredits || 0;
    const limit = orgSnap.data()?.aiMonthlyCreditLimit || 4000;
    if (used >= limit) {
      throw new HttpsError(
        "resource-exhausted",
        "Månadens AI-krediter är förbrukade. Text fungerar fortfarande — bild- och videogenerering öppnas igen vid månadsskiftet, eller kontakta oss för utökad kvot."
      );
    }
  } catch (err) {
    if (err instanceof HttpsError) throw err; // riktig spärr släpps igenom
    console.warn("Kreditkontroll misslyckades (fail-open):", err.message);
  }
};

// Slå upp organisation från inloggad användare (för proxy-anrop utan orgId)
const resolveOrgIdFromAuth = async (uid) => {
  if (!uid) return null;
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    return userDoc.data()?.organizationId || null;
  } catch (e) { return null; }
};

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
/*                  QR Scan Tracking & Redirect                        */
/* ------------------------------------------------------------------ */

export const qrRedirect = onRequest({ region: "us-central1" }, async (req, res) => {
  try {
    // URL-format: .../qrRedirect/{orgId}/{screenId}/{postId}
    const [orgId, screenId, postId] = req.path.split("/").filter(Boolean);
    const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
    if (!ID_RE.test(orgId || "") || !ID_RE.test(screenId || "") || !ID_RE.test(postId || "")) {
      res.status(400).send("Ogiltig länk.");
      return;
    }

    const screenDoc = await db
      .collection("organizations").doc(orgId)
      .collection("displayScreens").doc(screenId).get();
    let screenData = screenDoc.exists ? screenDoc.data() : null;

    // Fallback: äldre organisationer har skärmarna som array på org-dokumentet
    if (!screenData) {
      const orgSnap = await db.collection("organizations").doc(orgId).get();
      const legacyScreens = orgSnap.data()?.displayScreens;
      if (Array.isArray(legacyScreens)) {
        screenData = legacyScreens.find((s) => s.id === screenId) || null;
      }
    }

    const post = parseScreenPosts(screenData).find((p) => p.id === postId);
    const target = post?.qrCodeUrl;

    // Endast redirect till URL:er som faktiskt ligger på inlägget (ingen open redirect)
    if (!target || !/^https?:\/\//i.test(target)) {
      res.status(404).send("Länken är inte längre aktiv.");
      return;
    }

    // Logga skanningen (fel här får inte stoppa redirecten)
    try {
      const today = new Date().toISOString().slice(0, 10);
      await db.collection("qrScanCounts").doc(postId).set({
        orgId,
        screenId,
        count: FieldValue.increment(1),
        daily: { [today]: FieldValue.increment(1) },
        lastScanAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) { /* ignorera loggfel */ }

    res.set("Cache-Control", "no-store");
    res.redirect(302, target);
  } catch (e) {
    res.status(500).send("Något gick fel.");
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

    const { prompt, image, orgId, screenId, postId } = request.data;
    if (orgId) await checkAiCreditLimit(orgId);
    trackAiUsage(orgId || null, "initiateVideoGeneration", AI_CREDIT_COSTS.initiateVideoGeneration);
    const API_KEY = process.env.API_KEY;

    if (!API_KEY) throw new HttpsError("internal", "Service configuration error.");

    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const model = AI_MODELS.VIDEO;
      
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

      if (orgId && postId) {
        try {
          await db.collection("organizations").doc(orgId).collection("videoOperations").add({
            orgId,
            postId,
            screenId: screenId || null,
            prompt: prompt || "",
            operationName,
            model,
            status: "processing",
            createdAt: new Date().toISOString(),
          });
        } catch (e) {
          console.warn("Kunde inte skriva videoOperations-dokument:", e);
        }
      }

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
            const posts = parseScreenPosts(postData);
            const idx = posts.findIndex(p => p.id === postId);
            
            if (idx > -1) {
                posts[idx].videoUrl = publicUrl;
                posts[idx].isAiGeneratedVideo = true;
                delete posts[idx].imageUrl;
                delete posts[idx].isAiGeneratedImage;
                t.update(postRef, { _serialized_posts: JSON.stringify(posts), posts: FieldValue.delete() });
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
    const refsToDelete = [];

    const subcollections = ["displayScreens", "suggestedPosts", "instagramStories", "videoOperations"];
    for (const sub of subcollections) {
        const subcollectionRef = orgRef.collection(sub);
        const snapshot = await subcollectionRef.get();
        if (!snapshot.empty) {
            snapshot.docs.forEach((doc) => refsToDelete.push(doc.ref));
        }
    }
    
    refsToDelete.push(orgRef);

    const usersQuery = db.collection("users").where("organizationId", "==", organizationId);
    const usersSnapshot = await usersQuery.get();
    const userIdsToDelete = [];
    if (!usersSnapshot.empty) {
        usersSnapshot.forEach((doc) => {
            userIdsToDelete.push(doc.id);
            refsToDelete.push(doc.ref);
        });
    }

    const pairingCodesQuery = db.collection("screenPairingCodes").where("organizationId", "==", organizationId);
    const pairingCodesSnapshot = await pairingCodesQuery.get();
    if (!pairingCodesSnapshot.empty) {
        pairingCodesSnapshot.forEach((doc) => refsToDelete.push(doc.ref));
    }

    for (let i = 0; i < refsToDelete.length; i += 400) {
      const batch = db.batch();
      refsToDelete.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

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
    const orgId = orgDoc.id;
    try {
      const org = orgDoc.data() || {};
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
      const ranAutomationIds = [];
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
          const alreadyToday = !!lastRunParts &&
            String(lastRunParts.year) === String(nowParts.year) &&
            String(lastRunParts.month) === String(nowParts.month) &&
            String(lastRunParts.day) === String(nowParts.day);
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

          const brandContext = [
              org.businessDescription ? `About the business: ${org.businessDescription}` : "",
              Array.isArray(org.businessType) && org.businessType.length ? `Industry: ${org.businessType.join(", ")}` : "",
          ].filter(Boolean).join("\n");

          const sp = org.styleProfile || {};
          const dnaContext = [
              sp.summary ? `Brand DNA summary: ${sp.summary}` : "",
              sp.brandPersonality ? `Brand personality: ${sp.brandPersonality}` : "",
              sp.targetAudience ? `Target audience: ${sp.targetAudience}` : "",
              sp.coreMessage ? `Core message: ${sp.coreMessage}` : "",
              sp.toneOfVoice ? `Tone of voice (all copy MUST follow this): ${sp.toneOfVoice}` : "",
          ].filter(Boolean).join("\n");

          const fullContext = [brandContext, dnaContext].filter(Boolean).join("\n");
          const brandContextPromptPart = fullContext 
              ? `\nUse this brand context and brand DNA to make the content specific, credible and on-brand:\n${fullContext}\n`
              : "";

          let prompt = "";

          // CHECK IF REMIXING
          if (automation.remixBasePostId) {
              let basePost = null;
              // Search all screens for the post
              for (const screen of displayScreens) {
                  basePost = parseScreenPosts(screen).find(p => p.id === automation.remixBasePostId);
                  if (basePost) break;
              }

              if (basePost) {
                  prompt = `You are an expert creative director for "${orgName}". Branding Color: ${org.primaryColor}.${brandContextPromptPart}
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
              prompt = `You are an expert creative director for "${orgName}". Automation Topic: "${automation.topic}". Branding Color: ${org.primaryColor}.${brandContextPromptPart}
              ${layoutConstraint}
              ${styleInstruction}
              Generate a complete post. Respond ONLY with a JSON object:
              { "headline": "SWEDISH", "body": "SWEDISH", "imagePrompt": "ENGLISH (NO TEXT, describe the image subject)", "layout": "text-only|image-fullscreen|image-left|image-right", "backgroundColor": "...", "textColor": "..." }`;
          }

          const textGen = await ai.models.generateContent({
            model: AI_MODELS.TEXT,
            contents: prompt,
          });

          let jsonString = String((textGen && textGen.text) || "").trim().replace(/^```json/, "").replace(/```$/, "");
          const postDetails = JSON.parse(jsonString);
          trackAiUsage(orgId, "automationSuggestionText", AI_CREDIT_COSTS.automationSuggestionText);

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
                const fullImagePrompt = `${postDetails.imagePrompt}. Style: ${imageStyle}.${sp.visualStyle ? ` Visual brand style: ${sp.visualStyle}.` : ""}`;
                
                const img = await ai.models.generateImages({
                  model: AI_MODELS.IMAGE_GENERATION,
                  prompt: fullImagePrompt,
                  config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio: screen.aspectRatio },
                });
                if (img.generatedImages) {
                  const imageBytes = img.generatedImages[0].image.imageBytes;
                  const bucket = storage.bucket();
                  const fileName = `organizations/${orgId}/ai-automation-assets/${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;
                  const file = bucket.file(fileName);
                  const token = randomUUID();
                  await file.save(Buffer.from(imageBytes, "base64"), {
                      metadata: {
                          contentType: "image/jpeg",
                          metadata: { firebaseStorageDownloadTokens: token }
                      }
                  });
                  imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${token}`;
                  trackAiUsage(orgId, "automationSuggestionImage", AI_CREDIT_COSTS.automationSuggestionImage);
                }
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
              durationSeconds: automation.durationSeconds || Number(postDetails.durationSeconds) || 15,
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
          ranAutomationIds.push(automation.id);
          hasChanges = true;
        } catch (err) {
          console.error(`Automation error for ${orgId}:`, err);
        }
      }

      if (hasChanges) {
        const orgRef = db.collection("organizations").doc(orgId);

        // lastRunAt sätts FÖRST: om förslagsskrivningen sedan felar förloras
        // körningen (hellre än att dubbletter skapas var 15:e minut).
        // lastRunAt: transaktion mot färsk data så att användarens samtidiga ändringar inte skrivs över
        const ranIds = new Set(ranAutomationIds);
        await db.runTransaction(async (t) => {
          const snap = await t.get(orgRef);
          const fresh = Array.isArray(snap.data()?.aiAutomations) ? snap.data().aiAutomations : [];
          const merged = fresh.map((a) => ranIds.has(a.id) ? { ...a, lastRunAt: now.toISOString() } : a);
          t.update(orgRef, { aiAutomations: merged });
        });

        // Nya förslagsdokument: vanlig batch (nya dokument, ingen konfliktrisk)
        const batch = db.batch();
        for (const sugg of newSuggestions) {
          const suggRef = orgRef.collection("suggestedPosts").doc(sugg.id);
          batch.set(suggRef, { ...sugg, createdAt: new Date().toISOString() });
        }
        await batch.commit();
      }
    } catch (err) {
      console.error(`Automation för org ${orgId} misslyckades:`, err);
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

/* ------------------------------------------------------------------ */
/*                  Screen Monitoring: Offline Alerts                  */
/* ------------------------------------------------------------------ */

export const checkScreenHeartbeats = onSchedule(
  { schedule: "every 15 minutes", region: "us-central1", timeoutSeconds: 120 },
  async () => {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000); // 10 min utan puls = offline

    // Endast sessioner som fortfarande tros vara online — så larmet skickas EN gång per avbrott
    const snap = await db.collection("screenSessions")
      .where("status", "==", "online")
      .where("lastHeartbeat", "<", cutoff)
      .get();

    if (snap.empty) return;

    for (const doc of snap.docs) {
      const session = doc.data();
      const deviceId = doc.id;
      const orgId = session.organizationId;
      if (!orgId) continue;

      try {
        // 1. Slå upp skärmens namn
        const orgSnap = await db.collection("organizations").doc(orgId).get();
        const org = orgSnap.data() || {};
        const physicalScreen = (org.physicalScreens || []).find((s) => s.id === deviceId);
        const screenName = physicalScreen?.name || "Ett skyltfönster";

        // 2. Notifiera organisationens ADMINS via befintliga notissystemet
        const adminsSnap = await db.collection("users").where("organizationId", "==", orgId).get();
        const adminDocs = adminsSnap.docs.filter((d) => String(d.data().role || "").toLowerCase().includes("admin"));

        const lastSeen = session.lastHeartbeat?.toDate
          ? session.lastHeartbeat.toDate().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" })
          : "okänd tid";

        // Chunka i grupper om 400 (Firestores batchtak är 500 operationer)
        for (let i = 0; i < adminDocs.length; i += 400) {
          const batch = db.batch();
          adminDocs.slice(i, i + 400).forEach((adminDoc) => {
            const notifRef = db.collection("users").doc(adminDoc.id).collection("notifications").doc();
            batch.set(notifRef, {
              type: "warning",
              title: "Skyltfönster offline",
              message: `${screenName} har slutat rapportera (senast sedd ${lastSeen}). Kontrollera att TV:n har ström och nätverk.`,
              createdAt: new Date().toISOString(),
              isRead: false,
              relatedScreenId: deviceId,
            });
          });
          await batch.commit();
        }

        // 3. Flippa status SIST — nu är larmet levererat. (Om notiserna felar ovan
        // förblir status "online" och larmet försöks igen nästa körning.)
        await doc.ref.update({ status: "offline", offlineDetectedAt: FieldValue.serverTimestamp() });
      } catch (err) {
        console.error(`Offline-larm misslyckades för ${deviceId}:`, err);
      }
    }
  }
);

/* ------------------------------------------------------------------ */
/*        Booking Calendar: dagens lediga tider från iCal              */
/* ------------------------------------------------------------------ */

const BOOKING_TZ = "Europe/Stockholm";

// Nyckelordningsoberoende jämförelse (Firestore sorterar map-nycklar)
const stableStringify = (v) => {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${k}:${stableStringify(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
};

const toLocalParts = (d) => {
  const date = d.toLocaleDateString("sv-SE", { timeZone: BOOKING_TZ });
  const [h, m] = d.toLocaleTimeString("sv-SE", { timeZone: BOOKING_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
  return { date, minutes: h * 60 + m };
};

const minutesToHHMM = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

export const syncBookingCalendars = onSchedule(
  { schedule: "every 15 minutes", region: "us-central1", timeoutSeconds: 300, memory: "512MiB" },
  async () => {
    const orgsSnap = await db.collection("organizations").get();
    const now = new Date();
    const { date: todayStr, minutes: nowMinutes } = toLocalParts(now);
    const weekday = new Date(now.toLocaleString("en-US", { timeZone: BOOKING_TZ })).getDay(); // 0 = söndag

    for (const orgDoc of orgsSnap.docs) {
      const orgData = orgDoc.data() || {};
      const privateDoc = await db.collection("orgPrivateSettings").doc(orgDoc.id).get();
      const privateData = privateDoc.exists ? privateDoc.data() : null;
      const icsUrls = privateData?.icsUrls || {};

      const bookingCalendars = (orgData.bookingCalendars || []).filter((e) => {
        if (!e || !e.enabled) return false;
        const icsUrl = icsUrls[e.id] || e.icsUrl;
        return Boolean(icsUrl);
      });

      if (bookingCalendars.length === 0) {
        // Städa bort inaktuell data om kalendrarna tagits bort/inaktiverats
        if (orgData.todaysAvailableSlots) {
          await orgDoc.ref.update({ todaysAvailableSlots: FieldValue.delete() })
            .catch((err) => console.error(`Kunde inte städa slots för org ${orgDoc.id}:`, err));
        }
        continue;
      }

      const byCalendar = {};

      for (const entry of bookingCalendars) {
        const icsUrl = icsUrls[entry.id] || entry.icsUrl;
        if (!entry.enabled || !icsUrl) continue;

        try {
          const events = await ical.async.fromURL(icsUrl, { timeout: 15000 });

          // INTEGRITET: vi läser ENDAST tidsblock. Titlar, beskrivningar och deltagare
          // (kan innehålla kundnamn) får aldrig läsas, loggas eller sparas.
          const busy = [];
          // Brett fönster ±36h för rrule-expansion; exakt dagfiltrering görs sedan
          // per förekomst i svensk tid (toLocalParts), vilket löser tidszonsproblemet.
          const windowStart = new Date(now.getTime() - 36 * 3600000);
          const windowEnd = new Date(now.getTime() + 36 * 3600000);

          for (const key of Object.keys(events)) {
            const ev = events[key];
            if (ev.type !== "VEVENT" || !ev.start) continue;

            const occurrences = [];
            if (ev.rrule) {
              const durationMs = (ev.end?.getTime() || ev.start.getTime()) - ev.start.getTime();
              ev.rrule.between(windowStart, windowEnd, true).forEach((occStart) => {
                // EXDATE: hoppa över inställda förekomster
                if (ev.exdate && Object.values(ev.exdate).some((d) => d?.getTime && Math.abs(d.getTime() - occStart.getTime()) < 60000)) return;
                // Förekomster med override (RECURRENCE-ID) ersätts av sina nya tider nedan
                if (ev.recurrences && Object.values(ev.recurrences).some((r) => r?.recurrenceid?.getTime && Math.abs(r.recurrenceid.getTime() - occStart.getTime()) < 60000)) return;
                occurrences.push({ start: occStart, end: new Date(occStart.getTime() + durationMs) });
              });
              // Lägg till flyttade förekomster med sina NYA tider
              if (ev.recurrences) {
                for (const rec of Object.values(ev.recurrences)) {
                  if (rec && rec.start) occurrences.push({ start: rec.start, end: rec.end || rec.start });
                }
              }
            } else {
              occurrences.push({ start: ev.start, end: ev.end || ev.start });
            }

            for (const occ of occurrences) {
              const s = toLocalParts(occ.start);
              const e = toLocalParts(occ.end);

              if (ev.datetype === "date") {
                // Heldagshändelser: DTEND är EXKLUSIVT (RFC 5545) — blockera [startdag, slutdag)
                const coversToday = s.date <= todayStr && (e.date > s.date ? todayStr < e.date : todayStr === s.date);
                if (coversToday) busy.push({ start: 0, end: 1440 });
                continue;
              }

              if (s.date > todayStr || e.date < todayStr) continue;
              // Tidsatt händelse som slutar exakt 00:00 idag tillhör gårdagen
              if (e.date === todayStr && e.minutes === 0 && s.date < todayStr) continue;

              busy.push({
                start: s.date === todayStr ? s.minutes : 0,
                end: e.date === todayStr ? e.minutes : 1440,
              });
            }
          }

          // Räkna luckor mot arbetstiderna
          const day = entry.workingHours?.[weekday];
          const slotMin = Number(entry.slotMinutes) || 60;
          const isClosed = !(day?.enabled && day.start && day.end);
          const slots = [];
          if (day?.enabled && day.start && day.end) {
            const [wsH, wsM] = day.start.split(":").map(Number);
            const [weH, weM] = day.end.split(":").map(Number);
            const workStart = wsH * 60 + wsM;
            const workEnd = weH * 60 + weM;
            for (let t = workStart; t + slotMin <= workEnd; t += slotMin) {
              if (t < nowMinutes) continue; // visa aldrig passerade tider
              const isFree = !busy.some((b) => t < b.end && t + slotMin > b.start);
              if (isFree) slots.push(minutesToHHMM(t));
            }
          }

          byCalendar[entry.id] = {
            staffName: entry.staffName,
            slots,
            ...(isClosed ? { closed: true } : {}),
          };
        } catch (err) {
          console.error(`Kalendersynk misslyckades för personal ${entry.staffName} i org ${orgDoc.id}:`, err.message);
          byCalendar[entry.id] = {
            staffName: entry.staffName,
            slots: [],
            error: "Kunde inte hämta kalendern. Kontrollera att länken är korrekt.",
          };
        }
      }

      const prev = orgData.todaysAvailableSlots;
      const unchanged = prev &&
        prev.date === todayStr &&
        stableStringify(prev.byCalendar || {}) === stableStringify(byCalendar);

      if (!unchanged) {
        try {
          await orgDoc.ref.update({
            todaysAvailableSlots: {
              date: todayStr,
              byCalendar,
              updatedAt: new Date().toISOString(),
            },
          });
        } catch (err) {
          console.error(`Misslyckades att uppdatera bokningsslots för org ${orgDoc.id}:`, err);
        }
      }
    }
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

        const usageCredits = AI_CREDIT_COSTS[action] || 1;
        const usageOrgId = (await resolveOrgIdFromAuth(request.auth.uid)) || `uid:${request.auth.uid}`;
        if (usageCredits >= 10) {
          await checkAiCreditLimit(usageOrgId);
        }
        trackAiUsage(usageOrgId, action, usageCredits);

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
              return { text: response.text, functionCalls: response.functionCalls || [] };
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

                const siteData = await fetchSiteBrandData(params.url);

                if (siteData) {
                    const themeColorInfo = siteData.themeColor ? `Meta theme-color: ${siteData.themeColor}` : '';
                    const colorsList = siteData.colorCandidates.length > 0
                        ? siteData.colorCandidates.join(', ')
                        : 'Inga specifika hexfärger hittades i CSS';

                    const prompt = `
                        Analyze the brand identity of this website (${params.url}).
                        Extract the following information based on the actual scraped site data provided below:

                        Sidans text (utdrag):
                        ${siteData.visibleText}

                        Färger som FAKTISKT förekommer i sidans HTML/CSS, sorterade efter frekvens:
                        ${colorsList}
                        ${themeColorInfo}

                        Logotypkandidater:
                        ${siteData.logoCandidates.join(', ') || 'Inga tydliga logobilder hittades'}

                        Instruktion:
                        1. primaryColor och secondaryColor MÅSTE väljas ur färglistan ovan — hitta ALDRIG på egna hexkoder. Välj de två mättade färger som tydligast bär sajtens identitet (primär = den mest framträdande profilfärgen, sekundär = komplementet, t.ex. bakgrunds-/jordton om sådan finns i listan). Anges som hexkod (t.ex. #ff6600).
                        2. Font style for headlines (categorize as 'sans', 'serif', 'display', or 'script').
                        3. Font style for body text (categorize as 'sans' or 'serif').
                        4. A concise business description (max 2 sentences) in Swedish.
                        5. 3-5 short phrases or keywords from the site that capture the tone of voice (in Swedish).
                        6. A list of 1-3 business type keywords (e.g. Café, Butik, Frisör, Konsult) in Swedish.
                        7. The URL of the main logo image found on the website. Prefer a direct image link from the candidates or site.

                        Svara ENDAST med ett giltigt JSON-objekt utan markdown eller övrig text, med EXAKT dessa nycklar:
                        { "primaryColor": "#hex", "secondaryColor": "#hex", "headlineFontCategory": "sans|serif|display|script", "bodyFontCategory": "sans|serif", "businessDescription": "...", "textSnippets": ["...", "..."], "businessType": ["..."], "logoUrl": "https://..." }
                    `;

                    const response = await ai.models.generateContent({
                        model: AI_MODELS.TEXT,
                        contents: prompt,
                        config: {
                            responseMimeType: "application/json"
                        }
                    });

                    return { text: response.text };
                }

                const response = await ai.models.generateContent({
                    model: AI_MODELS.TEXT,
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
                        Svara ENDAST med ett giltigt JSON-objekt utan markdown eller övrig text, med EXAKT dessa nycklar:
                        { "primaryColor": "#hex", "secondaryColor": "#hex", "headlineFontCategory": "sans|serif|display|script", "bodyFontCategory": "sans|serif", "businessDescription": "...", "textSnippets": ["...", "..."], "businessType": ["..."], "logoUrl": "https://..." }
                    `,
                    config: {
                        tools: [{googleSearch: {}}]
                    }
                });
                
                return { text: response.text };
            }

            // --- Specialized Handlers (kept for compatibility) ---

            case "formatPageWithAI": {
              const response = await ai.models.generateContent({ 
                  model: AI_MODELS.TEXT_LIGHT, 
                  contents: `Format to Markdown: ${params.rawContent}` 
              });
              return (response && response.text) || "";
            }

            case "generatePageContentFromPrompt": {
              const response = await ai.models.generateContent({ 
                  model: AI_MODELS.TEXT, 
                  contents: `Write info page in Swedish Markdown based on: ${params.userPrompt}` 
              });
              return (response && response.text) || "";
            }

            case "generateDisplayPostContent": {
              const response = await ai.models.generateContent({
                model: AI_MODELS.TEXT,
                contents: `Copywriter for "${params.organizationName}". Idea: ${params.userPrompt}.\n${params.dnaContext || ""}\nJSON: {headline, body}`,
                config: { responseMimeType: "application/json" },
              });
              return JSON.parse(response.text || "{}");
            }

            case "generateHeadlineSuggestions": {
              const response = await ai.models.generateContent({
                model: AI_MODELS.TEXT,
                contents: `5 headline suggestions for: "${params.body}". Avoid: ${JSON.stringify(params.existingHeadlines)}.\n${params.dnaContext || ""}\nJSON: {headlines:[]}`,
                config: { responseMimeType: "application/json" },
              });
              return JSON.parse(response.text || "{}").headlines || [];
            }

            case "generateBodySuggestions": {
              const response = await ai.models.generateContent({
                model: AI_MODELS.TEXT,
                contents: `3 body copy suggestions for headline: "${params.headline}". Avoid: ${JSON.stringify(params.existingBodies)}.\n${params.dnaContext || ""}\nJSON: {bodies:[]}`,
                config: { responseMimeType: "application/json" },
              });
              return JSON.parse(response.text || "{}").bodies || [];
            }

            case "refineDisplayPostContent": {
              const response = await ai.models.generateContent({
                model: AI_MODELS.TEXT,
                contents: `Refine text. Headline: ${params.content.headline}, Body: ${params.content.body}. Command: ${params.command}.\n${params.dnaContext || ""}\nJSON: {headline, body}`,
                config: { responseMimeType: "application/json" },
              });
              return JSON.parse(response.text || "{}");
            }

            case "generateDisplayPostImage": {
              const resp = await ai.models.generateImages({
                model: AI_MODELS.IMAGE_GENERATION,
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
                if (params.logo) {
                    parts.push({ inlineData: { data: params.logo.base64Data, mimeType: params.logo.mimeType } });
                }
                const response = await ai.models.generateContent({
                    model: AI_MODELS.IMAGE,
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
