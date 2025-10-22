// functions/index.js
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const {GoogleGenAI, Type, Modality} = require("@google/genai");
const {onDocumentDeleted} = require("firebase-functions/v2/firestore");

admin.initializeApp();
const db = admin.firestore();

// --- VÅR NYA TESTFUNKTION ---
exports.testFunction = onCall((request) => {
  // request.auth innehåller automatiskt information om den inloggade användaren.
  console.log("Test function called by:", request.auth ? request.auth.uid : "unauthenticated user");

  // Skicka tillbaka ett enkelt svar för att bekräfta att kopplingen fungerar
  return {
    message: "Hej från molnet! Kopplingen fungerar.",
    timestamp: new Date().toISOString(),
  };
});


// --- USER INVITATION FUNCTION ---
exports.inviteUser = onCall(async (request) => {
    // Authentication check
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Du måste vara inloggad för att lägga till användare.");
    }
    const { organizationId, email } = request.data;

    // Validate input
    if (!organizationId || !email) {
        throw new HttpsError("invalid-argument", "Saknar nödvändig information (organisation eller e-post).");
    }
    
    try {
        // Check if an admin with this email already exists in the system.
        // A more complex app might allow a user to belong to multiple orgs, but for now we'll keep it simple.
        const existingUsers = await db.collection("users").where("email", "==", email).limit(1).get();
        if (!existingUsers.empty) {
            throw new HttpsError("already-exists", "Denna administratör finns redan.");
        }
        
        // Find or create the user in Firebase Auth.
        let userRecord;
        try {
            userRecord = await admin.auth().getUserByEmail(email);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                // User does not exist, so create them.
                userRecord = await admin.auth().createUser({
                    email: email,
                    emailVerified: false, // User will need to use "Forgot Password" to set their password.
                });
            } else {
                // Re-throw other auth errors (e.g., invalid-email).
                throw error;
            }
        }

        // Create the user document in Firestore to link them to the organization as an admin.
        await db.collection("users").doc(userRecord.uid).set({
            email: email,
            organizationId: organizationId,
            role: "organizationadmin",
            adminRole: "admin", // New users always start as a standard admin.
        });
        
        // Return success message. The frontend will handle UI updates.
        return { success: true, message: "Administratören har lagts till." };

    } catch (error) {
        // If it's an HttpsError we threw, re-throw it.
        if (error instanceof HttpsError) {
            throw error;
        }
        // Handle Firebase Auth errors that might be thrown (like invalid-email).
        if (error.code && error.code.startsWith('auth/')) {
            throw new HttpsError('invalid-argument', 'Ogiltig e-postadress.');
        }
        // Log other errors and throw a generic one.
        console.error("Error in inviteUser function:", error);
        throw new HttpsError("internal", "Ett oväntat fel inträffade. Försök igen.");
    }
});


// --- NEW: AI AUTOMATION SCHEDULER ---
exports.runAiAutomations = onSchedule({
    schedule: "every 15 minutes",
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540,
    memory: "512MiB",
}, async (event) => {
    const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
    const now = new Date(event.time); // This is UTC from Firebase
    const lastCheckTime = new Date(now.getTime() - (15 * 60 * 1000)); // 15 minutes ago
    console.log(`[Scheduler] Running AI Automations check at ${now.toISOString()}`);

    // Helper function to safely convert various date formats to a valid Date object or null.
    const toValidDate = (value) => {
        if (!value) return null; // Handles null, undefined, ""
        // Firestore Timestamp
        if (typeof value.toDate === "function") {
            return value.toDate();
        }
        // String or Number (ISO string, unix ms, etc.)
        if (typeof value === "string" || typeof value === "number") {
            const d = new Date(value);
            if (!isNaN(d.getTime())) {
                return d;
            }
        }
        // Already a valid Date object
        if (value instanceof Date && !isNaN(value.getTime())) {
            return value;
        }
        // Return null for invalid or unsupported types (like invalid Date objects)
        return null;
    };


    const orgsSnapshot = await db.collection("organizations").get();
    if (orgsSnapshot.empty) {
        console.log("[Scheduler] No organizations found.");
        return;
    }

    const promises = orgsSnapshot.docs.map(async (doc) => {
        const org = doc.data();
        if (!org.aiAutomations || org.aiAutomations.length === 0) {
            return; // Skip org if no automations are configured
        }

        let hasChanges = false;
        const newSuggestions = [];
        const updatedAutomations = JSON.parse(JSON.stringify(org.aiAutomations));

        for (const automation of updatedAutomations) {
            if (!automation.isEnabled) {
                console.log(`[Automation: ${automation.id}] Skipping: Disabled.`);
                continue;
            }

            const timezone = automation.timezone || "Europe/Stockholm";
            const [scheduledHour, scheduledMinute] = automation.timeOfDay.split(":").map(Number);
            const scheduledTimeInMinutes = scheduledHour * 60 + scheduledMinute;

            const nowInTz = new Intl.DateTimeFormat("en-US", {
                timeZone: timezone, hour12: false,
                year: "numeric", month: "numeric", day: "numeric",
                hour: "numeric", minute: "numeric", weekday: "numeric", // 1=Mon, 7=Sun
            }).formatToParts(now).reduce((acc, p) => ({...acc, [p.type]: p.value}), {});

            const lastCheckInTz = new Intl.DateTimeFormat("en-US", {
                timeZone: timezone, hour12: false,
                year: "numeric", month: "numeric", day: "numeric",
                hour: "numeric", minute: "numeric",
            }).formatToParts(lastCheckTime).reduce((acc, p) => ({...acc, [p.type]: p.value}), {});
            
            const nowTimeInMinutes = parseInt(nowInTz.hour) * 60 + parseInt(nowInTz.minute);
            const lastCheckTimeInMinutes = parseInt(lastCheckInTz.hour) * 60 + parseInt(lastCheckInTz.minute);
            
            const dayRolledOver = nowInTz.day !== lastCheckInTz.day || nowInTz.month !== lastCheckInTz.month || nowInTz.year !== lastCheckInTz.year;

            let timeMatched = false;
            if (dayRolledOver) {
                timeMatched = scheduledTimeInMinutes > lastCheckTimeInMinutes || scheduledTimeInMinutes <= nowTimeInMinutes;
            } else {
                timeMatched = scheduledTimeInMinutes > lastCheckTimeInMinutes && scheduledTimeInMinutes <= nowTimeInMinutes;
            }

            if (!timeMatched) {
                console.log(`[Automation: ${automation.id}] Skipping: Time (${automation.timeOfDay} ${timezone}) not in the 15-min window.`);
                continue;
            }

            const lastRun = toValidDate(automation.lastRunAt); // SAFELY parse the date

            if (lastRun) { // This check is now safe because toValidDate returns null for invalid values
                const lastRunInTz = new Intl.DateTimeFormat("en-US", {
                    timeZone: timezone,
                    year: "numeric", month: "numeric", day: "numeric",
                }).formatToParts(lastRun).reduce((acc, p) => ({...acc, [p.type]: p.value}), {});
                
                if (lastRunInTz.year === nowInTz.year && lastRunInTz.month === nowInTz.month && lastRunInTz.day === nowInTz.day) {
                    console.log(`[Automation: ${automation.id}] Skipping: Already ran today in the target timezone.`);
                    continue;
                }
            } else if (automation.lastRunAt) {
              // Log if there was a value but it was invalid, then proceed as if never run.
              console.log(`[Automation: ${automation.id}] Found invalid lastRunAt value, treating as never run. Value:`, automation.lastRunAt);
            }

            let frequencyMatched = false;
            const dayOfWeekInTz = parseInt(nowInTz.weekday); // Intl: 1=Mon, 7=Sun
            const dayOfMonthInTz = parseInt(nowInTz.day);

            switch (automation.frequency) {
                case "daily":
                    frequencyMatched = true;
                    break;
                case "weekly":
                    if (dayOfWeekInTz === automation.dayOfWeek) frequencyMatched = true;
                    break;
                case "monthly":
                    if (dayOfMonthInTz === automation.dayOfMonth) frequencyMatched = true;
                    break;
            }
            
            if (!frequencyMatched) {
                console.log(`[Automation: ${automation.id}] Skipping: Frequency did not match.`);
                continue;
            }

            console.log(`[Automation: ${automation.id}] TRIGGERED. Generating content for "${automation.name}" in org "${org.name}"`);
            
            try {
                const history = (org.suggestedPosts || [])
                    .filter((p) => p.automationId === automation.id)
                    .slice(-10);

                const approved = history.filter((p) => p.status === "approved" || p.status === "edited-and-published");
                const rejected = history.filter((p) => p.status === "rejected");

                let feedbackContext = "No feedback history available yet.";
                if (approved.length > 0 || rejected.length > 0) {
                    feedbackContext = `Here is a summary of the user's feedback on previous suggestions for this automation:\n`;
                    if (approved.length > 0) {
                        feedbackContext += `- The user LIKED and APPROVED these (emulate this style):\n${approved.map((p) => `  - Headline: "${p.postData.headline}"`).join("\n")}\n`;
                    }
                    if (rejected.length > 0) {
                        feedbackContext += `- The user DISLIKED and REJECTED these (avoid this style):\n${rejected.map((p) => `  - Headline: "${p.postData.headline}"`).join("\n")}\n`;
                    }
                }
                
                const styleProfileContext = (org.styleProfile?.summary) ? `User's style profile:\n---\n${org.styleProfile.summary}\n---\n` : "";

                const prompt = `You are an expert creative director for "${org.name}", a company in the ${org.businessType?.join(", ")} sector.
Your task is to generate a new, compelling post suggestion for a digital sign.

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
                
                const textGenResponse = await ai.models.generateContent({model: "gemini-2.5-flash", contents: prompt});
                
                let jsonString = textGenResponse.text.trim();
                if (jsonString.startsWith("```json")) jsonString = jsonString.substring(7);
                if (jsonString.endsWith("```")) jsonString = jsonString.substring(0, jsonString.length - 3);
                const postDetails = JSON.parse(jsonString);

                for (const screenId of automation.targetScreenIds) {
                    const screen = org.displayScreens?.find((s) => s.id === screenId);
                    if (!screen) {
                        console.log(`[Automation: ${automation.id}] Skipping screen ${screenId}: Not found.`);
                        continue;
                    }

                    let imageUrl;
                    if (postDetails.layout !== "text-only" && postDetails.imagePrompt) {
                         const imageResponse = await ai.models.generateImages({
                            model: "imagen-4.0-generate-001",
                            prompt: postDetails.imagePrompt,
                            config: {numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio: screen.aspectRatio},
                        });
                        if (imageResponse.generatedImages && imageResponse.generatedImages.length > 0) {
                            imageUrl = `data:image/jpeg;base64,${imageResponse.generatedImages[0].image.imageBytes}`;
                        }
                    }

                    const newPostData = {
                        id: `sugg-post-${Date.now()}`,
                        internalTitle: `AI: ${postDetails.headline}`,
                        headline: postDetails.headline,
                        body: postDetails.body,
                        layout: postDetails.layout,
                        durationSeconds: 15,
                        backgroundColor: postDetails.backgroundColor,
                        textColor: postDetails.textColor,
                        imageOverlayEnabled: postDetails.imageOverlayEnabled,
                        textAlign: postDetails.textAlign,
                        textAnimation: postDetails.textAnimation,
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

                automation.lastRunAt = now.toISOString();
                hasChanges = true;

            } catch (err) {
                console.error(`[Automation: ${automation.id}] CRITICAL ERROR during generation for org ${org.id}:`, err);
            }
        }

        if (hasChanges) {
            console.log(`[Org: ${org.id}] Updating Firestore with ${newSuggestions.length} new suggestion(s).`);
            try {
                const updatePayload = {
                    aiAutomations: updatedAutomations,
                    suggestedPosts: admin.firestore.FieldValue.arrayUnion(...newSuggestions),
                };
                await db.collection("organizations").doc(org.id).update(updatePayload);
                console.log(`[Org: ${org.id}] Firestore updated successfully.`);
            } catch (updateError) {
                console.error(`[Org: ${org.id}] FAILED to update Firestore:`, updateError);
            }
        }
    });

    await Promise.all(promises);
    console.log("[Scheduler] AI Automations check finished.");
});

// --- NEW MEDIA CLEANUP FUNCTION ---
exports.cleanupDeletedPostMedia = onDocumentDeleted("organizations/{organizationId}/displayScreens/{screenId}/posts/{postId}", async (event) => {
  const post = event.data.data();

  if (!post) {
    console.log(`No data for deleted post ${event.params.postId}.`);
    return null;
  }
  
  console.log(`Post ${event.params.postId} deleted from org ${event.params.organizationId}. Cleaning up media...`);
  
  const storage = admin.storage();
  const bucket = storage.bucket();
  const deletionPromises = [];
  
  const urls = new Set();
  if (post.imageUrl) urls.add(post.imageUrl);
  if (post.videoUrl) urls.add(post.videoUrl);
  if (post.backgroundVideoUrl) urls.add(post.backgroundVideoUrl);
  if (post.subImages) post.subImages.forEach((si) => si.imageUrl && urls.add(si.imageUrl));
  if (post.collageItems) {
    post.collageItems.forEach((ci) => {
      if (ci && ci.imageUrl) urls.add(ci.imageUrl);
      if (ci && ci.videoUrl) urls.add(ci.videoUrl);
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
            }),
        );
      }
    }
  });

  await Promise.all(deletionPromises);
  console.log(`Cleanup complete. Attempted to delete ${deletionPromises.length} files.`);
  return {message: `Cleaned up media for post.`};
});


// --- NEW INSTAGRAM FUNCTIONS ---
/*
// TILLFÄLLIGT INAKTIVERAD: Denna funktion kräver en INSTAGRAM_ACCESS_TOKEN.
// Avkommentera hela blocket när ni har en token och har lagt till den som en secret i Google Cloud.
exports.fetchInstagramStories = onSchedule({
    schedule: "every 15 minutes",
    secrets: ["INSTAGRAM_ACCESS_TOKEN"],
    timeoutSeconds: 300,
    memory: "256MiB",
}, async (event) => {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    if (!accessToken) {
        console.error("CRITICAL: INSTAGRAM_ACCESS_TOKEN secret is not available.");
        return;
    }

    const orgsSnapshot = await db.collection("organizations").where("instagramUserId", ">", "").get();
    if (orgsSnapshot.empty) {
        console.log("No organizations with Instagram User ID configured.");
        return;
    }

    for (const doc of orgsSnapshot.docs) {
        const org = doc.data();
        const userId = org.instagramUserId;
        const orgId = org.id;

        console.log(`Fetching stories for org: ${orgId}, user: ${userId}`);

        // 1. Clean up old stories first
        const oldStoriesSnapshot = await db.collection("organizations").doc(orgId).collection("instagramStories").get();
        if (!oldStoriesSnapshot.empty) {
            const deleteBatch = db.batch();
            oldStoriesSnapshot.docs.forEach((storyDoc) => deleteBatch.delete(storyDoc.ref));
            await deleteBatch.commit();
            console.log(`Cleaned up ${oldStoriesSnapshot.size} old stories for org ${orgId}.`);
        }

        // 2. Fetch new stories
        const url = `https://graph.facebook.com/v19.0/${userId}/stories?fields=id,media_url,timestamp,media_type,thumbnail_url&access_token=${accessToken}`;
        
        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.error) {
                console.error(`Error fetching stories for user ${userId} (org: ${orgId}):`, data.error.message);
                continue; // Continue to next organization
            }

            if (!data.data || data.data.length === 0) {
                console.log(`No active stories found for user ${userId}.`);
                continue;
            }

            // 3. Save new stories
            const saveBatch = db.batch();
            for (const story of data.data) {
                const storyRef = db.collection("organizations").doc(orgId).collection("instagramStories").doc(story.id);
                saveBatch.set(storyRef, {
                    id: story.id,
                    mediaUrl: story.media_url,
                    mediaType: story.media_type,
                    thumbnailUrl: story.thumbnail_url || null,
                    timestamp: story.timestamp,
                });
            }
            await saveBatch.commit();
            console.log(`Fetched and stored ${data.data.length} new stories for organization ${orgId}.`);
        } catch (e) {
            console.error(`An unexpected error occurred while fetching stories for org ${orgId}:`, e);
        }
    }
});
*/

// --- GEMINI PROXY FUNCTION ---
exports.gemini = onCall({
    region: "us-central1",
    cors: true,
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540, // Increased timeout for long operations like video generation
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to use the AI service.");
    }

    const {action, params} = request.data;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("CRITICAL: Gemini API Key secret is not available.");
        throw new HttpsError("internal", "AI service is not configured correctly.");
    }
    
    const ai = new GoogleGenAI({apiKey});
    console.log(`Received Gemini call for action: ${action}`);

    try {
        switch (action) {
            case "formatPageWithAI": {
                const {rawContent} = params;
                const prompt = `You are a world-class digital content designer... (rest of the detailed prompt) ... Raw text to transform: --- ${rawContent} ---`;
                // FIX: Updated model name per Gemini API guidelines.
                const response = await ai.models.generateContent({model: "gemini-2.5-flash", contents: prompt});
                return response.text;
            }

            case "generatePageContentFromPrompt": {
                const {userPrompt} = params;
                const prompt = `You are a world-class digital content designer... (prompt details) ... The user's idea/prompt is: --- ${userPrompt} ---`;
                // FIX: Updated model name per Gemini API guidelines.
                const response = await ai.models.generateContent({model: "gemini-2.5-flash", contents: prompt});
                return response.text;
            }

            case "generateDisplayPostContent": {
                const {userPrompt, organizationName} = params;
                const prompt = `You are an expert copywriter... for a company named "${organizationName}"... The user's idea is: --- ${userPrompt} ---`;
                // FIX: Updated model name per Gemini API guidelines.
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {headline: {type: Type.STRING}, body: {type: Type.STRING}},
                            required: ["headline", "body"],
                        },
                    },
                });
                return JSON.parse(response.text.trim());
            }

            case "generateCompletePost": {
                const {userPrompt, organizationName, aspectRatio} = params;
                
                // Step 1: Generate text content and image prompt
                // FIX: Updated model name per Gemini API guidelines.
                const textGenResponse = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: `Du är en expert på marknadsföring och copywriting för ett företag som heter "${organizationName}". Användaren vill skapa ett inlägg för en digital skylt baserat på följande idé: "${userPrompt}". Svara med ett JSON-objekt som innehåller:
1.  'headline': En kort, slagkraftig rubrik.
2.  'body': En kort brödtext som utvecklar rubriken.
3.  'imagePrompt': En detaljerad, kreativ och professionell prompt på SVENSKA för en AI-bildgenerator för att skapa en matchande bild.`,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                headline: {type: Type.STRING},
                                body: {type: Type.STRING},
                                imagePrompt: {type: Type.STRING},
                            },
                            required: ["headline", "body", "imagePrompt"],
                        },
                    },
                });

                const content = JSON.parse(textGenResponse.text.trim());
                
                // Step 2: Generate image
                // FIX: Updated model name per Gemini API guidelines.
                const imageResponse = await ai.models.generateImages({
                    model: "imagen-4.0-generate-001",
                    prompt: content.imagePrompt,
                    config: {numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio},
                });

                if (!imageResponse.generatedImages || imageResponse.generatedImages.length === 0) {
                     throw new HttpsError("not-found", "AI:n kunde inte generera en bild.");
                }

                const imageUrl = `data:image/jpeg;base64,${imageResponse.generatedImages[0].image.imageBytes}`;

                // Step 3: Return combined result
                return {
                    headline: content.headline,
                    body: content.body,
                    imageUrl: imageUrl,
                };
            }

            case "generateHeadlineSuggestions": {
                const {body, existingHeadlines} = params;
                const prompt = `You are an expert copywriter... The body text is: --- ${body} --- ${(existingHeadlines && existingHeadlines.length > 0) ? `Your suggestions should be different from these existing headlines: "${existingHeadlines.join('", "')}".` : ""}`;
                // FIX: Updated model name per Gemini API guidelines.
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {headlines: {type: Type.ARRAY, items: {type: Type.STRING}}},
                            required: ["headlines"],
                        },
                    },
                });
                const content = JSON.parse(response.text.trim());
                return content.headlines;
            }

            case "refineDisplayPostContent": {
                const {content, command} = params;
                const commandDescription = {shorter: "Gör den mer koncis...", more_formal: "Använd en mer formell...", add_emojis: "Lägg till passande emojis...", more_casual: "Använd en mer avslappnad..."}[command];
                const prompt = `You are an expert copywriter... Current content: Headline: "${content.headline}", Body: "${content.body}". Your command is: ${commandDescription}`;
                // FIX: Updated model name per Gemini API guidelines.
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {headline: {type: Type.STRING}, body: {type: Type.STRING}},
                            required: ["headline", "body"],
                        },
                    },
                });
                return JSON.parse(response.text.trim());
            }

            case "generateDisplayPostImage": {
                const {prompt, aspectRatio} = params;
                const apiPrompt = `Create a high-quality, professional... marketing image... User's idea: "${prompt}"`;
                // FIX: Updated model name per Gemini API guidelines.
                const response = await ai.models.generateImages({
                    model: "imagen-4.0-generate-001",
                    prompt: apiPrompt,
                    config: {numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio},
                });

                if (response.generatedImages && response.generatedImages.length > 0) {
                    const base64ImageBytes = response.generatedImages[0].image.imageBytes;
                    return `data:image/jpeg;base64,${base64ImageBytes}`;
                }
                throw new HttpsError("not-found", "AI did not generate an image.");
            }

            case "editDisplayPostImage": {
                const {base64ImageData, mimeType, prompt, logo} = params;
                const mainImagePart = {inlineData: {data: base64ImageData, mimeType}};
                const parts = [mainImagePart, {text: prompt}];
                // ... (logic to add logo part if present, same as client)
                // FIX: Updated model name and responseModalities per Gemini API guidelines for image editing.
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash-image",
                    contents: {parts},
                    config: {responseModalities: [Modality.IMAGE]},
                });
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    }
                }
                throw new HttpsError("not-found", "AI did not return an edited image.");
            }

            case "generateDisplayPostCampaign": {
                const {userPrompt, postCount, organizationName, userMedia, businessType, businessDescription} = params;
                const prompt = `Du är en expert på marknadsföringskampanjer för digitala skyltar för ett företag som heter "${organizationName}".
Verksamhetstyp: ${businessType ? businessType.join(", ") : "Ej specificerad"}.
Verksamhetsbeskrivning: "${businessDescription || "Ej specificerad"}".

Användarens kampanjmål är: "${userPrompt}".

${userMedia ? `Användaren har laddat upp ${userMedia.length} bild(er) som du kan använda.` : ""}

Skapa en JSON-array med ${postCount} inläggsobjekt. Varje objekt ska ha:
- 'internalTitle': En kort intern titel.
- 'headline': En slagkraftig rubrik.
- 'body': En kort brödtext.
- 'durationSeconds': Mellan 10-20 sekunder.
- 'layout': Välj en passande layout från ['text-only', 'image-fullscreen', 'image-left', 'image-right']. Variera gärna.
- För inlägg med bild, välj ETT av följande:
  1. 'userMediaIndex': Om en uppladdad bild passar, ange dess index (0, 1, ...).
  2. 'imagePrompt': Om ingen bild passar, skapa en detaljerad bild-prompt på SVENSKA.
Använd inte både 'userMediaIndex' och 'imagePrompt' i samma inlägg. All text, inklusive imagePrompt, måste vara på svenska.`;
                const parts = [{text: prompt}];
                if (userMedia) {
                    userMedia.forEach((media) => {
                        parts.push({inlineData: {mimeType: media.mimeType, data: media.data}});
                    });
                }
                // FIX: Updated model name per Gemini API guidelines.
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: {parts},
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
                                    layout: { type: Type.STRING, enum: ['text-only', 'image-fullscreen', 'image-left', 'image-right'] },
                                    imagePrompt: { type: Type.STRING },
                                    userMediaIndex: { type: Type.INTEGER },
                                },
                                required: ["internalTitle", "headline", "body", "durationSeconds", "layout"],
                            },
                        },
                    },
                });
                return JSON.parse(response.text.trim());
            }

            case "generateCampaignIdeasForEvent": {
                const {eventName, organizationName, businessType, businessDescription} = params;
                const prompt = `You are a creative marketing expert... for an upcoming event: "${eventName}"...`;
                // FIX: Updated model name per Gemini API guidelines.
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {headline: {type: Type.STRING}, body: {type: Type.STRING}},
                                required: ["headline", "body"],
                            },
                        },
                    },
                });
                return JSON.parse(response.text.trim());
            }

            case "generateVideoFromPrompt": {
                const {prompt, organizationId, image} = params;
                const imagePart = image ? {imageBytes: image.data, mimeType: image.mimeType} : undefined;
                // FIX: Updated model name per Gemini API guidelines.
                let operation = await ai.models.generateVideos({
                    model: "veo-3.1-fast-generate-preview",
                    prompt: `En kort, slagkraftig och professionell video för en digital skylt. ${prompt}`,
                    image: imagePart,
                    config: {numberOfVideos: 1},
                });
                while (!operation.done) {
                    await new Promise((resolve) => setTimeout(resolve, 10000));
                    operation = await ai.operations.getVideosOperation({operation: operation});
                }
                const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
                if (!downloadLink) {
                    throw new HttpsError("not-found", "AI:n returnerade ingen video.");
                }

                // Download video from Gemini URL
                const videoResponse = await fetch(`${downloadLink}&key=${apiKey}`);
                if (!videoResponse.ok) {
                    throw new HttpsError("internal", `Kunde inte hämta videofilen. Status: ${videoResponse.statusText}`);
                }
                const videoBuffer = await videoResponse.arrayBuffer();

                // Upload to Firebase Storage
                const bucket = admin.storage().bucket();
                const fileName = `organizations/${organizationId}/videos/ai-video-${Date.now()}.mp4`;
                const file = bucket.file(fileName);
                await file.save(Buffer.from(videoBuffer), {metadata: {contentType: "video/mp4"}});
                await file.makePublic(); // Or generate a signed URL
                return file.publicUrl();
            }

            default:
                throw new HttpsError("invalid-argument", `Unknown AI action: ${action}`);
        }
    } catch (error) {
        console.error(`Error in Gemini function for action "${action}":`, error);
        if (error instanceof HttpsError) {
            throw error;
        }
        const errorString = error.toString().toLowerCase();
        if (errorString.includes("safety")) {
            throw new HttpsError("permission-denied", "Försöket blockerades av säkerhetsskäl. Prova en annan text.");
        }
        throw new HttpsError("internal", "Ett fel inträffade hos AI-tjänsten.");
    }
});


// --- NEW ORPHANED MEDIA CLEANUP FUNCTIONS ---

// Helper to extract storage path from a Firebase Storage URL
function getPathFromUrl(url) {
  if (!url || !url.includes("firebasestorage.googleapis.com")) {
    return null;
  }
  try {
    const urlObject = new URL(url);
    const pathSegment = urlObject.pathname.split("/o/")[1];
    if (pathSegment) {
      return decodeURIComponent(pathSegment.split("?")[0]);
    }
  } catch (e) {
    console.error(`Could not parse storage URL: ${url}`, e);
  }
  return null;
}

// Core cleanup logic for a single organization
async function cleanupOrg(org) {
  const orgId = org.id;
  const usedPaths = new Set();

  // 1. Gather all used URLs from the organization document and its subcollections.
  if (org.logoUrlLight) usedPaths.add(getPathFromUrl(org.logoUrlLight));
  if (org.logoUrlDark) usedPaths.add(getPathFromUrl(org.logoUrlDark));

  const mediaLibrarySnapshot = await db.collection("organizations").doc(orgId).collection("mediaLibrary").get();
  mediaLibrarySnapshot.forEach((doc) => {
    const item = doc.data();
    if (item.url) usedPaths.add(getPathFromUrl(item.url));
  });

  const displayScreensSnapshot = await db.collection("organizations").doc(orgId).collection("displayScreens").get();
  for (const screenDoc of displayScreensSnapshot.docs) {
    const postsSnapshot = await screenDoc.ref.collection("posts").get();
    postsSnapshot.forEach((postDoc) => {
      const post = postDoc.data();
      if (post.imageUrl) usedPaths.add(getPathFromUrl(post.imageUrl));
      if (post.videoUrl) usedPaths.add(getPathFromUrl(post.videoUrl));
      if (post.backgroundVideoUrl) usedPaths.add(getPathFromUrl(post.backgroundVideoUrl));
      (post.subImages || []).forEach((sub) => {
        if (sub.imageUrl) usedPaths.add(getPathFromUrl(sub.imageUrl));
      });
      (post.collageItems || []).forEach((item) => {
        if (item && item.imageUrl) usedPaths.add(getPathFromUrl(item.imageUrl));
        if (item && item.videoUrl) usedPaths.add(getPathFromUrl(item.videoUrl));
      });
    });
  }
  usedPaths.delete(null); // Remove any nulls that might have been added

  // 2. List all files in storage for this org
  const bucket = admin.storage().bucket();
  const prefixes = [`organizations/${orgId}/images/`, `organizations/${orgId}/videos/`];
  let allFiles = [];
  for (const prefix of prefixes) {
    const [files] = await bucket.getFiles({prefix});
    allFiles.push(...files);
  }

  // 3. Identify and delete orphaned files
  const deletionPromises = [];
  const twoDaysAgo = Date.now() - (48 * 60 * 60 * 1000);
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

  console.log(`[${org.name}] Cleanup finished. Found ${orphanedCount} potential orphans. Deleted ${deletedCount} files.`);
  return deletedCount;
}

exports.cleanupOrphanedMedia = onSchedule({
  schedule: "every sunday 03:00",
  timeZone: "Europe/Stockholm",
  timeoutSeconds: 540,
  memory: "512MiB",
}, async (event) => {
  console.log("Starting weekly orphaned media cleanup job.");
  const orgsSnapshot = await db.collection("organizations").get();
  if (orgsSnapshot.empty) {
    console.log("No organizations found to clean up.");
    return null;
  }

  const cleanupPromises = orgsSnapshot.docs.map((doc) => cleanupOrg(doc.data()));
  const results = await Promise.allSettled(cleanupPromises);

  results.forEach((result, index) => {
    const orgName = orgsSnapshot.docs[index].data().name;
    if (result.status === "fulfilled") {
      if (result.value > 0) {
        console.log(`Successfully cleaned org "${orgName}". Deleted ${result.value} files.`);
      }
    } else {
      console.error(`Failed to clean org "${orgName}":`, result.reason);
    }
  });

  console.log("Weekly orphaned media cleanup job finished.");
  return null;
});

// A utility function to run the cleanup manually for testing.
// Can be invoked via the Firebase console or a client-side call.
exports.testOrphanedMediaCleanup = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to run this test.");
  }
  const {organizationId} = request.data;
  let totalDeleted = 0;
  let message = "";

  if (organizationId) {
    console.log(`Manually running cleanup for single organization: ${organizationId}`);
    const orgDoc = await db.collection("organizations").doc(organizationId).get();
    if (!orgDoc.exists) {
      throw new HttpsError("not-found", `Organization ${organizationId} not found.`);
    }
    totalDeleted = await cleanupOrg(orgDoc.data());
    message = `Manual cleanup for "${orgDoc.data().name}" finished. Total files deleted: ${totalDeleted}.`;
  } else {
    console.log("Manually running cleanup for ALL organizations.");
    const orgsSnapshot = await db.collection("organizations").get();
    const cleanupPromises = orgsSnapshot.docs.map((doc) => cleanupOrg(doc.data()));
    const results = await Promise.allSettled(cleanupPromises);
    totalDeleted = results
      .filter((r) => r.status === "fulfilled")
      .reduce((sum, r) => sum + (r.value || 0), 0);
    message = `Manual cleanup for all organizations finished. Total files deleted: ${totalDeleted}.`;
  }

  console.log(message);
  return {message, deletedCount: totalDeleted};
});