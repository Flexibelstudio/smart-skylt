import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DisplayPost, Organization, DisplayScreen, Tag, SubImage, SubImageConfig, CollageItem } from '../../types';
import { PrimaryButton, SecondaryButton } from '../Buttons';
import { StyledInput, StyledSelect, FontSelector } from '../Forms';
import { ChevronDownIcon, ToggleSwitch, SparklesIcon, TrashIcon, CompactToggleSwitch, InstagramIcon } from '../icons';
import { 
    generateDisplayPostImage, 
    editDisplayPostImage,
    refineDisplayPostContent,
    generateHeadlineSuggestions,
    fileToBase64,
    urlToBase64,
    generateCompletePost,
    generateVideoFromPrompt,
} from '../../services/geminiService';
import { useToast } from '../../context/ToastContext';
import { uploadVideo } from '../../services/firebaseService';
import { AIStatusIndicator } from '../HelpBot';

// --- NEW HELPER COMPONENT FOR AI STUDIO ---
const AiStudioModifierGroup: React.FC<{
  label: string;
  options: { label: string; value: string }[];
  selectedValue: string;
  onSelect: (value: string) => void;
}> = ({ label, options, selectedValue, onSelect }) => (
  <div>
    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{label}</label>
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(selectedValue === opt.value ? '' : opt.value)}
          className={`px-3 py-1.5 text-sm font-semibold rounded-full border-2 transition-all ${
            selectedValue === opt.value
              ? 'bg-primary border-primary text-white'
              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-primary/70'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);


// --- NEW VISUAL LAYOUT SELECTOR ---

const layoutIcons = {
  'text-only': (
    <div className="w-full h-full flex flex-col justify-center items-center p-2 space-y-1.5">
      <div className="w-4/5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
      <div className="w-4/5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
      <div className="w-3/5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
    </div>
  ),
  'image-fullscreen': (
    <div className="w-full h-full flex flex-col">
      <div className="h-3/5 bg-slate-400 dark:bg-slate-500"></div>
      <div className="h-2/5 flex flex-col justify-center items-center space-y-1">
        <div className="w-3/5 h-1 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
        <div className="w-4/5 h-1 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
      </div>
    </div>
  ),
  'video-fullscreen': (
    <div className="w-full h-full flex flex-col relative">
      <div className="h-3/5 bg-slate-400 dark:bg-slate-500 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white/70" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
      </div>
      <div className="h-2/5 flex flex-col justify-center items-center space-y-1">
        <div className="w-3/5 h-1 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
        <div className="w-4/5 h-1 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
      </div>
    </div>
  ),
  'image-left': (
    <div className="w-full h-full flex items-center">
      <div className="w-2/5 h-full bg-slate-400 dark:bg-slate-500 flex-shrink-0"></div>
      <div className="flex-grow h-full flex flex-col justify-center items-center space-y-1">
        <div className="w-4/5 h-1 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
        <div className="w-4/5 h-1 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
      </div>
    </div>
  ),
  'image-right': (
    <div className="w-full h-full flex items-center">
      <div className="flex-grow h-full flex flex-col justify-center items-center space-y-1">
        <div className="w-4/5 h-1 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
        <div className="w-4/5 h-1 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
      </div>
      <div className="w-2/5 h-full bg-slate-400 dark:bg-slate-500 flex-shrink-0"></div>
    </div>
  ),
  'webpage': (
     <div className="w-full h-full flex flex-col">
      <div className="h-4 bg-slate-300 dark:bg-slate-600 flex items-center px-2 space-x-1 flex-shrink-0">
        <div className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
        <div className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
        <div className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
      </div>
      <div className="flex-grow bg-slate-400 dark:bg-slate-500"></div>
    </div>
  ),
  'collage': (
     <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px bg-slate-300 dark:bg-slate-600 p-px">
        <div className="bg-slate-400 dark:bg-slate-500"></div>
        <div className="bg-slate-400 dark:bg-slate-500"></div>
        <div className="bg-slate-400 dark:bg-slate-500"></div>
        <div className="bg-slate-400 dark:bg-slate-500"></div>
    </div>
  ),
  'instagram': (
    <div className="w-full h-full flex items-center justify-center p-2">
        <InstagramIcon className="w-8 h-8 text-slate-400 dark:text-slate-500"/>
    </div>
  ),
  'instagram-latest': (
    <div className="w-full h-full flex items-center justify-center p-2 relative">
        <InstagramIcon className="w-8 h-8 text-slate-400 dark:text-slate-500"/>
        <SparklesIcon className="w-5 h-5 text-yellow-400 absolute -top-1 -right-1"/>
    </div>
  ),
  'instagram-stories': (
    <div className="w-full h-full flex items-center justify-center p-2 relative">
        <div className="w-9 h-9 rounded-full border-2 border-pink-500 flex items-center justify-center">
            <InstagramIcon className="w-5 h-5 text-slate-400 dark:text-slate-500"/>
        </div>
        <span className="absolute -top-1 right-0 text-xs font-bold bg-pink-500 text-white rounded-full px-1">24h</span>
    </div>
  ),
};

const portraitLayoutIcons = {
    ...layoutIcons,
    'image-left': ( // image top
      <div className="w-full h-full flex flex-col items-center">
        <div className="w-full h-2/5 bg-slate-400 dark:bg-slate-500 flex-shrink-0"></div>
        <div className="flex-grow w-full flex flex-col justify-center items-center space-y-1 p-1">
          <div className="w-4/5 h-1 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
          <div className="w-4/5 h-1 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
        </div>
      </div>
    ),
    'image-right': ( // image bottom
      <div className="w-full h-full flex flex-col items-center">
        <div className="flex-grow w-full flex flex-col justify-center items-center space-y-1 p-1">
          <div className="w-4/5 h-1 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
          <div className="w-4/5 h-1 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
        </div>
        <div className="w-full h-2/5 bg-slate-400 dark:bg-slate-500 flex-shrink-0"></div>
      </div>
    ),
};


const layoutOptions: { value: DisplayPost['layout']; label: string }[] = [
    { value: 'text-only', label: 'Bara Text' },
    { value: 'image-fullscreen', label: 'Helskärmsbild' },
    { value: 'video-fullscreen', label: 'Helskärmsvideo' },
    { value: 'image-left', label: 'Bild vänster' },
    { value: 'image-right', label: 'Bild höger' },
    { value: 'webpage', label: 'Webbsida' },
    { value: 'collage', label: 'Collage' },
    { value: 'instagram', label: 'Instagram-inlägg' },
    { value: 'instagram-latest', label: 'Senaste Instagram' },
    { value: 'instagram-stories', label: 'Instagram Stories' },
];

const portraitLayoutOptions: { value: DisplayPost['layout']; label: string }[] = [
    { value: 'text-only', label: 'Bara Text' },
    { value: 'image-fullscreen', label: 'Helskärmsbild' },
    { value: 'video-fullscreen', label: 'Helskärmsvideo' },
    { value: 'image-left', label: 'Bild över' },
    { value: 'image-right', label: 'Bild under' },
    { value: 'webpage', label: 'Webbsida' },
    { value: 'collage', label: 'Collage' },
    { value: 'instagram', label: 'Instagram-inlägg' },
    { value: 'instagram-latest', label: 'Senaste Instagram' },
    { value: 'instagram-stories', label: 'Instagram Stories' },
];

const LayoutSelector: React.FC<{
  currentLayout: DisplayPost['layout'];
  onChange: (layout: DisplayPost['layout']) => void;
  aspectRatio: DisplayScreen['aspectRatio'];
}> = ({ currentLayout, onChange, aspectRatio }) => {
  const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
  const icons = isPortrait ? portraitLayoutIcons : layoutIcons;
  const options = isPortrait ? portraitLayoutOptions : layoutOptions;
  const iconContainerClass = isPortrait
    ? "h-24 w-16 mx-auto bg-slate-200 dark:bg-slate-700 rounded-md overflow-hidden"
    : "h-16 bg-slate-200 dark:bg-slate-700 rounded-md overflow-hidden";

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`p-2 rounded-lg border-2 text-center transition-all duration-200 ${
              currentLayout === option.value
                ? 'border-primary bg-primary/10 shadow-inner-soft'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/50 hover:border-primary/50'
            }`}
          >
            <div className={iconContainerClass}>
              {icons[option.value]}
            </div>
            <span className={`block text-xs font-semibold mt-2 ${
                currentLayout === option.value ? 'text-primary' : 'text-slate-600 dark:text-slate-300'
            }`}>
              {option.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

// --- NEW COLLAGE LAYOUT SELECTOR ---

const collageLayoutIcons: { [key in NonNullable<DisplayPost['collageLayout']>]: React.ReactNode } = {
  'landscape-1-2': <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px"><div className="row-span-2 bg-current"></div><div className="col-start-2 row-start-1 bg-current"></div><div className="col-start-2 row-start-2 bg-current"></div></div>,
  'landscape-2-horiz': <div className="w-full h-full grid grid-cols-2 gap-px"><div className="bg-current"></div><div className="bg-current"></div></div>,
  'landscape-2-vert': <div className="w-full h-full grid grid-rows-2 gap-px"><div className="bg-current"></div><div className="bg-current"></div></div>,
  'landscape-3-horiz': <div className="w-full h-full grid grid-cols-3 gap-px"><div className="bg-current"></div><div className="bg-current"></div><div className="bg-current"></div></div>,
  'landscape-4-grid': <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px"><div className="bg-current"></div><div className="bg-current"></div><div className="bg-current"></div><div className="bg-current"></div></div>,
  'portrait-1-2': <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px"><div className="col-span-2 bg-current"></div><div className="col-start-1 row-start-2 bg-current"></div><div className="col-start-2 row-start-2 bg-current"></div></div>,
  'portrait-2-horiz': <div className="w-full h-full grid grid-cols-2 gap-px"><div className="bg-current"></div><div className="bg-current"></div></div>,
  'portrait-2-vert': <div className="w-full h-full grid grid-rows-2 gap-px"><div className="bg-current"></div><div className="bg-current"></div></div>,
  'portrait-3-vert': <div className="w-full h-full grid grid-rows-3 gap-px"><div className="bg-current"></div><div className="bg-current"></div><div className="bg-current"></div></div>,
  'portrait-4-grid': <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px"><div className="bg-current"></div><div className="bg-current"></div><div className="bg-current"></div><div className="bg-current"></div></div>,
};

const landscapeCollageOptions: { value: NonNullable<DisplayPost['collageLayout']>; label: string }[] = [
    { value: 'landscape-1-2', label: '1 stor, 2 små' },
    { value: 'landscape-2-horiz', label: '2 sida vid sida' },
    { value: 'landscape-2-vert', label: '2 på varandra' },
    { value: 'landscape-3-horiz', label: '3 sida vid sida' },
    { value: 'landscape-4-grid', label: '4-rutnät' },
];

const portraitCollageOptions: { value: NonNullable<DisplayPost['collageLayout']>; label: string }[] = [
    { value: 'portrait-1-2', label: '1 stor, 2 små' },
    { value: 'portrait-2-horiz', label: '2 sida vid sida' },
    { value: 'portrait-2-vert', label: '2 på varandra' },
    { value: 'portrait-3-vert', label: '3 på varandra' },
    { value: 'portrait-4-grid', label: '4-rutnät' },
];

const CollageLayoutSelector: React.FC<{
  currentLayout?: DisplayPost['collageLayout'];
  onChange: (layout: DisplayPost['collageLayout']) => void;
  aspectRatio: DisplayScreen['aspectRatio'];
}> = ({ currentLayout, onChange, aspectRatio }) => {
  const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
  const options = isPortrait ? portraitCollageOptions : landscapeCollageOptions;
  const iconContainerClass = isPortrait
    ? "h-24 w-16 mx-auto text-slate-400 dark:text-slate-500"
    : "h-16 text-slate-400 dark:text-slate-500";

  const activeLayout = currentLayout || (isPortrait ? 'portrait-1-2' : 'landscape-1-2');

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`p-2 rounded-lg border-2 text-center transition-all duration-200 ${
              activeLayout === option.value
                ? 'border-primary bg-primary/10 shadow-inner-soft'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/50 hover:border-primary/50'
            }`}
          >
            <div className={iconContainerClass}>
              {collageLayoutIcons[option.value!]}
            </div>
            <span className={`block text-xs font-semibold mt-2 ${
                activeLayout === option.value ? 'text-primary' : 'text-slate-600 dark:text-slate-300'
            }`}>
              {option.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export interface PostEditorProps {
    post: DisplayPost;
    organization: Organization;
    aspectRatio: DisplayScreen['aspectRatio'];
    onPostChange: (updatedPost: DisplayPost) => void;
    onSave: () => void;
    onCancel: () => void;
    isSaving: boolean;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
}

const AccordionSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-4 font-bold text-lg text-slate-800 dark:text-slate-200" aria-expanded={isOpen}>
                <span>{title}</span>
                <ChevronDownIcon className={`h-6 w-6 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && <div className="p-4 border-t border-slate-200 dark:border-slate-700">{children}</div>}
        </div>
    );
};

const ColorPaletteInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  organization: Organization;
}> = ({ label, value, onChange, organization }) => {
    const brandColors = useMemo(() => {
        const colors = [
            { name: 'Primär', key: 'primary', hex: organization.primaryColor || '#14b8a6' }
        ];
        if (organization.secondaryColor) {
            colors.push({ name: 'Sekundär', key: 'secondary', hex: organization.secondaryColor });
        }
        if (organization.tertiaryColor) {
            colors.push({ name: 'Tertiär', key: 'tertiary', hex: organization.tertiaryColor });
        }
        if (organization.accentColor) {
            colors.push({ name: 'Accent', key: 'accent', hex: organization.accentColor });
        }
        return colors;
    }, [organization]);

  const fixedColors = [
    { name: 'Svart', key: 'black', hex: '#000000' },
    { name: 'Vit', key: 'white', hex: '#ffffff' },
  ];
  const allColors = [...brandColors, ...fixedColors];
  const isCustomColor = !allColors.some(c => c.key === value);
  const [showCustom, setShowCustom] = useState(isCustomColor);

  return (
    <div>
      <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {allColors.map(color => (
          <button
            key={color.key}
            type="button"
            onClick={() => { onChange(color.key); setShowCustom(false); }}
            className={`w-10 h-10 rounded-full border-2 transition-all ${value === color.key ? 'ring-2 ring-offset-2 ring-offset-slate-100 dark:ring-offset-slate-900 ring-primary' : 'hover:scale-110'}`}
            style={{ backgroundColor: color.hex, borderColor: color.hex === '#ffffff' ? '#e2e8f0' : 'transparent' }}
            title={color.name}
          />
        ))}
      </div>
      <div className="mt-3">
        <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showCustom} onChange={(e) => setShowCustom(e.target.checked)} className="h-4 w-4 rounded text-primary focus:ring-primary"/>
            <span className="font-semibold text-sm">Egen färg (HEX)</span>
        </label>
        {showCustom && (
            <div className="flex items-center gap-2 mt-2">
                <input type="color" value={value.startsWith('#') ? value : '#000000'} onChange={e => onChange(e.target.value)} className="w-12 h-12 p-1 bg-transparent rounded-lg border-none cursor-pointer"/>
                <StyledInput
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="font-mono"
                />
            </div>
        )}
      </div>
    </div>
  );
};

const AiTextActions: React.FC<{
    onRefine: (command: 'shorter' | 'more_formal' | 'add_emojis' | 'more_casual') => void;
    onSuggest?: () => void;
    isLoading: boolean;
}> = ({ onRefine, onSuggest, isLoading }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const actions = [
        { label: 'Gör kortare', command: 'shorter' as const },
        { label: 'Mer formell', command: 'more_formal' as const },
        { label: 'Mer ledig', command: 'more_casual' as const },
        { label: 'Lägg till emojis', command: 'add_emojis' as const },
    ];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative inline-block" ref={wrapperRef}>
            <button type="button" onClick={() => setIsOpen(!isOpen)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-purple-500" disabled={isLoading}>
                <SparklesIcon className="h-5 w-5"/>
            </button>
            {isOpen && (
                <div className="absolute z-10 right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-md shadow-lg border border-slate-200 dark:border-slate-700">
                    <div className="py-1">
                        {onSuggest && (
                            <button type="button" onClick={() => { onSuggest(); setIsOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">Föreslå rubriker</button>
                        )}
                        {onSuggest && <hr className="border-slate-200 dark:border-slate-700 my-1"/>}
                        {actions.map(action => (
                            <button key={action.command} type="button" onClick={() => { onRefine(action.command); setIsOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">{action.label}</button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const ColorOpacityControl: React.FC<{ value: string; onChange: (value: string) => void; }> = ({ value, onChange }) => {
    const { color, opacity } = useMemo(() => {
        let c = '#000000';
        let o = 0.5;
        if (value && value.match(/^#[0-9a-fA-F]{8}$/)) {
            c = value.substring(0, 7);
            o = parseInt(value.substring(7, 9), 16) / 255;
        } else if (value && value.match(/^#[0-9a-fA-F]{6}$/)) {
            c = value;
            o = 1;
        }
        return { color: c, opacity: o };
    }, [value]);

    const handleColorChange = (newColor: string) => {
        const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
        onChange(`${newColor}${alphaHex}`);
    };

    const handleOpacityChange = (newOpacity: number) => {
        const alphaHex = Math.round(newOpacity * 255).toString(16).padStart(2, '0');
        onChange(`${color}${alphaHex}`);
    };

    return (
        <div className="flex items-center gap-4">
            <input
                type="color"
                value={color}
                onChange={e => handleColorChange(e.target.value)}
                className="w-16 h-12 p-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
            />
            <div className="flex-grow flex items-center gap-2">
                 <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={opacity}
                    onChange={e => handleOpacityChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
                />
                <span className="font-mono text-sm text-slate-500 dark:text-slate-400 w-12 text-right">
                    {Math.round(opacity * 100)}%
                </span>
            </div>
        </div>
    );
};

const getAIStatusText = (loadingState: string | false): string => {
  if (!loadingState) return 'AI arbetar...';
  if (loadingState.startsWith('text-')) return 'AI finjusterar text...';
  switch (loadingState) {
    case 'complete': return 'AI skapar inlägg...';
    case 'generate': return 'AI genererar bild...';
    case 'edit': return 'AI redigerar bild...';
    case 'suggest-headline': return 'AI föreslår rubriker...';
    case 'video': return 'AI genererar video...';
    case 'upload':
    case 'upload-sub':
      return 'Bearbetar media...';
    default:
      if (loadingState.startsWith('collage-')) return 'Bearbetar media...';
      return 'AI arbetar...';
  }
};

export const PostEditor: React.FC<PostEditorProps> = ({ post, organization, aspectRatio, onPostChange, onSave, onCancel, isSaving, onUpdateOrganization }) => {
    const { showToast } = useToast();
    const [aiLoading, setAiLoading] = useState<string | false>(false);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [aiStudioState, setAiStudioState] = useState({ style: '', colors: '', mood: '' });
    const [aiEditPrompt, setAiEditPrompt] = useState('');
    const [aiCombinedPrompt, setAiCombinedPrompt] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const subImageFileInputRef = useRef<HTMLInputElement>(null);
    const [aiVideoPrompt, setAiVideoPrompt] = useState('');
    const [aiVideoStatus, setAiVideoStatus] = useState('');
    const [useImageForVideo, setUseImageForVideo] = useState(false);
    
    const collageFileInputRef = useRef<HTMLInputElement>(null);
    const [editingCollageSlot, setEditingCollageSlot] = useState<number | null>(null);

    const handleFieldChange = (field: keyof DisplayPost, value: any) => {
        const updatedPost = { ...post, [field]: value };
        if (field === 'headline') {
            updatedPost.internalTitle = value || 'Namnlöst inlägg';
        }
        onPostChange(updatedPost);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const file = files[0];

        if (file.type.startsWith('image/')) {
            setAiLoading('upload');
            try {
                const { data, mimeType } = await fileToBase64(file);
                onPostChange({ ...post, imageUrl: `data:${mimeType};base64,${data}`, videoUrl: undefined, isAiGeneratedImage: false, isAiGeneratedVideo: false });
            } catch (error) {
                showToast({ message: "Kunde inte ladda upp bilden.", type: 'error' });
            } finally {
                setAiLoading(false);
            }
        } else if (file.type.startsWith('video/')) {
            setAiLoading('upload');
            setUploadProgress(0);
            try {
                const videoUrl = await uploadVideo(organization.id, file, (progress) => {
                    setUploadProgress(progress);
                });
                onPostChange({ ...post, videoUrl: videoUrl, imageUrl: undefined, isAiGeneratedImage: false, isAiGeneratedVideo: false });
                showToast({ message: "Videon har laddats upp!", type: 'success'});
            } catch (error) {
                showToast({ message: `Kunde inte ladda upp videon: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
            } finally {
                setAiLoading(false);
                setUploadProgress(null);
            }
        } else {
            showToast({ message: 'Ogiltig filtyp. Välj en bild eller en MP4-video.', type: 'error' });
        }
    };
    
    const handleAddCollageItem = (index: number) => {
        setEditingCollageSlot(index);
        collageFileInputRef.current?.click();
    };

    const handleCollageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || editingCollageSlot === null) return;
        
        setAiLoading(`collage-${editingCollageSlot}`);
        try {
            const { data, mimeType } = await fileToBase64(file);
            const newItem: CollageItem = {
                id: `collage-${Date.now()}-${editingCollageSlot}`,
                type: mimeType.startsWith('image') ? 'image' : 'video',
                imageUrl: mimeType.startsWith('image') ? `data:${mimeType};base64,${data}` : undefined,
                videoUrl: mimeType.startsWith('video') ? `data:${mimeType};base64,${data}` : undefined, // Placeholder for future video support
                isAiGeneratedImage: false,
            };

            const currentItems = [...(post.collageItems || [])];
            currentItems[editingCollageSlot] = newItem;
            handleFieldChange('collageItems', currentItems);

        } catch (error) {
            showToast({ message: "Kunde inte ladda upp media.", type: 'error'});
        } finally {
            setAiLoading(false);
            setEditingCollageSlot(null);
             if (collageFileInputRef.current) {
                collageFileInputRef.current.value = "";
            }
        }
    };
    
    const handleRemoveCollageItem = (indexToRemove: number) => {
        const newItems = (post.collageItems || []).map((item, index) => {
            if (index === indexToRemove) {
                return null;
            }
            return item;
        });
        handleFieldChange('collageItems', newItems as any);
    };

    const getSlotCount = (layout: DisplayPost['collageLayout'], aspectRatio: DisplayScreen['aspectRatio']): number => {
        const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
        const effectiveLayout = layout || (isPortrait ? 'portrait-1-2' : 'landscape-1-2');
        if (effectiveLayout.includes('4-grid')) return 4;
        if (effectiveLayout.includes('3-')) return 3;
        if (effectiveLayout.includes('1-2')) return 3;
        if (effectiveLayout.includes('2-')) return 2;
        return 3;
    };

    const handleGenerateCompletePost = async () => {
        if (!aiCombinedPrompt) return;
        setAiLoading('complete');
        try {
            const { postData, imageUrl } = await generateCompletePost(
                aiCombinedPrompt,
                organization,
                aspectRatio,
                aiStudioState.style,
                aiStudioState.colors,
                aiStudioState.mood
            );
            onPostChange({
                ...post,
                ...postData,
                imageUrl, // this will be undefined for text-only, which is correct
                internalTitle: postData.headline || 'AI-genererat inlägg',
                isAiGeneratedImage: !!imageUrl,
                videoUrl: undefined, // ensure video is cleared
                headlineFontFamily: organization.headlineFontFamily,
                bodyFontFamily: organization.bodyFontFamily,
            });
            showToast({ message: 'AI:n har skapat ett förslag!', type: 'success' });
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Ett fel inträffade vid generering.', type: 'error' });
        } finally {
            setAiLoading(false);
        }
    };

    const handleAiStudioGenerate = async () => {
        if (!aiCombinedPrompt) {
            showToast({ message: "Beskriv först bildens motiv i textrutan.", type: 'info' });
            return;
        }
        setAiLoading('generate');

        const constructAiPrompt = (state: typeof aiStudioState, mainPrompt: string) => {
            let parts = [];
            
            // Style and Subject are key. Default to photorealistic for better initial results.
            const style = state.style || 'photorealistic';
            parts.push(style);
            parts.push(mainPrompt);

            // Add modifiers
            if (state.mood) parts.push(`with a ${state.mood} mood`);
            if (state.colors) parts.push(`using a ${state.colors} color palette`);
            
            // Add final quality enhancers
            let finalPrompt = parts.join(', ');
            finalPrompt += ", professional marketing photography, high resolution, cinematic lighting, visually stunning";
            return finalPrompt;
        }

        try {
            const finalPrompt = constructAiPrompt(aiStudioState, aiCombinedPrompt);
            const newImageUrl = await generateDisplayPostImage(finalPrompt, aspectRatio);
            onPostChange({ ...post, imageUrl: newImageUrl, videoUrl: undefined, layout: post.layout === 'text-only' ? 'image-fullscreen' : post.layout, isAiGeneratedImage: true, isAiGeneratedVideo: false });
            showToast({ message: 'AI:n har skapat en bild!', type: 'success' });
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Ett fel inträffade.', type: 'error' });
        } finally {
            setAiLoading(false);
        }
    };
    
    const handleAiImageEdit = async () => {
        if (!aiEditPrompt || !post.imageUrl) return;
        setAiLoading('edit');
        try {
            const { mimeType, data } = post.imageUrl.startsWith('data:') 
                ? { mimeType: post.imageUrl.split(';')[0].split(':')[1], data: post.imageUrl.split(',')[1] }
                : await urlToBase64(post.imageUrl);
            
            const newImageUrl = await editDisplayPostImage(data, mimeType, aiEditPrompt);
            onPostChange({ ...post, imageUrl: newImageUrl, videoUrl: undefined, isAiGeneratedImage: true, isAiGeneratedVideo: false });
            setAiEditPrompt('');
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Ett fel inträffade.', type: 'error' });
        } finally {
            setAiLoading(false);
        }
    };

    const handleAiTextRefine = async (command: 'shorter' | 'more_formal' | 'add_emojis' | 'more_casual') => {
        setAiLoading(`text-${command}`);
        try {
            const newContent = await refineDisplayPostContent({ headline: post.headline || '', body: post.body || '' }, command);
            onPostChange({ ...post, ...newContent, internalTitle: newContent.headline || 'Namnlöst inlägg' });
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Ett fel inträffade.', type: 'error' });
        } finally {
            setAiLoading(false);
        }
    };
    
    const handleAiSuggestHeadlines = async () => {
        if (!post.body) {
            showToast({ message: 'Skriv en brödtext först för att få rubrikförslag.', type: 'info' });
            return;
        }
        setAiLoading('suggest-headline');
        try {
            const suggestions = await generateHeadlineSuggestions(post.body, [post.headline || '']);
            // For now, let's just pick the first one. A better UI could show a list.
            if (suggestions.length > 0) {
                handleFieldChange('headline', suggestions[0]);
            } else {
                showToast({ message: 'AI:n kunde inte generera några nya förslag just nu.', type: 'info' });
            }
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Ett fel inträffade.', type: 'error' });
        } finally {
            setAiLoading(false);
        }
    };

    const handleTagChange = (tagId: string, checked: boolean) => {
        const currentTags = post.tagIds || [];
        const newTags = checked
            ? [...currentTags, tagId]
            : currentTags.filter(id => id !== tagId);
        handleFieldChange('tagIds', newTags);
    };

    const handleGenerateVideo = async () => {
        if (!aiVideoPrompt) return;
        setAiLoading('video');
        setAiVideoStatus('Startar videoprocess...');

        try {
            let imageInput: { mimeType: string; data: string } | undefined = undefined;
            if (useImageForVideo && post.imageUrl) {
                setAiVideoStatus('Förbereder bild...');
                const { mimeType, data } = post.imageUrl.startsWith('data:') 
                    ? { mimeType: post.imageUrl.split(';')[0].split(':')[1], data: post.imageUrl.split(',')[1] }
                    : await urlToBase64(post.imageUrl);
                imageInput = { mimeType, data };
            }
            
            // Reassuring message
            setAiVideoStatus('Genererar video, detta kan ta några minuter...');

            const newVideoUrl = await generateVideoFromPrompt(
                aiVideoPrompt, 
                organization.id, 
                (status) => setAiVideoStatus(status), // Update with final status from server
                imageInput,
            );

            onPostChange({ 
                ...post, 
                videoUrl: newVideoUrl, 
                imageUrl: undefined, 
                layout: 'video-fullscreen', 
                isAiGeneratedVideo: true,
                isAiGeneratedImage: false
            });
            showToast({ message: "AI-videon har genererats!", type: 'success' });
            setAiVideoPrompt('');
            setUseImageForVideo(false);

        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Ett fel inträffade vid videogenerering.', type: 'error' });
        } finally {
            setAiLoading(false);
            setAiVideoStatus('');
        }
    };

    const handleSubImageConfigChange = (field: keyof SubImageConfig, value: any) => {
        const newConfig: SubImageConfig = {
            animation: 'scroll',
            position: 'bottom',
            size: 'md',
            intervalSeconds: 30,
            ...post.subImageConfig,
            [field]: value,
        };
        // When switching animation, reset to sensible defaults
        if (field === 'animation') {
            if (value === 'scroll') {
                newConfig.position = 'bottom';
                newConfig.intervalSeconds = 30;
            } else { // fade
                newConfig.position = 'bottom-right';
                newConfig.intervalSeconds = 5;
            }
        }
        onPostChange({ ...post, subImageConfig: newConfig });
    };

    const handleSubImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        setAiLoading('upload-sub');
        try {
            const newImages = await Promise.all(
                Array.from(files).map(async (file) => {
                    // FIX: The error indicates that 'file' might be of type 'unknown'. While this is unexpected
                    // for a FileList, adding a type guard makes the code more robust against potential
                    // environment inconsistencies where type inference might fail.
                    if (!(file instanceof File)) {
                        throw new Error('An invalid item was found in the file list.');
                    }
                    const { data, mimeType } = await fileToBase64(file);
                    return {
                        id: `subimg-${Date.now()}-${Math.random()}`,
                        imageUrl: `data:${mimeType};base64,${data}`,
                    };
                })
            );
            onPostChange({
                ...post,
                subImages: [...(post.subImages || []), ...newImages],
            });
        } catch (error) {
            showToast({ message: "Kunde inte ladda upp bilder.", type: 'error' });
        } finally {
            setAiLoading(false);
            if (subImageFileInputRef.current) {
                subImageFileInputRef.current.value = "";
            }
        }
    };

    const handleRemoveSubImage = (id: string) => {
        onPostChange({
            ...post,
            subImages: (post.subImages || []).filter(img => img.id !== id),
        });
    };

    const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';

    const styleOptions = [
      { label: 'Fotorealistisk', value: 'photorealistic' },
      { label: 'Abstrakt', value: 'abstract art' },
      { label: 'Minimalistisk', value: 'minimalist' },
      { label: 'Akvarell', value: 'watercolor painting' },
      { label: 'Neonpunk', value: 'neon-punk aesthetic' },
      { label: 'Vintagefoto', value: 'vintage photograph' },
    ];

    const colorOptions = [
      { label: 'Varma toner', value: 'warm tones (reds, oranges, yellows)' },
      { label: 'Kalla toner', value: 'cool tones (blues, greens, purples)' },
      { label: 'Pastell', value: 'pastel colors' },
      { label: 'Monokrom', value: 'monochromatic' },
      { label: 'Livfull', value: 'vibrant and saturated colors' },
    ];

    const moodOptions = [
      { label: 'Glad', value: 'joyful and uplifting' },
      { label: 'Lugn', value: 'calm and serene' },
      { label: 'Energisk', value: 'energetic and vibrant' },
      { label: 'Dramatisk', value: 'dramatic and moody' },
      { label: 'Lyxig', value: 'luxurious and elegant' },
    ];

    return (
        <div className="space-y-6 bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm animate-fade-in">
            <AIStatusIndicator
                isThinking={!!aiLoading}
                statusText={aiLoading === 'video' && aiVideoStatus ? aiVideoStatus : getAIStatusText(aiLoading)}
            />
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                {post.id.startsWith('new-') ? 'Skapa nytt inlägg' : `Redigera: ${post.internalTitle}`}
            </h3>
            
            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white pb-3 flex-shrink-0">
                    <SparklesIcon className="h-6 w-6 text-purple-500" />
                    AI-Assistent
                </div>
                
                <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Beskriv ditt inlägg med några ord så skapar AI:n ett komplett förslag med text, bild och design.</p>
                    <textarea
                        rows={3}
                        value={aiCombinedPrompt}
                        onChange={e => setAiCombinedPrompt(e.target.value)}
                        placeholder="T.ex. 'Erbjudande på kanelbullar' eller 'Ny yogaklass på onsdagar'"
                        className="w-full bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                        disabled={!!aiLoading}
                    />
                    
                    <details className="group">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-primary list-none flex items-center gap-1">
                            <ChevronDownIcon className="h-4 w-4 transition-transform group-open:rotate-180" />
                            Bildinställningar (Valfritt)
                        </summary>
                        <div className="mt-4 pl-5 space-y-4 border-l-2 border-slate-200 dark:border-slate-700">
                            <p className="text-sm text-slate-500 dark:text-slate-400">Finslipa din bildidé genom att välja stil, färger och känsla.</p>
                            <AiStudioModifierGroup label="Stil" options={styleOptions} selectedValue={aiStudioState.style} onSelect={value => setAiStudioState(s => ({ ...s, style: value }))} />
                            <AiStudioModifierGroup label="Färgpalett" options={colorOptions} selectedValue={aiStudioState.colors} onSelect={value => setAiStudioState(s => ({ ...s, colors: value }))} />
                            <AiStudioModifierGroup label="Känsla" options={moodOptions} selectedValue={aiStudioState.mood} onSelect={value => setAiStudioState(s => ({ ...s, mood: value }))} />
                            
                            <PrimaryButton onClick={handleAiStudioGenerate} loading={aiLoading === 'generate'} disabled={!aiCombinedPrompt || !!aiLoading}>
                                Generera Endast Bild
                            </PrimaryButton>
                        </div>
                    </details>
                    
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                         <PrimaryButton onClick={handleGenerateCompletePost} disabled={!aiCombinedPrompt} loading={aiLoading === 'complete'} className="bg-purple-600 hover:bg-purple-500">
                            Generera Inlägg (Text & Bild)
                        </PrimaryButton>
                    </div>
                </div>
            </div>

            <AccordionSection title="Layout">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Intern titel</label>
                        <StyledInput type="text" value={post.internalTitle} onChange={(e) => handleFieldChange('internalTitle', e.target.value)} />
                    </div>
                     <div>
                        <LayoutSelector currentLayout={post.layout} onChange={(layout) => handleFieldChange('layout', layout)} aspectRatio={aspectRatio} />
                    </div>
                    {post.layout === 'webpage' && (
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Webbadress (URL)</label>
                            <StyledInput 
                                type="url" 
                                value={post.webpageUrl || ''} 
                                onChange={(e) => handleFieldChange('webpageUrl', e.target.value)} 
                                placeholder="https://exempel.se"
                            />
                        </div>
                    )}
                    {post.layout === 'instagram' && (
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Länk till Instagram-inlägg</label>
                             <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Gå till inlägget på Instagram, klicka på "..." och välj "Kopiera länk". Klistra in den här.</p>
                            <StyledInput 
                                type="url" 
                                value={post.instagramUrl || ''} 
                                onChange={(e) => handleFieldChange('instagramUrl', e.target.value)} 
                                placeholder="https://www.instagram.com/p/..."
                            />
                        </div>
                    )}
                     {post.layout === 'instagram-latest' && (
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-700 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-b-lg -m-4 mt-4">
                           <h4 className="font-bold text-blue-800 dark:text-blue-300">Automatiskt Innehåll</h4>
                           <p className="text-sm text-blue-700 dark:text-blue-300/80 mt-1">Detta inlägg visar automatiskt den länk som angetts under <strong className="font-semibold">Varumärke &gt; Sociala Medier</strong>. Du behöver inte ange en länk här.</p>
                        </div>
                    )}
                    {post.layout === 'instagram-stories' && (
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-700 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-b-lg -m-4 mt-4">
                           <h4 className="font-bold text-blue-800 dark:text-blue-300">Automatiskt Innehåll</h4>
                           <p className="text-sm text-blue-700 dark:text-blue-300/80 mt-1">Detta inlägg visar automatiskt de senaste händelserna (stories) från det Instagram-konto som angetts under <strong className="font-semibold">Varumärke &gt; Sociala Medier</strong>.</p>
                        </div>
                    )}
                </div>
            </AccordionSection>
            
            {post.layout !== 'instagram' && post.layout !== 'instagram-latest' && post.layout !== 'instagram-stories' && (
                <>
                    {post.layout === 'collage' && (
                        <AccordionSection title="Collage-layout">
                            <CollageLayoutSelector
                                currentLayout={post.collageLayout}
                                onChange={(layout) => handleFieldChange('collageLayout', layout)}
                                aspectRatio={aspectRatio}
                            />
                        </AccordionSection>
                    )}

                    {(post.layout.includes('image') || post.layout.includes('video') || post.layout === 'collage') && (
                        <AccordionSection title="Media">
                            {post.layout === 'collage' ? (
                                <div className="space-y-4">
                                    <input
                                        type="file"
                                        ref={collageFileInputRef}
                                        onChange={handleCollageFileChange}
                                        accept="image/*,video/mp4"
                                        className="hidden"
                                    />
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Klicka på en ruta för att lägga till en bild eller video.</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        {Array.from({ length: getSlotCount(post.collageLayout, aspectRatio) }).map((_, index) => {
                                            const item = post.collageItems?.[index];
                                            return (
                                                <div key={index} className="aspect-video bg-slate-100 dark:bg-slate-900/50 rounded-lg flex items-center justify-center relative group border border-slate-200 dark:border-slate-700">
                                                    {item ? (
                                                        <>
                                                            {item.type === 'image' && <img src={item.imageUrl} alt={`Collagebild ${index+1}`} className="w-full h-full object-cover rounded-lg" />}
                                                            {item.type === 'video' && <video src={item.videoUrl} className="w-full h-full object-cover rounded-lg" />}
                                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                                                                <button onClick={() => handleRemoveCollageItem(index)} className="bg-red-600 hover:bg-red-500 text-white p-2 rounded-full">
                                                                    <TrashIcon className="h-5 w-5" />
                                                                </button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <button type="button" onClick={() => handleAddCollageItem(index)} className="w-full h-full text-3xl text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900 rounded-lg transition-colors">
                                                            +
                                                        </button>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,video/mp4" className="hidden" />
                                    <PrimaryButton onClick={() => fileInputRef.current?.click()} disabled={!!aiLoading} loading={aiLoading === 'upload'}>
                                        {aiLoading === 'upload' ? (uploadProgress !== null ? `Laddar upp... ${uploadProgress.toFixed(0)}%` : 'Bearbetar...') : 'Ladda upp bild/video'}
                                    </PrimaryButton>
                                    
                                    {post.imageUrl && (
                                        <div className="space-y-2">
                                            <img src={post.imageUrl} alt="Förhandsvisning" className="w-48 rounded-md border border-slate-300 dark:border-slate-600"/>
                                            <div className="flex flex-col gap-2">
                                                <SecondaryButton onClick={() => handleFieldChange('imageUrl', undefined)} className="self-start">Ta bort bild</SecondaryButton>
                                                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900/50">
                                                    <label className="flex items-center gap-2 font-semibold text-purple-600 dark:text-purple-400 text-sm">
                                                        <SparklesIcon className="h-5 w-5"/> Trollstav (Redigera med AI)
                                                    </label>
                                                    <div className="flex gap-2 mt-2">
                                                        <StyledInput type="text" value={aiEditPrompt} onChange={e => setAiEditPrompt(e.target.value)} placeholder="t.ex. 'gör himlen mer dramatisk'"/>
                                                        <PrimaryButton onClick={handleAiImageEdit} loading={aiLoading === 'edit'} disabled={!aiEditPrompt || !!aiLoading}>Ändra</PrimaryButton>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {post.videoUrl && (
                                        <div className="space-y-2">
                                            <video src={post.videoUrl} controls className="w-48 rounded-md border border-slate-300 dark:border-slate-600"/>
                                            <div className="flex flex-col gap-2">
                                                <SecondaryButton onClick={() => handleFieldChange('videoUrl', undefined)} className="self-start">Ta bort video</SecondaryButton>
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900/50 mt-4">
                                        <label className="flex items-center gap-2 font-semibold text-purple-600 dark:text-purple-400 text-sm">
                                            <SparklesIcon className="h-5 w-5"/> AI-Videogenerator
                                        </label>
                                        <div className="flex flex-col gap-2 mt-2">
                                            <textarea 
                                                value={aiVideoPrompt} 
                                                onChange={e => setAiVideoPrompt(e.target.value)} 
                                                placeholder="Beskriv en kort video..."
                                                rows={2}
                                                className="w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                                                disabled={!!aiLoading}
                                            />
                                            {post.imageUrl && (
                                                <label className="flex items-center gap-2 cursor-pointer text-sm">
                                                    <input 
                                                        type="checkbox"
                                                        checked={useImageForVideo}
                                                        onChange={e => setUseImageForVideo(e.target.checked)}
                                                        className="h-4 w-4 rounded text-primary focus:ring-primary"
                                                        disabled={!!aiLoading}
                                                    />
                                                    Använd befintlig bild som grund för videon
                                                </label>
                                            )}
                                            <PrimaryButton 
                                                onClick={handleGenerateVideo} 
                                                loading={aiLoading === 'video'} 
                                                disabled={!aiVideoPrompt || !!aiLoading}
                                            >
                                                {aiLoading === 'video' ? aiVideoStatus : 'Generera video'}
                                            </PrimaryButton>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </AccordionSection>
                    )}

                    {post.layout === 'image-fullscreen' && (
                        <AccordionSection title="Sub-bilder (karusell)">
                            <div className="space-y-6">
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Lägg till mindre bilder som visas i en karusell ovanpå huvudbilden.</p>
                                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                                        {(post.subImages || []).map((img, index) => (
                                            <div key={img.id} className="relative group aspect-square">
                                                <img src={img.imageUrl} alt={`Sub-image ${index + 1}`} className="w-full h-full object-cover rounded-md border border-slate-300 dark:border-slate-600" />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveSubImage(img.id)}
                                                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <TrashIcon className="h-3