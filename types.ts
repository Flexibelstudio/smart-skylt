// FIX: Added 'staff' and removed 'coach' to support all user roles in the application.
// FIX: Add 'staff' to support all user roles in the application.
export type UserRole = 'organizationadmin' | 'systemowner' | 'member' | 'staff';

export interface UserData {
  uid: string;
  email: string;
  // FIX: Added 'staff' to allow for users with the staff role.
  // FIX: Added 'member' to align with UserRole type.
  // FIX: Added 'staff' to role to align with UserRole type.
  role: 'organizationadmin' | 'systemowner' | 'member' | 'staff';
  organizationId?: string; // Which organization they belong to
  adminRole?: 'superadmin' | 'admin'; // NEW: granular role for org admins
  screenPin?: string; // PIN for accessing admin menu on a screen
  // NEW: Add a list of location IDs this staff member has access to.
  // If undefined or empty, they have access to all locations in the organization.
  accessibleLocationIds?: string[];
}

// FIX: Added missing Workout type definition.
export interface Workout {
  id: string;
  organizationId: string;
  title: string;
  content: string; // Markdown content for the workout
  category?: string;
  isPublished?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

// FIX: Added missing CustomCategoryWithPrompt type definition.
export interface CustomCategoryWithPrompt {
  id:string;
  name: string;
  prompt: string;
}

// FIX: Added missing EquipmentItem type definition.
export interface EquipmentItem {
  id: string;
  name: string;
}

export interface CustomPageTab {
  id: string;
  title: string;
  content: string; // Markdown content
}

export interface CustomPage {
  id:string;
  title: string; // This is the main title for the group of tabs
  tabs: CustomPageTab[];
}

export interface InfoMessage {
  id: string;
  internalTitle: string;
  headline: string;
  body: string;
  layout: 'text-only' | 'image-left' | 'image-right';
  imageUrl?: string; // base64 data URI
  animation: 'fade' | 'slide-left' | 'slide-right';
  durationSeconds: number;
  startDate?: string; // ISO string
  endDate?: string;   // ISO string
  visibleInLocations: string[]; // Array of location IDs, or ['all']
}

export interface InfoCarousel {
  isEnabled: boolean;
  messages: InfoMessage[];
}

export interface Tag {
  id: string;
  displayType?: 'tag' | 'stamp';
  text: string;
  backgroundColor: string;
  textColor: '#FFFFFF' | '#000000';
  fontSize: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
  fontFamily?: 'sans' | 'display' | 'script' | 'adscript' | 'roboto' | 'open-sans' | 'lato' | 'montserrat' | 'source-sans-pro' | 'nunito' | 'raleway' | 'oswald' | 'ubuntu' | 'helvetica-neue' | 'arial' | 'manrope' | 'fira-sans' | 'merriweather' | 'playfair-display' | 'lora' | 'georgia' | 'times-new-roman' | 'libre-baskerville' | 'eb-garamond' | 'cormorant-garamond' | 'pt-serif' | 'dm-sans' | 'work-sans' | 'quicksand' | 'josefin-sans' | 'exo-2' | 'cabin';
  fontWeight?: 'bold' | 'black';
  animation?: 'none' | 'pulse' | 'glow';
  position?: 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  url?: string;
  shape?: 'rectangle' | 'circle';
  border?: 'none' | 'solid' | 'dashed';
  opacity?: number; // 0 to 1 for stamps
}

export interface SubImage {
  id: string;
  imageUrl: string; // base64 data URI
}

// NEW: A type for items in a collage, which can be an image or a video.
export interface CollageItem {
  id: string;
  type: 'image' | 'video';
  imageUrl?: string; // base64 data URI
  videoUrl?: string; // e.g., URL to an MP4 file
  isAiGeneratedImage?: boolean;
  isAiGeneratedVideo?: boolean;
}

export interface SubImageConfig {
  animation: 'fade' | 'scroll';
  // FIX: Expanded position to include all 9 grid positions to fix a type error in DisplayScreenEditorScreen.
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'top' | 'middle' | 'bottom' | 'top-center' | 'center-left' | 'center-right' | 'bottom-center';
  size: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  intervalSeconds: number;
}

export type ContentPosition =
  'top-left' | 'top-left-center' | 'top-center' | 'top-right-center' | 'top-right' |
  'middle-top-left' | 'middle-top-left-center' | 'middle-top-center' | 'middle-top-right-center' | 'middle-top-right' |
  'middle-left' | 'middle-left-center' | 'middle-center' | 'middle-right-center' | 'middle-right' |
  'middle-bottom-left' | 'middle-bottom-left-center' | 'middle-bottom-center' | 'middle-bottom-right-center' | 'middle-bottom-right' |
  'bottom-left' | 'bottom-left-center' | 'bottom-center' | 'bottom-right-center' | 'bottom-right' |
  // Legacy names for backwards compatibility
  'center-left' | 'center' | 'center-right';

export interface TagPositionOverride {
  tagId: string;
  x: number; // percentage from left
  y: number; // percentage from top
  rotation: number; // degrees
}

export interface TagColorOverride {
  tagId: string;
  backgroundColor?: string;
  textColor?: '#FFFFFF' | '#000000';
}

export interface DisplayPost {
  id: string;
  internalTitle: string;
  layout: 'text-only' | 'image-fullscreen' | 'video-fullscreen' | 'image-left' | 'image-right' | 'webpage' | 'collage' | 'instagram' | 'instagram-latest' | 'instagram-stories';
  collageLayout?: 'landscape-1-2' | 'landscape-3-horiz' | 'landscape-4-grid' | 'landscape-2-horiz' | 'landscape-2-vert' | 'portrait-1-2' | 'portrait-3-vert' | 'portrait-4-grid' | 'portrait-2-horiz' | 'portrait-2-vert';
  headline?: string;
  rotatingHeadlines?: string[];
  headlineFontSize?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | '8xl' | '9xl';
  headlineFontFamily?: Tag['fontFamily'];
  body?: string;
  bodyFontSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  bodyFontFamily?: Tag['fontFamily'];
  textPosition?: ContentPosition;
  textAlign?: 'left' | 'center' | 'right';
  textPositionX?: number; // percentage from left
  textPositionY?: number; // percentage from top
  imageUrl?: string; // base64 data URI
  videoUrl?: string; // e.g., URL to an MP4 file
  webpageUrl?: string;
  instagramUrl?: string;
  durationSeconds: number;
  startDate?: string; // ISO string
  endDate?: string;   // ISO string
  tagIds?: string[]; // Array of Tag IDs
  tagPositionOverrides?: TagPositionOverride[];
  tagColorOverrides?: TagColorOverride[];
  backgroundColor?: 'white' | 'black' | 'primary' | 'secondary' | 'tertiary' | 'accent' | string; // Can be a keyword or a hex color string
  textColor?: 'white' | 'black' | 'primary' | 'secondary' | 'tertiary' | 'accent' | string; // Can be a keyword or a hex color string
  subImages?: SubImage[];
  collageItems?: CollageItem[]; // NEW: Use for collage layout to support mixed media
  subImageConfig?: SubImageConfig;
  imageOverlayEnabled?: boolean;
  imageOverlayColor?: string; // NEW: Color for the media overlay (e.g., #000000B3)
  textBackgroundEnabled?: boolean; // NEW: Enable a background box for text
  textBackgroundColor?: string; // NEW: Color for the text background box (e.g., #00000080)
  backgroundEffect?: 'none' | 'confetti' | 'hearts' | 'pulse-light' | 'pulse-medium' | 'pulse-intense';
  pulseColor?: string; // Hex color for the pulse effect
  shareToInspiration?: boolean; // NEW: Allow users to share their post design to the gallery
  textAnimation?: 'none' | 'typewriter' | 'fade-up-word' | 'blur-in';
  imageEffect?: 'none' | 'ken-burns-slow' | 'ken-burns-fast';
  backgroundVideoUrl?: string;
  backgroundVideoOverlayEnabled?: boolean;
  isAiGeneratedImage?: boolean; // NEW: Flag to track if the image was created by AI
  isAiGeneratedVideo?: boolean; // NEW: Flag to track if the video was created by AI
  aiImagePrompt?: string; // NEW: Prompt for AI image generation
  transitionToNext?: 'fade' | 'slide' | 'dissolve';
  qrCodeUrl?: string;
  qrCodePosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  qrCodeSize?: 'sm' | 'md' | 'lg' | 'xl';
  splitRatio?: number; // % of space for image in split layouts (25-75)
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

// NEW: Represents a physical screen that has been connected. This is now the billable entity.
export interface PhysicalScreen {
  id: string;
  name: string; // e.g., "Butik A - Kassa"
  organizationId: string;
  displayScreenId: string; // The ID of the DisplayScreen (content configuration) it's showing.
  pairedAt: string; // ISO string
  pairedByUid: string;
}


export interface CustomEvent {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD format
  icon: string; // Emoji
}

// NEW: A PostTemplate for creating reusable post layouts
export interface PostTemplate {
  id: string;
  templateName: string; // E.g., "Nytt Objekt", "Dagens Lunch"
  // The post object contains all styling and layout, but no scheduling.
  // Content fields can be used as placeholders/defaults.
  postData: Omit<DisplayPost, 'id' | 'startDate' | 'endDate' | 'internalTitle'>;
}

// NEW: Represents an item in the user's personal media gallery.
export interface MediaItem {
  id: string; // Unique identifier
  type: 'image' | 'video';
  url: string; // The URL to the media (can be data URI or remote URL)
  internalTitle: string; // A descriptive name, e.g., "AI-genererad bild: Sommarfest"
  createdAt: string; // ISO string
  createdBy: 'user' | 'ai'; // To distinguish between uploaded and generated media
  aiPrompt?: string; // The prompt used if created by AI
}

// NEW: A type for the organization's AI-learned style profile.
export interface StyleProfile {
  summary?: string; // AI-generated summary of the user's style preferences.
  version?: number; // To track if the summary is up-to-date.
}

// NEW: A type for the organization's AI-learned planning rhythm.
export interface PlanningProfile {
  averageCampaignLengthDays?: number;
  averageGapDays?: number;
  commonStartPeriod?: 'early-month' | 'mid-month' | 'late-month' | 'any';
  peakMonths?: number[]; // 0-11 for Jan-Dec
  lowActivityMonths?: number[]; // 0-11
  lastUpdatedAt?: string; // ISO string to know when it was last calculated
}

export interface Organization {
  id:string;
  name: string;
  subdomain: string;
  logoUrlLight?: string;
  logoUrlDark?: string;
  primaryColor?: string; // Hex color code, e.g., '#FF5733'
  secondaryColor?: string;
  tertiaryColor?: string;
  accentColor?: string;
  headlineFontFamily?: 'sans' | 'display' | 'script' | 'adscript' | 'roboto' | 'open-sans' | 'lato' | 'montserrat' | 'source-sans-pro' | 'nunito' | 'raleway' | 'oswald' | 'ubuntu' | 'helvetica-neue' | 'arial' | 'manrope' | 'fira-sans' | 'merriweather' | 'playfair-display' | 'lora' | 'georgia' | 'times-new-roman' | 'libre-baskerville' | 'eb-garamond' | 'cormorant-garamond' | 'pt-serif' | 'dm-sans' | 'work-sans' | 'quicksand' | 'josefin-sans' | 'exo-2' | 'cabin';
  bodyFontFamily?: 'sans' | 'display' | 'script' | 'adscript' | 'roboto' | 'open-sans' | 'lato' | 'montserrat' | 'source-sans-pro' | 'nunito' | 'raleway' | 'oswald' | 'ubuntu' | 'helvetica-neue' | 'arial' | 'manrope' | 'fira-sans' | 'merriweather' | 'playfair-display' | 'lora' | 'georgia' | 'times-new-roman' | 'libre-baskerville' | 'eb-garamond' | 'cormorant-garamond' | 'pt-serif' | 'dm-sans' | 'work-sans' | 'quicksand' | 'josefin-sans' | 'exo-2' | 'cabin';
  businessType?: string[];
  businessDescription?: string;
  customPages?: CustomPage[];
  infoCarousel?: InfoCarousel;
  displayScreens?: DisplayScreen[]; // These are now content configurations/templates
  physicalScreens?: PhysicalScreen[]; // NEW: The actual connected devices
  tags?: Tag[];
  customEvents?: CustomEvent[];
  postTemplates?: PostTemplate[]; // NEW: Add support for post templates
  mediaLibrary?: MediaItem[]; // NEW: Personal gallery for reusable media
  styleProfile?: StyleProfile; // NEW: AI-learned style profile for personalization.
  planningProfile?: PlanningProfile; // NEW: AI-learned planning rhythm.
  discountScreen?: number; // Percentage, e.g., 10 for 10%
  // NEW: Customer information fields
  address?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  orgNumber?: string;
  latestInstagramPostUrl?: string; // NEW: Central URL for the latest Instagram post
  instagramUserId?: string; // NEW: Instagram Business Account ID for Stories integration
}

export enum Page {
  SystemOwner,
  CustomContent,
  CustomPageEditor,
  DisplayWindow,
  SuperAdmin,
  DisplayScreenEditor,
  AiGuide,
}

export interface MenuItem {
  title: string;
  action: () => void;
  subTitle?: string;
  disabled?: boolean;
  colorClass?: string;
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

// NEW: A type for structured visual suggestions from the AI.
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

export interface AppNotification {
  id: string;
  createdAt: string; // ISO string
  type: 'info' | 'warning' | 'success' | 'suggestion';
  title: string;
  message: string;
  isRead: boolean;
  relatedScreenId?: string; // To identify the source
  relatedPostId?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// NEW: A type for fetched Instagram Stories
export interface InstagramStory {
  id: string;
  mediaUrl: string;
  mediaType: 'IMAGE' | 'VIDEO';
  timestamp: string;
  thumbnailUrl?: string;
}