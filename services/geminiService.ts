
// services/geminiService.ts
import {
  GoogleGenAI,
  Type,
  Modality,
  Chat,
  FunctionDeclaration,
} from "@google/genai";
import { z, ZodSchema } from 'zod';

import {
  DisplayPost,
  CampaignIdea,
  DisplayScreen,
  Organization,
  SkyltIdeSuggestion,
  PlanningProfile,
  StyleProfile,
} from "../types";

import {
  isOffline,
  getOrganizationById,
  updateOrganization,
} from "./firebaseService";
import { storage, functions } from "./firebaseInit";

import * as Prompts from './aiPrompts';
import * as Schemas from './aiSchemas';

// -------------------------------------------------------------
// Init
// -------------------------------------------------------------

// @ts-ignore - Netlify/Node env injection
// CRITICAL FIX: Force undefined to prevent using the leaked/expired key bundled in the frontend.
// This forces the app to use the Cloud Function proxy which has the valid secret.
const API_KEY = undefined; // process.env.API_KEY;

// Only initialize local client if key exists. Calls will now fallback to proxy if local fails/key missing.
let ai: GoogleGenAI | null = null;
if (API_KEY) {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  } catch (e) {
    console.warn("Local GoogleGenAI initialization failed (using proxy fallback):", e);
  }
} else {
  console.warn(
    "Gemini API Key missing locally (or disabled for security). AI features will rely on Cloud Functions proxy."
  );
}

const ensureAiInitialized = (): GoogleGenAI => {
  if (!ai) {
    throw new Error("Local AI-tjänst är inte tillgänglig. Använd röstchatten eller vänta på en uppdatering.");
  }
  return ai;
};

// -------------------------------------------------------------
// Helpers (Timeouts, filer/bilder/base64)
// -------------------------------------------------------------

// Timeout helper to prevent infinite hangs
const timeoutPromise = <T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
    let timer: any;
    const timerPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorMessage)), ms);
    });
    return Promise.race([promise, timerPromise]).finally(() => clearTimeout(timer));
};

async function ensurePublicImageUrl(url: string): Promise<string> {
  if (isOffline || !storage || !url.includes("firebasestorage.googleapis.com")) {
    return url;
  }
  try {
    const storageRef = storage.refFromURL(url);
    const downloadUrl = await storageRef.getDownloadURL();
    return downloadUrl;
  } catch (error) {
    console.warn("Image fetch fallback:", error);
    return url;
  }
}

export const fileToBase64 = (
  file: File
): Promise<{ mimeType: string; data: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const parts = result.split(",");
      if (parts.length !== 2) {
        return reject(new Error("Invalid file format for base64 conversion."));
      }
      const mimeType = parts[0].split(";")[0].split(":")[1];
      const data = parts[1];
      resolve({ mimeType, data });
    };
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
};

export async function urlToBase64(
  url: string
): Promise<{ mimeType: string; data: string }> {
  try {
    const publicUrl = await ensurePublicImageUrl(url);
    
    // Add 15s timeout for fetching image
    const response = await timeoutPromise(
        fetch(publicUrl), 
        15000, 
        "Hämtning av bild tog för lång tid (timeout)."
    );
    
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const blob = await response.blob();

    if (blob.type === "image/svg+xml") {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(blob);
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const width = img.naturalWidth || 512;
          const height = img.naturalHeight || 512;
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const pngDataUrl = canvas.toDataURL("image/png");
            const data = pngDataUrl.split(",")[1];
            URL.revokeObjectURL(objectUrl);
            resolve({ mimeType: "image/png", data });
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
          const mimeType = result.split(";")[0].split(":")[1];
          const data = result.split(",")[1];
          resolve({ mimeType, data });
        };
        reader.onerror = () => reject(new Error("Failed to read blob."));
        reader.readAsDataURL(blob);
      });
    }
  } catch (e) {
    console.error("Error converting URL to base64:", e);
    throw new Error(e instanceof Error ? e.message : String(e));
  }
}

// -------------------------------------------------------------
// Robust JSON Parsing & Validation
// -------------------------------------------------------------

function safeParseJSON<T>(text: string, schema: ZodSchema<T>): T {
  try {
    let jsonString = text.trim();
    // Remove Markdown code blocks if present
    if (jsonString.startsWith("```json")) {
        jsonString = jsonString.replace(/^```json\s*/, "");
    } else if (jsonString.startsWith("```")) {
        jsonString = jsonString.replace(/^```\s*/, "");
    }
    if (jsonString.endsWith("```")) {
        jsonString = jsonString.replace(/\s*```$/, "");
    }
    
    const parsed = JSON.parse(jsonString);
    return schema.parse(parsed);
  } catch (error) {
    console.error("JSON Parsing/Validation Failed:", error);
    console.error("Raw Text:", text);
    throw new Error("Kunde inte tolka AI-svaret korrekt. Försök igen.");
  }
}

// -------------------------------------------------------------
// Lätt cache
// -------------------------------------------------------------
async function getCachedAIResponse<T>(
  cacheKey: string,
  ttlMinutes: number,
  generator: () => Promise<T>
): Promise<T> {
  try {
    const cachedItem = localStorage.getItem(cacheKey);
    if (cachedItem) {
      const { timestamp, data } = JSON.parse(cachedItem);
      const isStale = Date.now() - timestamp > ttlMinutes * 60 * 1000;
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
  const fresh = await generator();

  try {
    localStorage.setItem(
      cacheKey,
      JSON.stringify({ timestamp: Date.now(), data: fresh })
    );
  } catch (e) {
    console.warn(`[AI Cache] Could not write to cache for key ${cacheKey}:`, e);
  }

  return fresh;
}

// -------------------------------------------------------------
// Generell felhanterare & Proxy
// -------------------------------------------------------------

// Helper to call Gemini via Cloud Function proxy if local key is missing/invalid
async function generateContentViaProxy(model: string, contents: any, config?: any): Promise<{ text: string }> {
    if (!functions) throw new Error("Cloud functions not initialized.");
    const geminiFn = functions.httpsCallable('gemini');
    const result = await geminiFn({
        action: 'generateContent',
        params: { model, contents, config }
    });
    return result.data as { text: string };
}

async function generateImagesViaProxy(model: string, prompt: string, config?: any): Promise<{ imageBytes: string, mimeType: string }> {
    if (!functions) throw new Error("Cloud functions not initialized.");
    const geminiFn = functions.httpsCallable('gemini');
    const result = await geminiFn({
        action: 'generateImages',
        params: { model, prompt, config }
    });
    return result.data as { imageBytes: string, mimeType: string };
}

async function handleAIError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error("Gemini API Error:", error);
    // Handle specific errors first
    if (error instanceof Error && error.message && error.message.includes("Cannot update access control")) {
       throw new Error("Serverfel vid lagring av video (Uniform Bucket Access). Kontakta support.");
    }

    const errorString =
      error instanceof Error ? error.toString().toLowerCase() : String(error).toLowerCase();
    
    // FIX: Correctly identify 403 PERMISSION_DENIED as API Key issue
    if (errorString.includes("403") || errorString.includes("permission_denied") || errorString.includes("permission denied")) {
        throw new Error("API-nyckeln är ogiltig eller blockerad (403). Kontakta support.");
    }

    if (errorString.includes("safety")) {
      throw new Error("Försöket blockerades av säkerhetsskäl. Prova en annan text.");
    }
    if (errorString.includes("api key not valid")) {
      throw new Error("API-nyckeln är ogiltig.");
    }
    if (errorString.includes("404") || errorString.includes("not found")) {
        throw new Error("AI-modellen hittades inte (404). Kontakta support eller försök igen.");
    }
    if (errorString.includes("timeout")) {
        throw new Error("AI-tjänsten svarade inte i tid. Försök igen.");
    }
    throw new Error(
      error instanceof Error ? error.message : "Ett fel inträffade hos AI-tjänsten."
    );
  }
}

// -------------------------------------------------------------
// Chat-initiering
// -------------------------------------------------------------
export async function initializeMarketingCoachChat(
  organization: Organization
): Promise<Chat> {
  const ai = ensureAiInitialized(); // Chat still uses local AI for now as it's complex to proxy statefully
  const systemInstruction = Prompts.getMarketingCoachSystemInstruction(organization);

  const createDisplayPost: FunctionDeclaration = {
    name: 'createDisplayPost',
    description: "Används för att skapa ett komplett utkast till ett inlägg för en digital skylt. Modellen ska först ställa följdfrågor för att samla in tillräckligt med information (ämne, erbjudande etc.) och sedan anropa denna funktion med alla detaljer.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            topic: {
                type: Type.STRING,
                description: 'Huvudämnet för inlägget. Exempel: "sommarrea på böcker", "ny yogaklass", "dagens lunch".'
            },
            offerDetails: {
                type: Type.STRING,
                description: 'Specifika detaljer om ett erbjudande, om det finns. Exempel: "50% rabatt", "köp 2 betala för 1".'
            },
            product: {
                type: Type.STRING,
                description: 'Produkten eller tjänsten som inlägget handlar om. Exempel: "alla pocketböcker", "vinyasa flow yoga", "köttbullar med mos".'
            },
            validity: {
                type: Type.STRING,
                description: 'Hur länge ett erbjudande eller information är giltig. Exempel: "endast idag", "hela juli", "gäller på onsdagar kl 11-14".'
            },
        },
        required: ['topic']
    }
  };

  const chat = ai.chats.create({
    model: "gemini-3-pro-preview", // Keep Pro for the chat/coach, it needs reasoning.
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: [createDisplayPost] }],
    },
    history: [],
  });

  return chat;
}


// -------------------------------------------------------------
// AI-funktioner
// -------------------------------------------------------------

export const formatPageWithAI = (rawContent: string): Promise<string> =>
  handleAIError(async () => {
    // Force proxy
    if (functions) {
        const fn = functions.httpsCallable('gemini');
        const result = await fn({ action: 'formatPageWithAI', params: { rawContent } });
        return result.data as string;
    }
    // Fallback only if functions are missing (which shouldn't happen online)
    const aiClient = ensureAiInitialized();
    const prompt = Prompts.getFormatPagePrompt(rawContent);
    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text ?? "";
  });

export const generatePageContentFromPrompt = (userPrompt: string): Promise<string> =>
  handleAIError(async () => {
    if (functions) {
        const fn = functions.httpsCallable('gemini');
        const result = await fn({ action: 'generatePageContentFromPrompt', params: { userPrompt } });
        return result.data as string;
    }
    const aiClient = ensureAiInitialized();
    const prompt = Prompts.getGeneratePageContentPrompt(userPrompt);
    const response = await aiClient.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
    });
    return response.text ?? "";
  });

export const generateDisplayPostContent = (
  userPrompt: string,
  organizationName: string
): Promise<{ headline: string; body: string }> =>
  handleAIError(async () => {
    if (functions) {
        const fn = functions.httpsCallable('gemini');
        const result = await fn({ action: 'generateDisplayPostContent', params: { userPrompt, organizationName } });
        return result.data as { headline: string; body: string };
    }
    const aiClient = ensureAiInitialized();
    const prompt = Prompts.getDisplayPostContentPrompt(userPrompt, organizationName);
    const response = await aiClient.models.generateContent({
      model: "gemini-3-pro-preview",
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
    return safeParseJSON(response.text ?? "{}", Schemas.DisplayPostContentSchema) as { headline: string; body: string };
  });

export const generateAutomationPrompt = (inputs: {
  goal: string;
  tone: string;
  mentions: string;
  avoids: string;
}): Promise<string> =>
  handleAIError(async () => {
    const prompt = Prompts.getAutomationPromptPrompt(inputs);
    // Use generic proxy for this since no specific action exists
    if (functions) {
        const response = await generateContentViaProxy("gemini-2.5-flash", prompt);
        return (response.text ?? "").trim();
    }
    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return (response.text ?? "").trim();
  });

export const generateSkyltIdeas = (
  prompt: string,
  organization: Organization
): Promise<SkyltIdeSuggestion[]> =>
  handleAIError(async () => {
    const fullPrompt = Prompts.getSkyltIdeasPrompt(prompt, organization);
    const config = {
        responseMimeType: "application/json",
        responseSchema: Schemas.GenAiSkyltIdeSuggestionArray,
    };

    if (functions) {
        const response = await generateContentViaProxy("gemini-2.5-flash", fullPrompt, config);
        return safeParseJSON(response.text ?? "[]", Schemas.SkyltIdeSuggestionArraySchema) as SkyltIdeSuggestion[];
    }

    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash", // Changed to Flash for speed in the interactive UI
      contents: fullPrompt,
      config,
    });
    return safeParseJSON(response.text ?? "[]", Schemas.SkyltIdeSuggestionArraySchema) as SkyltIdeSuggestion[];
  });

export const generateCampaignIdeasForEvent = (
  eventName: string,
  daysUntil: number,
  organization: Organization
): Promise<{ ideas: CampaignIdea[]; followUpSuggestion?: { question: string; eventName: string } | null }> =>
  handleAIError(async () => {
    const prompt = Prompts.getCampaignIdeasForEventPrompt(eventName, daysUntil, organization);
    const config = {
        responseMimeType: "application/json",
        responseSchema: Schemas.GenAiCampaignIdeasResponse,
    };

    if (functions) {
        const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
        return safeParseJSON(response.text ?? "{}", Schemas.CampaignIdeasResponseSchema) as { ideas: CampaignIdea[]; followUpSuggestion?: { question: string; eventName: string } | null };
    }

    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({
      model: "gemini-3-pro-preview", // Keep Pro for strategic campaign planning
      contents: prompt,
      config,
    });
    return safeParseJSON(response.text ?? "{}", Schemas.CampaignIdeasResponseSchema) as { ideas: CampaignIdea[]; followUpSuggestion?: { question: string; eventName: string } | null };
  });

export const generateSeasonalCampaignIdeas = (
  organization: Organization,
  planningContext: string
): Promise<{ ideas: CampaignIdea[] }> =>
  handleAIError(async () => {
    const prompt = Prompts.getSeasonalCampaignIdeasPrompt(organization, planningContext);
    const config = {
        responseMimeType: "application/json",
        responseSchema: Schemas.GenAiCampaignIdeasResponse, 
    };

    if (functions) {
        const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
        return safeParseJSON(response.text ?? "{}", Schemas.SeasonalCampaignIdeasResponseSchema) as { ideas: CampaignIdea[] };
    }

    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({
      model: "gemini-3-pro-preview", // Keep Pro for strategic campaign planning
      contents: prompt,
      config,
    });
    return safeParseJSON(response.text ?? "{}", Schemas.SeasonalCampaignIdeasResponseSchema) as { ideas: CampaignIdea[] };
  });

export const generateCompletePost = (
  userPrompt: string,
  organization: Organization,
  aspectRatio: DisplayScreen["aspectRatio"],
  style?: string,
  colors?: string,
  mood?: string,
  layout?: string
): Promise<{ postData: Partial<DisplayPost>; imageData?: { imageBytes: string, mimeType: string } }> =>
  handleAIError(async () => {
    const prompt = Prompts.getCompletePostPrompt(userPrompt, organization, layout);
    const parts: any[] = [{ text: prompt }];
    
    // Limit preference media to 3 items to avoid payload size issues and timeouts
    const preferenceMedia = (organization.preferenceProfile?.mediaItems || []).slice(0, 3);
    
    if (preferenceMedia.length > 0) {
      // Map requests to promise that resolves to null on failure instead of throwing
      const imagePartsPromises = preferenceMedia.map((item) => 
        urlToBase64(item.url).catch(err => {
            console.warn(`[GeminiService] Skipping broken preference image: ${item.url}`, err);
            return null;
        })
      );
      
      const imageParts = await Promise.all(imagePartsPromises);
      
      imageParts.forEach((data) => {
        if (data) {
            parts.push({ inlineData: { mimeType: data.mimeType, data: data.data } });
        }
      });
    }

    const config = {
        responseMimeType: "application/json",
        responseSchema: Schemas.GenAiCompletePostResponse,
    };

    let textGenResponse;
    if (functions) {
        textGenResponse = await generateContentViaProxy("gemini-3-pro-preview", { parts }, config);
    } else {
        const aiClient = ensureAiInitialized();
        // Add explicit timeout to text generation
        textGenResponse = await timeoutPromise(
            aiClient.models.generateContent({
            model: "gemini-3-pro-preview", // Keep Pro here for good Art Direction prompts
            contents: { parts },
            config
            }),
            45000, // 45s timeout for text generation with images
            "Textgenerering tog för lång tid."
        );
    }

    const postData = safeParseJSON(textGenResponse.text ?? "{}", Schemas.CompletePostResponseSchema) as unknown as Partial<DisplayPost>;

    if (postData.layout !== "text-only" && (postData as any).imagePrompt) {
      // Add explicit timeout to image generation
      let imageResponse;
      if (functions) {
          const proxyImg = await generateImagesViaProxy(
              "imagen-4.0-generate-001", 
              (postData as any).imagePrompt, 
              { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio }
          );
          imageResponse = { generatedImages: [{ image: { imageBytes: proxyImg.imageBytes } }] };
      } else {
          const aiClient = ensureAiInitialized();
          imageResponse = await timeoutPromise(
              aiClient.models.generateImages({
                model: "imagen-4.0-generate-001", // Explicitly use Imagen 4
                prompt: (postData as any).imagePrompt,
                config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio },
              }),
              30000, // 30s timeout for image generation
              "Bildgenerering tog för lång tid."
          );
      }

      if (!imageResponse.generatedImages || imageResponse.generatedImages.length === 0) {
        throw new Error("AI:n kunde inte generera en bild.");
      }
      
      const imageData = {
          imageBytes: imageResponse.generatedImages[0].image.imageBytes,
          mimeType: 'image/jpeg',
      };
      
      return { postData, imageData };
    }

    return { postData };
  });

export const generateFollowUpPost = (
  originalPost: DisplayPost,
  organization: Organization,
  aspectRatio: DisplayScreen["aspectRatio"]
): Promise<{ postData: Partial<DisplayPost>; imageData?: { imageBytes: string, mimeType: string } }> =>
  handleAIError(async () => {
    const prompt = Prompts.getFollowUpPostPrompt(originalPost, organization);
    const config = {
        responseMimeType: "application/json",
        responseSchema: Schemas.GenAiCompletePostResponse,
    };

    let textGenResponse;
    if (functions) {
        textGenResponse = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
    } else {
        const aiClient = ensureAiInitialized();
        textGenResponse = await aiClient.models.generateContent({
            model: "gemini-3-pro-preview", // Keep Pro for context awareness
            contents: prompt,
            config,
        });
    }

    const postData = safeParseJSON(textGenResponse.text ?? "{}", Schemas.CompletePostResponseSchema) as unknown as Partial<DisplayPost>;

    if (postData.layout !== "text-only" && (postData as any).imagePrompt) {
      let imageResponse;
      if (functions) {
          const proxyImg = await generateImagesViaProxy(
              "imagen-4.0-generate-001",
              (postData as any).imagePrompt,
              { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio }
          );
          imageResponse = { generatedImages: [{ image: { imageBytes: proxyImg.imageBytes } }] };
      } else {
          const aiClient = ensureAiInitialized();
          imageResponse = await aiClient.models.generateImages({
            model: "imagen-4.0-generate-001",
            prompt: (postData as any).imagePrompt,
            config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio },
          });
      }

      if (!imageResponse.generatedImages || imageResponse.generatedImages.length === 0) {
        throw new Error("AI:n kunde inte generera en bild.");
      }
      const imageData = {
          imageBytes: imageResponse.generatedImages[0].image.imageBytes,
          mimeType: 'image/jpeg',
      };
      return { postData, imageData };
    }

    return { postData };
  });

export const generateHeadlineSuggestions = (
  body: string,
  existingHeadlines?: string[]
): Promise<string[]> =>
  handleAIError(async () => {
    if (functions) {
        const fn = functions.httpsCallable('gemini');
        const result = await fn({ action: 'generateHeadlineSuggestions', params: { body, existingHeadlines } });
        return result.data as string[];
    }
    const aiClient = ensureAiInitialized();
    const prompt = Prompts.getHeadlineSuggestionsPrompt(body, existingHeadlines);
    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash", // Changed to Flash for speed
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
    const content = safeParseJSON(response.text ?? "{}", Schemas.HeadlineSuggestionsSchema) as z.infer<typeof Schemas.HeadlineSuggestionsSchema>;
    return content.headlines;
  });

export const generateBodySuggestions = (
  headline: string,
  existingBodies?: string[]
): Promise<string[]> =>
  handleAIError(async () => {
    const prompt = Prompts.getBodySuggestionsPrompt(headline, existingBodies);
    const config = {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { bodies: { type: Type.ARRAY, items: { type: Type.STRING } } },
          required: ["bodies"],
        },
    };

    if (functions) {
        const response = await generateContentViaProxy("gemini-2.5-flash", prompt, config);
        const content = safeParseJSON(response.text ?? "{}", Schemas.BodySuggestionsSchema) as z.infer<typeof Schemas.BodySuggestionsSchema>;
        return content.bodies;
    }

    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash", // Changed to Flash for speed
      contents: prompt,
      config,
    });
    const content = safeParseJSON(response.text ?? "{}", Schemas.BodySuggestionsSchema) as z.infer<typeof Schemas.BodySuggestionsSchema>;
    return content.bodies;
  });

export const refineDisplayPostContent = (
  content: { headline: string; body: string },
  command:
    | "shorter"
    | "more_formal"
    | "add_emojis"
    | "more_casual"
    | "more_salesy"
    | "simplify_language"
): Promise<{ headline: string; body: string }> =>
  handleAIError(async () => {
    if (functions) {
        const fn = functions.httpsCallable('gemini');
        const result = await fn({ action: 'refineDisplayPostContent', params: { content, command } });
        return result.data as { headline: string; body: string };
    }
    const aiClient = ensureAiInitialized();
    const commandDescription = {
      shorter:
        "Gör texten *något* kortare och mer koncis, men behåll kärnan i budskapet. Förkorta med ungefär 20-30%, inte mer. Svara på SVENSKA.",
      more_formal: "Använd en mer formell och professionell ton. Svara på SVENSKA.",
      add_emojis:
        "Lägg till 1-2 passande emojis för att göra texten mer levande. Svara på SVENSKA.",
      more_casual: "Använd en mer vardaglig och avslappnad ton. Svara på SVENSKA.",
      more_salesy:
        "Gör den mer säljande och övertygande, med en tydlig 'call to action' om det passar. Svara på SVENSKA.",
      simplify_language:
        "Förenkla språket så det blir lättare att förstå för en bred publik. Använd enklare ord och kortare meningar. Svara på SVENSKA.",
    }[command];
    
    const prompt = Prompts.getRefineContentPrompt(content, commandDescription);

    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash", // Changed to Flash for speed
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
    return safeParseJSON(response.text ?? "{}", Schemas.DisplayPostContentSchema) as { headline: string; body: string };
  });

export const refineTextWithCustomPrompt = (
  content: { headline: string; body: string },
  customPrompt: string
): Promise<{ headline: string; body: string }> =>
  handleAIError(async () => {
    const prompt = Prompts.getRefineWithCustomPromptPrompt(content, customPrompt);
    const config = {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            body: { type: Type.STRING },
          },
          required: ["headline", "body"],
        },
    };

    if (functions) {
        const response = await generateContentViaProxy("gemini-2.5-flash", prompt, config);
        return safeParseJSON(response.text ?? "{}", Schemas.DisplayPostContentSchema) as { headline: string; body: string };
    }

    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash", // Changed to Flash for speed
      contents: prompt,
      config,
    });
    return safeParseJSON(response.text ?? "{}", Schemas.DisplayPostContentSchema) as { headline: string; body: string };
  });

export const generateDisplayPostImage = (
  prompt: string,
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" = "16:9"
): Promise<{ imageBytes: string; mimeType: string }> =>
  handleAIError(async () => {
    if (functions) {
        const fn = functions.httpsCallable('gemini');
        const result = await fn({ action: 'generateDisplayPostImage', params: { prompt, aspectRatio } });
        // The callable returns data URI string, need to parse
        // "data:image/jpeg;base64,..."
        const dataUri = result.data as string;
        const [meta, data] = dataUri.split(',');
        const mime = meta.split(':')[1].split(';')[0];
        return { imageBytes: data, mimeType: mime };
    }
    const aiClient = ensureAiInitialized();
    const apiPrompt = Prompts.getGenerateImagePrompt(prompt);
    
    // Add explicit timeout to image generation
    const response = await timeoutPromise(
        aiClient.models.generateImages({
          model: "imagen-4.0-generate-001", // Keep Imagen 4 for high quality
          prompt: apiPrompt,
          config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio },
        }),
        30000,
        "Bildgenerering tog för lång tid."
    );

    if (response.generatedImages && response.generatedImages.length > 0) {
      return { 
          imageBytes: response.generatedImages[0].image.imageBytes, 
          mimeType: 'image/jpeg' 
      };
    }
    throw new Error("AI did not generate an image.");
  });

export const editDisplayPostImage = (
  base64ImageData: string,
  mimeType: string,
  prompt: string,
  logo?: { base64Data: string; mimeType: string }
): Promise<{ imageBytes: string; mimeType: string }> =>
  handleAIError(async () => {
    if (functions) {
        const fn = functions.httpsCallable('gemini');
        const result = await fn({ action: 'editDisplayPostImage', params: { base64ImageData, mimeType, prompt, logo } });
        const dataUri = result.data as string;
        const [meta, data] = dataUri.split(',');
        const mime = meta.split(':')[1].split(';')[0];
        return { imageBytes: data, mimeType: mime };
    }
    const aiClient = ensureAiInitialized();
    const mainImagePart = { inlineData: { data: base64ImageData, mimeType } };
    const parts: ({ text: string } | { inlineData: { data: string; mimeType: string } })[] = [
      mainImagePart,
      { text: prompt },
    ];
    if (logo) {
      parts.push({ inlineData: { data: logo.base64Data, mimeType: logo.mimeType } });
    }

    const response = await timeoutPromise(
        aiClient.models.generateContent({
          model: "gemini-2.5-flash-image", // Editing works best/fastest with flash-image
          contents: { parts },
          config: { responseModalities: [Modality.IMAGE] },
        }),
        30000,
        "Bildredigering tog för lång tid."
    );

    if (response.promptFeedback?.blockReason) {
      throw new Error(
        `Bildredigeringen blockerades av säkerhetsskäl: ${
          response.promptFeedback.blockReasonMessage || response.promptFeedback.blockReason
        }`
      );
    }

    const responseParts = response.candidates?.[0]?.content?.parts || [];
    let textResponse = "";

    for (const part of responseParts) {
      if (part.inlineData) {
        return {
            imageBytes: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
        };
      }
      if (part.text) {
        textResponse += part.text;
      }
    }

    if (textResponse) {
      throw new Error(`AI:n kunde inte redigera bilden: ${textResponse}`);
    }

    console.error("AI did not return an edited image. Full response:", JSON.stringify(response, null, 2));
    throw new Error("AI did not return an edited image.");
  });

export const generateVideoFromPrompt = (
  prompt: string,
  organizationId: string,
  screenId: string,
  postId: string,
  onProgress: (status: string) => void,
  image?: { mimeType: string; data: string }
): Promise<string> => {
  return handleAIError(async () => {
    // 1. INITIATE SERVER-SIDE (Avoids 429 Quota Error)
    onProgress("Beställer video från Google Veo...");
    
    if (!functions) throw new Error("Firebase Functions not initialized");
    // Use the compat syntax for calling functions
    const initiateVideoGeneration = functions.httpsCallable('initiateVideoGeneration');

    let imagePayload = null;
    if (image) {
        imagePayload = {
            imageBytes: image.data,
            mimeType: image.mimeType
        };
    }

    const result = await initiateVideoGeneration({
        prompt,
        orgId: organizationId,
        screenId,
        postId,
        image: imagePayload
    });

    const data = result.data as { operationName: string };
    const operationName = data.operationName;
    
    if (!operationName) throw new Error("Kunde inte starta videogenereringen (inget ID returnerades).");

    console.log("Video initiated. Polling for completion client-side...", operationName);
    
    // 2. POLL CLIENT-SIDE (Avoids 540s Timeout Error)
    // FIX: Using proxy for polling to avoid exposing key if local key is dead
    const POLLING_INTERVAL = 5000; // 5s
    const MAX_POLLING_TIME = 1000 * 60 * 15; // 15 minutes
    const startTime = Date.now();

    let videoUri: string | null = null;

    while (!videoUri) {
        if (Date.now() - startTime > MAX_POLLING_TIME) {
            throw new Error("Videogenereringen tog för lång tid (klient-timeout).");
        }

        try {
            let opResult: any;
            
            // Proxy logic for operation polling
            if (functions) {
                const fn = functions.httpsCallable('gemini');
                const res = await fn({ action: 'getVideosOperation', params: { operation: { name: operationName } } });
                opResult = res.data;
            } else {
                const aiClient = ensureAiInitialized();
                opResult = await aiClient.operations.getVideosOperation({ 
                    operation: { name: operationName } 
                } as any);
            }
            
            if (opResult.done) {
                if (opResult.error) {
                    throw new Error(`Google Veo fel: ${JSON.stringify(opResult.error)}`);
                }

                // Robustly find the URI
                videoUri = 
                    opResult.response?.generatedVideos?.[0]?.video?.uri ||
                    (opResult as any).result?.generatedVideos?.[0]?.video?.uri ||
                    (opResult as any).metadata?.generatedVideos?.[0]?.video?.uri;

                if (!videoUri) {
                    console.warn("Operation marked done but no URI found. Full response:", opResult);
                    throw new Error("Operation completed but no video URI returned.");
                }
            } else {
                // Still processing
                onProgress("Väntar på att videon ska bli klar...");
                await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
            }
        } catch (pollErr: any) {
            console.warn("Polling error (retrying):", pollErr);
            if (pollErr.message && (pollErr.message.includes("not found") || pollErr.message.includes("404"))) {
                 throw pollErr; // Stop if operation is gone
            }
            await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        }
    }

    // 3. SAVE SERVER-SIDE (Securely stores file)
    onProgress("Sparar video...");
    const saveGeneratedVideo = functions.httpsCallable('saveGeneratedVideo');
    
    const saveResult = await saveGeneratedVideo({
        videoUri,
        orgId: organizationId,
        screenId,
        postId
    });

    const saveData = saveResult.data as { success: boolean, videoUrl: string };

    onProgress("Klar!");
    return saveData.videoUrl;
  });
};

export const generateEventReminderText = (
  event: { name: string; icon: string },
  daysUntil: number,
  organization: Organization,
  hasExistingCampaign: boolean
): Promise<{ headline: string; subtext: string }> => {
  const cacheKey = `ai-event-reminder-${organization.id}-${event.name}-${daysUntil}`;
  const ttlMinutes = 60 * 6;

  return getCachedAIResponse(cacheKey, ttlMinutes, () =>
    handleAIError(async () => {
      const prompt = Prompts.getEventReminderPrompt(event, daysUntil, organization, hasExistingCampaign);
      const config = {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              subtext: { type: Type.STRING },
            },
            required: ["headline", "subtext"],
          },
      };

      if (functions) {
          const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
          return safeParseJSON(response.text ?? "{}", Schemas.EventReminderSchema) as { headline: string; subtext: string };
      }

      const aiClient = ensureAiInitialized();
      const response = await aiClient.models.generateContent({
        model: "gemini-3-pro-preview", // Keep Pro for clever copy
        contents: prompt,
        config,
      });
      return safeParseJSON(response.text ?? "{}", Schemas.EventReminderSchema) as { headline: string; subtext: string };
    })
  );
};

export const updateStyleProfileSummary = (
  organization: Organization,
  recentPosts: DisplayPost[]
): Promise<{ summary: string }> =>
  handleAIError(async () => {
    const postSummaries = recentPosts
      .map((post) => {
        return `Inlägg: "${post.internalTitle}"
- Layout: ${post.layout}
- Färger: BG=${post.backgroundColor}, Text=${post.textColor}
- Rubrik: "${post.headline || ""}"
- Text: "${post.body || ""}"
- Bild: ${
          post.isAiGeneratedImage
            ? "AI-genererad"
            : post.imageUrl
            ? "Befintlig bild"
            : "Ingen bild"
        }`.trim();
      })
      .join("\n\n");

    const prompt = Prompts.getStyleProfileSummaryPrompt(organization, postSummaries);
    const config = {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "En sammanfattning av användarens designstil." },
          },
          required: ["summary"],
        },
    };

    if (functions) {
        const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
        return safeParseJSON(response.text ?? "{}", Schemas.StyleProfileSummarySchema) as { summary: string };
    }

    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({
      model: "gemini-3-pro-preview", // Pro for analysis
      contents: prompt,
      config,
    });
    return safeParseJSON(response.text ?? "{}", Schemas.StyleProfileSummarySchema) as { summary: string };
  });

export const generateRhythmReminderText = (
  organization: Organization,
  analysis: {
    reason: "new_cycle" | "gap" | "ending_soon" | "peak_month_approaching";
    context: string;
  }
): Promise<{ headline: string; subtext: string }> => {
  const cacheKey = `ai-rhythm-reminder-${organization.id}-${analysis.reason}`;
  const ttlMinutes = 60 * 6;

  return getCachedAIResponse(cacheKey, ttlMinutes, () =>
    handleAIError(async () => {
      const prompt = Prompts.getRhythmReminderPrompt(organization, analysis.context);
      const config = {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              subtext: { type: Type.STRING },
            },
            required: ["headline", "subtext"],
          },
      };

      if (functions) {
          const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
          return safeParseJSON(response.text ?? "{}", Schemas.RhythmReminderSchema) as { headline: string; subtext: string };
      }

      const aiClient = ensureAiInitialized();
      const response = await aiClient.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt,
        config,
      });
      return safeParseJSON(response.text ?? "{}", Schemas.RhythmReminderSchema) as { headline: string; subtext: string };
    })
  );
};

export const getSeasonalSuggestion = (
  posts: DisplayPost[],
  organization: Organization
): Promise<{ headline: string; subtext: string; context: string } | null> => {
  const now = new Date();
  const cacheKey = `ai-seasonal-suggestion-${organization.id}-${now.getFullYear()}-${now.getMonth()}`;
  const ttlMinutes = 60 * 24;

  return getCachedAIResponse(cacheKey, ttlMinutes, () =>
    handleAIError(async () => {
      const oneYearAgo = new Date(now);
      oneYearAgo.setFullYear(now.getFullYear() - 1);

      const relevantPosts = posts
        .filter((p) => {
          if (!p.startDate) return false;
          const postDate = new Date(p.startDate);
          const oneYearAgoMinusMonth = new Date(oneYearAgo);
          oneYearAgoMinusMonth.setMonth(oneYearAgo.getMonth() - 1);
          const oneYearAgoPlusMonth = new Date(oneYearAgo);
          oneYearAgoPlusMonth.setMonth(oneYearAgo.getMonth() + 1);
          return postDate > oneYearAgoMinusMonth && postDate < oneYearAgoPlusMonth;
        })
        .map(
          (p) =>
            `- Inlägg "${p.internalTitle}" (från ${new Date(p.startDate!).toLocaleDateString(
              "sv-SE"
            )}) med rubriken: "${p.headline}"`
        )
        .join("\n");

      if (!relevantPosts) {
        return null;
      }

      const prompt = Prompts.getSeasonalSuggestionPrompt(organization, relevantPosts, now.toLocaleDateString("sv-SE"));
      const config = {
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
      };

      if (functions) {
          const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
          return safeParseJSON(response.text ?? "{}", Schemas.SeasonalSuggestionSchema) as { headline: string; subtext: string; context: string };
      }

      const aiClient = ensureAiInitialized();
      const response = await aiClient.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt,
        config,
      });
      return safeParseJSON(response.text ?? "{}", Schemas.SeasonalSuggestionSchema) as { headline: string; subtext: string; context: string };
    })
  );
};

export const generateDnaAnalysis = (
  organization: Organization
): Promise<Partial<StyleProfile>> =>
  handleAIError(async () => {
    const prompt = Prompts.getDnaAnalysisPrompt(organization);
    const config = {
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
          required: [
            "brandPersonality",
            "targetAudience",
            "coreMessage",
            "visualStyle",
            "toneOfVoice",
            "summary",
          ],
        },
    };

    if (functions) {
        const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
        const analysisData = safeParseJSON(response.text ?? "{}", Schemas.DnaAnalysisSchema) as z.infer<typeof Schemas.DnaAnalysisSchema>;
        return {
            ...analysisData,
            lastUpdatedAt: new Date().toISOString(),
            feedback: null,
        };
    }

    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config,
    });

    const analysisData = safeParseJSON(response.text ?? "{}", Schemas.DnaAnalysisSchema) as z.infer<typeof Schemas.DnaAnalysisSchema>;
    return {
      ...analysisData,
      lastUpdatedAt: new Date().toISOString(),
      feedback: null,
    };
  });

export const analyzePostDiff = (
  aiSuggestion: DisplayPost,
  finalPost: DisplayPost
): Promise<{
  ändringar: string[];
  tolkning: string;
  förslagFörFramtiden: string;
}> =>
  handleAIError(async () => {
    const suggestionSummary = `
- Rubrik: "${aiSuggestion.headline || ""}"
- Text: "${aiSuggestion.body || ""}"
- Layout: ${aiSuggestion.layout}
- Färger: BG=${aiSuggestion.backgroundColor}, Text=${aiSuggestion.textColor}
- Bild: ${
      (aiSuggestion as any).aiImagePrompt
        ? `AI-genererad bild föreslogs.`
        : aiSuggestion.imageUrl
        ? "Befintlig bild föreslogs."
        : "Ingen bild."
    }
    `.trim();

    const finalSummary = `
- Rubrik: "${finalPost.headline || ""}"
- Text: "${finalPost.body || ""}"
- Layout: ${finalPost.layout}
- Färger: BG=${finalPost.backgroundColor}, Text=${finalPost.textColor}
- Bild: ${
      finalPost.isAiGeneratedImage
        ? `Användaren använde en AI-genererad bild.`
        : finalPost.imageUrl
        ? "Användaren valde en egen bild."
        : "Ingen bild."
    }
    `.trim();

    const prompt = Prompts.getPostDiffPrompt(suggestionSummary, finalSummary);
    const config = {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ändringar: { type: Type.ARRAY, items: { type: Type.STRING } },
            tolkning: { type: Type.STRING },
            förslagFörFramtiden: { type: Type.STRING },
          },
          required: ["ändringar", "tolkning", "förslagFörFramtiden"],
        },
    };

    if (functions) {
        const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
        return safeParseJSON(response.text ?? "{}", Schemas.PostDiffAnalysisSchema) as {
            ändringar: string[];
            tolkning: string;
            förslagFörFramtiden: string;
        };
    }

    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config,
    });

    return safeParseJSON(response.text ?? "{}", Schemas.PostDiffAnalysisSchema) as {
      ändringar: string[];
      tolkning: string;
      förslagFörFramtiden: string;
    };
  });

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

  const prompt = Prompts.getRollupPrompt(learnLog, org.styleProfile?.summary);
  let summary = "";

  if (functions) {
      const response = await generateContentViaProxy("gemini-3-pro-preview", prompt);
      summary = response.text?.trim() || "";
  } else {
      const aiClient = ensureAiInitialized();
      const result = await aiClient.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt,
      });
      summary = result.text?.trim() || "";
  }

  const newStyleProfile: StyleProfile = {
    ...org.styleProfile,
    summary: summary,
    learnLog: [],
    lastRolledUpAt: new Date().toISOString(),
  };

  await updateOrganization(orgId, { styleProfile: newStyleProfile });

  return summary;
}
