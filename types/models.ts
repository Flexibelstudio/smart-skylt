
import { Tag, PostTemplate, CustomPage, CustomEvent, DisplayPost, InfoCarousel } from './content';
import { StyleProfile, PlanningProfile, PreferenceProfile, AiAutomation, SuggestedPost } from './ai';

// Represents an item in the user's personal media gallery.
export interface MediaItem {
  id: string; // Unique identifier
  type: 'image' | 'video';
  url: string; // The URL to the media (can be data URI or remote URL)
  internalTitle: string; // A descriptive name, e.g., "AI-genererad bild: Sommarfest"
  createdAt: string; // ISO string
  createdBy: 'user' | 'ai'; // To distinguish between uploaded and generated media
  aiPrompt?: string; // The prompt used if created by AI
  sizeBytes?: number;
}

export interface InstagramStory {
    id: string;
    mediaUrl: string;
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
    permalink: string;
    timestamp: string;
}

export interface BrandingOptions {
  isEnabled: boolean;
  showLogo: boolean;
  showName: boolean;
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
}

export interface DisplayScreen {
  id: string;
  name: string;
  isEnabled: boolean;
  posts: DisplayPost[];
  aspectRatio: '16:9' | '9:16' | '4:3' | '3:4';
  branding?: BrandingOptions;
}

// Represents a physical screen that has been connected. This is now the billable entity.
export interface PhysicalScreen {
  id: string;
  name: string; // e.g., "Butik A - Kassa"
  organizationId: string;
  displayScreenId: string; // The ID of the DisplayScreen (content configuration) it's showing.
  pairedAt: string; // ISO string
  pairedByUid: string;
}

export interface Organization {
  id:string;
  name: string;
  brandName?: string;
  subdomain: string;
  logoUrlLight?: string;
  logoUrlDark?: string;
  primaryColor?: string; // Hex color code, e.g., '#FF5733'
  secondaryColor?: string;
  tertiaryColor?: string;
  accentColor?: string;
  headlineFontFamily?: Tag['fontFamily'];
  bodyFontFamily?: Tag['fontFamily'];
  businessType?: string[];
  businessDescription?: string;
  infoCarousel?: InfoCarousel;
  styleProfile?: StyleProfile; // NEW: AI-learned style profile for personalization.
  planningProfile?: PlanningProfile; // NEW: AI-learned planning rhythm.
  preferenceProfile?: PreferenceProfile; // NEW: AI-training material.
  discountScreen?: number; // Percentage, e.g., 10 for 10%
  // NEW: Customer information fields
  address?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  orgNumber?: string;
  latestInstagramPostUrl?: string; // NEW: Central URL for the latest Instagram post
  
  displayScreens?: DisplayScreen[];
  tags?: Tag[];
  postTemplates?: PostTemplate[];
  customPages?: CustomPage[];
  customEvents?: CustomEvent[];
  physicalScreens?: PhysicalScreen[];
  mediaLibrary?: MediaItem[];
  aiAutomations?: AiAutomation[]; // NEW: AI automation configurations.
  suggestedPosts?: SuggestedPost[];
  instagramStories?: InstagramStory[];
}

export interface SystemSettings {
  id: 'main';
  basePriceIncludingFirstScreen?: number;
  pricePerScreenAdditional?: number;
}

export interface ScreenPairingCode {
    code: string; // The 6-character code
    createdAt: any; // Firestore Timestamp
    status: 'pending' | 'paired';
    
    // Fields added upon pairing
    organizationId?: string;
    pairedByUid?: string; // UID of admin who paired it
    pairedAt?: any; // Firestore Timestamp
    assignedDisplayScreenId?: string;
    pairedDeviceId?: string; // NEW: ID of the physical device that was paired.
}