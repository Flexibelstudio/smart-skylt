
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

export interface ScreenZoneConfig {
  isEnabled: boolean;
  layoutType: 'none' | 'main-sidebar' | 'main-footer' | 'traditional-3split';
  showClock?: boolean;
  showWeather?: boolean;
  tickerText?: string;
  sidebarTitle?: string;
  sidebarText?: string;
  showQrCode?: boolean;
  qrCodeUrl?: string;
  qrCodeLabel?: string;
}

export interface DisplayScreen {
  id: string;
  name: string;
  isEnabled: boolean;
  posts: DisplayPost[];
  aspectRatio: '16:9' | '9:16' | '4:3' | '3:4';
  branding?: BrandingOptions;
  zones?: ScreenZoneConfig;
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
  maxScreens?: number;           // Antal skärmar som ingår i abonnemanget (default 1)
  aiMonthlyCreditLimit?: number; // Månadstak för AI-krediter (läses av backend, default 4000)
  // NEW: Customer information fields
  address?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  orgNumber?: string;
  
  displayScreens?: DisplayScreen[];
  tags?: Tag[];
  postTemplates?: PostTemplate[];
  customPages?: CustomPage[];
  customEvents?: CustomEvent[];
  physicalScreens?: PhysicalScreen[];
  mediaLibrary?: MediaItem[];
  aiAutomations?: AiAutomation[]; // NEW: AI automation configurations.
  suggestedPosts?: SuggestedPost[];
  bookingCalendars?: BookingCalendarEntry[];
  todaysAvailableSlots?: TodaysSlots; // Skrivs av backend, läses av skärmen
}

export interface BookingCalendarEntry {
  id: string;              // t.ex. genererat vid skapande
  staffName: string;       // "Anna", "Erik" — visas på skärmen
  enabled: boolean;
  icsUrl?: string;
  bookingUrl?: string;     // Personlig bokningslänk (QR)
  slotMinutes: number;
  workingHours: { [weekday: number]: { enabled: boolean; start: string; end: string } };
}

export interface StaffSlots {
  staffName: string;
  slots: string[];         // ["11:00", "14:30"]
  error?: string;
  closed?: boolean;   // Arbetsdagen är avstängd i inställningarna (≠ fullbokad)
}

export interface TodaysSlots {
  date: string;            // YYYY-MM-DD
  byCalendar: { [calendarId: string]: StaffSlots };
  updatedAt: string;       // ISO
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