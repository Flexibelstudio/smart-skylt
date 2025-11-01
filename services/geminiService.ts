import { GoogleGenAI, Type, Modality, Chat } from "https://esm.sh/@google/genai@0.14.0";
import { DisplayPost, CampaignIdea, DisplayScreen, Organization, SkyltIdeSuggestion, VisualSuggestion, PlanningProfile, StyleProfile } from '../types';
// FIX: `isOffline` is exported from `firebaseService`, not `firebaseInit`.
import { uploadVideo, isOffline, getOrganizationById, updateOrganization } from './firebaseService';
import { storage } from './firebaseInit';

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

async function ensurePublicImageUrl(url: string): Promise<string> {
    if (isOffline || !storage || !url.includes('firebasestorage.googleapis.com')) {
        return url;
    }
    try {
        const storageRef = storage.refFromURL(url);
        const downloadUrl = await storageRef.getDownloadURL();
        return downloadUrl;
    } catch (error) {
        console.warn("Image fetch fallback:", error);
        return url; // Fallback to original URL on error
    }
}

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
        const publicUrl = await ensurePublicImageUrl(url);
        const response = await fetch(publicUrl);
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

// --- Caching Helper ---
async function getCachedAIResponse<T>(cacheKey: string, ttlMinutes: number, generator: () => Promise<T>): Promise<T> {
    try {
        const cachedItem = localStorage.getItem(cacheKey);
        if (cachedItem) {
            const { timestamp, data } = JSON.parse(cachedItem);
            const isStale = (Date.now() - timestamp) > ttlMinutes * 60 * 1000;
            if (!isStale) {
                console.log(`[AI Cache] HIT for key: ${cacheKey}`);
                return data as T;
            }
            console.log(`[AI Cache] STALE for key: ${cacheKey}`);
        }
    } catch (e) {
        console.warn(`[AI Cache] Could not read from cache for key ${cacheKey}:`, e);
    }

    console.log(`[AI Cache] MISS for key: ${cacheKey}. Fetching from API.`);
    const freshData = await generator();

    try {
        const itemToCache = {
            timestamp: Date.now(),
            data: freshData,
        };
        localStorage.setItem(cacheKey, JSON.stringify(itemToCache));
    } catch (e) {
        console.warn(`[AI Cache] Could not write to cache for key ${cacheKey}:`, e);
    }

    return freshData;
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
    // FIX: Updated model name per Gemini API guidelines.
    const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction: helpBotSystemInstruction,
        },
    });
    return chat;
}

// --- Marketing Coach Bot ---
const marketingCoachSystemInstruction = (organization: Organization): string => {
    const orgContext = `
**Företagskontext:**
- Företagsnamn: ${organization.name}
- Verksamhetstyp: ${organization.businessType?.join(', ') || 'ej angiven'}
- Beskrivning: ${organization.businessDescription || 'ej angiven'}
- Hemsida: ${organization.preferenceProfile?.websiteUrl || 'ej angiven'}
- Exempeltexter (tonalitet): ${(organization.preferenceProfile?.textSnippets || []).map(s => `"${s}"`).join(', ') || 'inga angivna'}
- AI-lärd stilprofil: ${organization.styleProfile?.summary || 'ej analyserad än'}
`;

    return `Du är en expert på marknadsföring och en kreativ coach för appen "Smart Skylt". Ditt namn är "AI Marknadscoach". Ditt mål är att hjälpa användare med kreativa idéer, textförslag, kampanjstrategier och bildkoncept.

Du hjälper specifikt företaget:
${orgContext}

**Dina regler:**
1.  **Svara alltid på svenska.**
2.  Använd din kunskap om företaget för att ge skräddarsydda och relevanta förslag. Var proaktiv och kreativ.
3.  Fokusera på marknadsföring, reklam, sociala medier och innehållsskapande.
4.  Om användaren ställer en teknisk supportfråga om appen (t.ex. "hur sparar jag?"), hänvisa dem artigt till "Hjälp & Support"-chatten (frågetecknet nere i hörnet) som är specialiserad på tekniska frågor.
5.  Var uppmuntrande och inspirerande i din ton.
6.  Du kan inte utföra några handlingar, bara ge råd och förslag.
`;
};

export async function initializeMarketingCoachChat(organization: Organization): Promise<Chat> {
    const ai = ensureAiInitialized();
    const systemInstruction = marketingCoachSystemInstruction(organization);
    const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction,
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
    const prompt = `Du är en expert på markdown-formatering. Formatera följande råtext till ett västrukturerat dokument med rubriker (#, ##), punktlistor (*), fet text (**text**) och kursiv text (_text_). Se till att resultatet är rent och professionellt. Svara alltid på samma språk som råtexten.

Råtext att formatera:
---
${rawContent}
---`;
    // FIX: Updated model name per Gemini API guidelines.
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    return response.text;
});

export const generatePageContentFromPrompt = (userPrompt: string): Promise<string> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `Du är en copywriter. En användare vill skapa en infosida. Utveckla deras idé och skriv innehållet i välstrukturerad Markdown. Svara alltid på SVENSKA.

Användarens idé/prompt är:
---
${userPrompt}
---`;
    // FIX: Updated model name per Gemini API guidelines.
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    return response.text;
});

export const generateDisplayPostContent = (userPrompt: string, organizationName: string): Promise<{ headline: string, body: string }> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `Du är en expert-copywriter för digitala skyltar för ett företag som heter "${organizationName}". All text måste vara extremt koncis och lättläst på några få sekunder. Skapa en rubrik (headline) och en brödtext (body) på SVENSKA, baserat på användarens idé: "${userPrompt}"`;
    // FIX: Updated model name per Gemini API guidelines.
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: { 
                    headline: { 
                        type: Type.STRING,
                        description: 'En mycket kort rubrik för en digital skylt, max 5-7 ord.'
                    }, 
                    body: { 
                        type: Type.STRING,
                        description: 'En kort brödtext, max 1-2 korta meningar.'
                    } 
                },
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
    layout?: string,
): Promise<{ postData: Partial<DisplayPost>, imageUrl?: string }> => handleAIError(async () => {
    const ai = ensureAiInitialized();

    const brandingGuidelines = `
- Primärfärg: ${organization.primaryColor || 'ej angiven'}
- Sekundärfärg: ${organization.secondaryColor || 'ej angiven'}
- Accentfärg: ${organization.accentColor || 'ej angiven'}
- Använd dessa färger som nyckelord: 'primary', 'secondary', 'accent', 'black', 'white'. Du kan även använda hex-koder.
`;

    const imageStylePreferences = `
- Stil: ${style || 'ej specificerad'}
- Färgpalett: ${colors || 'ej specificerad'}
- Stämning: ${mood || 'ej specificerad'}
`;
    
    const styleProfileContext = (organization.styleProfile?.summary)
        ? `Ta stark hänsyn till användarens stilprofil:
---
${organization.styleProfile.summary}
---`
        : "";
        
    const preferenceProfileContext = organization.preferenceProfile ? `
**Användarens Preferensmaterial:**
- Webbplats: ${organization.preferenceProfile.websiteUrl || 'ej angiven'}
- Textutdrag som visar tonalitet:
  ${(organization.preferenceProfile.textSnippets || []).map(s => `- "${s}"`).join('\n') || 'inga'}
Använd de bifogade bilderna som stark visuell inspiration för färg, stil och motiv.
` : '';

    const layoutInstruction = layout 
        ? `Användaren har specifikt begärt layouten '${layout}', så du MÅSTE använda den.`
        : `Välj den layout som passar bäst av 'text-only', 'image-fullscreen', 'image-left', 'image-right'.`;

    const prompt = `Du är en expert kreativ chef och designer för ett företag som heter "${organization.name}".
Din uppgift är att skapa ett komplett, visuellt tilltalande inlägg för en digital skylt baserat på användarens idé. All text måste vara koncis och lättläst på några sekunder.
Var kreativ och variera dina designer. Ibland kan du hålla dig till varumärket, och ibland skapa något vilt och annorlunda som sticker ut.

**Varumärkesriktlinjer:**
${brandingGuidelines}

**Användarens stilprofil (om tillgänglig):**
${styleProfileContext}

**Användarens Preferensmaterial (om tillgängligt):**
${preferenceProfileContext}

**Användarens idé:**
"${userPrompt}"

**Bildstils-preferenser (valfritt):**
${imageStylePreferences}

**Din uppgift:**
Svara ENDAST med ett JSON-objekt inuti ett markdown-kodblock (\`\`\`json ... \`\`\`).
JSON-objektet måste innehålla:
1.  'headline': En mycket kort, slagkraftig rubrik på SVENSKA (max 5-7 ord).
2.  'body': En kort brödtext på SVENSKA (max 1-2 korta meningar).
3.  'imagePrompt': En detaljerad, kreativ och professionell prompt på SVENSKA för en AI-bildgenerator. Den ska vara både inspirerande för en människa och detaljerad nog för bild-AI:n. **VIKTIGT: Bildprompten MÅSTE instruera bild-generatorn att INTE inkludera någon text, bokstäver eller ord i bilden.** Inkludera användarens bildstils-preferenser om de anges. Om layouten är 'text-only', kan detta vara en tom sträng.
4.  'layout': ${layoutInstruction}
5.  'backgroundColor': Ett färgsökord ('primary', 'secondary', 'accent', 'black', 'white') eller en hex-kod.
6.  'textColor': Ett färgsökord ('primary', 'black', 'white') eller en hex-kod.
7.  'imageOverlayEnabled': En boolean. Vanligtvis true för 'image-fullscreen' för att säkerställa att texten är läsbar.
8.  'textAlign': Välj en av 'left', 'center', 'right'.
9.  'textAnimation': Välj en av 'none', 'typewriter', 'fade-up-word', 'blur-in'.`;

    const parts: any[] = [{ text: prompt }];
    const preferenceMedia = organization.preferenceProfile?.mediaItems;

    if (preferenceMedia && preferenceMedia.length > 0) {
        const imagePartsPromises = preferenceMedia.map(item => urlToBase64(item.url));
        const imagePartsData = await Promise.all(imagePartsPromises);
        imagePartsData.forEach(data => {
            parts.push({ inlineData: { mimeType: data.mimeType, data: data.data } });
        });
    }

    // FIX: Updated model name per Gemini API guidelines.
    const textGenResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts },
    });
    
    let jsonString = textGenResponse.text.trim();
    if (jsonString.startsWith("```json")) {
        jsonString = jsonString.substring(7);
    }
    if (jsonString.endsWith("```")) {
        jsonString = jsonString.substring(0, jsonString.length - 3);
    }

    const postData: Partial<DisplayPost> & { imagePrompt?: string } = JSON.parse(jsonString.trim());

    if (postData.layout !== 'text-only' && postData.imagePrompt) {
        // FIX: Updated model name per Gemini API guidelines.
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

export const generateFollowUpPost = (
    originalPost: DisplayPost,
    organization: Organization,
    aspectRatio: DisplayScreen['aspectRatio'],
): Promise<{ postData: Partial<DisplayPost>, imageUrl?: string }> => handleAIError(async () => {
    const ai = ensureAiInitialized();

    const brandingGuidelines = `
- Primärfärg: ${organization.primaryColor || 'ej angiven'}
- Sekundärfärg: ${organization.secondaryColor || 'ej angiven'}
- Accentfärg: ${organization.accentColor || 'ej angiven'}
- Använd dessa färger som nyckelord: 'primary', 'secondary', 'accent', 'black', 'white'. Du kan även använda hex-koder.
`;
    
    const styleProfileContext = (organization.styleProfile?.summary)
        ? `Ta stark hänsyn till användarens stilprofil:
---
${organization.styleProfile.summary}
---`
        : "";

    const originalPostSummary = `
- Rubrik: "${originalPost.headline || ''}"
- Brödtext: "${originalPost.body || ''}"
- Layout: ${originalPost.layout}
`;

    const prompt = `Du är en expert kreativ chef och designer för ett företag som heter "${organization.name}". All text måste vara koncis och lättläst på några sekunder.
Din uppgift är att skapa ett uppföljande inlägg i en pågående kampanj. Här är det föregående inlägget:
---
${originalPostSummary}
---

Skapa ett nytt, unikt inlägg som bygger vidare på temat. Det kan vara en påminnelse, ett "sista chansen"-erbjudande, eller presentera en ny aspekt av produkten/tjänsten. Återanvänd INTE exakt samma rubrik eller text.

**Varumärkesriktlinjer:**
${brandingGuidelines}

**Användarens stilprofil (om tillgänglig):**
${styleProfileContext}

**Din uppgift:**
Svara med ett JSON-objekt som definierar det nya inlägget. JSON-objektet måste innehålla:
1.  'headline': En mycket kort, slagkraftig rubrik på SVENSKA (max 5-7 ord).
2.  'body': En kort brödtext på SVENSKA (max 1-2 korta meningar).
3.  'imagePrompt': En detaljerad, kreativ och professionell prompt på SVENSKA för en AI-bildgenerator. **VIKTIGT: Bildprompten MÅSTE instruera att bilden INTE ska innehålla någon text, ord eller bokstäver.** Om layouten är 'text-only', kan detta vara en tom sträng.
4.  'layout': Välj en av 'text-only', 'image-fullscreen', 'image-left', 'image-right'.
5.  'backgroundColor': Ett färgsökord ('primary', 'secondary', 'accent', 'black', 'white') eller en hex-kod.
6.  'textColor': Ett färgsökord ('primary', 'black', 'white') eller en hex-kod.
7.  'imageOverlayEnabled': En boolean. Vanligtvis true för 'image-fullscreen' för att säkerställa att texten är läsbar.
8.  'textAlign': Välj en av 'left', 'center', 'right'.
9.  'textAnimation': Välj en av 'none', 'typewriter', 'fade-up-word', 'blur-in'.`;

    // FIX: Updated model name per Gemini API guidelines.
    const textGenResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    headline: { type: Type.STRING, description: 'En mycket kort rubrik för en digital skylt, max 5-7 ord.' },
                    body: { type: Type.STRING, description: 'En kort brödtext, max 1-2 korta meningar.' },
                    imagePrompt: { type: Type.STRING, description: "En detaljerad, kreativ och professionell prompt på SVENSKA för en AI-bildgenerator. VIKTIGT: Denna prompt MÅSTE instruera att bilden INTE ska innehålla någon text, ord eller bokstäver." },
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
        // FIX: Updated model name per Gemini API guidelines.
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
    return { postData };
});

// FIX: Added missing generateDisplayPostCampaign function.
// This function generates the data for multiple posts in a campaign based on a single prompt.
export const generateDisplayPostCampaign = (
    userPrompt: string,
    postCount: number,
    organizationName: string,
    userMedia?: { mimeType: string; data: string }[],
    imageSettings?: any, // Note: imageSettings are not directly used by this function's logic
    businessType?: string[],
    businessDescription?: string
): Promise<{ 
    internalTitle: string;
    headline: string;
    body: string;
    durationSeconds: number;
    layout: DisplayPost['layout'];
    imagePrompt?: string;
    userMediaIndex?: number;
}[]> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `Du är en expert på marknadsföringskampanjer för digitala skyltar för ett företag som heter "${organizationName}". All text måste vara koncis och lättläst på några få sekunder.
Verksamhetstyp: ${businessType ? businessType.join(", ") : "Ej specificerad"}.
Verksamhetsbeskrivning: "${businessDescription || "Ej specificerad"}".

Användarens kampanjmål är: "${userPrompt}".

${userMedia ? `Användaren har laddat upp ${userMedia.length} bild(er) som du kan använda.` : ""}

Skapa en JSON-array med ${postCount} inläggsobjekt. Varje objekt ska ha:
- 'internalTitle': En kort intern titel.
- 'headline': En mycket kort, slagkraftig rubrik (max 5-7 ord).
- 'body': En kort brödtext (max 1-2 korta meningar).
- 'durationSeconds': Mellan 10-20 sekunder.
- 'layout': Välj en passande layout från ['text-only', 'image-fullscreen', 'image-left', 'image-right']. Variera gärna.
- För inlägg med bild, välj ETT av följande:
  1. 'userMediaIndex': Om en uppladdad bild passar, ange dess index (0, 1, ...).
  2. 'imagePrompt': Om ingen bild passar, skapa en detaljerad bild-prompt på SVENSKA. **VIKTIGT: Bildprompten MÅSTE instruera att INTE inkludera text, ord eller bokstäver i bilden.**
Använd inte både 'userMediaIndex' och 'imagePrompt' i samma inlägg. All text, inklusive imagePrompt, måste vara på svenska.`;

    // FIX: Explicitly type `parts` to allow both text and inlineData objects, resolving a TypeScript error where `inlineData` was not recognized.
    const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [{ text: prompt }];
    if (userMedia) {
        userMedia.forEach((media) => {
            parts.push({ inlineData: { mimeType: media.mimeType, data: media.data } });
        });
    }

    // FIX: Updated model name per Gemini API guidelines.
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
                        headline: { type: Type.STRING, description: 'En mycket kort rubrik för en digital skylt, max 5-7 ord.' },
                        body: { type: Type.STRING, description: 'En kort brödtext, max 1-2 korta meningar.' },
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
});


export const generateHeadlineSuggestions = (body: string, existingHeadlines?: string[]): Promise<string[]> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `Brödtexten är: --- ${body} --- Generera 5 korta, slagkraftiga och kreativa rubriker på SVENSKA som passar till denna brödtext. ${(existingHeadlines?.length) ? `Undvik variationer av dessa: "${existingHeadlines.join('", "')}".` : ""}`;
    // FIX: Updated model name per Gemini API guidelines.
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

export const generateBodySuggestions = (headline: string, existingBodies?: string[]): Promise<string[]> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `Rubriken är: --- ${headline} --- Generera 3 korta, slagkraftiga och kreativa brödtexter (max 1-2 meningar) på SVENSKA som passar till denna rubrik. ${(existingBodies?.length) ? `Undvik variationer av dessa: "${existingBodies.join('", "')}".` : ""}`;
    
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: { bodies: { type: Type.ARRAY, items: { type: Type.STRING } } },
                required: ["bodies"],
            },
        },
    });
    const content = JSON.parse(response.text.trim());
    return content.bodies;
});


export const refineDisplayPostContent = (content: { headline: string; body: string }, command: 'shorter' | 'more_formal' | 'add_emojis' | 'more_casual' | 'more_salesy' | 'simplify_language'): Promise<{ headline: string, body: string }> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const commandDescription = { 
        shorter: "Gör den mer koncis.", 
        more_formal: "Använd en mer formell ton.", 
        add_emojis: "Lägg till passande emojis.", 
        more_casual: "Använd en mer vardaglig ton.",
        more_salesy: "Gör den mer säljande och övertygande.",
        simplify_language: "Förenkla språket så det blir lättare att förstå."
    }[command];
    const prompt = `Nuvarande innehåll: Rubrik: "${content.headline}", Brödtext: "${content.body}". Ditt kommando är: ${commandDescription}. Skriv om innehållet på SVENSKA. Håll texten kort och anpassad för en digital skylt.`;
    // FIX: Updated model name per Gemini API guidelines.
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: { 
                    headline: { type: Type.STRING, description: 'En mycket kort rubrik för en digital skylt, max 5-7 ord.' }, 
                    body: { type: Type.STRING, description: 'En kort brödtext, max 1-2 korta meningar.' } 
                },
                required: ["headline", "body"],
            },
        },
    });
    return JSON.parse(response.text.trim());
});

export const generateDisplayPostImage = (prompt: string, aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' = '16:9'): Promise<string> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const apiPrompt = `A high-quality, professional, photorealistic marketing image for a digital sign. User's idea: "${prompt}". IMPORTANT: The generated image must not contain any text, words, or letters.`;
    // FIX: Updated model name per Gemini API guidelines.
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
    const parts: ({ text: string } | { inlineData: { data: string; mimeType: string } })[] = [mainImagePart, { text: prompt }];
    if (logo) {
        parts.push({ inlineData: { data: logo.base64Data, mimeType: logo.mimeType } });
    }
    
    // FIX: Updated model name and responseModalities per Gemini API guidelines for image editing.
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: { parts },
        config: { responseModalities: [Modality.IMAGE] },
    });

    const responseParts = response.candidates?.[0]?.content?.parts || [];
    let textResponse = "";
    
    for (const part of responseParts) {
        if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
        if (part.text) {
            textResponse += part.text;
        }
    }
    
    if (textResponse) {
        throw new Error(`AI:n kunde inte redigera bilden: ${textResponse}`);
    }

    throw new Error("AI did not return an edited image.");
});

export const generateCampaignIdeasForEvent = (
    eventName: string,
    daysUntil: number,
    organization: Organization
): Promise<{ ideas: CampaignIdea[], followUpSuggestion?: { question: string; eventName: string; } }> => handleAIError(async () => {
    const ai = ensureAiInitialized();

    let timeContext = '';
    if (daysUntil > 30) {
        timeContext = `Det är mer än 30 dagar kvar (planeringsläge). Ton: lugn, inspirerande, förberedande. Bildstil: ljusa, luftiga färger, naturliga toner. Komposition: fokus på miljö och känsla.`;
    } else if (daysUntil >= 14) {
        timeContext = `Det är ${daysUntil} dagar kvar (huvudkampanjläge). Ton: aktiv, säljande, tydlig. Bildstil: starka kontraster, skarpa färger, energi. Komposition: centralt motiv.`;
    } else {
        timeContext = `Det är bara ${daysUntil} ${daysUntil === 1 ? 'dag' : 'dagar'} kvar (snabbläge). Ton: direkt, uppmanande, effektiv. Bildstil: dramatisk belysning, tydliga former. Komposition: närbilder, fokus på action/produkt.`;
    }
    
    const styleProfileContext = (organization.styleProfile?.summary)
        ? `Användarens stilprofil:
---
${organization.styleProfile.summary}
---
Ditt uppdrag är att generera 3 distinkta kampanjidéer... Varje idé måste vara anpassad till tidskontexten, verksamhetstypen, OCH användarens stilprofil. Skapa 2 förslag som matchar profilen och 1 som är en kreativ "wildcard" för att ge ny inspiration.`
        : `Ditt uppdrag är att generera 3 distinkta kampanjidéer... Varje idé måste vara anpassad till både tidskontexten och verksamhetstypen (t.ex. Gym: energi, Café: värme, Spa: lugn, Butik: trend).`;

    const prompt = `Du är en expert på marknadsföringskampanjer för "${organization.name}".
Evenemang: "${eventName}".
Tidskontext: ${timeContext}
Verksamhetstyp: ${organization.businessType?.join(", ") || "N/A"}. Beskrivning: "${organization.businessDescription || "N/A"}".

${styleProfileContext}

Varje idé ska ha en slagkraftig rubrik ('headline'), en kort text ('text') och ett 'visual'-objekt med bildidéer.

**VIKTIGT:** All text, inklusive rubriker och brödtext, måste vara koncis och anpassad för en digital skylt. Alla textvärden i JSON-objektet, inklusive alla fält inuti 'visual'-objektet, måste vara på **svenska**. Den visuella beskrivningen ska vara både inspirerande och detaljerad. **Den MÅSTE också tydligt instruera att bilden INTE ska innehålla någon text, ord eller bokstäver.**
Exempel på ett bra 'visual'-objekt på svenska:
{
  "imageIdea": "En närbild på en nybakad, perfekt semla, pudrad med florsocker. Inga ord eller text i bilden.",
  "style": "Fotorealistisk, aptitretande stil.",
  "colorPalette": "Varma, krämiga färger med inslag av vitt.",
  "mood": "Frestаnde och mysig.",
  "composition": "Tajt beskuren med kort skärpedjup.",
  "lighting": "Mjukt, varmt sidoljus som framhäver texturen i grädden."
}

Efter idéerna, lägg till ett 'followUpSuggestion'-objekt. Objektet ska innehålla 'question' (en kort fråga på svenska som föreslår nästa händelse) och 'eventName' (endast namnet på den händelsen, t.ex. "Julkampanj" eller "Nyår").

Svara ENDAST med ett JSON-objekt enligt schemat.`;
    
    const visualSchema = {
        type: Type.OBJECT,
        properties: {
            imageIdea: { type: Type.STRING }, style: { type: Type.STRING },
            colorPalette: { type: Type.STRING }, mood: { type: Type.STRING },
            composition: { type: Type.STRING }, lighting: { type: Type.STRING },
        },
        required: ["imageIdea", "style", "colorPalette", "mood", "composition", "lighting"],
    };

    // FIX: Updated model name per Gemini API guidelines.
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    ideas: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: { 
                                headline: { type: Type.STRING, description: 'En mycket kort rubrik för en digital skylt, max 5-7 ord.' }, 
                                text: { type: Type.STRING, description: 'En kort brödtext, max 1-2 korta meningar.' }, 
                                visual: visualSchema 
                            },
                            required: ["headline", "text", "visual"],
                        },
                    },
                    followUpSuggestion: {
                        type: Type.OBJECT,
                        properties: {
                            question: { type: Type.STRING, description: "En fråga som föreslår nästa kampanj." },
                            eventName: { type: Type.STRING, description: "Namnet på den föreslagna händelsen." }
                        },
                        required: ["question", "eventName"],
                    }
                },
                required: ["ideas"],
            },
        },
    });
    return JSON.parse(response.text.trim());
});

// NEW: AI function to generate campaign ideas based on seasonal/historical data and brand profile.
export const generateSeasonalCampaignIdeas = (
    organization: Organization,
    seasonalContext: string, // e.g., "Förra året vid den här tiden körde du en kampanj om 'Vårboost'."
): Promise<{ ideas: CampaignIdea[] }> => handleAIError(async () => {
    const ai = ensureAiInitialized();

    const brandProfile = `
- Verksamhetstyp: ${organization.businessType?.join(", ") || "Ej angivet"}
- Beskrivning: "${organization.businessDescription || "Ej angivet"}"
`;

    const styleProfile = organization.styleProfile?.summary 
        ? `Användarens stilprofil (använd för ton, bildstil, färg):
---
${organization.styleProfile.summary}
---`
        : "Användaren har ingen stilprofil. Anpassa förslag efter verksamhetstyp.";
    
    const prompt = `Du är en expert kreativ chef och digital varumärkesstrateg för ett företag som heter "${organization.name}".
Ditt uppdrag är att kombinera användarens tidigare säsongsdata med deras varumärkesprofil för att skapa 3 personliga, branschanpassade kampanjförslag för den kommande perioden.

**Input-data:**
1.  **Historisk kontext (vad användaren gjort tidigare):**
    ${seasonalContext}
2.  **Varumärkesprofil:**
    ${brandProfile}
3.  **Stilprofil:**
    ${styleProfile}

**Dina regler:**
1.  **Analysera och kombinera:** Identifiera överlappar mellan historik och varumärkesidentitet för att ge idéer som känns både igenkännbara och förnyade.
2.  **Väg dina förslag:** Sikta på att 2 förslag följer den etablerade stilen (historik + profil) och 1 förslag är ett kreativt "wildcard" som ger ny inspiration.
3.  **Anpassa ton, stil och känsla:** Varje del av förslaget (rubrik, text, bildidé) måste anpassas till varumärkestypen enligt följande:
    - **Gym/Hälsa:** Energiskt, motiverande. Dynamiska bilder, stark kontrast. Färger: Turkos, orange, svart, vit.
    - **Café:** Varmt, personligt. Mjukt, naturligt ljus, närbilder. Färger: Beige, brun, kräm, pastell.
    - **Spa:** Lugnt, elegant. Minimalistiskt, balanserat. Färger: Ljusblå, sand, vit, grön.
    - **Butik:** Inspirerande, trendigt. Färgstarkt, säsongsbetonat. Hög kontrast.
4.  **Svara på svenska.**

Varje kampanjidé ska ha en slagkraftig rubrik ('headline'), en kort text ('text') och ett 'visual'-objekt med bildidéer.

**VIKTIGT:** All text, inklusive rubriker och brödtext, måste vara koncis och anpassad för en digital skylt. Alla textvärden i JSON-objektet, inklusive alla fält inuti 'visual'-objektet, måste vara på **svenska**. Den visuella beskrivningen ska vara både inspirerande och detaljerad. **Den MÅSTE också tydligt instruera att bilden INTE ska innehålla någon text, ord eller bokstäver.**

Svara ENDAST med ett JSON-objekt enligt schemat.`;

    const visualSchema = {
        type: Type.OBJECT,
        properties: {
            imageIdea: { type: Type.STRING }, style: { type: Type.STRING },
            colorPalette: { type: Type.STRING }, mood: { type: Type.STRING },
            composition: { type: Type.STRING }, lighting: { type: Type.STRING },
        },
        required: ["imageIdea", "style", "colorPalette", "mood", "composition", "lighting"],
    };

    // FIX: Updated model name per Gemini API guidelines.
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    ideas: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: { 
                                headline: { type: Type.STRING, description: 'En mycket kort rubrik för en digital skylt, max 5-7 ord.' }, 
                                text: { type: Type.STRING, description: 'En kort brödtext, max 1-2 korta meningar.' }, 
                                visual: visualSchema 
                            },
                            required: ["headline", "text", "visual"],
                        },
                    },
                },
                required: ["ideas"],
            },
        },
    });
    return JSON.parse(response.text.trim());
});


export const generateSkyltIdeas = (userInput: string, organization?: Organization): Promise<SkyltIdeSuggestion[]> => handleAIError(async () => {
    const ai = ensureAiInitialized();

    const businessContext = (organization && (organization.businessType || organization.businessDescription))
        ? `Kontext om användarens verksamhet (använd detta för att göra förslagen mer relevanta):
- Verksamhetstyp: ${organization.businessType?.join(", ") || "Ej angivet"}
- Beskrivning: "${organization.businessDescription || "Ej angivet"}"
`
        : "";

    const styleProfileContext = (organization?.styleProfile?.summary)
        ? `Användarens stilprofil (använd detta för att anpassa förslagen):
---
${organization.styleProfile.summary}
---
Försök att ge 2 förslag som matchar profilen och 1 som är lite annorlunda för att ge ny inspiration.`
        : "Användaren har ingen stilprofil än. Ge generella, kreativa förslag.";
        
    const preferenceProfileContext = organization?.preferenceProfile ? `
**Användarens Preferensmaterial:**
- Webbplats: ${organization.preferenceProfile.websiteUrl || 'ej angiven'}
- Textutdrag som visar tonalitet:
  ${(organization.preferenceProfile.textSnippets || []).map(s => `- "${s}"`).join('\n') || 'inga'}
Använd de bifogade bilderna som stark visuell inspiration för färg, stil och motiv.
` : '';

    const prompt = `Du är en kreativ assistent i appen Smart Skylt. Ditt uppdrag är att hjälpa användare skapa snyggt och engagerande skyltmaterial.

${businessContext}
${styleProfileContext}
${preferenceProfileContext}

Ditt mål är att ge tre konkreta idéförslag på SVENSKA utifrån användarens input: "${userInput}".

Varje förslag ska innehålla:
1. 'headline': En mycket kort, slagkraftig rubrik (max 5-7 ord).
2. 'text': 1–2 korta meningar som förklarar budskapet tydligt.
3. 'visual': Ett objekt med visuella riktlinjer anpassade för verksamheten (t.ex. Gym: energi, Café: värme, Spa: lugn, Butik: trend).

**VIKTIGT:** All text, inklusive rubriker och brödtext, måste vara koncis och anpassad för en digital skylt. Alla textvärden i JSON-objektet, inklusive alla fält inuti 'visual'-objektet, måste vara på **svenska**. Den visuella beskrivningen ska vara både inspirerande och detaljerad. **Den MÅSTE också tydligt instruera att bilden INTE ska innehålla någon text, ord eller bokstäver.**
Exempel på ett bra 'visual'-objekt på svenska:
{
  "imageIdea": "En närbild på en nybakad, perfekt semla, pudrad med florsocker. Inga ord eller text i bilden.",
  "style": "Fotorealistisk, aptitretande stil.",
  "colorPalette": "Varma, krämiga färger med inslag av vitt.",
  "mood": "Frestаnde och mysig.",
  "composition": "Tajt beskuren med kort skärpedjup.",
  "lighting": "Mjukt, varmt sidoljus som framhäver texturen i grädden."
}

Svara ENDAST med ett JSON-objekt inuti ett markdown-kodblock (\`\`\`json ... \`\`\`). JSON-objektet ska ha en enda nyckel, "suggestions", som innehåller en array av dina tre förslag.`;

    const parts: any[] = [{ text: prompt }];
    if (organization?.preferenceProfile?.mediaItems) {
        const imagePartsPromises = organization.preferenceProfile.mediaItems.map(item => urlToBase64(item.url));
        const imagePartsData = await Promise.all(imagePartsPromises);
        imagePartsData.forEach(data => {
            parts.push({ inlineData: { mimeType: data.mimeType, data: data.data } });
        });
    }

    // FIX: Updated model name per Gemini API guidelines.
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts },
    });
    
    let jsonString = response.text.trim();
    if (jsonString.startsWith("```json")) {
        jsonString = jsonString.substring(7);
    }
    if (jsonString.endsWith("```")) {
        jsonString = jsonString.substring(0, jsonString.length - 3);
    }
    
    const result = JSON.parse(jsonString.trim());
    
    // FIX: The AI might return an array directly, or an object with a 'suggestions' property.
    // This handles both cases and ensures an array is always returned, preventing a crash.
    if (Array.isArray(result)) {
        return result;
    }
    return result.suggestions || [];
});

export const generateVideoFromPrompt = (prompt: string, organizationId: string, onProgress: (status: string) => void, image?: { mimeType: string; data: string }): Promise<string> => handleAIError(async () => {
    const ai = ensureAiInitialized();
    const imagePart = image ? { imageBytes: image.data, mimeType: image.mimeType } : undefined;
    onProgress("Startar videogenerering...");
    // FIX: Updated model name per Gemini API guidelines.
    let operation = await ai.models.generateVideos({
        model: "veo-3.1-fast-generate-preview",
        prompt: `En kort, professionell video för en digital skylt, baserad på följande idé: ${prompt}. VIKTIGT: Videon får inte innehålla någon text, ord eller bokstäver.`,
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

export const generateEventReminderText = (
    event: { name: string; icon: string },
    daysUntil: number,
    organization: Organization,
    hasExistingCampaign: boolean
): Promise<{ headline: string, subtext: string }> => {
    const cacheKey = `ai-event-reminder-${organization.id}-${event.name}-${daysUntil}`;
    const ttlMinutes = 60 * 6; // Cache for 6 hours

    return getCachedAIResponse(cacheKey, ttlMinutes, () => handleAIError(async () => {
        const ai = ensureAiInitialized();

        let timeContext = '';
        if (daysUntil > 30) {
            timeContext = `Det är ${daysUntil} dagar kvar, så det är en bra tid att börja planera en teaser-kampanj.`;
        } else if (daysUntil >= 14) {
            timeContext = `Det är ${daysUntil} dagar kvar, så det är dags att planera huvudkampanjen.`;
        } else {
            timeContext = `Det är bara ${daysUntil} ${daysUntil === 1 ? 'dag' : 'dagar'} kvar, så det är dags att publicera kampanjen snart.`;
        }

        const campaignStatus = hasExistingCampaign
            ? `Användaren har redan en eller flera inlägg planerade för denna händelse. Föreslå att de granskar eller uppdaterar den befintliga kampanjen.`
            : `Användaren har ingen kampanj planerad för denna händelse än. Uppmuntra dem att börja skapa en.`;

        const prompt = `Du är en proaktiv marknadsassistent för appen Smart Skylt. Ditt mål är att skapa en kort, engagerande och kontextmedveten påminnelse för en kommande händelse.
        
        Händelse: "${event.name}" (${event.icon})
        Dagar kvar: ${daysUntil}
        Verksamhetstyp: "${organization.businessType?.join(", ") || "Ej specificerad"}"
        Verksamhetsbeskrivning: "${organization.businessDescription || "Ej specificerad"}"
        
        Tidskontext: ${timeContext}
        Kampanjstatus: ${campaignStatus}

        **Din uppgift:**
        Baserat på all information ovan, skapa ett JSON-objekt med:
        1. 'headline': En kort, inspirerande rubrik (max 10 ord) anpassad till verksamhetens ton.
        2. 'subtext': En uppföljande mening (max 15 ord) som föreslår nästa steg (t.ex. "Ska vi skapa en kampanj?" eller "Vill du uppdatera din befintliga design?").

        **Exempel på tonalitet:**
        - Gym/Hälsa: Energiskt och motiverande.
        - Café/Bageri: Varmt, personligt och mysigt.
        - Spa/Skönhet: Lugnt, elegant och avkopplande.
        - Butik/Handel: Säljande, inspirerande och trendigt.

        Svara ALLTID på svenska. Svara ENDAST med JSON-objektet.
        `;

        // FIX: Updated model name per Gemini API guidelines.
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        headline: { type: Type.STRING },
                        subtext: { type: Type.STRING }
                    },
                    required: ["headline", "subtext"],
                },
            },
        });
        return JSON.parse(response.text.trim());
    }));
};

// NEW: AI function to analyze posts and generate a style profile summary.
export const updateStyleProfileSummary = (
    organization: Organization,
    recentPosts: DisplayPost[],
): Promise<{ summary: string }> => handleAIError(async () => {
    const ai = ensureAiInitialized();

    const businessContext = `Verksamhetstyp: ${organization.businessType?.join(", ") || "Ej angivet"}. Beskrivning: "${organization.businessDescription || "Ej angivet"}"`;

    const preferenceProfileContext = organization.preferenceProfile ? `
**Användarens Preferensmaterial:**
- Webbplats: ${organization.preferenceProfile.websiteUrl || 'ej angiven'}
- Textutdrag som visar tonalitet:
  ${(organization.preferenceProfile.textSnippets || []).map(s => `- "${s}"`).join('\n') || 'inga'}
- Antal referensbilder: ${(organization.preferenceProfile.mediaItems || []).length}
` : '';

    const postSummaries = recentPosts.map(post => {
        return `Inlägg: "${post.internalTitle}"
- Layout: ${post.layout}
- Färger: BG=${post.backgroundColor}, Text=${post.textColor}
- Rubrik: "${post.headline || ''}"
- Text: "${post.body || ''}"
- Bildstil: ${post.isAiGeneratedImage ? 'AI-genererad' : (post.imageUrl ? 'Egen bild' : 'Ingen bild')}
`.trim();
    }).join('\n\n');

    const prompt = `Du är en AI-analytiker som observerar en användares designval för att skapa en stilprofil.
Baserat på följande information om verksamheten, användarens preferensmaterial och de senaste inläggen användaren har skapat, generera en kort, koncis sammanfattning av deras stil.

**Verksamhetskontext:**
${businessContext}

**Användarens preferensmaterial:**
${preferenceProfileContext}

**Senaste inlägg:**
${postSummaries}

**Din uppgift:**
Analysera all information och skapa ett JSON-objekt med fältet 'summary'. Sammanfattningen ska vara en textsträng på max 5-6 rader som beskriver användarens preferenser för ton, visuell stil, färgval och typ av innehåll. Använd nyckelord som användaren själv skulle kunna förstå.

Exempel på sammanfattning:
"Föredrar en energisk och motiverande ton med korta, direkta budskap. Använder ofta fotorealistiska bilder med starka kontraster och varma färger, med orange som en återkommande accentfärg."

Svara ENDAST med JSON-objektet.`;

    // FIX: Updated model name per Gemini API guidelines.
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    summary: { type: Type.STRING, description: "En sammanfattning av användarens designstil." }
                },
                required: ["summary"],
            },
        },
    });
    return JSON.parse(response.text.trim());
});

export const generateRhythmReminderText = (
    organization: Organization,
    analysis: {
        reason: 'new_cycle' | 'gap' | 'ending_soon' | 'peak_month_approaching';
        context: string;
    }
): Promise<{ headline: string, subtext: string }> => {
    const cacheKey = `ai-rhythm-reminder-${organization.id}-${analysis.reason}`;
    const ttlMinutes = 60 * 6; // Cache for 6 hours

    return getCachedAIResponse(cacheKey, ttlMinutes, () => handleAIError(async () => {
        const ai = ensureAiInitialized();

        const prompt = `Du är en proaktiv och insiktsfull marknadsassistent för appen Smart Skylt. Ditt mål är att ge en vänlig påminnelse baserat på användarens unika publiceringsrytm.
        
        Verksamhetstyp: "${organization.businessType?.join(", ") || "Ej specificerad"}"
        Användarens mönster: "${analysis.context}"

        **Din uppgift:**
        Baserat på informationen ovan, skapa ett JSON-objekt med:
        1. 'headline': En kort, inspirerande och personlig rubrik (max 12 ord) som anknyter till mönstret.
        2. 'subtext': En uppföljande mening (max 15 ord) som föreslår nästa steg (t.ex. "Ska vi spåna på några idéer?" eller "Vill du planera nästa kampanj?").

        **Exempel på tonalitet:**
        - "Du har bra rytm i dina inlägg – vill du fortsätta på samma spår inför november?"
        - "Maj brukar vara en stark månad för dig. Ska jag hjälpa dig planera vårens kampanj?"

        Svara ALLTID på svenska. Svara ENDAST med JSON-objektet.`;

        // FIX: Updated model name per Gemini API guidelines.
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        headline: { type: Type.STRING },
                        subtext: { type: Type.STRING }
                    },
                    required: ["headline", "subtext"],
                },
            },
        });
        return JSON.parse(response.text.trim());
    }));
};

export const getSeasonalSuggestion = (
    posts: DisplayPost[],
    organization: Organization
): Promise<{ headline: string, subtext: string, context: string } | null> => {
    const now = new Date();
    const cacheKey = `ai-seasonal-suggestion-${organization.id}-${now.getFullYear()}-${now.getMonth()}`;
    const ttlMinutes = 60 * 24; // Cache for 24 hours

    return getCachedAIResponse(cacheKey, ttlMinutes, () => handleAIError(async () => {
        const ai = ensureAiInitialized();

        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(now.getFullYear() - 1);

        const relevantPosts = posts.filter(p => {
            if (!p.startDate) return false;
            const postDate = new Date(p.startDate);
            // Look at posts from last year around the same time, e.g., in a +/- 1 month window
            const oneYearAgoMinusMonth = new Date(oneYearAgo); oneYearAgoMinusMonth.setMonth(oneYearAgo.getMonth() - 1);
            const oneYearAgoPlusMonth = new Date(oneYearAgo); oneYearAgoPlusMonth.setMonth(oneYearAgo.getMonth() + 1);
            return postDate > oneYearAgoMinusMonth && postDate < oneYearAgoPlusMonth;
        }).map(p => `- Inlägg "${p.internalTitle}" (från ${new Date(p.startDate!).toLocaleDateString('sv-SE')}) med rubriken: "${p.headline}"`).join('\n');

        if (!relevantPosts) {
            return null;
        }

        const prompt = `Du är en proaktiv marknadsassistent för appen Smart Skylt för företaget "${organization.name}".
Ditt mål är att ge en vänlig påminnelse baserat på vad användaren gjorde förra året vid den här tiden.

Dagens datum är ${now.toLocaleDateString('sv-SE')}.

**Här är relevanta kampanjer från ungefär samma tid förra året:**
${relevantPosts}

**Din uppgift:**
Baserat på informationen ovan, skapa ett JSON-objekt med:
1. 'headline': En kort, inspirerande rubrik (max 12 ord) som refererar till förra årets aktivitet. Exempel: "Dags för årets vårboost?" eller "Förra året var november en stark månad!".
2. 'subtext': En uppföljande mening (max 15 ord) som föreslår nästa steg. Exempel: "Vill du skapa en ny version av förra årets kampanj?" eller "Ska jag hjälpa dig planera årets Black Friday?".
3. 'context': En kort sammanfattning av förra årets kampanj(er) som kan användas som input för att generera nya idéer.

Svara ALLTID på svenska. Formuleringarna ska vara mjuka och inspirerande. Svara ENDAST med JSON-objektet.`;

        // FIX: Updated model name per Gemini API guidelines.
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        headline: { type: Type.STRING },
                        subtext: { type: Type.STRING },
                        context: { type: Type.STRING },
                    },
                    required: ["headline", "subtext", "context"],
                },
            },
        });
        return JSON.parse(response.text.trim());
    }));
};

export const generateDnaAnalysis = (organization: Organization): Promise<Partial<StyleProfile>> => handleAIError(async () => {
    const ai = ensureAiInitialized();

    const prompt = `
Du är en expert på varumärkesstrategi. Analysera följande information om ett företag och destillera ner det till dess "DNA". Svara ENDAST med ett JSON-objekt.

**Företagsinformation:**
- Namn: ${organization.name}
- Verksamhetstyp: ${organization.businessType?.join(", ") || "Ej angivet"}
- Beskrivning: "${organization.businessDescription || "Ej angivet"}"
- Hemsida: ${organization.preferenceProfile?.websiteUrl || 'Ej angiven'}
- Tonalitet (exempeltexter): ${(organization.preferenceProfile?.textSnippets || []).map(s => `"${s}"`).join(', ') || 'inga angivna'}

**Din uppgift:**
Baserat på informationen, fyll i följande fält i ett JSON-objekt. Var koncis och använd nyckelord. All text ska vara på SVENSKA.

- brandPersonality: 3-5 adjektiv som beskriver varumärkets personlighet (t.ex. "Vänlig, pålitlig, lokal").
- targetAudience: En kort beskrivning av den primära målgruppen (t.ex. "Hälsointresserade kvinnor 25-45 år").
- coreMessage: Kärnbudskapet i en mening (t.ex. "Vi gör det enkelt att leva hälsosamt i vardagen.").
- visualStyle: Beskrivning av den visuella stilen (t.ex. "Naturliga färger, ljusa bilder, minimalistisk design").
- toneOfVoice: Hur varumärket kommunicerar (t.ex. "Personlig, uppmuntrande och informativ").
- summary: En kort sammanfattning (max 2 meningar) av hela DNA-analysen.
`;

    // FIX: Updated model name per Gemini API guidelines.
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    brandPersonality: { type: Type.STRING },
                    targetAudience: { type: Type.STRING },
                    coreMessage: { type: Type.STRING },
                    visualStyle: { type: Type.STRING },
                    toneOfVoice: { type: Type.STRING },
                    summary: { type: Type.STRING },
                },
                required: ["brandPersonality", "targetAudience", "coreMessage", "visualStyle", "toneOfVoice", "summary"],
            },
        },
    });

    const analysisData = JSON.parse(response.text.trim());
    return {
        ...analysisData,
        lastUpdatedAt: new Date().toISOString(),
        feedback: null, // Reset feedback on new analysis
    };
});

// NEW: AI function to analyze the difference between a suggestion and the final edited post.
export const analyzePostDiff = (
    aiSuggestion: DisplayPost,
    finalPost: DisplayPost
): Promise<{ ändringar: string[]; tolkning: string; förslagFörFramtiden: string; }> => handleAIError(async () => {
    const ai = ensureAiInitialized();

    // Create a simplified summary of the posts for comparison
    const suggestionSummary = `
- Rubrik: "${aiSuggestion.headline || ''}"
- Text: "${aiSuggestion.body || ''}"
- Layout: ${aiSuggestion.layout}
- Färger: BG=${aiSuggestion.backgroundColor}, Text=${aiSuggestion.textColor}
- Bild: ${aiSuggestion.aiImagePrompt ? `AI-genererad bild föreslogs.` : (aiSuggestion.imageUrl ? 'Befintlig bild föreslogs.' : 'Ingen bild.')}
    `.trim();

    const finalSummary = `
- Rubrik: "${finalPost.headline || ''}"
- Text: "${finalPost.body || ''}"
- Layout: ${finalPost.layout}
- Färger: BG=${finalPost.backgroundColor}, Text=${finalPost.textColor}
- Bild: ${finalPost.isAiGeneratedImage ? `Användaren använde en AI-genererad bild.` : (finalPost.imageUrl ? 'Användaren valde en egen bild.' : 'Ingen bild.')}
    `.trim();

    const prompt = `Du är en AI som ska analysera hur en användare redigerade ditt förslag innan publicering.

AI-förslag (original):
---
${suggestionSummary}
---

Publicerad version:
---
${finalSummary}
---

Identifiera och beskriv:
1. Vilka konkreta ändringar användaren gjorde (t.ex. kortare text, ändrad ton, annan CTA, annan bild). Var specifik. Om en text ändrades, visa vad den ändrades från och till.
2. Vad dessa ändringar avslöjar om användarens preferenser.
3. Hur du bör justera framtida förslag för att bättre passa användaren.

Svara ENDAST med ett JSON-objekt i ett markdown-kodblock (\`\`\`json ... \`\`\`) enligt följande format:
{
  "ändringar": ["En lista med strängar som beskriver varje ändring."],
  "tolkning": "En sammanfattande tolkning av användarens preferenser baserat på ändringarna.",
  "förslagFörFramtiden": "En kort instruktion till AI:n för hur den ska agera i framtiden, t.ex. 'Använd en mer avslappnad ton och kortare rubriker.'."
}`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    ändringar: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    },
                    tolkning: { type: Type.STRING },
                    förslagFörFramtiden: { type: Type.STRING }
                },
                required: ["ändringar", "tolkning", "förslagFörFramtiden"],
            },
        },
    });

    let jsonString = response.text.trim();
    if (jsonString.startsWith("```json")) {
        jsonString = jsonString.substring(7);
    }
    if (jsonString.endsWith("```")) {
        jsonString = jsonString.substring(0, jsonString.length - 3);
    }

    return JSON.parse(jsonString.trim());
});

function buildRollupPrompt(learnLog: string[], currentSummary?: string): string {
    const learningPoints = learnLog.map(l => `- ${l}`).join('\n');

    return `Du är en expert på varumärkesstrategi. Du har en befintlig sammanfattning av en användares stil och en lista med nya lärdomar baserat på användarens redigeringar. Ditt uppdrag är att syntetisera dessa lärdomar till en ny, uppdaterad och koncis stilprofil.

**Befintlig Sammanfattning:**
${currentSummary || "Ingen befintlig sammanfattning."}

**Nya Lärdomar (viktigast):**
${learningPoints}

**Din Uppgift:**
Skriv en ny, sammanhängande sammanfattning i ett enda stycke. Den ska integrera de nya lärdomarna och förfina den befintliga profilen. Fokusera på att skapa en praktisk guide för en AI-assistent. Svara ENDAST med den nya sammanfattningen.
`;
}

export async function summarizeLearnLogForOrg(orgId: string) {
  const org = await getOrganizationById(orgId);
  if (!org) {
    throw new Error(`Organization with ID ${orgId} not found.`);
  }

  const learnLog = org.styleProfile?.learnLog ?? [];
  if (learnLog.length < 3) {
    console.log("Too few learnings to summarize.");
    return "Too few learnings to summarize.";
  }

  const prompt = buildRollupPrompt(learnLog, org.styleProfile?.summary);
  const ai = ensureAiInitialized();
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  const summary = result.text.trim();

  const newStyleProfile: StyleProfile = {
    ...org.styleProfile,
    summary: summary,
    learnLog: [], // Clear the log
    lastRolledUpAt: new Date().toISOString(),
  };

  await updateOrganization(orgId, { styleProfile: newStyleProfile });

  return summary;
}
