
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { DisplayPost, Organization, SkyltIdeSuggestion, AdditionalTextElement } from '../../../types';
import { StyledInput, FontSelector, StyledSelect } from '../../Forms';
import { SparklesIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, LoadingSpinnerIcon, TextAlignLeftIcon, TextAlignCenterIcon, TextAlignRightIcon, ToggleSwitch, LayoutWebpageIcon, TrashIcon, PencilIcon, LinkIcon } from '../../icons';
import { useToast } from '../../../context/ToastContext';
import { 
    refineDisplayPostContent,
    generateHeadlineSuggestions,
    generateBodySuggestions,
    refineTextWithCustomPrompt,
    extractContentFromUrl,
    generateDisplayPostImage
} from '../../../services/geminiService';
import AIIdeaGenerator from '../../AIGeneratorScreen';

// --- Shared Color Utilities ---
const resolveColor = (colorKey: string | undefined, fallback: string, organization?: Organization): string => {
    if (!colorKey) return fallback;
    if (colorKey.startsWith('#')) return colorKey;
    switch (colorKey) {
        case 'white': return '#ffffff';
        case 'black': return '#000000';
        case 'primary': return organization?.primaryColor || '#14b8a6';
        case 'secondary': return organization?.secondaryColor || '#f97316';
        case 'tertiary': return organization?.tertiaryColor || '#3b82f6';
        case 'accent': return organization?.accentColor || '#ec4899';
        default: return colorKey; 
    }
};

const ColorPaletteInput: React.FC<{
    value: string;
    onChange: (color: string) => void;
    organization: Organization;
}> = ({ value, onChange, organization }) => {
    const colorOptions = useMemo(() => [
        { name: 'Primär', keyword: 'primary', hex: organization.primaryColor || '#14b8a6' },
        { name: 'Sekundär', keyword: 'secondary', hex: organization.secondaryColor || '#f97316' },
        { name: 'Svart', keyword: 'black', hex: '#000000' },
        { name: 'Vit', keyword: 'white', hex: '#ffffff' },
    ], [organization]);

    const hexValueForInput = resolveColor(value, '#000000', organization);

    return (
        <div className="flex items-center gap-2">
            <input 
                type="color" 
                value={hexValueForInput} 
                onChange={e => onChange(e.target.value)} 
                className="w-8 h-8 p-0.5 bg-white dark:bg-black rounded border border-slate-300 dark:border-slate-600 cursor-pointer"
            />
            <div className="flex gap-1">
                {colorOptions.map(opt => (
                    <button 
                        key={opt.keyword} 
                        type="button" 
                        onClick={() => onChange(opt.keyword)} 
                        className={`w-6 h-6 rounded-full border transition-all ${value === opt.keyword ? 'ring-2 ring-offset-1 ring-primary border-transparent' : 'border-slate-200 dark:border-slate-600'}`} 
                        style={{ backgroundColor: opt.hex }} 
                        title={opt.name} 
                    />
                ))}
            </div>
        </div>
    );
};

// --- Color Opacity Control (Local) ---
const ColorOpacityControl: React.FC<{
    value: string;
    onChange: (color: string) => void;
    organization: Organization;
}> = ({ value, onChange, organization }) => {
    const { color, opacity } = React.useMemo(() => {
        const s_value = (value || '').trim();
        let match = s_value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
            return {
                color: `#${toHex(parseInt(match[1]))}${toHex(parseInt(match[2]))}${toHex(parseInt(match[3]))}`,
                opacity: match[4] !== undefined ? parseFloat(match[4]) : 1,
            };
        }
        if (s_value.startsWith('#')) {
            return { color: s_value.slice(0, 7), opacity: 1 };
        }
        return { color: '#000000', opacity: 0.5 };
    }, [value]);

    const handleColorChange = (newColor: string) => {
        const r = parseInt(newColor.slice(1, 3), 16);
        const g = parseInt(newColor.slice(3, 5), 16);
        const b = parseInt(newColor.slice(5, 7), 16);
        onChange(`rgba(${r}, ${g}, ${b}, ${opacity})`);
    };

    const handleOpacityChange = (newOpacity: number) => {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        if (!isNaN(r)) onChange(`rgba(${r}, ${g}, ${b}, ${newOpacity})`);
    };
    
    return (
         <div className="space-y-2 p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 mt-2">
            <div className="flex items-center gap-3">
                <input type="color" value={color} onChange={e => handleColorChange(e.target.value)} className="w-8 h-8 p-0.5 bg-white dark:bg-black rounded border border-slate-300 dark:border-slate-600 cursor-pointer"/>
                <div className="flex-grow">
                    <label className="block text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mb-0.5">Opacitet</label>
                    <input type="range" min="0" max="1" step="0.01" value={opacity} onChange={e => handleOpacityChange(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer" />
                </div>
                <div className="w-10 text-center text-xs font-mono text-slate-500">{Math.round(opacity * 100)}%</div>
            </div>
        </div>
    );
};

// --- Small Color Picker for Effects ---
const EffectColorPicker: React.FC<{
    value: string;
    onChange: (val: string) => void;
    organization: Organization;
}> = ({ value, onChange, organization }) => {
    const hexValue = resolveColor(value, '#000000', organization);
    return (
        <div className="relative group">
            <input 
                type="color" 
                value={hexValue} 
                onChange={e => onChange(e.target.value)} 
                className="w-6 h-6 p-0 rounded-full border border-slate-300 dark:border-slate-600 cursor-pointer overflow-hidden"
                title="Välj färg"
            />
        </div>
    );
};

// --- Text Block Component ---
const TextBlock: React.FC<{
    label: string;
    textValue: string;
    onTextChange: (val: string) => void;
    
    // Style props
    fontFamily: string;
    onFontChange: (val: any) => void;
    
    // NEW: Font Scale props
    fontScale?: number;
    onScaleChange: (val: number) => void;
    defaultScale: number;

    color: string;
    onColorChange: (val: string) => void;
    textAlign: string;
    onAlignChange: (val: any) => void;
    
    // Background props
    bgEnabled: boolean;
    onBgEnabledChange: (val: boolean) => void;
    bgColor: string;
    onBgColorChange: (val: string) => void;

    // Effects props
    shadowType: string;
    onShadowTypeChange: (val: string) => void;
    shadowColor: string;
    onShadowColorChange: (val: string) => void;
    outlineWidth: number;
    onOutlineWidthChange: (val: number) => void;
    outlineColor: string;
    onOutlineColorChange: (val: string) => void;
    
    // AI props (optional)
    onAiSuggest?: () => void;
    onRefine?: (command: string) => void;
    aiLoading?: boolean | string;
    organization: Organization;
    rows?: number;
    
    // Delete action (for extra text boxes)
    onDelete?: () => void;
}> = ({ 
    label, textValue, onTextChange, 
    fontFamily, onFontChange, 
    fontScale, onScaleChange, defaultScale,
    color, onColorChange, 
    textAlign, onAlignChange,
    bgEnabled, onBgEnabledChange,
    bgColor, onBgColorChange,
    shadowType, onShadowTypeChange,
    shadowColor, onShadowColorChange,
    outlineWidth, onOutlineWidthChange,
    outlineColor, onOutlineColorChange,
    onAiSuggest, onRefine, aiLoading, organization, rows = 2,
    onDelete
}) => {
    
    const aiActions = [
        { label: 'Kortare', command: 'shorter' },
        { label: 'Längre', command: 'longer' },
        { label: 'Säljande', command: 'more_salesy' },
        { label: 'Info', command: 'more_informative' },
        { label: 'Förenkla', command: 'simplify_language' },
        { label: 'Förbättra', command: 'improve' },
        { label: 'Emojis', command: 'add_emojis' },
    ];

    const [isExpanded, setIsExpanded] = useState(!onDelete); // Default expanded for main blocks, collapsed for optional ones if initially created empty? Actually always expanded is fine for now.
    const [showAdvanced, setShowAdvanced] = useState(false);

    return (
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow">
            <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    {onDelete && (
                        <button onClick={() => setIsExpanded(!isExpanded)} className="text-slate-400 hover:text-slate-600 mr-1 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                            {isExpanded ? '▼' : '▶'}
                        </button>
                    )}
                    <span className="text-base font-extrabold tracking-tight text-slate-800 dark:text-slate-100">{label}</span>
                </label>
                <div className="flex items-center gap-2.5">
                    {onAiSuggest && (
                        <button
                            type="button"
                            onClick={onAiSuggest}
                            disabled={!!aiLoading}
                            className="flex items-center gap-1 py-1 px-2.5 rounded-lg text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border border-purple-200/50 dark:border-purple-800/30 hover:bg-purple-100/80 transition-all disabled:opacity-50"
                        >
                            <SparklesIcon className="h-3.5 w-3.5 text-purple-500 animate-pulse" />
                            Föreslå med AI
                        </button>
                    )}
                    {onDelete && (
                        <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors" title="Ta bort textruta">
                            <TrashIcon className="h-4.5 w-4.5" />
                        </button>
                    )}
                </div>
            </div>
            
            {isExpanded && (
                <>
                    <textarea 
                        rows={rows} 
                        value={textValue} 
                        onChange={e => onTextChange(e.target.value)} 
                        className="w-full bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 mb-4 focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition-all placeholder:text-slate-400 text-slate-900 dark:text-white"
                        placeholder={`Skriv din ${label.toLowerCase()} här...`}
                    />

                    {/* Inline Design Controls */}
                    <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                        
                        {/* Row 1: Font, Align, Color */}
                        <div className="flex flex-wrap gap-4 items-center">
                            <div className="flex-grow min-w-[150px]">
                                <FontSelector value={fontFamily as any} onChange={onFontChange} />
                            </div>
                            
                            <div className="flex bg-slate-100 dark:bg-slate-900 rounded-xl p-1 gap-1 border border-slate-200/50 dark:border-slate-800">
                                {[
                                    { id: 'left', icon: <TextAlignLeftIcon className="w-4 h-4"/> },
                                    { id: 'center', icon: <TextAlignCenterIcon className="w-4 h-4"/> },
                                    { id: 'right', icon: <TextAlignRightIcon className="w-4 h-4"/> }
                                ].map(opt => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => onAlignChange(opt.id)}
                                        className={`p-2 rounded-lg transition-all ${textAlign === opt.id ? 'bg-white dark:bg-slate-800 text-primary shadow-sm font-semibold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                                    >
                                        {opt.icon}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] uppercase font-bold text-slate-400">Färg:</span>
                                <ColorPaletteInput value={color} onChange={onColorChange} organization={organization} />
                            </div>
                        </div>

                        {/* Row 2: Size Slider */}
                        <div className="flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/10 p-2.5 rounded-xl border border-slate-100 dark:border-slate-900/50">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase w-14 flex-shrink-0">Storlek</label>
                            <input
                                type="range"
                                min="1.0"
                                max="40.0"
                                step="0.5"
                                value={fontScale ?? defaultScale}
                                onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                                className="flex-grow h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <input
                                type="number"
                                min="1.0"
                                max="40.0"
                                step="0.5"
                                value={fontScale ?? defaultScale}
                                onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                                className="w-16 p-2 text-center text-sm font-bold font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary focus:outline-none focus:border-primary"
                            />
                        </div>

                        {/* AI Quick refinements - accessible yet neat */}
                        {onRefine && (
                            <div className="flex flex-wrap gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-700/30">
                                <div className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-400 w-full mb-1 flex items-center gap-1">
                                    <SparklesIcon className="w-3.5 h-3.5 text-purple-500" /> Anpassa eller förfina texten:
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {aiActions.map(({ label: btnLabel, command }) => (
                                        <button
                                            key={command}
                                            type="button"
                                            onClick={() => onRefine(command)}
                                            disabled={!!aiLoading}
                                            className="px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-950/20 hover:text-purple-500 flex items-center justify-center min-w-[55px] shadow-sm cursor-pointer"
                                        >
                                            {aiLoading === `text-${command}` ? <LoadingSpinnerIcon className="h-3 w-3 animate-spin text-purple-500" /> : btnLabel}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Collapsible Advanced Section for Shadow, Outline and Background */}
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-700/30">
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="text-xs font-bold text-primary dark:text-primary/95 flex items-center gap-1.5 p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                                <span className="transition-transform duration-200" style={{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                                <span>{showAdvanced ? 'Dölj' : 'Visa'} avancerade designeffekter</span>
                                <span className="text-[10px] text-slate-400 font-normal">(skugga, kantlinje, textbakgrund)</span>
                            </button>
                            
                            {showAdvanced && (
                                <div className="space-y-4 pt-4 pl-3.5 border-l-2 border-primary/20 dark:border-primary/30 mt-3 animate-fade-in">
                                    {/* Effects Section */}
                                    <div className="flex flex-wrap gap-x-6 gap-y-4 items-center bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-900">
                                        {/* Shadow */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Textskugga</span>
                                            <div className="flex bg-slate-200/70 dark:bg-slate-800 rounded-lg p-0.5">
                                                {[
                                                    { id: 'none', label: 'Inget' },
                                                    { id: 'soft', label: 'Mjuk' },
                                                    { id: 'hard', label: 'Hård' },
                                                    { id: 'glow', label: 'Glöd' }
                                                ].map(opt => (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() => onShadowTypeChange(opt.id)}
                                                        className={`px-2.5 py-1 text-xs rounded-md transition-all ${shadowType === opt.id ? 'bg-white dark:bg-slate-700 shadow-sm text-primary font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'}`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                            {shadowType !== 'none' && (
                                                <EffectColorPicker value={shadowColor} onChange={onShadowColorChange} organization={organization} />
                                            )}
                                        </div>

                                        {/* Outline */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Kantlinje</span>
                                            <input 
                                                type="range" 
                                                min="0" max="5" step="1" 
                                                value={outlineWidth} 
                                                onChange={e => onOutlineWidthChange(parseInt(e.target.value))}
                                                className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary"
                                                title={`${outlineWidth}px`}
                                            />
                                            {outlineWidth > 0 && (
                                                <EffectColorPicker value={outlineColor} onChange={onOutlineColorChange} organization={organization} />
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-900">
                                        <div className="flex-grow">
                                            <ToggleSwitch label="Kontrast-textbakgrund (höjer läsbarheten)" checked={bgEnabled} onChange={onBgEnabledChange} />
                                            {bgEnabled && (
                                                <div className="mt-2 pl-2">
                                                    <ColorOpacityControl value={bgColor} onChange={onBgColorChange} organization={organization} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

// --- Suggestion Popover ---
interface SuggestionPopoverProps {
    suggestions: string[];
    onSelect: (suggestion: string) => void;
    onGenerateNew: () => void;
    onClose: () => void;
    isLoading: boolean;
    title: string;
}

const SuggestionPopover: React.FC<SuggestionPopoverProps> = ({ suggestions, onSelect, onGenerateNew, onClose, isLoading, title }) => {
    return ReactDOM.createPortal(
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in w-80 max-w-[90vw]"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200">{title}</h4>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">&times;</button>
                </div>
                {isLoading ? (
                    <div className="flex items-center justify-center p-10">
                        <LoadingSpinnerIcon className="h-6 w-6 text-primary" />
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-60 overflow-y-auto">
                        {suggestions.map((s, i) => (
                            <button key={i} onClick={() => onSelect(s)} className="w-full text-left p-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                                {s}
                            </button>
                        ))}
                    </div>
                )}
                <div className="p-2 border-t border-slate-200 dark:border-slate-700">
                    <button onClick={onGenerateNew} disabled={isLoading} className="w-full text-center p-2 text-sm font-semibold text-primary hover:bg-primary/10 rounded-md">
                        Generera nya
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export const Step2_Content: React.FC<{
    post: DisplayPost;
    onPostChange: (updatedPost: DisplayPost) => void;
    organization: Organization;
    screen?: any;
}> = ({ post, onPostChange, organization, screen }) => {
    const { showToast } = useToast();
    const [aiLoading, setAiLoading] = useState<string | false>(false);
    const [importStatus, setImportStatus] = useState<{
        type: 'success' | 'warning_image_blocked' | 'error';
        message: string;
    } | null>(null);

    const [activeSuggestions, setActiveSuggestions] = useState<'headline' | 'body' | null>(null);
    const [headlineSuggestions, setHeadlineSuggestions] = useState<string[]>([]);
    const [bodySuggestions, setBodySuggestions] = useState<string[]>([]);
    
    // Undo/Redo
    const [textHistory, setTextHistory] = useState<{ headline: string; body: string; }[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const isTypingRef = useRef(false);

    useEffect(() => {
        const initialState = { headline: post.headline || '', body: post.body || '' };
        setTextHistory([initialState]);
        setHistoryIndex(0);
    }, [post.id]);

    const updateHistory = (newState: { headline: string; body: string; }) => {
        const newHistory = textHistory.slice(0, historyIndex + 1);
        newHistory.push(newState);
        setTextHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    const handleFieldChange = (field: keyof DisplayPost, value: any) => {
        const newPost = { ...post, [field]: value };
        onPostChange(newPost);
        
        if (field === 'headline' || field === 'body') {
            if (!isTypingRef.current) {
                isTypingRef.current = true;
                setTimeout(() => {
                    updateHistory({ headline: newPost.headline || '', body: newPost.body || '' });
                    isTypingRef.current = false;
                }, 500);
            }
        }
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            const prevState = textHistory[newIndex];
            onPostChange({ ...post, ...prevState });
        }
    };

    const handleRedo = () => {
        if (historyIndex < textHistory.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            const nextState = textHistory[newIndex];
            onPostChange({ ...post, ...nextState });
        }
    };

    const handleIdeaSelect = (idea: SkyltIdeSuggestion) => {
        const newState = { headline: idea.headline, body: idea.text };
        onPostChange({
            ...post,
            ...newState,
            internalTitle: idea.headline || 'AI-förslag',
            aiImagePrompt: idea.visual?.imageIdea,
        });
        updateHistory(newState);
        showToast({ message: "Text uppdaterad med AI-förslag.", type: 'info' });
    };

    const fetchHeadlineSuggestions = useCallback(async () => {
        if (!post.body) return;
        setAiLoading('suggest-headline');
        try {
            const suggestions = await generateHeadlineSuggestions(post.body, [post.headline || '']);
            setHeadlineSuggestions(suggestions);
        } catch (error) {
            showToast({ message: "Kunde inte hämta förslag.", type: 'error' });
            setActiveSuggestions(null);
        } finally {
            setAiLoading(false);
        }
    }, [post.body, post.headline, showToast]);

    const fetchBodySuggestions = useCallback(async () => {
        if (!post.headline) return;
        setAiLoading('suggest-body');
        try {
            const suggestions = await generateBodySuggestions(post.headline, [post.body || '']);
            setBodySuggestions(suggestions);
        } catch (error) {
            showToast({ message: "Kunde inte hämta förslag.", type: 'error' });
            setActiveSuggestions(null);
        } finally {
            setAiLoading(false);
        }
    }, [post.headline, post.body, showToast]);

    const handleOpenHeadlineSuggestions = useCallback(() => {
        if (!post.body) { showToast({ message: 'Skriv en brödtext först.', type: 'info' }); return; }
        setActiveSuggestions('headline');
        fetchHeadlineSuggestions();
    }, [post.body, showToast, fetchHeadlineSuggestions]);

    const handleOpenBodySuggestions = useCallback(() => {
        if (!post.headline) { showToast({ message: 'Skriv en rubrik först.', type: 'info' }); return; }
        setActiveSuggestions('body');
        fetchBodySuggestions();
    }, [post.headline, showToast, fetchBodySuggestions]);

    // AI Actions
    const handleAiTextRefine = async (command: string, type: 'headline' | 'body' | 'both') => {
        setAiLoading(`text-${command}`);
        try {
            let newContent;
            const currentContent = { headline: post.headline || '', body: post.body || '' };
    
            switch (command) {
                case 'longer':
                    newContent = await refineTextWithCustomPrompt(currentContent, "Gör texten längre och mer detaljerad, men behåll kärnan.");
                    break;
                case 'more_informative':
                    newContent = await refineTextWithCustomPrompt(currentContent, "Gör texten mer informativ och faktaspäckad.");
                    break;
                case 'improve':
                    newContent = await refineTextWithCustomPrompt(currentContent, "Förbättra texten. Gör den mer engagerande, tydlig och slagkraftig.");
                    break;
                default:
                    newContent = await refineDisplayPostContent(currentContent, command);
            }
            
            // Only update the requested field(s)
            const updates: Partial<DisplayPost> = {};
            if (type === 'headline' || type === 'both') updates.headline = newContent.headline;
            if (type === 'body' || type === 'both') updates.body = newContent.body;

            onPostChange({ ...post, ...updates });
            updateHistory({ headline: updates.headline || post.headline || '', body: updates.body || post.body || '' });
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Ett fel inträffade.', type: 'error' });
        } finally {
            setAiLoading(false);
        }
    };

    // --- Handling Additional Text Elements ---
    
    const handleAddAdditionalText = () => {
        const newElement: AdditionalTextElement = {
            id: `text-${Date.now()}`,
            text: 'Ny text',
            x: 50, y: 50, width: 50,
            fontScale: 5.0,
            color: 'white',
            textAlign: 'center',
            shadowType: 'none',
            outlineWidth: 0
        };
        const currentElements = post.additionalTextElements || [];
        onPostChange({ ...post, additionalTextElements: [...currentElements, newElement] });
    };

    const handleUpdateAdditionalText = (id: string, updates: Partial<AdditionalTextElement>) => {
        const currentElements = post.additionalTextElements || [];
        const newElements = currentElements.map(el => el.id === id ? { ...el, ...updates } : el);
        onPostChange({ ...post, additionalTextElements: newElements });
    };

    const handleRemoveAdditionalText = (id: string) => {
        const currentElements = post.additionalTextElements || [];
        const newElements = currentElements.filter(el => el.id !== id);
        onPostChange({ ...post, additionalTextElements: newElements });
    };

    const handleFetchContentFromUrl = async () => {
        if (!post.realEstateUrl) {
            showToast({ message: 'Ange en URL.', type: 'info' });
            return;
        }
        setAiLoading('fetch-real-estate');
        setImportStatus(null);
        try {
            const data = await extractContentFromUrl(post.realEstateUrl);
            
            // Använd en bild-proxy för att kringgå hotlinking-skydd
            let finalImageUrl = data.imageUrl ? `https://images.weserv.nl/?url=${encodeURIComponent(data.imageUrl)}` : undefined;

            // Om bild-URL saknas eller om den kommer från Hemnet (som blockerar all extern laddning/hotlinking)
            const isHemnetUrl = post.realEstateUrl.toLowerCase().includes('hemnet.se');
            let isImageBlocked = false;

            if (!data.imageUrl || isHemnetUrl) {
                isImageBlocked = true;
                finalImageUrl = undefined; // Ingen bild hämtas pga blockering/saknas
            }

            // Beräkna lämplig textskala och generös separering (y-led) för att förhindra överlappning
            const headlineLength = data.headline ? data.headline.length : 0;
            const bodyLength = data.body ? data.body.length : 0;
            
            const headlineScale = headlineLength > 35 ? 5.5 : (headlineLength > 20 ? 6.5 : 8.0);
            const bodyScale = bodyLength > 100 ? 3.5 : (bodyLength > 60 ? 4.0 : 4.5);

            onPostChange({
                ...post,
                headline: data.headline,
                body: data.body,
                imageUrl: finalImageUrl,
                internalTitle: `Importerad: ${data.headline}`,
                // Sätt generösa standardpositioner och storlekar efter import för att eliminera överlapp helt
                headlinePositionX: 50,
                headlinePositionY: 30, // 30% höjd (övre halvan)
                bodyPositionX: 50,
                bodyPositionY: 70,     // 70% höjd (undre halvan)
                headlineFontScale: headlineScale,
                bodyFontScale: bodyScale
            });

            if (isImageBlocked) {
                setImportStatus({
                    type: 'warning_image_blocked',
                    message: 'Texten har hämtats framgångsrikt! Vi kunde dock inte hämta bilden eftersom webbplatsen (t.ex. Hemnet) blockerar extern bildretrieval på grund av kopieringsskydd. Gå till fliken "3. Media" för att enkelt ladda upp rätt bild manuellt.'
                });
                showToast({ message: 'Text hämtad, men bilden blockerades.', type: 'warning' });
            } else {
                setImportStatus({
                    type: 'success',
                    message: 'Både text och bild hämtades framgångsrikt!'
                });
                showToast({ message: 'Information hämtad!', type: 'success' });
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Kunde inte hämta informationen.';
            setImportStatus({
                type: 'error',
                message: errMsg
            });
            showToast({ message: errMsg, type: 'error' });
        } finally {
            setAiLoading(false);
        }
    };

    if (post.layout === 'webpage') {
        const isBokadirektUrl = (post.webpageUrl || '').toLowerCase().includes('bokadirekt.se');
        // If webpageUrl contains bokadirekt, default webpageUseSmartPortal to true unless user explicitly set it
        const currentUseSmartPortal = post.webpageUseSmartPortal !== undefined 
            ? post.webpageUseSmartPortal 
            : (isBokadirektUrl ? true : false);

        const applyTemplate = (headlineText: string, bodyText: string) => {
            onPostChange({
                ...post,
                webpageUseSmartPortal: true,
                headline: headlineText,
                body: bodyText,
            });
            showToast({ message: 'Mall applicerad!', type: 'success' });
        };

        const handlePasteUrl = async () => {
            try {
                if (!navigator.clipboard) {
                    showToast({ 
                        message: 'Direktpaste stöds inte av din webbläsare. Klicka i textrutan och använd Ctrl+V (Windows) eller Cmd+V (Mac).', 
                        type: 'info' 
                    });
                    return;
                }
                const clipboardText = await navigator.clipboard.readText();
                if (clipboardText) {
                    const trimmedText = clipboardText.trim();
                    const nextIsBokadirekt = trimmedText.toLowerCase().includes('bokadirekt.se');
                    onPostChange({
                        ...post,
                        webpageUrl: trimmedText,
                        webpageUseSmartPortal: post.webpageUseSmartPortal !== undefined ? post.webpageUseSmartPortal : (nextIsBokadirekt ? true : false)
                    });
                    showToast({ message: 'Adressen klistrades in!', type: 'success' });
                } else {
                    showToast({ message: 'Urklippet är tomt. Kopiera en länk först.', type: 'info' });
                }
            } catch (err) {
                console.warn('Clipboard paste failed:', err);
                showToast({ 
                    message: 'Webbläsaren blockerar direktåtkomst till urklipp i denna förhandsvy. Klicka i rutan och tryck Ctrl+V eller Cmd+V på tangentbordet för att klistra in länk.', 
                    type: 'info' 
                });
            }
        };

        return (
            <div className="space-y-6">
                <div className="bg-blue-50/70 dark:bg-blue-900/20 p-5 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2.5 bg-blue-100 dark:bg-blue-800 rounded-xl text-blue-600 dark:text-blue-300 shadow-sm">
                            <LayoutWebpageIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-extrabold text-lg text-blue-900 dark:text-blue-200">Webbsida / Bokningssystem</h3>
                            <p className="text-xs text-blue-800 dark:text-blue-350">
                                Visa en interaktiv bokningskalender, hemsida eller en skräddarsydd QR-skylt.
                            </p>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Webbadress (URL)</label>
                            <div className="flex gap-2">
                                <StyledInput
                                    type="text"
                                    value={post.webpageUrl || ''}
                                    onChange={(e) => {
                                        const nextUrl = e.target.value;
                                        const nextIsBokadirekt = nextUrl.toLowerCase().includes('bokadirekt.se');
                                        onPostChange({
                                            ...post,
                                            webpageUrl: nextUrl,
                                            // Auto-toggle to true if Bokadirekt is selected, to save the user hassle
                                            webpageUseSmartPortal: post.webpageUseSmartPortal !== undefined ? post.webpageUseSmartPortal : (nextIsBokadirekt ? true : false)
                                        });
                                    }}
                                    placeholder="https://bokadirekt.se/..."
                                    className="flex-grow font-mono text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={handlePasteUrl}
                                    className="px-4 py-2 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all shadow-sm hover:scale-[1.01] active:scale-[0.99]"
                                    title="Klistra in länk från urklipp"
                                >
                                    <LinkIcon className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                    <span>Klistra in</span>
                                </button>
                            </div>
                        </div>

                        {/* Smart Info Alert specifically for Cookie Dialog walls (e.g. Bokadirekt) */}
                        {isBokadirektUrl && (
                            <div className="bg-amber-50/80 dark:bg-amber-950/20 p-4 rounded-xl border border-amber-200/50 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300 space-y-2">
                                <div className="flex items-center gap-2 font-bold text-sm">
                                    <SparklesIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                    <span>Bokadirekt Smart-Skylt Rekommenderas!</span>
                                </div>
                                <p className="leading-relaxed font-medium">
                                    Bokadirekt laddar tyvärr alltid in en irriterande <strong>cookie-godkännande panel</strong> i iframes som döljer innehållet på en icke-interaktiv presentationsskärm. 
                                </p>
                                <p className="leading-relaxed font-bold">
                                    Vår inbyggda Smart-QR portal ritar automatiskt upp en vacker, ren och cookie-säker bokningsskylt med QR-kod så kunderna bokar direkt i sina egna mobiler istället!
                                </p>
                            </div>
                        )}

                        {/* Main smart portal mode selector toggle */}
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <span className="text-sm font-bold text-slate-900 dark:text-white block">Säker Smart-QR-vy</span>
                                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Visar en stilren infoyta med QR-kod istället för rå hemsida</span>
                                </div>
                                <ToggleSwitch 
                                    label=""
                                    checked={currentUseSmartPortal} 
                                    onChange={(checked) => handleFieldChange('webpageUseSmartPortal', checked)} 
                                />
                            </div>

                            {currentUseSmartPortal && (
                                <div className="pt-3 border-t border-slate-100 dark:border-slate-700/50 space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Rubrik på skärmen</label>
                                        <StyledInput 
                                            type="text" 
                                            value={post.headline || ''} 
                                            onChange={(e) => handleFieldChange('headline', e.target.value)} 
                                            placeholder="Boka din behandling enkelt!"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Beskrivning / Instruktion</label>
                                        <textarea 
                                            value={post.body || ''} 
                                            onChange={(e) => handleFieldChange('body', e.target.value)} 
                                            placeholder="Skanna QR-koden till höger med din mobilkamera för att se lediga tider hos oss direkt."
                                            rows={2}
                                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-700 dark:text-slate-300"
                                        />
                                    </div>

                                    {/* Template Buttons */}
                                    <div className="space-y-1.5">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Snabbmallar</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            <button 
                                                type="button"
                                                onClick={() => applyTemplate("Boka tid för friskvård", "Se våra lediga tider för massage, friskvård och personlig hälsa. Skanna koden för att säkra din tid!")}
                                                className="text-xs font-semibold py-1 px-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-305 rounded-md hover:bg-slate-200 dark:hover:bg-slate-650 transition-colors"
                                            >
                                                💆 Friskvård & Hälsa
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => applyTemplate("Unna dig en skön stund", "Hitta din nästa lediga behandling hos oss redan idag. Skanna QR-koden med mobilen för att boka din tid!")}
                                                className="text-xs font-semibold py-1 px-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-305 rounded-md hover:bg-slate-200 dark:hover:bg-slate-650 transition-colors"
                                            >
                                                🌸 Behandling & Spa
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => applyTemplate("Smidig tidsbokning", "Öppna vår kalender direkt i mobilen. Skanna koden här bredvid så ser du alla lediga tider i veckan!")}
                                                className="text-xs font-semibold py-1 px-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-305 rounded-md hover:bg-slate-200 dark:hover:bg-slate-650 transition-colors"
                                            >
                                                📅 Standard
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {!currentUseSmartPortal && (
                            <div className="text-[11px] text-slate-550 dark:text-slate-400 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-start gap-2">
                                <span className="text-xl">ℹ️</span>
                                <div className="leading-relaxed">
                                    <strong>IFrame Inbäddning:</strong><br/>
                                    Hela sidan ritas upp på skärmen. OBS: Många externa sidor (som Bokadirekt och sociala medier) tillåter inte inbäddning på grund av säkerhetsregler (CORS) eller visar upprepade cookie-rutor som blockerar vyn.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {/* Still allow internal title editing */}
                 <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Intern titel (endast för dig)</label>
                    <StyledInput type="text" value={post.internalTitle || ''} onChange={(e) => handleFieldChange('internalTitle', e.target.value)} />
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-800 rounded-lg text-emerald-600 dark:text-emerald-300">
                        <LinkIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-emerald-900 dark:text-emerald-200">Smart länkimport</h3>
                        <p className="text-sm text-emerald-800 dark:text-emerald-300">
                            Klistra in valfri länk (t.ex. en nyhetsartikel, produkt eller bostadsannons) så hämtar AI:n text och bild automatiskt.
                        </p>
                    </div>
                </div>
                
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <div className="flex-grow">
                            <StyledInput
                                type="url"
                                value={post.realEstateUrl || ''}
                                onChange={(e) => handleFieldChange('realEstateUrl', e.target.value)}
                                placeholder="https://..."
                            />
                        </div>
                        <button
                            onClick={handleFetchContentFromUrl}
                            disabled={aiLoading === 'fetch-real-estate' || !post.realEstateUrl}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                        >
                            {aiLoading === 'fetch-real-estate' ? (
                                <><LoadingSpinnerIcon className="w-5 h-5" /> Hämtar...</>
                            ) : (
                                <><SparklesIcon className="w-5 h-5" /> Hämta info</>
                            )}
                        </button>
                    </div>

                    {importStatus && (
                        <div className={`p-4 rounded-xl border text-xs flex items-start gap-3 transition-all ${
                            importStatus.type === 'warning_image_blocked' 
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400' 
                                : importStatus.type === 'success'
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400'
                        }`}>
                            <span className="text-base flex-shrink-0">
                                {importStatus.type === 'warning_image_blocked' ? '⚠️' : importStatus.type === 'success' ? '✅' : '❌'}
                            </span>
                            <div className="space-y-1">
                                <p className="font-bold">
                                    {importStatus.type === 'warning_image_blocked' ? 'Text hämtad, men bild blockerades' : importStatus.type === 'success' ? 'Länkimport klar!' : 'Importfel'}
                                </p>
                                <p className="leading-relaxed opacity-95">{importStatus.message}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-800/30">
                <div className="flex items-center gap-2 text-lg font-bold text-purple-900 dark:text-purple-200 pb-3 flex-shrink-0">
                    <SparklesIcon className="h-5 w-5 text-purple-500" />
                    Idétorka? Låt AI hjälpa dig igång
                </div>
                <AIIdeaGenerator
                    onIdeaSelect={handleIdeaSelect}
                    isLoading={!!aiLoading}
                    organization={organization}
                />
            </div>

            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Intern titel (endast för dig)</label>
                        <StyledInput type="text" value={post.internalTitle || ''} onChange={(e) => handleFieldChange('internalTitle', e.target.value)} />
                    </div>
                    <div className="flex items-center gap-1 self-end mb-1">
                        <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed"><ArrowUturnLeftIcon className="h-5 w-5"/></button>
                        <button onClick={handleRedo} disabled={historyIndex >= textHistory.length - 1} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed"><ArrowUturnRightIcon className="h-5 w-5"/></button>
                    </div>
                </div>

                <TextBlock 
                    label="Rubrik"
                    textValue={post.headline || ''}
                    onTextChange={val => handleFieldChange('headline', val)}
                    fontFamily={post.headlineFontFamily || organization.headlineFontFamily || 'display'}
                    onFontChange={val => handleFieldChange('headlineFontFamily', val)}
                    
                    fontScale={post.headlineFontScale}
                    onScaleChange={val => handleFieldChange('headlineFontScale', val)}
                    defaultScale={8.0}

                    color={post.headlineTextColor || post.textColor || 'white'}
                    onColorChange={val => handleFieldChange('headlineTextColor', val)}
                    textAlign={post.headlineTextAlign || post.textAlign || 'center'}
                    onAlignChange={val => handleFieldChange('headlineTextAlign', val)}
                    bgEnabled={post.headlineBackgroundEnabled ?? post.textBackgroundEnabled ?? false}
                    onBgEnabledChange={val => handleFieldChange('headlineBackgroundEnabled', val)}
                    bgColor={post.headlineBackgroundColor || post.textBackgroundColor || 'rgba(0,0,0,0.5)'}
                    onBgColorChange={val => handleFieldChange('headlineBackgroundColor', val)}
                    // Effects props
                    shadowType={post.headlineShadowType || 'none'}
                    onShadowTypeChange={val => handleFieldChange('headlineShadowType', val)}
                    shadowColor={post.headlineShadowColor || '#000000'}
                    onShadowColorChange={val => handleFieldChange('headlineShadowColor', val)}
                    outlineWidth={post.headlineOutlineWidth || 0}
                    onOutlineWidthChange={val => handleFieldChange('headlineOutlineWidth', val)}
                    outlineColor={post.headlineOutlineColor || '#000000'}
                    onOutlineColorChange={val => handleFieldChange('headlineOutlineColor', val)}
                    // AI
                    onAiSuggest={handleOpenHeadlineSuggestions}
                    onRefine={(cmd) => handleAiTextRefine(cmd, 'headline')}
                    aiLoading={aiLoading}
                    organization={organization}
                    rows={2}
                />

                <TextBlock 
                    label="Brödtext"
                    textValue={post.body || ''}
                    onTextChange={val => handleFieldChange('body', val)}
                    fontFamily={post.bodyFontFamily || organization.bodyFontFamily || 'sans'}
                    onFontChange={val => handleFieldChange('bodyFontFamily', val)}
                    
                    fontScale={post.bodyFontScale}
                    onScaleChange={val => handleFieldChange('bodyFontScale', val)}
                    defaultScale={4.8}

                    color={post.bodyTextColor || post.textColor || 'white'}
                    onColorChange={val => handleFieldChange('bodyTextColor', val)}
                    textAlign={post.bodyTextAlign || post.textAlign || 'center'}
                    onAlignChange={val => handleFieldChange('bodyTextAlign', val)}
                    bgEnabled={post.bodyBackgroundEnabled ?? post.textBackgroundEnabled ?? false}
                    onBgEnabledChange={val => handleFieldChange('bodyBackgroundEnabled', val)}
                    bgColor={post.bodyBackgroundColor || post.textBackgroundColor || 'rgba(0,0,0,0.5)'}
                    onBgColorChange={val => handleFieldChange('bodyBackgroundColor', val)}
                    // Effects props
                    shadowType={post.bodyShadowType || 'none'}
                    onShadowTypeChange={val => handleFieldChange('bodyShadowType', val)}
                    shadowColor={post.bodyShadowColor || '#000000'}
                    onShadowColorChange={val => handleFieldChange('bodyShadowColor', val)}
                    outlineWidth={post.bodyOutlineWidth || 0}
                    onOutlineWidthChange={val => handleFieldChange('bodyOutlineWidth', val)}
                    outlineColor={post.bodyOutlineColor || '#000000'}
                    onOutlineColorChange={val => handleFieldChange('bodyOutlineColor', val)}
                    // AI
                    onAiSuggest={handleOpenBodySuggestions}
                    onRefine={(cmd) => handleAiTextRefine(cmd, 'body')}
                    aiLoading={aiLoading}
                    organization={organization}
                    rows={4}
                />
            </div>
            
            {/* --- ADDITIONAL TEXT ELEMENTS --- */}
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex justify-between items-center">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200">Övriga texter</h4>
                    <button onClick={handleAddAdditionalText} className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1">
                        <span>+</span> Lägg till textruta
                    </button>
                </div>
                
                {post.additionalTextElements && post.additionalTextElements.length > 0 ? (
                    <div className="space-y-4">
                        {post.additionalTextElements.map((el, index) => (
                            <TextBlock
                                key={el.id}
                                label={`Extra text ${index + 1}`}
                                textValue={el.text}
                                onTextChange={val => handleUpdateAdditionalText(el.id, { text: val })}
                                
                                fontFamily={el.fontFamily || organization.bodyFontFamily || 'sans'}
                                onFontChange={val => handleUpdateAdditionalText(el.id, { fontFamily: val })}
                                
                                fontScale={el.fontScale}
                                onScaleChange={val => handleUpdateAdditionalText(el.id, { fontScale: val })}
                                defaultScale={5.0}

                                color={el.color || 'white'}
                                onColorChange={val => handleUpdateAdditionalText(el.id, { color: val })}
                                textAlign={el.textAlign || 'center'}
                                onAlignChange={val => handleUpdateAdditionalText(el.id, { textAlign: val })}
                                
                                bgEnabled={el.backgroundEnabled || false}
                                onBgEnabledChange={val => handleUpdateAdditionalText(el.id, { backgroundEnabled: val })}
                                bgColor={el.backgroundColor || 'rgba(0,0,0,0.5)'}
                                onBgColorChange={val => handleUpdateAdditionalText(el.id, { backgroundColor: val })}
                                
                                shadowType={el.shadowType || 'none'}
                                onShadowTypeChange={val => handleUpdateAdditionalText(el.id, { shadowType: val as any })}
                                shadowColor={el.shadowColor || '#000000'}
                                onShadowColorChange={val => handleUpdateAdditionalText(el.id, { shadowColor: val })}
                                outlineWidth={el.outlineWidth || 0}
                                onOutlineWidthChange={val => handleUpdateAdditionalText(el.id, { outlineWidth: val })}
                                outlineColor={el.outlineColor || '#000000'}
                                onOutlineColorChange={val => handleUpdateAdditionalText(el.id, { outlineColor: val })}
                                
                                onDelete={() => handleRemoveAdditionalText(el.id)}
                                // AI not supported for arbitrary extra blocks yet to keep it simple
                                organization={organization}
                                aiLoading={false}
                                onAiSuggest={() => {}}
                                onRefine={() => {}}
                                rows={1}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500 italic">Inga extra textrutor tillagda.</p>
                )}
            </div>

            {activeSuggestions === 'headline' && (
                <SuggestionPopover
                    title="Rubriksförslag"
                    suggestions={headlineSuggestions}
                    isLoading={aiLoading === 'suggest-headline'}
                    onSelect={(suggestion) => {
                        handleFieldChange('headline', suggestion);
                        updateHistory({ headline: suggestion, body: post.body || '' });
                        setActiveSuggestions(null);
                    }}
                    onGenerateNew={fetchHeadlineSuggestions}
                    onClose={() => setActiveSuggestions(null)}
                />
            )}
            {activeSuggestions === 'body' && (
                <SuggestionPopover
                    title="Textförslag"
                    suggestions={bodySuggestions}
                    isLoading={aiLoading === 'suggest-body'}
                    onSelect={(suggestion) => {
                        handleFieldChange('body', suggestion);
                        updateHistory({ headline: post.headline || '', body: suggestion });
                        setActiveSuggestions(null);
                    }}
                    onGenerateNew={fetchBodySuggestions}
                    onClose={() => setActiveSuggestions(null)}
                />
            )}
        </div>
    );
};
