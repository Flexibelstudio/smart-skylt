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