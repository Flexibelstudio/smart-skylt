import { GoogleGenAI, Type, Modality, Chat } from "@google/genai";
import { DisplayPost, CampaignIdea, DisplayScreen, Organization } from '../types';
import { uploadVideo } from './firebaseService';

// --- Initialization ---

// @ts-ignore
const GEMINI_API_KEY = process.env.API_KEY;

let ai: GoogleGenAI | null = null;
if (GEMINI_API_KEY) {
    try {
        ai = new GoogleGenAI({apiKey: GEMINI_API_KEY});
    } catch (e) {
        console.error("Failed to initialize GoogleGenAI:", e);
    }
} else {
    console.error("Gemini API Key is not configured in the environment. AI features will not work.");
}

const ensureAiInitialized = (): GoogleGenAI => {
    if (!ai) {
        throw new Error("AI-tjänsten är inte konfigurerad. Kontrollera API-nyckeln.");
    }
    return ai;
}


// --- Helper Functions ---

export const fileToBase64 = (file: File): Promise<{ mimeType: string; data: string }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const parts = result.split(',');
            if (parts.length !== 2) {
                return reject(new Error("Invalid file format for base64 conversion."));
            }
            const mimeType = parts[0].split(';')[0].split(':')[1];
            const data = parts[1];
            resolve({ mimeType, data });
        };
        // FIX: Always reject with an Error object.
        reader.onerror = () => reject(new Error("File could not be read."));
        reader.readAsDataURL(file);
    });
};

export async function urlToBase64(url: string): Promise<{ mimeType: string; data: string }> {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        const blob = await response.blob();

        if (blob.type === 'image/svg+xml') {
            return new Promise((resolve, reject) => {
                const img = new Image();
                const objectUrl = URL.createObjectURL(blob);
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const width = img.naturalWidth || 512;
                    const height = img.naturalHeight || 512;
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, width, height);
                        const pngDataUrl = canvas.toDataURL('image/png');
                        const data = pngDataUrl.split(',')[1];
                        URL.revokeObjectURL(objectUrl);
                        resolve({ mimeType: 'image/png', data });
                    } else {
                        URL.revokeObjectURL(objectUrl);
                        reject(new Error("Could not get canvas context for SVG conversion."));
                    }
                };
                img.onerror = (err) => {
                    URL.revokeObjectURL(objectUrl);
                    reject(new Error(`Failed to load SVG for conversion: ${err}`));
                };
                img.src = objectUrl;
            });
        } else {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = reader.result as string;
                    const mimeType = result.split(';')[0].split(':')[1];
                    const data = result.split(',')[1];
                    resolve({ mimeType, data });
                };
                // FIX: Always reject with an Error object.
                reader.onerror = () => reject(new Error("Failed to read blob."));
                reader.readAsDataURL(blob);
            });
        }
    } catch (e) {
        console.error("Error converting URL to base64:", e);
        // FIX: Always reject with an Error object.
        throw new Error(e instanceof Error ? e.message : String(e));
    }
}


// --- Help Bot (Uses same client-side key) ---

const helpBotSystemInstruction = `Du är "Smart Support", en vänlig och professionell AI-assistent för digital-skyltnings-appen "Smart Skylt". Ditt mål är att hjälpa användare att förstå och använda appens funktioner.

**Dina kunskapsområden är:**
- **Skyltfönster:** Hur man skapar, redigerar, grupperar och ansluter fysiska skärmar.
- **Inlägg:** Hur man skapar olika typer av inlägg (text, helskärmsbild, video), ställer in layout, tidsstyrning och effekter.
- **AI-Assistent:** Förklarar hur man använder AI för att generera text och bilder till inlägg.
- **AI-Kampanjskapare:** Förklarar hur man kan låta AI:n bygga en hel serie av inlägg (en kampanj).
- **Varumärke:** Hur man ställer in logotyper, primärfärg och taggar för sin organisation.
- **Administration:** Hur man bjuder in nya administratörer och hanterar användare.
- **Planering & Kalender:** Hur man använder den nya kalendervyn för att planera innehåll och kampanjer kring händelser.

**Regler för konversation:**
1.  **Svara alltid på svenska.**
2.  Håll dina svar korta, tydliga och lätta att förstå. Använd punktlistor när det passar.
3.  Var alltid vänlig och serviceinriktad.
4.  Om en fråga handlar om något utanför appens funktioner (t.ex. allmän marknadsföringsstrategi, teknisk felsökning av användarens dator/nätverk, eller frågor om fakturering), svara artigt att du tyvärr inte kan hjälpa till med det och rekommendera att de kontaktar mänsklig support för den typen av ärenden.
5.  Du kan inte utföra några handlingar åt användaren. Du kan bara ge information och vägledning.`;

export async function initializeHelpBotChat(): Promise<Chat> {
    const ai = ensureAiInitialized();
    const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction: helpBotSystemInstruction,
        },
    });
    return chat;
}


// --- Generic AI Error Handler ---
// FIX: Changed function signature to accept a function that returns a promise.
async function handleAIError<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        console.error("Gemini API Error:", error);
        const errorString = error instanceof Error ? error.toString().toLowerCase() : String(error).toLowerCase();
        if (errorString.includes("safety")) {
            throw new Error("Försöket blockerades av säkerhetsskäl. Prova en annan text.");
        }
        if (errorString.includes("api key not valid")) {
             throw new Error("API-nyckeln är ogiltig.");
        }
        throw new Error(error instanceof Error ? error.message : "Ett fel inträffade hos AI-tjänsten.");
    }
}

// --- Re-implemented AI Service Functions ---

export const formatPageWithAI = (rawContent: string): Promise<string> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `You are a markdown formatting expert. Format the following raw text into a well-structured document using headings (#, ##), bullet points (*), bold text (**text**), and italics (_text_). Ensure the output is clean and professional.

Raw text to transform:
---
${rawContent}
---`;
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    return response.text;
});

export const generatePageContentFromPrompt = (userPrompt: string): Promise<string> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `You are a copywriter. A user wants to create an info page. Expand on their idea and write the content in well-structured Markdown.

The user's idea/prompt is:
---
${userPrompt}
---`;
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    return response.text;
});

export const generateDisplayPostContent = (userPrompt: string, organizationName: string): Promise<{ headline: string, body: string }> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `You are an expert copywriter for a company named "${organizationName}". Generate a short, punchy headline and a brief body text based on the user's idea: "${userPrompt}"`;
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
    return JSON.parse(response.text.trim());
});

export const generateCompletePost = (
    userPrompt: string,
    organization: Organization,
    aspectRatio: DisplayScreen['aspectRatio'],
    style?: string,
    colors?: string,
    mood?: string,
): Promise<{ postData: Partial<DisplayPost>, imageUrl?: string }> => handleAIError(async () => {
    const ai = ensureAiInitialized();

    const brandingGuidelines = `
- Primary Color: ${organization.primaryColor || 'not set'}
- Secondary Color: ${organization.secondaryColor || 'not set'}
- Accent Color: ${organization.accentColor || 'not set'}
- Use these colors as keywords: 'primary', 'secondary', 'accent', 'black', 'white'. You can also use hex codes.
`;

    const imageStylePreferences = `
- Style: ${style || 'not specified'}
- Color Palette: ${colors || 'not specified'}
- Mood: ${mood || 'not specified'}
`;

    const prompt = `You are an expert creative director and designer for a company named "${organization.name}".
Your task is to generate a complete, visually appealing post for a digital sign based on the user's idea.
Be very creative and vary your designs. Sometimes stick to the brand, and sometimes create something wild and different that stands out.

**Brand Guidelines:**
${brandingGuidelines}

**User's Idea:**
"${userPrompt}"

**Image Style Preferences (optional):**
${imageStylePreferences}

**Your Task:**
Respond with a JSON object that defines the post. Be creative with the layout and presentation. For about one in every five requests, feel free to completely ignore the brand colors and create a unique, bold design that grabs attention.

The JSON object must contain:
1.  'headline': A short, punchy headline.
2.  'body': A brief body text.
3.  'imagePrompt': A detailed, creative, and professional prompt (in English) for an AI image generator. Incorporate the user's image style preferences if they are provided. If the layout is 'text-only', this can be an empty string.
4.  'layout': Choose one of 'text-only', 'image-fullscreen', 'image-left', 'image-right'.
5.  'backgroundColor': A color keyword ('primary', 'secondary', 'accent', 'black', 'white') or a hex code.
6.  'textColor': A color keyword ('primary', 'black', 'white') or a hex code.
7.  'imageOverlayEnabled': A boolean. Usually true for 'image-fullscreen' to ensure text is readable.
8.  'textAlign': Choose one of 'left', 'center', 'right'.
9.  'textAnimation': Choose one of 'none', 'typewriter', 'fade-up-word', 'blur-in'.`;

    const textGenResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    headline: { type: Type.STRING },
                    body: { type: Type.STRING },
                    imagePrompt: { type: Type.STRING },
                    layout: { type: Type.STRING, enum: ['text-only', 'image-fullscreen', 'image-left', 'image-right'] },
                    backgroundColor: { type: Type.STRING },
                    textColor: { type: Type.STRING },
                    imageOverlayEnabled: { type: Type.BOOLEAN },
                    textAlign: { type: Type.STRING, enum: ['left', 'center', 'right'] },
                    textAnimation: { type: Type.STRING, enum: ['none', 'typewriter', 'fade-up-word', 'blur-in'] },
                },
                required: ["headline", "body", "imagePrompt", "layout", "backgroundColor", "textColor", "imageOverlayEnabled", "textAlign", "textAnimation"],
            },
        },
    });
    const postData: Partial<DisplayPost> & { imagePrompt?: string } = JSON.parse(textGenResponse.text.trim());

    if (postData.layout !== 'text-only' && postData.imagePrompt) {
        const imageResponse = await ai.models.generateImages({
            model: "imagen-4.0-generate-001",
            prompt: postData.imagePrompt,
            config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio },
        });

        if (!imageResponse.generatedImages || imageResponse.generatedImages.length === 0) {
            throw new Error("AI:n kunde inte generera en bild.");
        }
        const imageUrl = `data:image/jpeg;base64,${imageResponse.generatedImages[0].image.imageBytes}`;
        delete postData.imagePrompt; // Remove prompt before returning
        return { postData, imageUrl };
    }

    delete postData.imagePrompt; // Remove prompt before returning
    // If text-only or no image prompt, return without imageUrl
    return { postData };
});

export const generateHeadlineSuggestions = (body: string, existingHeadlines?: string[]): Promise<string[]> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `The body text is: --- ${body} --- Generate 5 short, punchy, and creative headlines that fit this body text. ${(existingHeadlines?.length) ? `Avoid variations of these: "${existingHeadlines.join('", "')}".` : ""}`;
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
    const content = JSON.parse(response.text.trim());
    return content.headlines;
});

export const refineDisplayPostContent = (content: { headline: string; body: string }, command: 'shorter' | 'more_formal' | 'add_emojis' | 'more_casual'): Promise<{ headline: string, body: string }> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const commandDescription = { shorter: "Make it more concise.", more_formal: "Use a more formal tone.", add_emojis: "Add suitable emojis.", more_casual: "Use a more casual tone." }[command];
    const prompt = `Current content: Headline: "${content.headline}", Body: "${content.body}". Your command is: ${commandDescription}. Rewrite the content.`;
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
    return JSON.parse(response.text.trim());
});

export const generateDisplayPostImage = (prompt: string, aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' = '16:9'): Promise<string> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const apiPrompt = `A high-quality, professional, photorealistic marketing image for a digital sign. User's idea: "${prompt}"`;
    const response = await ai.models.generateImages({
        model: "imagen-4.0-generate-001",
        prompt: apiPrompt,
        config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio },
    });
    if (response.generatedImages && response.generatedImages.length > 0) {
        return `data:image/jpeg;base64,${response.generatedImages[0].image.imageBytes}`;
    }
    throw new Error("AI did not generate an image.");
});

export const editDisplayPostImage = (base64ImageData: string, mimeType: string, prompt: string, logo?: { base64Data: string; mimeType: string }): Promise<string> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const mainImagePart = { inlineData: { data: base64ImageData, mimeType } };
    const parts = [mainImagePart, { text: prompt }];
    if (logo) parts.push({ inlineData: { data: logo.base64Data, mimeType: logo.mimeType } });
    
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: { parts },
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    });
    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
    }
    throw new Error("AI did not return an edited image.");
});

export interface GeneratedCampaignPost {
    internalTitle: string;
    headline: string;
    body: string;
    durationSeconds: number;
    layout: DisplayPost['layout'];
    imagePrompt?: string;
    userMediaIndex?: number;
}

export const generateDisplayPostCampaign = (userPrompt: string, postCount: number, organizationName: string, userMedia?: { mimeType: string; data: string }[], businessType?: string[], businessDescription?: string): Promise<GeneratedCampaignPost[]> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `Du är en expert på marknadsföringskampanjer för "${organizationName}".
Verksamhet: ${businessType?.join(", ") || "Ej specificerad"}.
Beskrivning: "${businessDescription || "Ej specificerad"}".
Användarens mål: "${userPrompt}".
${userMedia ? `Användaren har laddat upp ${userMedia.length} bild(er).` : ""}
Skapa en JSON-array med ${postCount} inläggsobjekt med fälten: 'internalTitle', 'headline', 'body', 'durationSeconds' (10-20), 'layout' (variera mellan 'text-only', 'image-fullscreen', 'image-left', 'image-right'). För bildinlägg, välj ANTINGEN 'userMediaIndex' (om en uppladdad bild passar) ELLER 'imagePrompt' (en ny bild-prompt på engelska). All text på svenska.`;

    const parts: any[] = [{ text: prompt }];
    if (userMedia) userMedia.forEach(media => parts.push({ inlineData: { mimeType: media.mimeType, data: media.data } }));
    
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
                        internalTitle: { type: Type.STRING }, headline: { type: Type.STRING }, body: { type: Type.STRING },
                        durationSeconds: { type: Type.INTEGER }, layout: { type: Type.STRING, enum: ['text-only', 'image-fullscreen', 'image-left', 'image-right'] },
                        imagePrompt: { type: Type.STRING }, userMediaIndex: { type: Type.INTEGER },
                    },
                    required: ["internalTitle", "headline", "body", "durationSeconds", "layout"],
                },
            },
        },
    });
    return JSON.parse(response.text.trim());
});

export const generateCampaignIdeasForEvent = (eventName: string, organizationName: string, businessType?: string[], businessDescription?: string): Promise<CampaignIdea[]> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `Generate 3 distinct campaign ideas for "${organizationName}" for the upcoming event: "${eventName}". Business type: ${businessType?.join(", ") || "N/A"}. Description: "${businessDescription || "N/A"}". Each idea should have a catchy headline and a short body text suitable for digital signs.`;
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
    return JSON.parse(response.text.trim());
});

export const generateVideoFromPrompt = (prompt: string, organizationId: string, onProgress: (status: string) => void, image?: { mimeType: string; data: string }): Promise<string> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const imagePart = image ? { imageBytes: image.data, mimeType: image.mimeType } : undefined;
    onProgress("Startar videogenerering...");
    let operation = await ai.models.generateVideos({
        model: "veo-2.0-generate-001",
        prompt: `A short, professional video for a digital sign. ${prompt}`,
        image: imagePart,
        config: { numberOfVideos: 1 },
    });
    onProgress("Väntar på att videon ska bli klar... (kan ta flera minuter)");
    while (!operation.done) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
    }
    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("AI:n returnerade ingen video.");

    onProgress("Laddar ner video...");
    const videoResponse = await fetch(`${downloadLink}&key=${GEMINI_API_KEY}`);
    if (!videoResponse.ok) throw new Error(`Kunde inte hämta videofilen: ${videoResponse.statusText}`);
    const videoBlob = await videoResponse.blob();
    const videoFile = new File([videoBlob], `ai-video-${Date.now()}.mp4`, { type: 'video/mp4' });

    onProgress("Laddar upp video till ditt galleri...");
    const storageUrl = await uploadVideo(organizationId, videoFile, (progress) => {
        onProgress(`Laddar upp video... ${progress.toFixed(0)}%`);
    });
    onProgress("Klart!");
    return storageUrl;
});