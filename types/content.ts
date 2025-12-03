
import { StructuredImagePrompt, AiImageVariant } from './ai';

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
  url?: string;
  shape?: 'rectangle' | 'circle' | 'square';
  border?: 'none' | 'solid' | 'dashed';
  opacity?: number; // 0 to 1 for stamps
}

export interface SubImage {
  id: string;
  imageUrl: string; // base64 data URI
}

// A type for items in a collage, which can be an image or a video.
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
  layout: 'text-only' | 'image-fullscreen' | 'video-fullscreen' | 'image-left' | 'image-right' | 'webpage' | 'collage' | 'instagram-latest' | 'instagram-stories';
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
  textWidth?: number; // percentage width
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
  backgroundEffect?: 'none' | 'confetti' | 'hearts';
  shareToInspiration?: boolean; // NEW: Allow users to share their post design to the gallery
  textAnimation?: 'none' | 'typewriter' | 'fade-up-word' | 'blur-in';
  imageEffect?: 'none' | 'ken-burns-slow' | 'ken-burns-fast';
  backgroundVideoUrl?: string;
  backgroundVideoOverlayEnabled?: boolean;
  isAiGeneratedImage?: boolean; // NEW: Flag to track if the image was created by AI
  isAiGeneratedVideo?: boolean; // NEW: Flag to track if the video was created by AI
  aiImagePrompt?: string; // DEPRECATED in favor of structured prompt, but kept for compatibility.
  structuredImagePrompt?: Partial<StructuredImagePrompt>; // NEW: The structured prompt for the AI image builder.
  aiVideoPrompt?: string; // NEW: Prompt for AI video generation
  aiImageVariants?: AiImageVariant[]; // NEW: To store AI-generated image variations
  transitionToNext?: 'fade' | 'slide' | 'dissolve';
  qrCodeUrl?: string;
  qrCodePosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; // Deprecated
  qrCodeSize?: 'sm' | 'md' | 'lg' | 'xl'; // Deprecated
  qrPositionX?: number; // percentage from left
  qrPositionY?: number; // percentage from top
  qrWidth?: number; // percentage of container width
  splitRatio?: number; // % of space for image in split layouts (25-75)
  sharedFrom?: string; // NEW: Renamed from sharedFromScreenId to track original channel ID.
  sharedFromPostId?: string; // NEW: To link a shared post to its original post for syncing.
  sharedAt?: string; // NEW: ISO string timestamp of when the post was shared.
  suggestionOriginId?: string; // NEW: Temp field to link an edited post back to its suggestion.
  automationId?: string; // NEW: Link post back to the automation that created it.
  status?: 'active' | 'archived'; // NEW: Lifecycle status for automated posts.
}

// A PostTemplate for creating reusable post layouts
export interface PostTemplate {
  id: string;
  templateName: string; // E.g., "Nytt Objekt", "Dagens Lunch"
  // The post object contains all styling and layout, but no scheduling.
  // Content fields can be used as placeholders/defaults.
  postData: Omit<DisplayPost, 'id' | 'startDate' | 'endDate' | 'internalTitle'>;
}

export interface CustomCategoryWithPrompt {
  id:string;
  name: string;
  prompt: string;
}

export interface EquipmentItem {
  id: string;
  name: string;
}

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

export interface InstagramStory {
  id: string;
  mediaUrl: string;
  mediaType: 'IMAGE' | 'VIDEO';
  timestamp: string; // ISO string
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

export interface CustomEvent {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD format
  icon: string; // Emoji
}
