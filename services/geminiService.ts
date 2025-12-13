
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

// @ts-ignore
const API_KEY = undefined; // FORCE PROXY: process.env.API_KEY is ignored here to prevent client-side usage

let ai: GoogleGenAI | null = null;
if (API_KEY) {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  } catch (e) {
    console.warn("Local GoogleGenAI initialization failed:", e);
  }
}

// Chat still needs a local instance for streaming if possible, but without key it fails.
// We will handle chat separately or via a custom backend stream endpoint (voice-ws).
const ensureAiInitialized = (): GoogleGenAI => {
  if (!ai) {
    throw new Error("AI-tjänsten är inte konfigurerad lokalt. Försök igen eller kontakta support.");
  }
  return ai;
};

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------

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
    const response = await timeoutPromise(fetch(publicUrl), 15000, "Timeout vid hämtning av bild.");
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const blob = await response.blob();

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
  } catch (e) {
    console.error("Error converting URL to base64:", e);
    throw new Error(e instanceof Error ? e.message : String(e));
  }
}

function safeParseJSON<T>(text: string, schema: ZodSchema<T>): T {
  try {
    let jsonString = text.trim();
    if (jsonString.startsWith("```json")) jsonString = jsonString.replace(/^```json\s*/, "");
    else if (jsonString.startsWith("```")) jsonString = jsonString.replace(/^```\s*/, "");
    if (jsonString.endsWith("```")) jsonString = jsonString.replace(/\s*```$/, "");
    
    const parsed = JSON.parse(jsonString);
    return schema.parse(parsed);
  } catch (error) {
    console.error("JSON Parsing/Validation Failed:", error);
    throw new Error("Kunde inte tolka AI-svaret korrekt.");
  }
}

async function getCachedAIResponse<T>(
  cacheKey: string,
  ttlMinutes: number,
  generator: () => Promise<T>
): Promise<T> {
  try {
    const cachedItem = localStorage.getItem(cacheKey);
    if (cachedItem) {
      const { timestamp, data } = JSON.parse(cachedItem);
      if (Date.now() - timestamp <= ttlMinutes * 60 * 1000) return data as T;
    }
  } catch (e) { /* ignore */ }

  const fresh = await generator();
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: fresh }));
  } catch (e) { /* ignore */ }
  return fresh;
}

// -------------------------------------------------------------
// Proxy Functions
// -------------------------------------------------------------

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
    const errorString = error instanceof Error ? error.toString().toLowerCase() : String(error).toLowerCase();
    
    if (errorString.includes("internal")) throw new Error("Serverfel (Internal). Försök igen om en stund.");
    if (errorString.includes("permission_denied")) throw new Error("Behörighet saknas. Kontakta support.");
    if (errorString.includes("safety")) throw new Error("Blockerades av säkerhetsskäl.");
    if (errorString.includes("not found")) throw new Error("AI-modellen hittades inte.");
    if (errorString.includes("timeout")) throw new Error("Tidsgränsen överskreds.");
    
    throw new Error(error instanceof Error ? error.message : "Ett fel inträffade hos AI-tjänsten.");
  }
}

// -------------------------------------------------------------
// Exports
// -------------------------------------------------------------

// CHAT uses a direct connection if key exists, otherwise assumes backend stream logic elsewhere
export async function initializeMarketingCoachChat(organization: Organization): Promise<Chat> {
  // If no local key, we cannot init local chat. The Voice Chat component uses WebSocket backend.
  // For text chat, we might need a similar backend proxy or just fail gracefully if no key.
  if (!API_KEY) {
      // Return a dummy object or throw? The UI should handle this.
      // For now, we throw to signal that local chat isn't possible.
      throw new Error("Chat requires backend connection.");
  }
  const ai = ensureAiInitialized();
  const systemInstruction = Prompts.getMarketingCoachSystemInstruction(organization);
  return ai.chats.create({
    model: "gemini-3-pro-preview",
    config: { systemInstruction },
    history: [],
  });
}

export const formatPageWithAI = (rawContent: string): Promise<string> =>
  handleAIError(async () => {
    if (functions) {
        const fn = functions.httpsCallable('gemini');
        const result = await fn({ action: 'formatPageWithAI', params: { rawContent } });
        return result.data as string;
    }
    const aiClient = ensureAiInitialized();
    const prompt = Prompts.getFormatPagePrompt(rawContent);
    const response = await aiClient.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
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
    const response = await aiClient.models.generateContent({ model: "gemini-3-pro-preview", contents: prompt });
    return response.text ?? "";
  });

export const generateDisplayPostContent = (userPrompt: string, organizationName: string): Promise<{ headline: string; body: string }> =>
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
      config: { responseMimeType: "application/json", responseSchema: Schemas.DisplayPostContentSchema } // Simplified schema usage locally
    });
    return safeParseJSON(response.text ?? "{}", Schemas.DisplayPostContentSchema) as { headline: string; body: string };
  });

export const generateAutomationPrompt = (inputs: { goal: string; tone: string; mentions: string; avoids: string; }): Promise<string> =>
  handleAIError(async () => {
    const prompt = Prompts.getAutomationPromptPrompt(inputs);
    if (functions) {
        const response = await generateContentViaProxy("gemini-2.5-flash", prompt);
        return (response.text ?? "").trim();
    }
    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    return (response.text ?? "").trim();
  });

export const generateSkyltIdeas = (prompt: string, organization: Organization): Promise<SkyltIdeSuggestion[]> =>
  handleAIError(async () => {
    const fullPrompt = Prompts.getSkyltIdeasPrompt(prompt, organization);
    const config = { responseMimeType: "application/json", responseSchema: Schemas.GenAiSkyltIdeSuggestionArray };

    if (functions) {
        const response = await generateContentViaProxy("gemini-2.5-flash", fullPrompt, config);
        return safeParseJSON(response.text ?? "[]", Schemas.SkyltIdeSuggestionArraySchema) as SkyltIdeSuggestion[];
    }
    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({ model: "gemini-2.5-flash", contents: fullPrompt, config });
    return safeParseJSON(response.text ?? "[]", Schemas.SkyltIdeSuggestionArraySchema) as SkyltIdeSuggestion[];
  });

export const generateCampaignIdeasForEvent = (eventName: string, daysUntil: number, organization: Organization): Promise<{ ideas: CampaignIdea[]; followUpSuggestion?: { question: string; eventName: string } | null }> =>
  handleAIError(async () => {
    const prompt = Prompts.getCampaignIdeasForEventPrompt(eventName, daysUntil, organization);
    const config = { responseMimeType: "application/json", responseSchema: Schemas.GenAiCampaignIdeasResponse };

    if (functions) {
        const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
        return safeParseJSON(response.text ?? "{}", Schemas.CampaignIdeasResponseSchema) as any;
    }
    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({ model: "gemini-3-pro-preview", contents: prompt, config });
    return safeParseJSON(response.text ?? "{}", Schemas.CampaignIdeasResponseSchema) as any;
  });

export const generateSeasonalCampaignIdeas = (organization: Organization, planningContext: string): Promise<{ ideas: CampaignIdea[] }> =>
  handleAIError(async () => {
    const prompt = Prompts.getSeasonalCampaignIdeasPrompt(organization, planningContext);
    const config = { responseMimeType: "application/json", responseSchema: Schemas.GenAiCampaignIdeasResponse };

    if (functions) {
        const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
        return safeParseJSON(response.text ?? "{}", Schemas.SeasonalCampaignIdeasResponseSchema) as any;
    }
    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({ model: "gemini-3-pro-preview", contents: prompt, config });
    return safeParseJSON(response.text ?? "{}", Schemas.SeasonalCampaignIdeasResponseSchema) as any;
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
    
    // Media logic kept simple for proxy - only send prompt
    const config = { responseMimeType: "application/json", responseSchema: Schemas.GenAiCompletePostResponse };

    let textGenResponse;
    if (functions) {
        textGenResponse = await generateContentViaProxy("gemini-3-pro-preview", { parts }, config);
    } else {
        const aiClient = ensureAiInitialized();
        textGenResponse = await aiClient.models.generateContent({ model: "gemini-3-pro-preview", contents: { parts }, config });
    }

    const postData = safeParseJSON(textGenResponse.text ?? "{}", Schemas.CompletePostResponseSchema) as unknown as Partial<DisplayPost>;

    if (postData.layout !== "text-only" && (postData as any).imagePrompt) {
      let imageResponse;
      if (functions) {
          const proxyImg = await generateImagesViaProxy("imagen-4.0-generate-001", (postData as any).imagePrompt, { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio });
          imageResponse = { generatedImages: [{ image: { imageBytes: proxyImg.imageBytes } }] };
      } else {
          const aiClient = ensureAiInitialized();
          imageResponse = await aiClient.models.generateImages({ model: "imagen-4.0-generate-001", prompt: (postData as any).imagePrompt, config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio } });
      }

      if (!imageResponse.generatedImages?.length) throw new Error("AI:n kunde inte generera en bild.");
      return { postData, imageData: { imageBytes: imageResponse.generatedImages[0].image.imageBytes, mimeType: 'image/jpeg' } };
    }
    return { postData };
  });

export const generateFollowUpPost = (originalPost: DisplayPost, organization: Organization, aspectRatio: DisplayScreen["aspectRatio"]): Promise<{ postData: Partial<DisplayPost>; imageData?: { imageBytes: string, mimeType: string } }> =>
  handleAIError(async () => {
    const prompt = Prompts.getFollowUpPostPrompt(originalPost, organization);
    const config = { responseMimeType: "application/json", responseSchema: Schemas.GenAiCompletePostResponse };

    let textGenResponse;
    if (functions) {
        textGenResponse = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
    } else {
        const aiClient = ensureAiInitialized();
        textGenResponse = await aiClient.models.generateContent({ model: "gemini-3-pro-preview", contents: prompt, config });
    }

    const postData = safeParseJSON(textGenResponse.text ?? "{}", Schemas.CompletePostResponseSchema) as unknown as Partial<DisplayPost>;

    if (postData.layout !== "text-only" && (postData as any).imagePrompt) {
      let imageResponse;
      if (functions) {
          const proxyImg = await generateImagesViaProxy("imagen-4.0-generate-001", (postData as any).imagePrompt, { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio });
          imageResponse = { generatedImages: [{ image: { imageBytes: proxyImg.imageBytes } }] };
      } else {
          const aiClient = ensureAiInitialized();
          imageResponse = await aiClient.models.generateImages({ model: "imagen-4.0-generate-001", prompt: (postData as any).imagePrompt, config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio } });
      }
      if (!imageResponse.generatedImages?.length) throw new Error("AI:n kunde inte generera en bild.");
      return { postData, imageData: { imageBytes: imageResponse.generatedImages[0].image.imageBytes, mimeType: 'image/jpeg' } };
    }
    return { postData };
  });

export const generateHeadlineSuggestions = (body: string, existingHeadlines?: string[]): Promise<string[]> =>
  handleAIError(async () => {
    if (functions) {
        const fn = functions.httpsCallable('gemini');
        const result = await fn({ action: 'generateHeadlineSuggestions', params: { body, existingHeadlines } });
        return result.data as string[];
    }
    const aiClient = ensureAiInitialized();
    const prompt = Prompts.getHeadlineSuggestionsPrompt(body, existingHeadlines);
    const response = await aiClient.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { headlines: { type: Type.ARRAY, items: { type: Type.STRING } } } } },
    });
    return safeParseJSON(response.text ?? "{}", Schemas.HeadlineSuggestionsSchema).headlines;
  });

export const generateBodySuggestions = (headline: string, existingBodies?: string[]): Promise<string[]> =>
  handleAIError(async () => {
    const prompt = Prompts.getBodySuggestionsPrompt(headline, existingBodies);
    const config = { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { bodies: { type: Type.ARRAY, items: { type: Type.STRING } } } } };

    if (functions) {
        const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
        return safeParseJSON(response.text ?? "{}", Schemas.BodySuggestionsSchema).bodies;
    }
    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({ model: "gemini-3-pro-preview", contents: prompt, config });
    return safeParseJSON(response.text ?? "{}", Schemas.BodySuggestionsSchema).bodies;
  });

export const refineDisplayPostContent = (content: { headline: string; body: string }, command: string): Promise<{ headline: string; body: string }> =>
  handleAIError(async () => {
    if (functions) {
        const fn = functions.httpsCallable('gemini');
        const result = await fn({ action: 'refineDisplayPostContent', params: { content, command } });
        return result.data as { headline: string; body: string };
    }
    const aiClient = ensureAiInitialized();
    const prompt = Prompts.getRefineContentPrompt(content, command);
    const response = await aiClient.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema: Schemas.DisplayPostContentSchema },
    });
    return safeParseJSON(response.text ?? "{}", Schemas.DisplayPostContentSchema) as { headline: string; body: string };
  });

export const refineTextWithCustomPrompt = (content: { headline: string; body: string }, customPrompt: string): Promise<{ headline: string; body: string }> =>
  handleAIError(async () => {
    const prompt = Prompts.getRefineWithCustomPromptPrompt(content, customPrompt);
    const config = { responseMimeType: "application/json", responseSchema: Schemas.DisplayPostContentSchema };

    if (functions) {
        const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
        return safeParseJSON(response.text ?? "{}", Schemas.DisplayPostContentSchema) as { headline: string; body: string };
    }
    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({ model: "gemini-3-pro-preview", contents: prompt, config });
    return safeParseJSON(response.text ?? "{}", Schemas.DisplayPostContentSchema) as { headline: string; body: string };
  });

export const generateDisplayPostImage = (prompt: string, aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" = "16:9"): Promise<{ imageBytes: string; mimeType: string }> =>
  handleAIError(async () => {
    if (functions) {
        const fn = functions.httpsCallable('gemini');
        const result = await fn({ action: 'generateDisplayPostImage', params: { prompt, aspectRatio } });
        const dataUri = result.data as string;
        const [meta, data] = dataUri.split(',');
        const mime = meta.split(':')[1].split(';')[0];
        return { imageBytes: data, mimeType: mime };
    }
    const aiClient = ensureAiInitialized();
    const apiPrompt = Prompts.getGenerateImagePrompt(prompt);
    const response = await aiClient.models.generateImages({
      model: "imagen-4.0-generate-001",
      prompt: apiPrompt,
      config: { numberOfImages: 1, outputMimeType: "image/jpeg", aspectRatio },
    });
    if (response.generatedImages?.length) return { imageBytes: response.generatedImages[0].image.imageBytes, mimeType: 'image/jpeg' };
    throw new Error("AI did not generate an image.");
  });

export const editDisplayPostImage = (base64ImageData: string, mimeType: string, prompt: string, logo?: { base64Data: string; mimeType: string }): Promise<{ imageBytes: string; mimeType: string }> =>
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
    const parts: any[] = [{ inlineData: { data: base64ImageData, mimeType } }, { text: prompt }];
    if (logo) parts.push({ inlineData: { data: logo.base64Data, mimeType: logo.mimeType } });

    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: { parts },
      config: { responseModalities: [Modality.IMAGE] },
    });
    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part?.inlineData) return { imageBytes: part.inlineData.data, mimeType: part.inlineData.mimeType };
    throw new Error("AI did not return an edited image.");
  });

export const generateVideoFromPrompt = (prompt: string, organizationId: string, screenId: string, postId: string, onProgress: (status: string) => void, image?: { mimeType: string; data: string }): Promise<string> => {
  return handleAIError(async () => {
    onProgress("Beställer video från Google Veo...");
    if (!functions) throw new Error("Firebase Functions not initialized");
    const initiateFn = functions.httpsCallable('initiateVideoGeneration');
    
    let imagePayload = null;
    if (image) imagePayload = { imageBytes: image.data, mimeType: image.mimeType };

    const result = await initiateFn({ prompt, orgId: organizationId, screenId, postId, image: imagePayload });
    const operationName = (result.data as any).operationName;
    
    if (!operationName) throw new Error("Kunde inte starta videogenereringen.");

    const POLLING_INTERVAL = 5000;
    const MAX_POLLING_TIME = 1000 * 60 * 15;
    const startTime = Date.now();
    let videoUri: string | null = null;

    while (!videoUri) {
        if (Date.now() - startTime > MAX_POLLING_TIME) throw new Error("Videogenereringen tog för lång tid.");

        try {
            let opResult: any;
            if (functions) {
                const fn = functions.httpsCallable('gemini');
                const res = await fn({ action: 'getVideosOperation', params: { operation: { name: operationName } } });
                opResult = res.data;
            } else {
                // Fallback impossible without key
                throw new Error("Proxy required.");
            }
            
            if (opResult.done) {
                if (opResult.error) throw new Error(`Google Veo fel: ${JSON.stringify(opResult.error)}`);
                videoUri = opResult.response?.generatedVideos?.[0]?.video?.uri || (opResult as any).result?.generatedVideos?.[0]?.video?.uri;
                if (!videoUri) throw new Error("Operation completed but no video URI returned.");
            } else {
                onProgress("Väntar på att videon ska bli klar...");
                await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
            }
        } catch (pollErr: any) {
            if (pollErr.message?.includes("not found")) throw pollErr;
            await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        }
    }

    onProgress("Sparar video...");
    const saveFn = functions.httpsCallable('saveGeneratedVideo');
    const saveResult = await saveFn({ videoUri, orgId: organizationId, screenId, postId });
    return (saveResult.data as any).videoUrl;
  });
};

export const generateEventReminderText = (event: { name: string; icon: string }, daysUntil: number, organization: Organization, hasExistingCampaign: boolean): Promise<{ headline: string; subtext: string }> => {
  const cacheKey = `ai-event-reminder-${organization.id}-${event.name}-${daysUntil}`;
  return getCachedAIResponse(cacheKey, 60 * 6, () =>
    handleAIError(async () => {
      const prompt = Prompts.getEventReminderPrompt(event, daysUntil, organization, hasExistingCampaign);
      const config = { responseMimeType: "application/json", responseSchema: Schemas.EventReminderSchema };
      if (functions) {
          const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
          return safeParseJSON(response.text ?? "{}", Schemas.EventReminderSchema) as { headline: string; subtext: string };
      }
      const aiClient = ensureAiInitialized();
      const response = await aiClient.models.generateContent({ model: "gemini-3-pro-preview", contents: prompt, config });
      return safeParseJSON(response.text ?? "{}", Schemas.EventReminderSchema) as { headline: string; subtext: string };
    })
  );
};

export const updateStyleProfileSummary = (organization: Organization, recentPosts: DisplayPost[]): Promise<{ summary: string }> =>
  handleAIError(async () => {
    const summaries = recentPosts.map(post => `Inlägg: "${post.internalTitle}", Layout: ${post.layout}, Rubrik: "${post.headline}"`).join("\n");
    const prompt = Prompts.getStyleProfileSummaryPrompt(organization, summaries);
    const config = { responseMimeType: "application/json", responseSchema: Schemas.StyleProfileSummarySchema };

    if (functions) {
        const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
        return safeParseJSON(response.text ?? "{}", Schemas.StyleProfileSummarySchema) as { summary: string };
    }
    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({ model: "gemini-3-pro-preview", contents: prompt, config });
    return safeParseJSON(response.text ?? "{}", Schemas.StyleProfileSummarySchema) as { summary: string };
  });

export const generateRhythmReminderText = (organization: Organization, analysis: { reason: string; context: string; }): Promise<{ headline: string; subtext: string }> => {
  const cacheKey = `ai-rhythm-reminder-${organization.id}-${analysis.reason}`;
  return getCachedAIResponse(cacheKey, 60 * 6, () =>
    handleAIError(async () => {
      const prompt = Prompts.getRhythmReminderPrompt(organization, analysis.context);
      const config = { responseMimeType: "application/json", responseSchema: Schemas.RhythmReminderSchema };
      if (functions) {
          const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
          return safeParseJSON(response.text ?? "{}", Schemas.RhythmReminderSchema) as { headline: string; subtext: string };
      }
      const aiClient = ensureAiInitialized();
      const response = await aiClient.models.generateContent({ model: "gemini-3-pro-preview", contents: prompt, config });
      return safeParseJSON(response.text ?? "{}", Schemas.RhythmReminderSchema) as { headline: string; subtext: string };
    })
  );
};

export const getSeasonalSuggestion = (posts: DisplayPost[], organization: Organization): Promise<{ headline: string; subtext: string; context: string } | null> => {
  const now = new Date();
  const cacheKey = `ai-seasonal-suggestion-${organization.id}-${now.getFullYear()}-${now.getMonth()}`;
  return getCachedAIResponse(cacheKey, 60 * 24, () =>
    handleAIError(async () => {
      const relevantPosts = posts.slice(0, 5).map(p => `- ${p.internalTitle}`).join("\n"); // Simplified logic
      if (!relevantPosts) return null;

      const prompt = Prompts.getSeasonalSuggestionPrompt(organization, relevantPosts, now.toLocaleDateString("sv-SE"));
      const config = { responseMimeType: "application/json", responseSchema: Schemas.SeasonalSuggestionSchema };
      
      if (functions) {
          const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
          return safeParseJSON(response.text ?? "{}", Schemas.SeasonalSuggestionSchema) as { headline: string; subtext: string; context: string };
      }
      const aiClient = ensureAiInitialized();
      const response = await aiClient.models.generateContent({ model: "gemini-3-pro-preview", contents: prompt, config });
      return safeParseJSON(response.text ?? "{}", Schemas.SeasonalSuggestionSchema) as { headline: string; subtext: string; context: string };
    })
  );
};

export const generateDnaAnalysis = (organization: Organization): Promise<Partial<StyleProfile>> =>
  handleAIError(async () => {
    const prompt = Prompts.getDnaAnalysisPrompt(organization);
    const config = { responseMimeType: "application/json", responseSchema: Schemas.DnaAnalysisSchema };

    if (functions) {
        const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
        const analysisData = safeParseJSON(response.text ?? "{}", Schemas.DnaAnalysisSchema) as any;
        return { ...analysisData, lastUpdatedAt: new Date().toISOString(), feedback: null };
    }
    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({ model: "gemini-3-pro-preview", contents: prompt, config });
    const analysisData = safeParseJSON(response.text ?? "{}", Schemas.DnaAnalysisSchema) as any;
    return { ...analysisData, lastUpdatedAt: new Date().toISOString(), feedback: null };
  });

export const analyzePostDiff = (aiSuggestion: DisplayPost, finalPost: DisplayPost): Promise<{ ändringar: string[]; tolkning: string; förslagFörFramtiden: string; }> =>
  handleAIError(async () => {
    const prompt = Prompts.getPostDiffPrompt(aiSuggestion.headline || "", finalPost.headline || "");
    const config = { responseMimeType: "application/json", responseSchema: Schemas.PostDiffAnalysisSchema };

    if (functions) {
        const response = await generateContentViaProxy("gemini-3-pro-preview", prompt, config);
        return safeParseJSON(response.text ?? "{}", Schemas.PostDiffAnalysisSchema) as { ändringar: string[]; tolkning: string; förslagFörFramtiden: string; };
    }
    const aiClient = ensureAiInitialized();
    const response = await aiClient.models.generateContent({ model: "gemini-3-pro-preview", contents: prompt, config });
    return safeParseJSON(response.text ?? "{}", Schemas.PostDiffAnalysisSchema) as { ändringar: string[]; tolkning: string; förslagFörFramtiden: string; };
  });

export async function summarizeLearnLogForOrg(orgId: string) {
  const org = await getOrganizationById(orgId);
  if (!org) throw new Error(`Organization ${orgId} not found.`);
  const learnLog = org.styleProfile?.learnLog ?? [];
  if (learnLog.length < 3) return "Too few learnings.";

  const prompt = Prompts.getRollupPrompt(learnLog, org.styleProfile?.summary);
  let summary = "";

  if (functions) {
      const response = await generateContentViaProxy("gemini-3-pro-preview", prompt);
      summary = response.text?.trim() || "";
  } else {
      const aiClient = ensureAiInitialized();
      const result = await aiClient.models.generateContent({ model: "gemini-3-pro-preview", contents: prompt });
      summary = result.text?.trim() || "";
  }

  const newStyleProfile: StyleProfile = {
    ...org.styleProfile,
    summary,
    learnLog: [],
    lastRolledUpAt: new Date().toISOString(),
  };
  await updateOrganization(orgId, { styleProfile: newStyleProfile });
  return summary;
}
