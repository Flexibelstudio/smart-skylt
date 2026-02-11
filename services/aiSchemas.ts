import { z } from 'zod';
import { Type } from '@google/genai';

// --- Shared Zod Schemas ---

// Helper for robust string fields.
// Accepts string, null, or undefined. ALWAYS returns a string (empty if null/undefined).
// Using preprocess ensures the input is handled before Zod validation, guaranteeing a string output.
const RobustString = z.preprocess((val) => val === null || val === undefined ? "" : String(val), z.string());

export const VisualSuggestionSchema = z.object({
  imageIdea: RobustString,
  style: RobustString,
  colorPalette: RobustString,
  mood: RobustString,
  composition: RobustString,
  lighting: RobustString,
});

export const SkyltIdeSuggestionSchema = z.object({
  headline: RobustString,
  text: RobustString,
  visual: VisualSuggestionSchema.optional().default({}),
});

export const SkyltIdeSuggestionArraySchema = z.array(SkyltIdeSuggestionSchema).default([]);

export const DisplayPostContentSchema = z.object({
  headline: RobustString,
  body: RobustString,
});

export const CampaignIdeaSchema = z.object({
  headline: RobustString,
  text: RobustString,
  visual: VisualSuggestionSchema.optional().default({}),
});

export const CampaignIdeasResponseSchema = z.object({
  ideas: z.array(CampaignIdeaSchema).default([]),
  followUpSuggestion: z.object({
    question: RobustString,
    eventName: RobustString
  }).nullable().optional().default(null)
});

export const SeasonalCampaignIdeasResponseSchema = z.object({
  ideas: z.array(CampaignIdeaSchema).default([]),
});

export const CompletePostResponseSchema = z.object({
  headline: RobustString,
  body: RobustString,
  imagePrompt: RobustString,
  layout: RobustString, 
  backgroundColor: RobustString,
  textColor: RobustString,
  imageOverlayEnabled: z.boolean().optional().default(false),
  textAlign: RobustString,
  textAnimation: RobustString
});

export const RemixVariantsResponseSchema = z.object({
  variants: z.array(CompletePostResponseSchema).default([])
});

export const HeadlineSuggestionsSchema = z.object({
  headlines: z.array(z.string()).default([])
});

export const BodySuggestionsSchema = z.object({
  bodies: z.array(z.string()).default([])
});

export const EventReminderSchema = z.object({
  headline: RobustString,
  subtext: RobustString
});

export const StyleProfileSummarySchema = z.object({
  summary: RobustString
});

export const RhythmReminderSchema = z.object({
  headline: RobustString,
  subtext: RobustString
});

export const SeasonalSuggestionSchema = z.object({
  headline: RobustString,
  subtext: RobustString,
  context: RobustString
});

export const DnaAnalysisSchema = z.object({
    brandPersonality: RobustString,
    targetAudience: RobustString,
    coreMessage: RobustString,
    visualStyle: RobustString,
    toneOfVoice: RobustString,
    summary: RobustString,
});

export const PostDiffAnalysisSchema = z.object({
    ändringar: z.array(z.string()).default([]),
    tolkning: RobustString,
    förslagFörFramtiden: RobustString
});

export const PostAnalysisSchema = z.object({
    score: z.number(),
    critique: RobustString,
    improvements: z.array(z.string()).default([]),
    positive: RobustString,
});

export const WebsiteBrandAnalysisSchema = z.object({
    primaryColor: RobustString,
    secondaryColor: RobustString,
    headlineFontCategory: z.enum(['sans', 'serif', 'display', 'script', 'unknown']).default('unknown'),
    bodyFontCategory: z.enum(['sans', 'serif', 'unknown']).default('unknown'),
    businessDescription: RobustString,
    textSnippets: z.array(z.string()).default([]),
    businessType: z.array(z.string()).default([]),
    logoUrl: RobustString.optional(),
});


// --- GenAI SDK Schemas (Config for the AI Model) ---

const GenAiVisualSuggestionObject = {
  type: Type.OBJECT,
  properties: {
    imageIdea: { type: Type.STRING },
    style: { type: Type.STRING },
    colorPalette: { type: Type.STRING },
    mood: { type: Type.STRING },
    composition: { type: Type.STRING },
    lighting: { type: Type.STRING },
  },
  nullable: true,
};

export const GenAiSkyltIdeSuggestionArray = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      headline: { type: Type.STRING },
      text: { type: Type.STRING },
      visual: GenAiVisualSuggestionObject,
    },
    required: ['headline', 'text'],
  },
};

export const GenAiCampaignIdeasResponse = {
  type: Type.OBJECT,
  properties: {
    ideas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          text: { type: Type.STRING },
          visual: GenAiVisualSuggestionObject,
        },
        required: ['headline', 'text'],
      },
    },
    followUpSuggestion: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING },
        eventName: { type: Type.STRING },
      },
      nullable: true,
    },
  },
  required: ['ideas'],
};

export const GenAiCompletePostResponse = {
    type: Type.OBJECT,
    properties: {
        headline: { type: Type.STRING },
        body: { type: Type.STRING },
        imagePrompt: { type: Type.STRING },
        layout: { type: Type.STRING },
        backgroundColor: { type: Type.STRING },
        textColor: { type: Type.STRING },
        imageOverlayEnabled: { type: Type.BOOLEAN },
        textAlign: { type: Type.STRING },
        textAnimation: { type: Type.STRING },
    },
    required: ['headline', 'body', 'imagePrompt'],
};

export const GenAiRemixVariantsResponse = {
  type: Type.OBJECT,
  properties: {
    variants: {
      type: Type.ARRAY,
      items: GenAiCompletePostResponse,
    },
  },
  required: ['variants'],
};

export const GenAiDisplayPostContentSchema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING },
    body: { type: Type.STRING },
  },
  required: ['headline', 'body'],
};

export const GenAiHeadlineSuggestionsSchema = {
  type: Type.OBJECT,
  properties: {
    headlines: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['headlines'],
};

export const GenAiBodySuggestionsSchema = {
  type: Type.OBJECT,
  properties: {
    bodies: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['bodies'],
};

export const GenAiEventReminderSchema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING },
    subtext: { type: Type.STRING },
  },
  required: ['headline', 'subtext'],
};

export const GenAiStyleProfileSummarySchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
  },
  required: ['summary'],
};

export const GenAiRhythmReminderSchema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING },
    subtext: { type: Type.STRING },
  },
  required: ['headline', 'subtext'],
};

export const GenAiSeasonalSuggestionSchema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING },
    subtext: { type: Type.STRING },
    context: { type: Type.STRING },
  },
  required: ['headline', 'subtext', 'context'],
};

export const GenAiDnaAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    brandPersonality: { type: Type.STRING },
    targetAudience: { type: Type.STRING },
    coreMessage: { type: Type.STRING },
    visualStyle: { type: Type.STRING },
    toneOfVoice: { type: Type.STRING },
    summary: { type: Type.STRING },
  },
  required: ['brandPersonality', 'targetAudience', 'coreMessage', 'visualStyle', 'toneOfVoice', 'summary'],
};

export const GenAiPostDiffAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    ändringar: { type: Type.ARRAY, items: { type: Type.STRING } },
    tolkning: { type: Type.STRING },
    förslagFörFramtiden: { type: Type.STRING },
  },
  required: ['ändringar', 'tolkning', 'förslagFörFramtiden'],
};

export const GenAiPostAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.NUMBER },
    critique: { type: Type.STRING },
    improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
    positive: { type: Type.STRING },
  },
  required: ['score', 'critique', 'improvements', 'positive'],
};

export const GenAiWebsiteBrandAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    primaryColor: { type: Type.STRING, description: "Hex code for the main brand color found." },
    secondaryColor: { type: Type.STRING, description: "Hex code for a secondary brand color found." },
    headlineFontCategory: { type: Type.STRING, enum: ['sans', 'serif', 'display', 'script'], description: "The general category of the font used for headings." },
    bodyFontCategory: { type: Type.STRING, enum: ['sans', 'serif'], description: "The general category of the font used for body text." },
    businessDescription: { type: Type.STRING, description: "A concise description of what the business does, in Swedish." },
    textSnippets: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3-5 short phrases from the website that capture the brand's tone of voice." },
    businessType: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Keywords describing the type of business (e.g. Café, Butik, Frisör), in Swedish." },
    logoUrl: { type: Type.STRING, description: "The URL of the brand's logo image found on the website. Prefer a direct image link (png/jpg/svg)." },
  },
  required: ['primaryColor', 'businessDescription', 'textSnippets'],
};