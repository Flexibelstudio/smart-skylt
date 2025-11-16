// services/geminiService.ts
// -------------------------------------------------------------
// Gemeni-service (kompatibel med @google/genai@0.14.0 ESM build)
// -------------------------------------------------------------

import {
  GoogleGenAI,
  Type,
  Modality,
  Chat,
  FunctionDeclaration,
} from "https://esm.sh/@google/genai@0.14.0";

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

// -------------------------------------------------------------
// Init
// -------------------------------------------------------------

// @ts-ignore - Netlify/Node env injection
// FIX: Per @google/genai guidelines, the API key must be from process.env.API_KEY.
const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI | null = null;
// FIX: Per @google/genai guidelines, the API key must be from process.env.API_KEY.
if (API_KEY) {
  try {
    // FIX: Per @google/genai guidelines, the API key must be from process.env.API_KEY.
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
// System-instruktion (persona)
// -------------------------------------------------------------
export const getMarketingCoachSystemInstruction = (
  organization: Organization
): string => {
  const allPosts = (organization.displayScreens || []).flatMap((s) => s.posts || []);
  const recentPosts = allPosts
    .sort((a, b) => {
      const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
      const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 5);

  const recentMedia = (organization.mediaLibrary || [])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const customPages = (organization.customPages || []).slice(0, 5);
  const tags = (organization.tags || []).slice(0, 10);
  const postTemplates = (organization.postTemplates || []).slice(0, 5);

  let contentContext = "\n**Användarens nuvarande innehåll i systemet:**";
  if (recentPosts.length > 0) {
    contentContext +=
      "\n- **Senaste inlägg:** " +
      recentPosts.map((p) => `"${p.internalTitle}"`).join(", ");
  }
  if (recentMedia.length > 0) {
    contentContext +=
      "\n- **Senaste media:** " +
      recentMedia.map((m) => `"${m.internalTitle}"`).join(", ");
  }
  if (customPages.length > 0) {
    contentContext +=
      "\n- **Egna infosidor:** " +
      customPages.map((p) => `"${p.title}"`).join(", ");
  }
  if (tags.length > 0) {
    contentContext +=
      "\n- **Definierade taggar:** " + tags.map((t) => `"${t.text}"`).join(", ");
  }
  if (postTemplates.length > 0) {
    contentContext +=
      "\n- **Sparade mallar:** " +
      postTemplates.map((t) => `"${t.templateName}"`).join(", ");
  }
  if (contentContext === "\n**Användarens nuvarande innehåll i systemet:**") {
    contentContext = "\nAnvändaren har inte skapat så mycket innehåll än.";
  }

  const orgContext = `
**Företagskontext:**
- Företagsnamn: ${organization.brandName || organization.name}
- Verksamhetstyp: ${organization.businessType?.join(", ") || "ej angiven"}
- Beskrivning: ${organization.businessDescription || "ej angiven"}
- Hemsida: ${organization.preferenceProfile?.websiteUrl || "ej angiven"}
- Exempeltexter (tonalitet): ${
    (organization.preferenceProfile?.textSnippets || []).map((s) => `"${s}"`).join(", ") ||
    "inga angivna"
  }
- AI-lärd stilprofil: ${organization.styleProfile?.summary || "ej analyserad än"}
${contentContext}
`.trim();

  const isProfileIncomplete =
    !organization.businessDescription ||
    !organization.businessType ||
    organization.businessType.length === 0;

  const profileCompletionInstruction = isProfileIncomplete
    ? `\nProfilkomplettering\n- Användarens profil är ofullständig. Uppmana dem vänligt att fylla i sin varumärkesprofil under fliken "Varumärke" för mer träffsäkra tips.`
    : "";

  return `
Du är Skylie, en digital marknadsassistent i ett system för digitala skyltar.
Din avatar visas i gränssnittet — en rund ikon med blå bakgrund och headset.

Ditt uppdrag är att hjälpa varje företag att skapa bättre innehåll, få idéer och förstå hur de kan använda systemet på bästa sätt. Du är vänlig, coachande och kreativ – men alltid tydlig och effektiv.

Du har tillgång till följande information om företaget du hjälper. Använd alltid denna information för att ge branschspecifika råd och relevanta exempel:
${orgContext}

Du kan:
- Föreslå inläggsidéer, kampanjer och bildstilar som passar användarens bransch och befintliga innehåll.
- Ge korta marknadsföringstips (t.ex. hur man formulerar erbjudanden, använder färg eller skapar säsongsanpassat innehåll).
- Förklara hur systemets funktioner fungrar, på ett pedagogiskt och avdramatiserat sätt.
- Svara på frågor om användarens befintliga innehåll (t.ex. "Vilka är mina senaste inlägg?").

När du svarar:
- Tala i första person (“Jag”).
- Håll språket enkelt, glatt och konkret.
- Låt dina svar kännas personliga och relevanta för användarens företag.
- Använd emoji sparsamt för att skapa värme (t.ex. 🌟, 💡, 📈).

VIKTIGA REGLER
1) Svara ALLTID på SVENSKA, oavsett vilket språk användaren skriver på.
2) Undvik att skriva ordet "SmartSkylt". Använd istället "systemet". När du menar produkten (de digitala skyltarna), skriv "era digitala skyltar".
3) Presentera dig endast i första svaret i en ny konversation. Upprepa inte "Jag heter Skylie..." i följande svar om inte användaren uttryckligen frågar.

Markdown
- Använd GitHub-flavored Markdown när det hjälper (rubriker, listor, **fetstil**, tabeller).
- Svara kort och konkret först, utveckla sedan vid behov.
${profileCompletionInstruction}
`.trim();
};

// -------------------------------------------------------------
// Chat-initiering (STATEFUL i Chat-instansen; ingen extern historik)
// -------------------------------------------------------------
export async function initializeMarketingCoachChat(
  organization: Organization
): Promise<Chat> {
  const ai = ensureAiInitialized();
  const systemInstruction = getMarketingCoachSystemInstruction(organization);

  // NEW: Define the tool for creating a display post
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
    model: "gemini-2.5-flash",
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: [createDisplayPost] }],
    },
    history: [],
  });

  return chat;
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
// Övriga AI-funktioner
// -------------------------------------------------------------
export const formatPageWithAI = (rawContent: string): Promise<string> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `Du är en expert på markdown-formatering. Formatera följande råtext till ett västrukturerat dokument med rubriker (#, ##), punktlistor (*), fet text (**text**) och kursiv text (_text_). Se till att resultatet är rent och professionellt. Svara alltid på samma språk som råtexten.

Råtext att formatera:
---
${rawContent}
---`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text;
  });

export const generatePageContentFromPrompt = (
  userPrompt: string
): Promise<string> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `Du är en copywriter. En användare vill skapa en infosida. Utveckla deras idé och skriv innehållet i välstrukturerad Markdown. Svara alltid på SVENSKA.

Användarens idé/prompt är:
---
${userPrompt}
---`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text;
  });

export const generateDisplayPostContent = (
  userPrompt: string,
  organizationName: string
): Promise<{ headline: string; body: string }> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `Du är en expert-copywriter för digitala skyltar för ett företag som heter "${organizationName}". All text måste vara extremt koncis och lättläst på några få sekunder. Skapa en rubrik (headline) och en brödtext (body) på SVENSKA, baserat på användarens idé: "${userPrompt}"`;
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
              description: "En mycket kort rubrik för en digital skylt, max 5-7 ord.",
            },
            body: {
              type: Type.STRING,
              description: "En kort brödtext, max 1-2 korta meningar.",
            },
          },
          required: ["headline", "body"],
        },
      },
    });
    return JSON.parse(response.text.trim());
  });

export const generateAutomationPrompt = (inputs: {
  goal: string;
  tone: string;
  mentions: string;
  avoids: string;
}): Promise<string> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();

    const prompt = `
Du är en expert på att skriva prompts för en kreativ AI som genererar innehåll för digitala skyltar. Ditt uppdrag är att omvandla en användares enkla instruktioner till en tydlig, detaljerad och effektiv kreativ brief.

Användarens instruktioner:
- Mål: ${inputs.goal}
- Tonalitet: ${inputs.tone || "Ej specificerad"}
- Måste nämna: ${inputs.mentions || "Inget specifikt"}
- Får inte nämna: ${inputs.avoids || "Inget specifikt"}

Baserat på detta, skriv ett enda stycke på SVENSKA som fungerar som en komplett instruktion (en kreativ brief) för den kreativa AI:n. Börja instruktionen med ett verb, till exempel "Skapa ett inlägg som...". Inkludera alla delar av användarens instruktioner. Svara ENDAST med den genererade instruktionen.
`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text.trim();
  });

// FIX: Added missing function `generateSkyltIdeas`.
export const generateSkyltIdeas = (
  prompt: string,
  organization: Organization
): Promise<SkyltIdeSuggestion[]> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const fullPrompt = `You are an expert marketing assistant for a company called "${
      organization.brandName || organization.name
    }".
Their business is: ${organization.businessDescription || (organization.businessType || []).join(", ")}.
The user wants ideas for a digital sign based on the keyword/idea: "${prompt}".

Generate 3 distinct and creative campaign ideas. For each idea, provide a catchy headline, a short descriptive text, and a detailed visual suggestion for an AI image generator. The visual suggestion should be broken down into specific elements.

Respond ONLY with a JSON array of 3 objects.
Each object must have:
1. 'headline': A short, punchy headline in SWEDISH.
2. 'text': A short body text in SWEDISH (1-2 sentences).
3. 'visual': An object with:
   - 'imageIdea': A description of the main subject/concept for the image in SWEDISH.
   - 'style': e.g., 'photorealistic', '3d render', 'watercolor'.
   - 'colorPalette': e.g., 'warm tones', 'pastel colors'.
   - 'mood': e.g., 'energetic', 'calm and serene'.
   - 'composition': e.g., 'close-up shot', 'wide angle'.
   - 'lighting': e.g., 'studio lighting', 'golden hour'.
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fullPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              text: { type: Type.STRING },
              visual: {
                type: Type.OBJECT,
                properties: {
                  imageIdea: { type: Type.STRING },
                  style: { type: Type.STRING },
                  colorPalette: { type: Type.STRING },
                  mood: { type: Type.STRING },
                  composition: { type: Type.STRING },
                  lighting: { type: Type.STRING },
                },
                required: ["imageIdea", "style", "colorPalette", "mood", "composition", "lighting"],
              },
            },
            required: ["headline", "text", "visual"],
          },
        },
      },
    });
    return JSON.parse(response.text.trim());
  });


// FIX: Added missing function `generateCampaignIdeasForEvent`.
export const generateCampaignIdeasForEvent = (
  eventName: string,
  daysUntil: number,
  organization: Organization
): Promise<{ ideas: CampaignIdea[]; followUpSuggestion?: { question: string; eventName: string } | null }> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `You are a creative marketing expert for "${organization.brandName || organization.name}".
Business type: ${organization.businessType?.join(", ") || "not specified"}.
Upcoming event: "${eventName}", which is in ${daysUntil} days.

Generate 3 creative and distinct campaign ideas for this event, tailored to the business. Each idea must include a headline, body text, and a detailed visual suggestion.
Also, provide one follow-up question to suggest another relevant event to plan for.

Respond ONLY with a JSON object. The JSON object must have:
1. 'ideas': An array of 3 objects, each with 'headline', 'text', and 'visual' (which is an object with 'imageIdea', 'style', 'colorPalette', 'mood', 'composition', 'lighting'). All text in SWEDISH.
2. 'followUpSuggestion': An object with 'question' (e.g., "Ska vi planera för Black Friday också?") and 'eventName' (e.g., "Black Friday").
`;
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
                  headline: { type: Type.STRING },
                  text: { type: Type.STRING },
                  visual: {
                    type: Type.OBJECT,
                    properties: {
                      imageIdea: { type: Type.STRING },
                      style: { type: Type.STRING },
                      colorPalette: { type: Type.STRING },
                      mood: { type: Type.STRING },
                      composition: { type: Type.STRING },
                      lighting: { type: Type.STRING },
                    },
                     required: ["imageIdea", "style", "colorPalette", "mood", "composition", "lighting"],
                  },
                },
                required: ["headline", "text", "visual"],
              },
            },
            followUpSuggestion: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                eventName: { type: Type.STRING },
              },
               required: ["question", "eventName"],
            },
          },
          required: ["ideas"],
        },
      },
    });
    return JSON.parse(response.text.trim());
  });

// FIX: Added missing function `generateSeasonalCampaignIdeas`.
export const generateSeasonalCampaignIdeas = (
  organization: Organization,
  planningContext: string
): Promise<{ ideas: CampaignIdea[] }> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `You are a creative marketing expert for "${organization.brandName || organization.name}".
Business type: ${organization.businessType?.join(", ") || "not specified"}.
The user wants ideas based on this context: "${planningContext}". This is related to their seasonal patterns.

Generate 3 creative and distinct campaign ideas inspired by this context. Each idea must include a headline, body text, and a detailed visual suggestion.

Respond ONLY with a JSON object. The JSON object must have:
1. 'ideas': An array of 3 objects, each with 'headline', 'text', and 'visual' (which is an object with 'imageIdea', 'style', 'colorPalette', 'mood', 'composition', 'lighting'). All text in SWEDISH.
`;
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
                  headline: { type: Type.STRING },
                  text: { type: Type.STRING },
                  visual: {
                    type: Type.OBJECT,
                    properties: {
                      imageIdea: { type: Type.STRING },
                      style: { type: Type.STRING },
                      colorPalette: { type: Type.STRING },
                      mood: { type: Type.STRING },
                      composition: { type: Type.STRING },
                      lighting: { type: Type.STRING },
                    },
                     required: ["imageIdea", "style", "colorPalette", "mood", "composition", "lighting"],
                  },
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

    const brandingGuidelines = `
- Primärfärg: ${organization.primaryColor || "ej angiven"}
- Sekundärfärg: ${organization.secondaryColor || "ej angiven"}
- Accentfärg: ${organization.accentColor || "ej angiven"}
- Använd dessa färger som nyckelord: 'primary', 'secondary', 'accent', 'black', 'white'. Du kan även använda hex-koder.
`;

    const imageStylePreferences = `
- Stil: ${style || "ej specificerad"}
- Färgpalett: ${colors || "ej specificerad"}
- Stämning: ${mood || "ej specificerad"}
`;

    const styleProfileContext = organization.styleProfile?.summary
      ? `Ta stark hänsyn till användarens stilprofil:
---
${organization.styleProfile.summary}
---`
      : "";

    const preferenceProfileContext = organization.preferenceProfile
      ? `
**Användarens Preferensmaterial:**
- Webbplats: ${organization.preferenceProfile.websiteUrl || "ej angiven"}
- Textutdrag som visar tonalitet:
  ${
    (organization.preferenceProfile.textSnippets || [])
      .map((s) => `- "${s}"`)
      .join("\n") || "inga"
  }
Använd de bifogade bilderna som stark visuell inspiration för färg, stil och motiv.
`
      : "";

    const layoutInstruction = layout
      ? `Användaren har specifikt begärt layouten '${layout}', så du MÅSTE använda den.`
      : `Välj den layout som passar bäst av 'text-only', 'image-fullscreen', 'image-left', 'image-right'.`;

    const prompt = `Du är en expert kreativ chef och designer för ett företag som heter "${
      organization.brandName || organization.name
    }".
Din uppgift är att skapa ett komplett, visuellt tilltalande inlägg för en digital skylt baserat på användarens idé. All text måste vara koncis och lättläst på några få sekunder.
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
3.  'imagePrompt': En detaljerad, kreativ och professionell prompt på ENGELSKA för en AI-bildgenerator. Den ska vara både inspirerande för en människa och detaljerad nog för bild-AI:n. **VIKTIGT: Bildprompten MÅSTE instruera bild-generatorn att INTE inkludera någon text, bokstäver eller ord i bilden, och att endast skapa EN enda bild (inte ett collage eller rutnät).** Inkludera användarens bildstils-preferenser om de anges. Om layouten är 'text-only', kan detta vara en tom sträng.
4.  'layout': ${layoutInstruction}
5.  'backgroundColor': Ett färgsökord ('primary', 'secondary', 'accent', 'black', 'white') eller en hex-kod.
6.  'textColor': Ett färgsökord ('primary', 'black', 'white') eller en hex-kod.
7.  'imageOverlayEnabled': En boolean. Vanligtvis true för 'image-fullscreen' för att säkerställa att texten är läsbar.
8.  'textAlign': Välj en av 'left', 'center', 'right'.
9.  'textAnimation': Välj en av 'none', 'typewriter', 'fade-up-word', 'blur-in'.`;

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
      model: "gemini-2.5-flash",
      contents: { parts },
    });

    let jsonString = textGenResponse.text.trim();
    if (jsonString.startsWith("```json")) jsonString = jsonString.substring(7);
    if (jsonString.endsWith("```")) jsonString = jsonString.slice(0, -3);

    const postData: Partial<DisplayPost> & { imagePrompt?: string } = JSON.parse(
      jsonString.trim()
    );

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
      
      delete postData.imagePrompt;
      return { postData, imageData };
    }

    delete postData.imagePrompt;
    return { postData };
  });

export const generateFollowUpPost = (
  originalPost: DisplayPost,
  organization: Organization,
  aspectRatio: DisplayScreen["aspectRatio"]
): Promise<{ postData: Partial<DisplayPost>; imageData?: { imageBytes: string, mimeType: string } }> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();

    const brandingGuidelines = `
- Primärfärg: ${organization.primaryColor || "ej angiven"}
- Sekundärfärg: ${organization.secondaryColor || "ej angiven"}
- Accentfärg: ${organization.accentColor || "ej angiven"}
- Använd dessa färger som nyckelord: 'primary', 'secondary', 'accent', 'black', 'white'. Du kan även använda hex-koder.
`;

    const styleProfileContext = organization.styleProfile?.summary
      ? `Ta stark hänsyn till användarens stilprofil:
---
${organization.styleProfile.summary}
---`
      : "";

    const originalPostSummary = `
- Rubrik: "${originalPost.headline || ""}"
- Brödtext: "${originalPost.body || ""}"
- Layout: ${originalPost.layout}
`;

    const prompt = `Du är en expert kreativ chef och designer för ett företag som heter "${
      organization.brandName || organization.name
    }". All text måste vara koncis och lättläst på några få sekunder.
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
3.  'imagePrompt': En detaljerad, kreativ och professionell prompt på ENGELSKA för en AI-bildgenerator. **VIKTIGT: Bildprompten MÅSTE instruera att bilden INTE ska innehålla någon text, ord eller bokstäver, och att endast skapa EN enda bild (inte ett collage eller rutnät).** Om layouten är 'text-only', kan detta vara en tom sträng.
4.  'layout': Välj en av 'text-only', 'image-fullscreen', 'image-left', 'image-right'.
5.  'backgroundColor': Ett färgsökord ('primary', 'secondary', 'accent', 'black', 'white') eller en hex-kod.
6.  'textColor': Ett färgsökord ('primary', 'black', 'white') eller en hex-kod.
7.  'imageOverlayEnabled': En boolean. Vanligtvis true för 'image-fullscreen' för att säkerställa att texten är läsbar.
8.  'textAlign': Välj en av 'left', 'center', 'right'.
9.  'textAnimation': Välj en av 'none', 'typewriter', 'fade-up-word', 'blur-in'.`;

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
            layout: {
              type: Type.STRING,
              enum: ["text-only", "image-fullscreen", "image-left", "image-right"],
            },
            backgroundColor: { type: Type.STRING },
            textColor: { type: Type.STRING },
            imageOverlayEnabled: { type: Type.BOOLEAN },
            textAlign: { type: Type.STRING, enum: ["left", "center", "right"] },
            textAnimation: {
              type: Type.STRING,
              enum: ["none", "typewriter", "fade-up-word", "blur-in"],
            },
          },
          required: [
            "headline",
            "body",
            "imagePrompt",
            "layout",
            "backgroundColor",
            "textColor",
            "imageOverlayEnabled",
            "textAlign",
            "textAnimation",
          ],
        },
      },
    });

    const postData: Partial<DisplayPost> & { imagePrompt?: string } = JSON.parse(
      textGenResponse.text.trim()
    );

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
      delete postData.imagePrompt;
      return { postData, imageData };
    }

    delete postData.imagePrompt;
    return { postData };
  });

// Kampanj-array
export const generateDisplayPostCampaign = (
  userPrompt: string,
  postCount: number,
  organizationName: string,
  userMedia?: { mimeType: string; data: string }[],
  imageSettings?: any,
  businessType?: string[],
  businessDescription?: string
): Promise<
  {
    internalTitle: string;
    headline: string;
    body: string;
    durationSeconds: number;
    layout: DisplayPost["layout"];
    imagePrompt?: string;
    userMediaIndex?: number;
  }[]
> =>
  handleAIError(async () => {
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
  2. 'imagePrompt': Om ingen bild passar, skapa en detaljerad bild-prompt på SVENSKA. **VIKTIGT: Bildprompten MÅSTE instruera att INTE inkludera text, ord eller bokstäver i bilden, och att endast skapa EN enda bild (inte ett collage eller rutnät).**
Använd inte både 'userMediaIndex' och 'imagePrompt' i samma inlägg. All text, inklusive imagePrompt, måste vara på svenska.`;

    const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] =
      [{ text: prompt }];
    if (userMedia) {
      userMedia.forEach((media) =>
        parts.push({ inlineData: { mimeType: media.mimeType, data: media.data } })
      );
    }

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

    return JSON.parse(response.text.trim());
  });

export const generateHeadlineSuggestions = (
  body: string,
  existingHeadlines?: string[]
): Promise<string[]> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `Brödtexten är: --- ${body} --- Generera 5 korta, slagkraftiga och kreativa rubriker på SVENSKA som passar till denna brödtext. ${
      existingHeadlines?.length
        ? `Undvik variationer av dessa: "${existingHeadlines.join('", "')}".`
        : ""
    }`;
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

export const generateBodySuggestions = (
  headline: string,
  existingBodies?: string[]
): Promise<string[]> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `Rubriken är: --- ${headline} --- Generera 3 korta, slagkraftiga och kreativa brödtexter (max 1-2 meningar) på SVENSKA som passar till denna rubrik. ${
      existingBodies?.length
        ? `Undvik variationer av dessa: "${existingBodies.join('", "')}".`
        : ""
    }`;

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
    const prompt = `Nuvarande innehåll: Rubrik: "${content.headline}", Brödtext: "${
      content.body
    }". Ditt kommando är: ${commandDescription}. Skriv om innehållet. Håll texten kort och anpassad för en digital skylt.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
    return JSON.parse(response.text.trim());
  });

export const refineTextWithCustomPrompt = (
  content: { headline: string; body: string },
  customPrompt: string
): Promise<{ headline: string; body: string }> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const prompt = `Du är en expert-copywriter för digitala skyltar.
Nuvarande innehåll:
Rubrik: "${content.headline}"
Brödtext: "${content.body}"

Användarens instruktion är: "${customPrompt}"

Skriv om innehållet på SVENSKA enligt instruktionen. Håll texten extremt koncis och anpassad för en digital skylt. Svara ENDAST med ett JSON-objekt med fälten "headline" och "body".`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
    return JSON.parse(response.text.trim());
  });

export const generateDisplayPostImage = (
  prompt: string,
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" = "16:9"
): Promise<{ imageBytes: string; mimeType: string }> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();
    const apiPrompt = `A high-quality, professional, photorealistic marketing image for a digital sign. User's idea: "${prompt}". IMPORTANT: The generated image must be a single, cohesive scene. It must not be a collage, diptych, triptych, or grid of multiple images. The image must not contain any text, words, or letters.`;
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
      model: "gemini-2.5-flash-image",
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

    let operation = await ai.models.generateVideos({
      model,
      prompt: `En kort, professionell video för en digital skylt, baserad på följande idé: ${prompt}. VIKTIGT: Videon får inte innehålla någon text, ord eller bokstäver.`,
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

      let timeContext = "";
      if (daysUntil > 30) {
        timeContext = `Det är ${daysUntil} dagar kvar, så det är en bra tid att börja planera en teaser-kampanj.`;
      } else if (daysUntil >= 14) {
        timeContext = `Det är ${daysUntil} dagar kvar, så det är dags att planera huvudkampanjen.`;
      } else {
        timeContext = `Det är bara ${daysUntil} ${
          daysUntil === 1 ? "dag" : "dagar"
        } kvar, så det är dags att publicera kampanjen snart.`;
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
            },
            required: ["headline", "subtext"],
          },
        },
      });
      return JSON.parse(response.text.trim());
    })
  );
};

// Stilprofil
export const updateStyleProfileSummary = (
  organization: Organization,
  recentPosts: DisplayPost[]
): Promise<{ summary: string }> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();

    const businessContext = `Verksamhetstyp: ${organization.businessType?.join(", ") || "Ej angivet"}. Beskrivning: "${organization.businessDescription || "Ej angivet"}"`;

    const preferenceProfileContext = organization.preferenceProfile
      ? `
**Användarens Preferensmaterial:**
- Webbplats: ${organization.preferenceProfile.websiteUrl || "ej angiven"}
- Textutdrag som visar tonalitet:
  ${
    (organization.preferenceProfile.textSnippets || [])
      .map((s) => `- "${s}"`)
      .join("\n") || "inga"
  }
- Antal referensbilder: ${(organization.preferenceProfile.mediaItems || []).length}
`
      : "";

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

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
    return JSON.parse(response.text.trim());
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
            },
            required: ["headline", "subtext"],
          },
        },
      });
      return JSON.parse(response.text.trim());
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

      const prompt = `Du är en proaktiv marknadsassistent för appen Smart Skylt för företaget "${
        organization.brandName || organization.name
      }".
Ditt mål är att ge en vänlig påminnelse baserat på vad användaren gjorde förra året vid den här tiden.

Dagens datum är ${now.toLocaleDateString("sv-SE")}.

**Här är relevanta kampanjer från ungefär samma tid förra året:**
${relevantPosts}

**Din uppgift:**
Baserat på informationen ovan, skapa ett JSON-objekt med:
1. 'headline': En kort, inspirerande rubrik (max 12 ord) som refererar till förra årets aktivitet. Exempel: "Dags för årets vårboost?" eller "Förra året var november en stark månad!".
2. 'subtext': En uppföljande mening (max 15 ord) som föreslår nästa steg. Exempel: "Vill du skapa en ny version av förra årets kampanj?" eller "Ska jag hjälpa dig planera årets Black Friday?".
3. 'context': En kort sammanfattning av förra årets kampanj(er) som kan användas som input för att generera nya idéer.

Svara ALLTID på svenska. Formuleringarna ska vara mjuka och inspirerande. Svara ENDAST med JSON-objektet.`;

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
    })
  );
};

// DNA-analys
export const generateDnaAnalysis = (
  organization: Organization
): Promise<Partial<StyleProfile>> =>
  handleAIError(async () => {
    const ai = ensureAiInitialized();

    const prompt = `
Du är en expert på varumärkesstrategi. Analysera följande information om ett företag och destillera ner det till dess "DNA". Svara ENDAST med ett JSON-objekt.

**Företagsinformation:**
- Namn: ${organization.brandName || organization.name} (Juridiskt: ${organization.name})
- Verksamhetstyp: ${organization.businessType?.join(", ") || "Ej angivet"}
- Beskrivning: "${organization.businessDescription || "Ej angivet"}"
- Hemsida: ${organization.preferenceProfile?.websiteUrl || "Ej angiven"}
- Tonalitet (exempeltexter): ${
      (organization.preferenceProfile?.textSnippets || [])
        .map((s) => `"${s}"`)
        .join(", ") || "inga angivna"
    }

**Din uppgift:**
Baserat på informationen, fyll i följande fält i ett JSON-objekt. Var koncis och använd nyckelord. All text ska vara på SVENSKA.

- brandPersonality: 3-5 adjektiv som beskriver varumärkets personlighet (t.ex. "Vänlig, pålitlig, lokal").
- targetAudience: En kort beskrivning av den primära målgruppen (t.ex. "Hälsointresserade kvinnor 25-45 år").
- coreMessage: Kärnbudskapet i en mening (t.ex. "Vi gör det enkelt att leva hälsosamt i vardagen.").
- visualStyle: Beskrivning av den visuella stilen (t.ex. "Naturliga färger, ljusa bilder, minimalistisk design").
- toneOfVoice: Hur varumärket kommunicerar (t.ex. "Personlig, uppmuntrande och informativ").
- summary: En kort sammanfattning (max 2 meningar) av hela DNA-analysen.
`;

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

    const analysisData = JSON.parse(response.text.trim());
    return {
      ...analysisData,
      lastUpdatedAt: new Date().toISOString(),
      feedback: null,
    };
  });

// Diff-analys
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
            ändringar: { type: Type.ARRAY, items: { type: Type.STRING } },
            tolkning: { type: Type.STRING },
            förslagFörFramtiden: { type: Type.STRING },
          },
          required: ["ändringar", "tolkning", "förslagFörFramtiden"],
        },
      },
    });

    let jsonString = response.text.trim();
    if (jsonString.startsWith("```json")) jsonString = jsonString.substring(7);
    if (jsonString.endsWith("```")) jsonString = jsonString.substring(0, jsonString.length - 3);
    return JSON.parse(jsonString.trim());
  });

// Rollup/lärlogg
function buildRollupPrompt(learnLog: string[], currentSummary?: string): string {
  const learningPoints = learnLog.map((l) => `- ${l}`).join("\n");

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
    learnLog: [],
    lastRolledUpAt: new Date().toISOString(),
  };

  await updateOrganization(orgId, { styleProfile: newStyleProfile });

  return summary;
}