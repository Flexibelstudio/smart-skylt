
import { DisplayPost } from './content';

// A structured representation for the AI image prompt builder.
export interface StructuredImagePrompt {
  subject: string; // Motiv (main description)
  style?: string; // Stil (Studiofoto, Lifestyle, etc.)
  colorTone?: string; // Färg & ton (Varm, Kall, etc.)
  perspective?: string; // Perspektiv (Närbild, etc.)
  composition?: string; // Komposition (Centrerad, etc.)
  story?: string; // Story / Användningsscenario (Före/efter, etc.)
  mood?: string;
  lighting?: string;
}

// A type for AI-generated image variants associated with a post.
export interface AiImageVariant {
  id: string;
  url: string; // Firebase storage URL
  prompt: string;
  createdAt: string; // ISO string
  createdByUid: string;
}

// A type for the organization's AI-learned style profile.
export interface StyleProfile {
  summary?: string;
  version?: number;
  // NEW fields for the DNA analysis
  brandPersonality?: string;
  targetAudience?: string;
  coreMessage?: string;
  visualStyle?: string;
  toneOfVoice?: string;
  feedback?: 'positive' | 'negative' | null;
  lastUpdatedAt?: string;
  learnLog?: string[];
  lastRolledUpAt?: string;
}

// A type for the organization's AI-learned planning rhythm.
export interface PlanningProfile {
  averageCampaignLengthDays?: number;
  averageGapDays?: number;
  commonStartPeriod?: 'early-month' | 'mid-month' | 'late-month' | 'any';
  peakMonths?: number[]; // 0-11 for Jan-Dec
  lowActivityMonths?: number[]; // 0-11
  lastUpdatedAt?: string; // ISO string to know when it was last calculated
}

export interface PreferenceMediaItem {
  id: string;
  url: string; // Firebase storage URL
  type: 'image' | 'logo';
}

export interface PreferenceProfile {
  mediaItems?: PreferenceMediaItem[];
  textSnippets?: string[];
  websiteUrl?: string;
}

// A type for configuring an AI-driven content automation.
export interface AiAutomation {
  id: string;
  name: string; // e.g., "Monday Motivation", "Weekly Offers"
  isEnabled: boolean;
  topic: string; // The user-defined theme, e.g., "motivational quotes about fitness" OR the remix instruction
  maxWords?: number; // NEW: The maximum number of words for the generated text.
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1=Monday, 7=Sunday (for weekly)
  dayOfMonth?: number; // 1-31 (for monthly)
  timeOfDay: string; // "HH:MM", e.g., "09:00"
  timezone?: string; // e.g. "Europe/Stockholm"
  targetScreenIds: string[]; // Which screens to generate posts for
  requiresApproval: boolean; // For Step 1, this is always true. For Step 2, it can be false.
  lastRunAt?: string; // ISO string to track when it last generated suggestions
  latestInsight?: string; // NEW: AI-generated insight about learned preferences.
  improvementSuggestion?: string; // A practical recommendation from the AI.
  suggestionState?: 'pending' | 'accepted' | 'ignored'; // The state of the suggestion
  isAutopilotEnabled?: boolean; // NEW: Allows AI to publish automatically if trust is high.
  postLifetimeMode?: 'replace' | 'duration'; // NEW: How to handle old posts.
  postLifetimeDays?: number; // NEW: For 'duration' mode.
  remixBasePostId?: string; // NEW: If set, the automation remixes this post instead of creating from scratch.
  
  // DESIGN PREFERENCES
  preferredLayout?: string; // e.g., 'image-fullscreen', 'text-only'
  imageStyle?: string; // e.g., 'studio photography', 'minimalist'
}

// A type for an AI-generated post that is awaiting user approval.
export interface SuggestedPost {
    id: string;
    automationId: string; // Link back to the automation that created it
    targetScreenId: string;
    createdAt: string; // ISO string
    status: 'pending' | 'approved' | 'rejected' | 'edited-and-published';
    postData: DisplayPost; // The generated post content and design
    finalPostId?: string; // NEW: ID of the DisplayPost created from this suggestion
}

// A type for structured visual suggestions from the AI.
export interface VisualSuggestion {
  imageIdea: string;
  style: string;
  colorPalette: string;
  mood: string;
  composition: string;
  lighting: string;
}

export interface CampaignIdea {
  headline: string;
  text: string;
  visual: VisualSuggestion;
}

export interface SkyltIdeSuggestion {
  headline: string;
  text: string;
  visual: VisualSuggestion;
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: ({ text: string } | { inlineData: { mimeType: string; data: string; url?: string } })[];
}

// For tracking long-running video generation operations.
export interface VideoOperation {
  id: string; // The operation ID from Gemini (without 'operations/')
  orgId: string;
  screenId: string;
  postId: string;
  userId: string;
  prompt: string;
  model: string;
  status: 'processing' | 'done' | 'error' | 'cancelled';
  createdAt: any; // Firestore Timestamp
  completedAt?: any; // Firestore Timestamp
  videoUrl?: string; // Final storage URL
  errorMessage?: string;
}
