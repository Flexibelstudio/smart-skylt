// functions/index.js
const {onCall, HttpsError} = require("firebase-functions/v2/onCall");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const {GoogleGenAI, Type, Modality} = require("@google/genai");

admin.initializeApp();
const db = admin.firestore();

// --- USER INVITATION FUNCTION ---
exports.inviteUser = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to invite users.");
    }
    const {email} = request.data;
    console.log(`Placeholder: Simulating invitation for ${email}.`);
    return {success: true, message: `(Server) Inbjudan skickad till ${email}.`};
});

// --- NEW INSTAGRAM FUNCTIONS ---
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
                const response = await ai.models.generateContent({model: "gemini-2.5-flash", contents: prompt});
                return response.text;
            }

            case "generatePageContentFromPrompt": {
                const {userPrompt} = params;
                const prompt = `You are a world-class digital content designer... (prompt details) ... The user's idea/prompt is: --- ${userPrompt} ---`;
                const response = await ai.models.generateContent({model: "gemini-2.5-flash", contents: prompt});
                return response.text;
            }

            case "generateDisplayPostContent": {
                const {userPrompt, organizationName} = params;
                const prompt = `You are an expert copywriter... for a company named "${organizationName}"... The user's idea is: --- ${userPrompt} ---`;
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
                const textGenResponse = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: `Du är en expert på marknadsföring och copywriting för ett företag som heter "${organizationName}". Användaren vill skapa ett inlägg för en digital skylt baserat på följande idé: "${userPrompt}". Svara med ett JSON-objekt som innehåller:
1.  'headline': En kort, slagkraftig rubrik.
2.  'body': En kort brödtext som utvecklar rubriken.
3.  'imagePrompt': En detaljerad, kreativ och professionell prompt på engelska för en AI-bildgenerator för att skapa en matchande bild.`,
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
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash-image",
                    contents: {parts},
                    config: {responseModalities: [Modality.IMAGE, Modality.TEXT]},
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
  2. 'imagePrompt': Om ingen bild passar, skapa en detaljerad bild-prompt på engelska.
Använd inte både 'userMediaIndex' och 'imagePrompt' i samma inlägg. All text ska vara på svenska.`;
                const parts = [{text: prompt}];
                if (userMedia) {
                    userMedia.forEach((media) => {
                        parts.push({inlineData: {mimeType: media.mimeType, data: media.data}});
                    });
                }
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
                let operation = await ai.models.generateVideos({
                    model: "veo-2.0-generate-001",
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