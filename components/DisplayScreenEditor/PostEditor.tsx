import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DisplayPost, Organization, DisplayScreen, Tag, SubImage, SubImageConfig, CollageItem, MediaItem, TagColorOverride, UserRole } from '../../types';
import { PrimaryButton, SecondaryButton, DestructiveButton } from '../Buttons';
import { StyledInput, StyledSelect, FontSelector } from '../Forms';
import { ChevronDownIcon, ToggleSwitch, SparklesIcon, TrashIcon, CompactToggleSwitch, InstagramIcon, LoadingSpinnerIcon, PhotoIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon } from '../icons';
import { 
    generateDisplayPostImage, 
    editDisplayPostImage,
    refineDisplayPostContent,
    generateHeadlineSuggestions,
    fileToBase64,
    urlToBase64,
    generateCompletePost,
    generateVideoFromPrompt,
    generateBodySuggestions,
} from '../../services/geminiService';
import { useToast } from '../../context/ToastContext';
import { uploadVideo } from '../../services/firebaseService';
import { AIStatusIndicator } from '../HelpBot';
import { MediaPickerModal } from './Modals';
import AIIdeaGenerator from '../AIGeneratorScreen';
import { getPostVisibility } from './sharedPostsUtils';

const toDateTimeLocal = (isoString?: string): string => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '';

        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().slice(0, 16);
    } catch (e) {
        console.error("Error formatting date for datetime-local input", e);
        return '';
    }
};

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
    { value: 'instagram-latest', label: 'Senaste Instagram' },
    { value: 'instagram-stories', label: 'Instagram Stories' },
];

const LayoutSelector: React.FC<{
  currentLayout: DisplayPost['layout'];
  onChange: (layout: DisplayPost['layout']) => void;
  aspectRatio: DisplayScreen['aspectRatio'];
  userRole: UserRole;
}> = ({ currentLayout, onChange, aspectRatio, userRole }) => {
  const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
  const icons = isPortrait ? portraitLayoutIcons : layoutIcons;

  const baseOptions = isPortrait ? portraitLayoutOptions : layoutOptions;
  const options = useMemo(() => {
    // "Instagram Stories" is hidden from the UI to prevent new selections, but remains functional for existing posts.
    return baseOptions.filter(option => option.value !== 'instagram-stories');
  }, [baseOptions]);

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

const PostVisibilityInfo: React.FC<{
  post: DisplayPost;
  screen: DisplayScreen;
  organization: Organization;
}> = ({ post, screen, organization }) => {
  const visibility = getPostVisibility(post, screen.id, organization);

  if (visibility.isShared) {
    return (
      <div className="text-sm bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-blue-800 dark:text-blue-300">
        <span className="font-semibold">Delas från:</span> {visibility.sourceScreenName}. Redigera originalet för att ändra innehållet.
      </div>
    );
  }

  if (visibility.visibleIn.length > 1) {
    return (
      <div className="text-sm bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
        <p className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Detta är ett originalinlägg som synkas till flera kanaler. Ändringar du sparar här kommer att slå igenom överallt.</p>
        <span className="font-semibold text-blue-800 dark:text-blue-300">Synkas till:</span>
        <div className="flex flex-wrap gap-2 mt-2">
          {visibility.visibleIn.map(s => (
            <span key={s.id} className="text-xs font-bold bg-blue-200 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full">
              {s.name}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return null;
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
    userRole: UserRole;
    onRejectSuggestion?: () => void;
}

const AccordionSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean, disabled?: boolean, disabledMessage?: string }> = ({ title, children, defaultOpen = false, disabled = false, disabledMessage }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen && !disabled);

    useEffect(() => {
        if(disabled) setIsOpen(false);
    }, [disabled]);

    return (
        <div className={`rounded-lg border ${disabled ? 'bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-700'}`}>
            <button type="button" onClick={() => !disabled && setIsOpen(!isOpen)} className={`w-full flex justify-between items-center p-4 font-bold text-lg ${disabled ? 'text-slate-500 dark:text-slate-500 cursor-not-allowed' : 'text-slate-800 dark:text-slate-200'}`} aria-expanded={isOpen} disabled={disabled}>
                <span>{title}</span>
                <ChevronDownIcon className={`h-6 w-6 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && !disabled && <div className="p-4 border-t border-slate-200 dark:border-slate-700">{children}</div>}
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
    onRefine: (command: 'shorter' | 'more_formal' | 'add_emojis' | 'more_casual' | 'more_salesy' | 'simplify_language') => void;
    onSuggest?: () => void;
    suggestLabel?: string;
    isLoading: boolean;
}> = ({ onRefine, onSuggest, suggestLabel, isLoading }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const actions = [
        { label: 'Gör kortare', command: 'shorter' as const },
        { label: 'Mer formell', command: 'more_formal' as const },
        { label: 'Mer ledig', command: 'more_casual' as const },
        { label: 'Mer säljande', command: 'more_salesy' as const },
        { label: 'Förenkla språket', command: 'simplify_language' as const },
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
                {isLoading ? <LoadingSpinnerIcon className="h-5 w-5 text-purple-500"/> : <SparklesIcon className="h-5 w-5"/>}
            </button>
            {isOpen && (
                <div className="absolute z-10 right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-md shadow-lg border border-slate-200 dark:border-slate-700">
                    <div className="py-1">
                        {onSuggest && (
                            <button type="button" onClick={() => { onSuggest(); setIsOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold text-primary">{suggestLabel || 'Föreslå'}</button>
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
    case 'suggest-body': return 'AI föreslår brödtext...';
    case 'video': return 'AI genererar video...';
    case 'upload':
    case 'upload-sub':
      return 'Bearbetar media...';
    default:
      if (loadingState.startsWith('collage-')) return 'Bearbetar media...';
      return 'AI arbetar...';
  }
};

export const PostEditor: React.FC<PostEditorProps> = ({ post, organization, aspectRatio, onPostChange, onSave, onCancel, isSaving, onUpdateOrganization, userRole, onRejectSuggestion }) => {
    const { showToast } = useToast();
    const [aiLoading, setAiLoading] = useState<string | false>(false);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [aiStudioState, setAiStudioState] = useState({ style: '', colors: '', mood: '', composition: '', lighting: '' });
    const [aiEditPrompt, setAiEditPrompt] = useState('');
    const [aiImagePrompt, setAiImagePrompt] = useState('');
    
    // Enkel ångrafunktion för att återställa senaste redigeringssteg i bild-/videoeditorn.
    const [history, setHistory] = useState<DisplayPost[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);

    // Initialize/reset history when a new post is being edited
    useEffect(() => {
        if (post) {
            setHistory([post]);
            setCurrentIndex(0);
        } else {
            setHistory([]);
            setCurrentIndex(-1);
        }
    }, [post?.id]);
    
    useEffect(() => {
        if (post) {
            const promptFromPost = post.aiImagePrompt || `${post.headline || ''}\n${post.body || ''}`.trim();
            setAiImagePrompt(promptFromPost);
        }
    }, [post?.id, post.aiImagePrompt, post.headline, post.body]);


    const updatePostAndSaveHistory = (updatedPost: DisplayPost) => {
        // Prevent saving identical subsequent states
        if (history[currentIndex] && JSON.stringify(history[currentIndex]) === JSON.stringify(updatedPost)) {
            return;
        }

        const newHistory = history.slice(0, currentIndex + 1);
        newHistory.push(updatedPost);
        setHistory(newHistory);
        setCurrentIndex(newHistory.length - 1);
        onPostChange(updatedPost);
    };

    const handleUndo = () => {
        if (currentIndex > 0) {
            const newIndex = currentIndex - 1;
            setCurrentIndex(newIndex);
            onPostChange(history[newIndex]);
        }
    };

    const handleRedo = () => {
        if (currentIndex < history.length - 1) {
            const newIndex = currentIndex + 1;
            setCurrentIndex(newIndex);
            onPostChange(history[newIndex]);
        }
    };

    const sectionRef = useRef<HTMLDetailsElement>(null);

    useEffect(() => {
        const triggerHighlight = (element: HTMLElement) => {
          element.classList.add("highlight-pulse");
          setTimeout(() => {
            element.classList.remove("highlight-pulse");
          }, 2500);
        };
    
      const fromAIFlow = sessionStorage.getItem("fromAIFlow") === "true";
      if (fromAIFlow && sectionRef.current) {
        triggerHighlight(sectionRef.current);
        sessionStorage.removeItem("fromAIFlow");
      }
    }, []);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const subImageFileInputRef = useRef<HTMLInputElement>(null);
    const [aiVideoPrompt, setAiVideoPrompt] = useState('');
    const [aiVideoStatus, setAiVideoStatus] = useState('');
    const [useImageForVideo, setUseImageForVideo] = useState(false);
    
    const collageFileInputRef = useRef<HTMLInputElement>(null);
    const [editingCollageSlot, setEditingCollageSlot] = useState<number | null>(null);

    const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
    const [mediaPickerConfig, setMediaPickerConfig] = useState<{
        target: 'main' | 'sub' | `collage-${number}`;
        filter?: 'image' | 'video';
    } | null>(null);
    const [collageSlotAction, setCollageSlotAction] = useState<number | null>(null);

    const handleIdeaSelect = (idea: { headline: string, text: string }) => {
        const updatedPost = {
            ...post,
            headline: idea.headline,
            body: idea.text,
            internalTitle: idea.headline || 'AI-förslag',
        };
        updatePostAndSaveHistory(updatedPost);
        showToast({ message: "Text uppdaterad med AI-förslag.", type: 'info' });
    };

    const openMediaPicker = (target: 'main' | 'sub' | `collage-${number}`, filter?: 'image' | 'video') => {
        setMediaPickerConfig({ target, filter });
        setIsMediaPickerOpen(true);
    };

    const handleMediaSelect = (item: MediaItem) => {
        if (!mediaPickerConfig) return;
        const { target } = mediaPickerConfig;

        if (target === 'main') {
            if (item.type === 'image') {
                updatePostAndSaveHistory({ ...post, imageUrl: item.url, videoUrl: undefined, isAiGeneratedImage: item.createdBy === 'ai', isAiGeneratedVideo: false });
            } else { // video
                updatePostAndSaveHistory({ ...post, videoUrl: item.url, imageUrl: undefined, isAiGeneratedImage: false, isAiGeneratedVideo: item.createdBy === 'ai' });
            }
        } else if (target === 'sub') {
            if (item.type === 'image') {
                const newSubImage: SubImage = { id: `subimg-${Date.now()}`, imageUrl: item.url };
                updatePostAndSaveHistory({ ...post, subImages: [...(post.subImages || []), newSubImage] });
            } else {
                showToast({ message: "Endast bilder kan användas som sub-bilder.", type: 'info' });
            }
        } else if (target.startsWith('collage-')) {
            const index = parseInt(target.split('-')[1], 10);
            const newItem: CollageItem = {
                id: `collage-${Date.now()}-${index}`,
                type: item.type,
                imageUrl: item.type === 'image' ? item.url : undefined,
                videoUrl: item.type === 'video' ? item.url : undefined,
                isAiGeneratedImage: item.type === 'image' && item.createdBy === 'ai',
                isAiGeneratedVideo: item.type === 'video' && item.createdBy === 'ai',
            };
            const currentItems = [...(post.collageItems || [])];
            while (currentItems.length <= index) { currentItems.push(null as any); }
            currentItems[index] = newItem;
            handleFieldChange('collageItems', currentItems);
        }
        
        setIsMediaPickerOpen(false);
        setMediaPickerConfig(null);
    };

    const handleFieldChange = (field: keyof DisplayPost, value: any) => {
        const updatedPost = { ...post, [field]: value };
        // Only update internalTitle if the post is not a shared post
        if (field === 'headline' && !post.sharedFromPostId) {
            updatedPost.internalTitle = value || 'Namnlöst inlägg';
        }
        updatePostAndSaveHistory(updatedPost);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const file = files[0];

        if (file.type.startsWith('image/')) {
            setAiLoading('upload');
            try {
                const { data, mimeType } = await fileToBase64(file);
                updatePostAndSaveHistory({ ...post, imageUrl: `data:${mimeType};base64,${data}`, videoUrl: undefined, isAiGeneratedImage: false, isAiGeneratedVideo: false });
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
                updatePostAndSaveHistory({ ...post, videoUrl: videoUrl, imageUrl: undefined, isAiGeneratedImage: false, isAiGeneratedVideo: false });
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
        const files = e.target.files;
        if (!files || files.length === 0 || editingCollageSlot === null) return;
    
        setAiLoading(`collage-${editingCollageSlot}`);
        try {
            const currentItems = [...(post.collageItems || [])];
            const slotCount = getSlotCount(post.collageLayout, aspectRatio);
    
            // Ensure currentItems has enough length, filling with nulls
            while (currentItems.length < slotCount) {
                currentItems.push(null as any);
            }
    
            const filesToProcess = Array.from(files);
            for (let i = 0; i < filesToProcess.length; i++) {
                const file = filesToProcess[i];
                const targetSlot = editingCollageSlot + i;
    
                if (targetSlot >= slotCount) break; // Stop if we run out of slots
    
                // Using a separate try/catch for each file to be more robust
                try {
                    if (!(file instanceof File)) {
                        throw new Error('An invalid item was found in the file list.');
                    }
                    const { data, mimeType } = await fileToBase64(file);
                    const isVideo = mimeType.startsWith('video');
                    const newItem: CollageItem = {
                        id: `collage-${Date.now()}-${targetSlot}`,
                        type: isVideo ? 'video' : 'image',
                        imageUrl: !isVideo ? `data:${mimeType};base64,${data}` : undefined,
                        videoUrl: isVideo ? `data:${mimeType};base64,${data}` : undefined,
                        isAiGeneratedImage: false,
                        isAiGeneratedVideo: false,
                    };
                    currentItems[targetSlot] = newItem;
                } catch (fileError) {
                    const fileName = file instanceof File ? file.name : `item ${i}`;
                    console.error(`Error processing file ${fileName}:`, fileError);
                    showToast({ message: `Kunde inte bearbeta filen ${fileName}.`, type: 'error' });
                }
            }
    
            handleFieldChange('collageItems', currentItems);
    
        } catch (error) {
            showToast({ message: "Ett fel inträffade vid uppladdning.", type: 'error' });
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

    const handleAiStudioGenerate = async () => {
        if (!aiImagePrompt) {
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
            if (state.composition) parts.push(state.composition);
            if (state.lighting) parts.push(`with ${state.lighting} lighting`);
            if (state.mood) parts.push(`with a ${state.mood} mood`);
            if (state.colors) parts.push(`using a ${state.colors} color palette`);
            
            // Add final quality enhancers
            let finalPrompt = parts.join(', ');
            finalPrompt += ", professional marketing photography, high resolution, cinematic lighting, visually stunning";
            return finalPrompt;
        }

        try {
            const finalPrompt = constructAiPrompt(aiStudioState, aiImagePrompt);
            const newImageUrl = await generateDisplayPostImage(finalPrompt, aspectRatio);
            updatePostAndSaveHistory({ ...post, imageUrl: newImageUrl, videoUrl: undefined, layout: post.layout === 'text-only' ? 'image-fullscreen' : post.layout, isAiGeneratedImage: true, isAiGeneratedVideo: false });
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
            updatePostAndSaveHistory({ ...post, imageUrl: newImageUrl, videoUrl: undefined, isAiGeneratedImage: true, isAiGeneratedVideo: false });
            setAiEditPrompt('');
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Ett fel inträffade.', type: 'error' });
        } finally {
            setAiLoading(false);
        }
    };

    const handleAiTextRefine = async (command: 'shorter' | 'more_formal' | 'add_emojis' | 'more_casual' | 'more_salesy' | 'simplify_language') => {
        setAiLoading(`text-${command}`);
        try {
            const newContent = await refineDisplayPostContent({ headline: post.headline || '', body: post.body || '' }, command);
            updatePostAndSaveHistory({ ...post, ...newContent, internalTitle: newContent.headline || 'Namnlöst inlägg' });
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
    
    const handleAiSuggestBody = async () => {
        if (!post.headline) {
            showToast({ message: 'Skriv en rubrik först för att få förslag på brödtext.', type: 'info' });
            return;
        }
        setAiLoading('suggest-body');
        try {
            const suggestions = await generateBodySuggestions(post.headline, [post.body || '']);
            if (suggestions.length > 0) {
                handleFieldChange('body', suggestions[0]);
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

    const handleTagColorOverrideChange = (tagId: string, newOverrideValues: Partial<Omit<TagColorOverride, 'tagId'>>) => {
        const tag = organization.tags?.find(t => t.id === tagId);
        if (!tag) return;
    
        const currentOverrides = post.tagColorOverrides || [];
        const otherOverrides = currentOverrides.filter(o => o.tagId !== tagId);
        const existingOverride = currentOverrides.find(o => o.tagId === tagId) || { tagId };
        
        const updatedOverride = { ...existingOverride, ...newOverrideValues };
        
        const isBgDefault = updatedOverride.backgroundColor === tag.backgroundColor;
        const isTextDefault = updatedOverride.textColor === tag.textColor;
            
        if (isBgDefault && isTextDefault) {
            handleFieldChange('tagColorOverrides', otherOverrides.length > 0 ? otherOverrides : undefined);
            return;
        }
        
        const newOverrides = [...otherOverrides, updatedOverride];
        handleFieldChange('tagColorOverrides', newOverrides);
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

            updatePostAndSaveHistory({ 
                ...post, 
                videoUrl: newVideoUrl, 
                imageUrl: undefined, 
                layout: 'video-fullscreen', 
                isAiGeneratedVideo: true,
                isAiGeneratedImage: false,
                aiVideoPrompt: aiVideoPrompt,
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
        updatePostAndSaveHistory({ ...post, subImageConfig: newConfig });
    };

    const handleSubImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        setAiLoading('upload-sub');
        try {
            const newImages = await Promise.all(
                Array.from(files).map(async (file) => {
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
            updatePostAndSaveHistory({
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
        updatePostAndSaveHistory({
            ...post,
            subImages: (post.subImages || []).filter(img => img.id !== id),
        });
    };

    const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
    
    const styleOptions = [
      { label: 'Fotorealistisk', value: 'photorealistic' },
      { label: '3D-render', value: '3D render' },
      { label: 'Abstrakt', value: 'abstract art' },
      { label: 'Minimalistisk', value: 'minimalist' },
      { label: 'Isometrisk', value: 'isometric' },
      { label: 'Linjekonst', value: 'line art' },
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
      { label: 'Jordnära', value: 'earthy tones' },
      { label: 'Juveltoner', value: 'jewel tones' },
    ];

    const moodOptions = [
      { label: 'Glad', value: 'joyful and uplifting' },
      { label: 'Lugn', value: 'calm and serene' },
      { label: 'Energisk', value: 'energetic and vibrant' },
      { label: 'Dramatisk', value: 'dramatic and moody' },
      { label: 'Lyxig', value: 'luxurious and elegant' },
      { label: 'Nostalgisk', value: 'nostalgic' },
      { label: 'Futuristisk', value: 'futuristic' },
      { label: 'Lekfull', value: 'playful' },
    ];

    const compositionOptions = [
        { label: 'Närbild', value: 'close-up shot' },
        { label: 'Vidvinkel', value: 'wide-angle shot' },
        { label: 'Fågelperspektiv', value: "bird's-eye view" },
        { label: 'Porträtt', value: 'portrait' },
    ];

    const lightingOptions = [
        { label: 'Studioljus', value: 'studio' },
        { label: 'Gyllene timmen', value: 'golden hour' },
        { label: 'Blå timmen', value: 'blue hour' },
        { label: 'Dramatisk', value: 'dramatic' },
        { label: 'Filmisk', value: 'cinematic' },
    ];

    const colorBasedEffects = ['pulse-light', 'pulse-medium', 'pulse-intense', 'glow-pulse', 'wave-bg', 'gradient-pulse'];
    const isSharedPost = !!post.sharedFromPostId;
    const currentScreen = organization.displayScreens?.find(s => s.posts.some(p => p.id === post.id));

    return (
        <div className="space-y-6 bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm animate-fade-in">
            <AIStatusIndicator
                isThinking={!!aiLoading}
                statusText={aiLoading === 'video' && aiVideoStatus ? aiVideoStatus : getAIStatusText(aiLoading)}
            />
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                {post.id.startsWith('new-') ? 'Skapa nytt inlägg' : `Redigera: ${post.internalTitle}`}
            </h3>

            {currentScreen && <PostVisibilityInfo post={post} screen={currentScreen} organization={organization} />}
            
            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white pb-3 flex-shrink-0">
                    <SparklesIcon className="h-6 w-6 text-purple-500" />
                    AI-Idéer
                </div>
                <AIIdeaGenerator
                    onIdeaSelect={handleIdeaSelect}
                    isLoading={!!aiLoading}
                    organization={organization}
                />
            </div>

            <AccordionSection title="Layout" defaultOpen={!isSharedPost} disabled={isSharedPost}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Intern titel</label>
                        <StyledInput type="text" value={post.internalTitle} onChange={(e) => handleFieldChange('internalTitle', e.target.value)} />
                    </div>
                     <div>
                        <LayoutSelector currentLayout={post.layout} onChange={(layout) => handleFieldChange('layout', layout)} aspectRatio={aspectRatio} userRole={userRole} />
                    </div>
                    {(post.layout === 'image-left' || post.layout === 'image-right') && (
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
                                Bildstorlek ({post.splitRatio || 50}%)
                            </label>
                            <input
                                type="range"
                                min="25"
                                max="75"
                                step="5"
                                value={post.splitRatio || 50}
                                onChange={(e) => handleFieldChange('splitRatio', parseInt(e.target.value, 10))}
                                className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    )}
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
            
            {post.layout !== 'instagram-latest' && post.layout !== 'instagram-stories' ? (
                <>
                    <AccordionSection title="Collage-layout" disabled={isSharedPost}>
                        <CollageLayoutSelector
                            currentLayout={post.collageLayout}
                            onChange={(layout) => handleFieldChange('collageLayout', layout)}
                            aspectRatio={aspectRatio}
                        />
                    </AccordionSection>

                    <AccordionSection title="Media" disabled={isSharedPost}>
                        {post.layout === 'collage' ? (
                            <div className="space-y-4">
                                <input
                                    type="file"
                                    multiple
                                    ref={collageFileInputRef}
                                    onChange={handleCollageFileChange}
                                    accept="image/*,video/mp4"
                                    className="hidden"
                                />
                                <p className="text-sm text-slate-500 dark:text-slate-400">Klicka på en ruta för att lägga till en bild eller video. Du kan välja flera filer samtidigt för att fylla påföljande rutor.</p>
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
                                                    <button type="button" onClick={() => setCollageSlotAction(index)} className="w-full h-full text-3xl text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900 rounded-lg transition-colors">
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
                                <div className="flex flex-wrap gap-2 items-center">
                                    <PrimaryButton onClick={() => fileInputRef.current?.click()} disabled={!!aiLoading} loading={aiLoading === 'upload'}>
                                        {aiLoading === 'upload' ? (uploadProgress !== null ? `Laddar upp... ${uploadProgress.toFixed(0)}%` : 'Bearbetar...') : 'Ladda upp bild/video'}
                                    </PrimaryButton>
                                    <SecondaryButton onClick={() => openMediaPicker('main')} disabled={!!aiLoading}>
                                        Välj från galleri
                                    </SecondaryButton>
                                    <div className="flex items-center gap-2">
                                        <SecondaryButton onClick={handleUndo} disabled={currentIndex <= 0 || isSaving} title="Ångra">
                                            <ArrowUturnLeftIcon className="h-5 w-5" />
                                            <span>Ångra</span>
                                        </SecondaryButton>
                                        <SecondaryButton onClick={handleRedo} disabled={currentIndex >= history.length - 1 || isSaving} title="Gör om">
                                            <ArrowUturnRightIcon className="h-5 w-5" />
                                        </SecondaryButton>
                                    </div>
                                </div>

                                <details className="p-4 rounded-lg bg-slate-100 dark:bg-slate-900/50 mt-4 border border-slate-200 dark:border-slate-700 open:pb-4" open>
                                    <summary className="flex items-center gap-2 font-semibold text-purple-600 dark:text-purple-400 text-lg cursor-pointer">
                                        <SparklesIcon className="h-6 w-6"/>
                                        AI-Bildstudio
                                    </summary>
                                    <div className="flex flex-col gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                        <textarea 
                                            value={aiImagePrompt} 
                                            onChange={e => setAiImagePrompt(e.target.value)} 
                                            placeholder="Beskriv bilden du vill skapa..."
                                            rows={2}
                                            className="w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                                            disabled={!!aiLoading}
                                        />
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <AiStudioModifierGroup label="Bildstil" options={styleOptions} selectedValue={aiStudioState.style} onSelect={v => setAiStudioState(s => ({...s, style: v}))} />
                                            <AiStudioModifierGroup label="Färger" options={colorOptions} selectedValue={aiStudioState.colors} onSelect={v => setAiStudioState(s => ({...s, colors: v}))} />
                                            <AiStudioModifierGroup label="Stämning" options={moodOptions} selectedValue={aiStudioState.mood} onSelect={v => setAiStudioState(s => ({...s, mood: v}))} />
                                            <AiStudioModifierGroup label="Komposition & Ljus" options={[...compositionOptions, ...lightingOptions]} selectedValue={aiStudioState.composition || aiStudioState.lighting} onSelect={v => {
                                                const isComp = compositionOptions.some(o => o.value === v);
                                                const isLight = lightingOptions.some(o => o.value === v);
                                                setAiStudioState(s => ({...s, composition: isComp ? v : '', lighting: isLight ? v : ''}));
                                            }} />
                                        </div>
                                        <PrimaryButton 
                                            onClick={handleAiStudioGenerate} 
                                            loading={aiLoading === 'generate'} 
                                            disabled={!aiImagePrompt || !!aiLoading}
                                            className="bg-purple-600 hover:bg-purple-500"
                                        >
                                            Generera ny bild
                                        </PrimaryButton>
                                    </div>
                                </details>
                                
                                {post.imageUrl && (
                                    <div className="space-y-2 mt-4">
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
                                    <div className="space-y-2 mt-4">
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

                    <AccordionSection title="Sub-bilder (karusell)" disabled={isSharedPost}>
                        <div className="space-y-6">
                            <div>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Lägg till mindre bilder som visas i en karusell ovanpå huvudbilden. Du kan välja flera bilder samtidigt.</p>
                                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                                    {(post.subImages || []).map((img, index) => (
                                        <div key={img.id} className="relative group aspect-square">
                                            <img src={img.imageUrl} alt={`Sub-image ${index + 1}`} className="w-full h-full object-cover rounded-md border border-slate-300 dark:border-slate-600" />
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveSubImage(img.id)}
                                                className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <TrashIcon className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <input type="file" multiple ref={subImageFileInputRef} onChange={handleSubImageUpload} accept="image/*" className="hidden" />
                                    <SecondaryButton onClick={() => subImageFileInputRef.current?.click()} loading={aiLoading === 'upload-sub'}>
                                        Ladda upp bilder
                                    </SecondaryButton>
                                    <SecondaryButton onClick={() => openMediaPicker('sub', 'image')}>
                                        Välj från galleri
                                    </SecondaryButton>
                                </div>
                            </div>
                            <div>
                                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Inställningar för karusell</h4>
                                <div className="space-y-4">
                                    <CompactToggleSwitch checked={!!post.subImages && post.subImages.length > 0} onChange={(checked) => {
                                        if (!checked) updatePostAndSaveHistory({ ...post, subImages: [] });
                                    }} />
                                    <div className={(!post.subImages || post.subImages.length === 0) ? 'opacity-50 pointer-events-none' : ''}>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Animation</label>
                                                <StyledSelect value={post.subImageConfig?.animation || 'scroll'} onChange={e => handleSubImageConfigChange('animation', e.target.value)}>
                                                    <option value="scroll">Rullande</option>
                                                    <option value="fade">Tona</option>
                                                </StyledSelect>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Position</label>
                                                <StyledSelect value={post.subImageConfig?.position || 'bottom'} onChange={e => handleSubImageConfigChange('position', e.target.value)}>
                                                    {post.subImageConfig?.animation === 'fade' ? (
                                                        <>
                                                            <option value="top-left">Topp Vänster</option>
                                                            <option value="top-right">Topp Höger</option>
                                                            <option value="bottom-left">Nere Vänster</option>
                                                            <option value="bottom-right">Nere Höger</option>
                                                            <option value="center">Centrerad</option>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <option value="top">Topp</option>
                                                            <option value="middle">Mitten</option>
                                                            <option value="bottom">Botten</option>
                                                        </>
                                                    )}
                                                </StyledSelect>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Storlek</label>
                                                <StyledSelect value={post.subImageConfig?.size || 'md'} onChange={e => handleSubImageConfigChange('size', e.target.value)}>
                                                    <option value="sm">Liten</option>
                                                    <option value="md">Mellan</option>
                                                    <option value="lg">Stor</option>
                                                    <option value="xl">XL</option>
                                                    <option value="2xl">XXL</option>
                                                </StyledSelect>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                                                    {post.subImageConfig?.animation === 'fade' ? 'Tid per bild (s)' : 'Scrolltid (s)'}
                                                </label>
                                                <StyledInput type="number" value={String(post.subImageConfig?.intervalSeconds || 5)} onChange={e => handleSubImageConfigChange('intervalSeconds', parseInt(e.target.value, 10))} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </AccordionSection>

                    <AccordionSection title="Text & Utseende" defaultOpen={true} disabled={isSharedPost}>
                        <div className="space-y-4">
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                                    <span>Rubrik</span>
                                    <AiTextActions
                                        isLoading={!!aiLoading && (aiLoading.startsWith('text-') || aiLoading === 'suggest-headline')}
                                        onRefine={handleAiTextRefine}
                                        onSuggest={handleAiSuggestHeadlines}
                                        suggestLabel="Föreslå rubriker"
                                    />
                                </label>
                                <textarea rows={2} value={post.headline || ''} onChange={e => handleFieldChange('headline', e.target.value)} className="w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600" />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                                    <span>Brödtext</span>
                                    <AiTextActions
                                        isLoading={!!aiLoading && (aiLoading.startsWith('text-') || aiLoading === 'suggest-body')}
                                        onRefine={handleAiTextRefine}
                                        onSuggest={handleAiSuggestBody}
                                        suggestLabel="Föreslå brödtext"
                                    />
                                </label>
                                <textarea rows={4} value={post.body || ''} onChange={e => handleFieldChange('body', e.target.value)} className="w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Rubrikstorlek</label>
                                    <StyledSelect value={post.headlineFontSize || '4xl'} onChange={e => handleFieldChange('headlineFontSize', e.target.value)}>
                                        {['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'].map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                                    </StyledSelect>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Textjustering</label>
                                    <StyledSelect value={post.textAlign || 'center'} onChange={e => handleFieldChange('textAlign', e.target.value)}>
                                        <option value="left">Vänster</option>
                                        <option value="center">Centrerad</option>
                                        <option value="right">Höger</option>
                                    </StyledSelect>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Brödtextstorlek</label>
                                    <StyledSelect value={post.bodyFontSize || 'lg'} onChange={e => handleFieldChange('bodyFontSize', e.target.value)}>
                                        {['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'].map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                                    </StyledSelect>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Textanimation</label>
                                    <StyledSelect value={post.textAnimation || 'none'} onChange={e => handleFieldChange('textAnimation', e.target.value)}>
                                        <option value="none">Ingen</option>
                                        <option value="typewriter">Skrivmaskin</option>
                                        <option value="fade-up-word">Tona in ord</option>
                                        <option value="blur-in">Tona in med oskärpa</option>
                                    </StyledSelect>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-500 dark:text-gray-400 mb-1">Rubriktypsnitt</label>
                                    <FontSelector value={post.headlineFontFamily || organization.headlineFontFamily || 'display'} onChange={font => handleFieldChange('headlineFontFamily', font)} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-500 dark:text-gray-400 mb-1">Brödtexttypsnitt</label>
                                    <FontSelector value={post.bodyFontFamily || organization.bodyFontFamily || 'sans'} onChange={font => handleFieldChange('bodyFontFamily', font)} />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <ColorPaletteInput label="Bakgrundsfärg" value={post.backgroundColor || 'black'} onChange={color => handleFieldChange('backgroundColor', color)} organization={organization} />
                                <ColorPaletteInput label="Textfärg" value={post.textColor || 'white'} onChange={color => handleFieldChange('textColor', color)} organization={organization} />
                            </div>
                        </div>
                    </AccordionSection>

                    <AccordionSection title="Extra Effekter" disabled={isSharedPost}>
                        <div className="space-y-4">
                            {/* "Toning över media" är avstängd som standard för att bilder ska visas utan överlägg från början. */}
                            <ToggleSwitch label="Toning över media" checked={post.imageOverlayEnabled ?? false} onChange={c => handleFieldChange('imageOverlayEnabled', c)} />
                            {post.imageOverlayEnabled && (
                                <div className="pl-4">
                                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Toningsfärg & opacitet</label>
                                    <ColorOpacityControl value={post.imageOverlayColor || '#00000080'} onChange={c => handleFieldChange('imageOverlayColor', c)} />
                                </div>
                            )}
                             <ToggleSwitch label="Textbakgrund" checked={post.textBackgroundEnabled ?? false} onChange={c => handleFieldChange('textBackgroundEnabled', c)} />
                            {post.textBackgroundEnabled && (
                                <div className="pl-4">
                                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Färg & opacitet</label>
                                    <ColorOpacityControl value={post.textBackgroundColor || '#00000080'} onChange={c => handleFieldChange('textBackgroundColor', c)} />
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Bildeffekt</label>
                                <StyledSelect value={post.imageEffect || 'none'} onChange={e => handleFieldChange('imageEffect', e.target.value)}>
                                    <option value="none">Ingen</option>
                                    <option value="ken-burns-slow">Ken Burns (Långsam)</option>
                                    <option value="ken-burns-fast">Ken Burns (Snabb)</option>
                                </StyledSelect>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Bakgrundseffekt</label>
                                <StyledSelect value={post.backgroundEffect || 'none'} onChange={e => handleFieldChange('backgroundEffect', e.target.value)}>
                                    <option value="none">Ingen</option>
                                    <option value="confetti">Konfetti</option>
                                    <option value="hearts">Hjärtan</option>
                                    <option value="pulse-light">Puls (Lätt)</option>
                                    <option value="pulse-medium">Puls (Medium)</option>
                                    <option value="pulse-intense">Puls (Intensiv)</option>
                                    <option value="glow-pulse">Glödande puls</option>
                                    <option value="wave-bg">Vågeffekt</option>
                                    <option value="gradient-pulse">Gradientpuls</option>
                                </StyledSelect>
                            </div>
                            {colorBasedEffects.includes(post.backgroundEffect || '') && (
                                <div className="pl-4">
                                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Pulsfärg</label>
                                    <input type="color" value={post.pulseColor || '#14b8a6'} onChange={e => handleFieldChange('pulseColor', e.target.value)} className="w-full h-10 p-1 bg-white dark:bg-black rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"/>
                                </div>
                            )}
                        </div>
                    </AccordionSection>

                    <AccordionSection title="Taggar & QR-kod" disabled={isSharedPost}>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Välj taggar som ska visas</label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {(organization.tags || []).map(tag => (
                                        <label key={tag.id} className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer">
                                            <input type="checkbox" checked={(post.tagIds || []).includes(tag.id)} onChange={e => handleTagChange(tag.id, e.target.checked)} className="h-4 w-4 rounded text-primary focus:ring-primary"/>
                                            <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{tag.text}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {(post.tagIds || []).length > 0 && (
                                <div className="pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                                    <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400">Färgjusteringar för detta inlägg</h4>
                                    {(post.tagIds || []).map(tagId => {
                                        const tag = organization.tags?.find(t => t.id === tagId);
                                        if (!tag) return null;
                                        const override = (post.tagColorOverrides || []).find(o => o.tagId === tagId);
                                        const currentBg = override?.backgroundColor ?? tag.backgroundColor;
                                        const currentText = override?.textColor ?? tag.textColor;

                                        return (
                                            <div key={tagId} className="bg-slate-100 dark:bg-slate-900/50 p-3 rounded-lg">
                                                <p className="font-semibold mb-2">{tag.text}</p>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Bakgrund</label>
                                                        <input type="color" value={currentBg} onChange={e => handleTagColorOverrideChange(tagId, { backgroundColor: e.target.value })} className="w-full h-10 p-1 bg-white dark:bg-black rounded-md border border-slate-300 dark:border-slate-600 cursor-pointer"/>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Text</label>
                                                        <div className="flex gap-2">
                                                            <button type="button" onClick={() => handleTagColorOverrideChange(tagId, { textColor: '#FFFFFF' })} className={`flex-1 h-10 rounded-md transition-all ${currentText === '#FFFFFF' ? 'ring-2 ring-primary' : ''} bg-white text-black shadow-inner-soft`}>Vit</button>
                                                            <button type="button" onClick={() => handleTagColorOverrideChange(tagId, { textColor: '#000000' })} className={`flex-1 h-10 rounded-md transition-all ${currentText === '#000000' ? 'ring-2 ring-primary' : ''} bg-black text-white`}>Svart</button>
                                                        </div>
                                                    </div>
                                                </div>
                                                {override && <button type="button" onClick={() => handleTagColorOverrideChange(tagId, { backgroundColor: tag.backgroundColor, textColor: tag.textColor })} className="text-xs text-slate-500 hover:text-primary mt-2">Återställ till standard</button>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">QR-kod (valfritt)</label>
                                <StyledInput type="url" placeholder="URL för QR-kod" value={post.qrCodeUrl || ''} onChange={e => handleFieldChange('qrCodeUrl', e.target.value.trim() ? e.target.value.trim() : undefined)} />
                                {post.qrCodeUrl && (
                                    <div className="grid grid-cols-2 gap-4 mt-2">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Position</label>
                                            <StyledSelect value={post.qrCodePosition || 'bottom-right'} onChange={e => handleFieldChange('qrCodePosition', e.target.value)}>
                                                <option value="top-left">Topp Vänster</option>
                                                <option value="top-right">Topp Höger</option>
                                                <option value="bottom-left">Nere Vänster</option>
                                                <option value="bottom-right">Nere Höger</option>
                                            </StyledSelect>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Storlek</label>
                                            <StyledSelect value={post.qrCodeSize || 'md'} onChange={e => handleFieldChange('qrCodeSize', e.target.value)}>
                                                <option value="sm">Liten</option>
                                                <option value="md">Mellan</option>
                                                <option value="lg">Stor</option>
                                                <option value="xl">Extra stor</option>
                                            </StyledSelect>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </AccordionSection>
                </>
            ) : null}

            <AccordionSection title="Publicering & Tidsstyrning" defaultOpen={true}>
                <div className="space-y-4">
                    {isSharedPost && (
                        <div className="text-sm bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-blue-800 dark:text-blue-300">
                            Detta är ett delat inlägg. Schemaläggningen styrs av originalet.
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Visningstid (sekunder)</label>
                        <StyledInput type="number" min="5" value={String(post.durationSeconds)} onChange={e => handleFieldChange('durationSeconds', parseInt(e.target.value, 10))} disabled={isSharedPost} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Startdatum</label>
                            <StyledInput 
                                type="datetime-local" 
                                value={toDateTimeLocal(post.startDate)} 
                                onChange={e => handleFieldChange('startDate', e.target.value ? new Date(e.target.value).toISOString() : undefined)} 
                                className="dark-date-input"
                                disabled={isSharedPost}
                            />
                            {!isSharedPost && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Lämna tomt för att spara som utkast. Inlägget visas inte förrän ett startdatum är satt.</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Slutdatum (valfritt)</label>
                            <StyledInput 
                                type="datetime-local" 
                                value={toDateTimeLocal(post.endDate)} 
                                onChange={e => handleFieldChange('endDate', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
                                className="dark-date-input"
                                disabled={isSharedPost}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Övergång till nästa inlägg</label>
                        <StyledSelect value={post.transitionToNext || 'fade'} onChange={e => handleFieldChange('transitionToNext', e.target.value)} disabled={isSharedPost}>
                            <option value="fade">Tona</option>
                            <option value="slide">Skjut</option>
                            <option value="dissolve">Lös upp</option>
                        </StyledSelect>
                    </div>
                </div>
            </AccordionSection>

            <div className="flex justify-end items-center gap-4 mt-8 border-t border-slate-200 dark:border-slate-700 pt-6">
                <div className="flex-grow flex items-center gap-2">
                    {/* Placeholder for future actions */}
                </div>
                {post.suggestionOriginId && onRejectSuggestion ? (
                    <div className="flex gap-4">
                        <SecondaryButton onClick={onCancel} disabled={isSaving}>Avbryt</SecondaryButton>
                        <DestructiveButton onClick={onRejectSuggestion} disabled={isSaving} loading={isSaving}>Förkasta Förslag</DestructiveButton>
                        <PrimaryButton onClick={onSave} loading={isSaving} className="bg-green-600 hover:bg-green-500">Godkänn</PrimaryButton>
                    </div>
                ) : (
                    <div className="flex gap-4">
                        <SecondaryButton onClick={onCancel} disabled={isSaving}>Avbryt</SecondaryButton>
                        <PrimaryButton onClick={onSave} loading={isSaving}>Spara inlägg</PrimaryButton>
                    </div>
                )}
            </div>
            {collageSlotAction !== null && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setCollageSlotAction(null)}>
                    <div className="bg-slate-800 rounded-xl p-6 w-full max-w-sm text-white" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold mb-4">Lägg till media i ruta {collageSlotAction + 1}</h3>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => {
                                    handleAddCollageItem(collageSlotAction);
                                    setCollageSlotAction(null);
                                }}
                                className="w-full text-left p-4 bg-slate-700 hover:bg-slate-600 rounded-lg"
                            >
                                Ladda upp ny bild/video
                            </button>
                            <button
                                onClick={() => {
                                    openMediaPicker(`collage-${collageSlotAction}`);
                                    setCollageSlotAction(null);
                                }}
                                className="w-full text-left p-4 bg-slate-700 hover:bg-slate-600 rounded-lg"
                            >
                                Välj från galleri
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <MediaPickerModal
                isOpen={isMediaPickerOpen}
                onClose={() => setIsMediaPickerOpen(false)}
                mediaLibrary={organization.mediaLibrary || []}
                onSelect={handleMediaSelect}
                filter={mediaPickerConfig?.filter}
            />
        </div>
    );
};
