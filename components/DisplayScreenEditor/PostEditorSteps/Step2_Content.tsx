
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { DisplayPost, Organization, SkyltIdeSuggestion } from '../../../types';
import { StyledInput, FontSelector, StyledSelect } from '../../Forms';
import { SparklesIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, LoadingSpinnerIcon, TextAlignLeftIcon, TextAlignCenterIcon, TextAlignRightIcon, ToggleSwitch, LayoutWebpageIcon } from '../../icons';
import { useToast } from '../../../context/ToastContext';
import { 
    refineDisplayPostContent,
    generateHeadlineSuggestions,
    generateBodySuggestions,
    refineTextWithCustomPrompt,
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
    
    // AI props
    onAiSuggest: () => void;
    onRefine: (command: string) => void;
    aiLoading: boolean | string;
    organization: Organization;
    rows?: number;
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
    onAiSuggest, onRefine, aiLoading, organization, rows = 2 
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

    return (
        <div className="bg-slate-50 dark:bg-slate-700/30 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-200">{label}</label>
                <button
                    type="button"
                    onClick={onAiSuggest}
                    disabled={!!aiLoading}
                    className="flex items-center gap-1 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-50"
                >
                    <SparklesIcon className="h-3 w-3" />
                    AI-förslag
                </button>
            </div>
            
            <textarea 
                rows={rows} 
                value={textValue} 
                onChange={e => onTextChange(e.target.value)} 
                className="w-full bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-600 mb-3 focus:ring-2 focus:ring-primary focus:outline-none transition-shadow"
                placeholder={`Skriv din ${label.toLowerCase()} här...`}
            />

            {/* Inline Design Controls */}
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-600/50">
                
                {/* Row 1: Font, Align, Color */}
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex-grow min-w-[140px]">
                        <FontSelector value={fontFamily as any} onChange={onFontChange} />
                    </div>
                    
                    <div className="flex bg-slate-200 dark:bg-slate-600 rounded-lg p-1 gap-1">
                        {[
                            { id: 'left', icon: <TextAlignLeftIcon className="w-4 h-4"/> },
                            { id: 'center', icon: <TextAlignCenterIcon className="w-4 h-4"/> },
                            { id: 'right', icon: <TextAlignRightIcon className="w-4 h-4"/> }
                        ].map(opt => (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => onAlignChange(opt.id)}
                                className={`p-1.5 rounded-md transition-all ${textAlign === opt.id ? 'bg-white dark:bg-slate-800 text-primary shadow-sm' : 'text-slate-500 dark:text-slate-300 hover:text-slate-700'}`}
                            >
                                {opt.icon}
                            </button>
                        ))}
                    </div>

                    <ColorPaletteInput value={color} onChange={onColorChange} organization={organization} />
                </div>

                {/* Row 2: Size Slider */}
                <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase w-12 flex-shrink-0">Storlek</label>
                    <input
                        type="range"
                        min="1.0"
                        max="40.0"
                        step="0.5"
                        value={fontScale ?? defaultScale}
                        onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                        className="flex-grow h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <input
                        type="number"
                        min="1.0"
                        max="40.0"
                        step="0.5"
                        value={fontScale ?? defaultScale}
                        onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                        className="w-16 p-1.5 text-center text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-primary focus:border-primary"
                    />
                </div>

                {/* Effects Section */}
                <div className="flex flex-wrap gap-x-6 gap-y-3 items-center">
                    {/* Shadow */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Skugga</span>
                        <div className="flex bg-slate-200 dark:bg-slate-600 rounded-md p-0.5">
                            {[
                                { id: 'none', label: '🚫' },
                                { id: 'soft', label: '☁️' },
                                { id: 'hard', label: '🧱' },
                                { id: 'glow', label: '✨' }
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => onShadowTypeChange(opt.id)}
                                    className={`px-2 py-1 text-xs rounded transition-all ${shadowType === opt.id ? 'bg-white dark:bg-slate-800 shadow-sm text-primary' : 'text-slate-500 dark:text-slate-300 hover:text-slate-700'}`}
                                    title={opt.id}
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
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Kant</span>
                        <input 
                            type="range" 
                            min="0" max="5" step="1" 
                            value={outlineWidth} 
                            onChange={e => onOutlineWidthChange(parseInt(e.target.value))}
                            className="w-16 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-primary"
                            title={`${outlineWidth}px`}
                        />
                        {outlineWidth > 0 && (
                            <EffectColorPicker value={outlineColor} onChange={onOutlineColorChange} organization={organization} />
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 border-t border-slate-200 dark:border-slate-600/30 pt-3">
                    <div className="flex-grow">
                        <ToggleSwitch label="Textbakgrund" checked={bgEnabled} onChange={onBgEnabledChange} />
                        {bgEnabled && (
                            <ColorOpacityControl value={bgColor} onChange={onBgColorChange} organization={organization} />
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-2">
                    {aiActions.map(({ label: btnLabel, command }) => (
                        <button
                            key={command}
                            type="button"
                            onClick={() => onRefine(command)}
                            disabled={!!aiLoading}
                            className="px-2 py-1 text-[10px] uppercase font-bold rounded-md border transition-all bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-purple-400 hover:text-purple-500 flex items-center justify-center min-w-[50px]"
                        >
                            {aiLoading === `text-${command}` ? <LoadingSpinnerIcon className="h-3 w-3" /> : btnLabel}
                        </button>
                    ))}
                </div>
            </div>
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
}> = ({ post, onPostChange, organization }) => {
    const { showToast } = useToast();
    const [aiLoading, setAiLoading] = useState<string | false>(false);

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

    if (post.layout === 'webpage') {
        return (
            <div className="space-y-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg text-blue-600 dark:text-blue-300">
                            <LayoutWebpageIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-blue-900 dark:text-blue-200">Webbsida / Bokningssystem</h3>
                            <p className="text-sm text-blue-800 dark:text-blue-300">
                                Visa en levande hemsida, bokningskalender eller dashboard.
                            </p>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Webbadress (URL)</label>
                            <StyledInput
                                type="url"
                                value={post.webpageUrl || ''}
                                onChange={(e) => handleFieldChange('webpageUrl', e.target.value)}
                                placeholder="https://bokadirekt.se/..."
                                autoFocus
                            />
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-start gap-2">
                            <span className="text-xl">ℹ️</span>
                            <div>
                                <strong>Automatisk uppdatering:</strong><br/>
                                Sidan laddas om automatiskt varje gång inlägget visas på skärmen.
                                Om detta är det enda inlägget i kanalen, kommer sidan att laddas om enligt den tidsintervall du anger i <em>Steg 4: Publicering</em> (t.ex. var 60:e sekund).
                            </div>
                        </div>
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
