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
const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI | null = null;
if (API_KEY) {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  } catch (e) {
    console.error("Failed to initialize GoogleGenAI:", e);
  }
} else {
  console.error(
    "Gemini API Key is not configured in the environment. AI features will not work."
  );
}

const ensureAiInitialized = (): GoogleGenAI => {
  if (!ai) {
    throw new Error("AI-tjänsten är inte konfigurerad. Kontrollera API-nyckeln.");
  }
  return ai;
};

// -------------------------------------------------------------
// Helpers (filer/bilder/base64)
// -------------------------------------------------------------

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
    const response = await fetch(publicUrl);
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
// Generell felhanterare
// -------------------------------------------------------------
async function handleAIError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error("Gemini API Error:", error);
    const errorString =
      error instanceof Error ? error.toString().toLowerCase() : String(error).toLowerCase();
    if (errorString.includes("safety")) {
      throw new Error("Försöket blockerades av säkerhetsskäl. Prova en annan text.");
    }
    if (errorString.includes("api key not valid")) {
      throw new Error("API-nyckeln är ogiltig.");
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
  const ai = ensureAiInitialized();
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
    model: "gemini-3-pro-preview", // Upgraded for smarter reasoning
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
    const ai = ensureAiInitialized();
    const prompt = Prompts.getFormatPagePrompt(rawContent);
    // Keep using Flash for simple formatting tasks (speed/cost)
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text ?? "";
  });

export const generatePageContentFromPrompt = (userPrompt: string): Promise<string> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = Prompts.getGeneratePageContentPrompt(userPrompt);
    // Upgraded to Pro for better content generation
    const response = await ai.models.generateContent({
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
    const ai = ensureAiInitialized();
    const prompt = Prompts.getDisplayPostContentPrompt(userPrompt, organizationName);
    const response = await ai.models.generateContent({
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
    return safeParseJSON(response.text ?? "{}", Schemas.DisplayPostContentSchema);
  });

export const generateAutomationPrompt = (inputs: {
  goal: string;
  tone: string;
  mentions: string;
  avoids: string;
}): Promise<string> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = Prompts.getAutomationPromptPrompt(inputs);
    // Upgraded to Pro to generate better prompts for itself
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
    });
    return (response.text ?? "").trim();
  });

export const generateSkyltIdeas = (
  prompt: string,
  organization: Organization
): Promise<SkyltIdeSuggestion[]> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const fullPrompt = Prompts.getSkyltIdeasPrompt(prompt, organization);
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", // Pro for creativity
      contents: fullPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: Schemas.GenAiSkyltIdeSuggestionArray,
      },
    });
    return safeParseJSON(response.text ?? "[]", Schemas.SkyltIdeSuggestionArraySchema);
  });

export const generateCampaignIdeasForEvent = (
  eventName: string,
  daysUntil: number,
  organization: Organization
): Promise<{ ideas: CampaignIdea[]; followUpSuggestion?: { question: string; eventName: string } | null }> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = Prompts.getCampaignIdeasForEventPrompt(eventName, daysUntil, organization);
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: Schemas.GenAiCampaignIdeasResponse,
      },
    });
    return safeParseJSON(response.text ?? "{}", Schemas.CampaignIdeasResponseSchema);
  });

export const generateSeasonalCampaignIdeas = (
  organization: Organization,
  planningContext: string
): Promise<{ ideas: CampaignIdea[] }> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = Prompts.getSeasonalCampaignIdeasPrompt(organization, planningContext);
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: Schemas.GenAiCampaignIdeasResponse, // Reuse same schema
      },
    });
    return safeParseJSON(response.text ?? "{}", Schemas.SeasonalCampaignIdeasResponseSchema);
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
    const ai = ensureAiInitialized();
    const prompt = Prompts.getCompletePostPrompt(userPrompt, organization, layout);

    const parts: any[] = [{ text: prompt }];
    const preferenceMedia = organization.preferenceProfile?.mediaItems;
    if (preferenceMedia && preferenceMedia.length > 0) {
      const imageParts = await Promise.all(
        preferenceMedia.map((item) => urlToBase64(item.url))
      );
      imageParts.forEach((data) =>
        parts.push({ inlineData: { mimeType: data.mimeType, data: data.data } })
      );
    }

    const textGenResponse = await ai.models.generateContent({
      model: "gemini-3-pro-preview", // Pro for better design decisions
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: Schemas.GenAiCompletePostResponse,
      }
    });

    const postData = safeParseJSON(textGenResponse.text ?? "{}", Schemas.CompletePostResponseSchema) as z.infer<typeof Schemas.CompletePostResponseSchema>;

    if (postData.layout !== "text-only" && postData.imagePrompt) {
      const imageResponse = await ai.models.generateImages({
        model: "imagen-4.0-generate-001", // Explicitly use Imagen 3/4
        prompt: postData.imagePrompt,
        config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio },
      });

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
    const ai = ensureAiInitialized();
    const prompt = Prompts.getFollowUpPostPrompt(originalPost, organization);

    const textGenResponse = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: Schemas.GenAiCompletePostResponse, // Reusing schema
      },
    });

    const postData = safeParseJSON(textGenResponse.text ?? "{}", Schemas.CompletePostResponseSchema) as z.infer<typeof Schemas.CompletePostResponseSchema>;

    if (postData.layout !== "text-only" && postData.imagePrompt) {
      const imageResponse = await ai.models.generateImages({
        model: "imagen-4.0-generate-001",
        prompt: postData.imagePrompt,
        config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio },
      });

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
    const ai = ensureAiInitialized();
    const prompt = Prompts.getHeadlineSuggestionsPrompt(body, existingHeadlines);
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
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
    const ai = ensureAiInitialized();
    const prompt = Prompts.getBodySuggestionsPrompt(headline, existingBodies);
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
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
    const ai = ensureAiInitialized();
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

    const response = await ai.models.generateContent({
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
    return safeParseJSON(response.text ?? "{}", Schemas.DisplayPostContentSchema);
  });

export const refineTextWithCustomPrompt = (
  content: { headline: string; body: string },
  customPrompt: string
): Promise<{ headline: string; body: string }> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = Prompts.getRefineWithCustomPromptPrompt(content, customPrompt);

    const response = await ai.models.generateContent({
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
    return safeParseJSON(response.text ?? "{}", Schemas.DisplayPostContentSchema);
  });

export const generateDisplayPostImage = (
  prompt: string,
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" = "16:9"
): Promise<{ imageBytes: string; mimeType: string }> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const apiPrompt = Prompts.getGenerateImagePrompt(prompt);
    const response = await ai.models.generateImages({
      model: "imagen-4.0-generate-001",
      prompt: apiPrompt,
      config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio },
    });
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
    const ai = ensureAiInitialized();
    const mainImagePart = { inlineData: { data: base64ImageData, mimeType } };
    const parts: ({ text: string } | { inlineData: { data: string; mimeType: string } })[] = [
      mainImagePart,
      { text: prompt },
    ];
    if (logo) {
      parts.push({ inlineData: { data: logo.base64Data, mimeType: logo.mimeType } });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image", // Editing still works best with the flash-image model for now
      contents: { parts },
      config: { responseModalities: [Modality.IMAGE] },
    });

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
): Promise<string> => // returns operation ID
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    if (!functions) throw new Error("Firebase Functions är inte initialiserat.");

    const imagePart = image
      ? { imageBytes: image.data, mimeType: image.mimeType }
      : undefined;

    onProgress("Startar videogenerering...");
    const model = "veo-3.1-fast-generate-preview";
    const apiPrompt = Prompts.getGenerateVideoPrompt(prompt);

    let operation = await ai.models.generateVideos({
      model,
      prompt: apiPrompt,
      image: imagePart,
      config: { numberOfVideos: 1 },
    });
    
    const operationId = operation.name.split('/').pop();
    if (!operationId) {
      throw new Error("Kunde inte hämta operation ID från Gemini.");
    }
    
    // Log operation to backend via Cloud Function
    const logFn = functions.httpsCallable('logVideoGeneration');
    await logFn({
        operationId,
        orgId: organizationId,
        screenId,
        postId,
        prompt,
        model,
    });

    onProgress("Uppdrag skickat. AI:n arbetar i bakgrunden...");
    
    return operationId;
  });

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
      const ai = ensureAiInitialized();
      const prompt = Prompts.getEventReminderPrompt(event, daysUntil, organization, hasExistingCampaign);

      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              subtext: { type: Type.STRING },
            },
            required: ["headline", "subtext"],
          },
        },
      });
      return safeParseJSON(response.text ?? "{}", Schemas.EventReminderSchema);
    })
  );
};

export const updateStyleProfileSummary = (
  organization: Organization,
  recentPosts: DisplayPost[]
): Promise<{ summary: string }> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();

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

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "En sammanfattning av användarens designstil." },
          },
          required: ["summary"],
        },
      },
    });
    return safeParseJSON(response.text ?? "{}", Schemas.StyleProfileSummarySchema);
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
      const ai = ensureAiInitialized();
      const prompt = Prompts.getRhythmReminderPrompt(organization, analysis.context);

      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              subtext: { type: Type.STRING },
            },
            required: ["headline", "subtext"],
          },
        },
      });
      return safeParseJSON(response.text ?? "{}", Schemas.RhythmReminderSchema);
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
      const ai = ensureAiInitialized();

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

      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
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
      return safeParseJSON(response.text ?? "{}", Schemas.SeasonalSuggestionSchema);
    })
  );
};

export const generateDnaAnalysis = (
  organization: Organization
): Promise<Partial<StyleProfile>> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = Prompts.getDnaAnalysisPrompt(organization);

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
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
          required: [
            "brandPersonality",
            "targetAudience",
            "coreMessage",
            "visualStyle",
            "toneOfVoice",
            "summary",
          ],
        },
      },
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
    const ai = ensureAiInitialized();

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

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
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
      },
    });

    return safeParseJSON(response.text ?? "{}", Schemas.PostDiffAnalysisSchema);
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
  const ai = ensureAiInitialized();
  const result = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: prompt,
  });

  const summary = result.text?.trim() || "";

  const newStyleProfile: StyleProfile = {
    ...org.styleProfile,
    summary: summary,
    learnLog: [],
    lastRolledUpAt: new Date().toISOString(),
  };

  await updateOrganization(orgId, { styleProfile: newStyleProfile });

  return summary;
}