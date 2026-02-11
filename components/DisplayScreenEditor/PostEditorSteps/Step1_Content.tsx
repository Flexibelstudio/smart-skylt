import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { DisplayPost, Organization, SkyltIdeSuggestion } from '../../../types';
import { StyledInput } from '../../Forms';
import { SparklesIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, MicrophoneIcon, LoadingSpinnerIcon, ChevronDownIcon } from '../../icons';
import { useToast } from '../../../context/ToastContext';
import { 
    refineDisplayPostContent,
    generateHeadlineSuggestions,
    generateBodySuggestions,
    refineTextWithCustomPrompt,
} from '../../../services/geminiService';
import AIIdeaGenerator from '../../AIGeneratorScreen';
import { useSpeechRecognition } from '../../../hooks/useSpeechRecognition';

interface SuggestionPopoverProps {
    suggestions: string[];
    onSelect: (suggestion: string) => void;
    onGenerateNew: () => void;
    onClose: () => void;
    isLoading: boolean;
    targetRef: React.RefObject<HTMLElement>;
    title: string;
}

const SuggestionPopover: React.FC<SuggestionPopoverProps> = ({ suggestions, onSelect, onGenerateNew, onClose, isLoading, targetRef, title }) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number, left: number } | null>(null);

    useEffect(() => {
        if (targetRef.current) {
            const rect = targetRef.current.getBoundingClientRect();
            const popoverWidth = 320; // w-80 is 20rem = 320px
            let leftPosition = rect.left + window.scrollX;

            // If the popover would overflow the right side of the screen,
            // align its right edge with the button's right edge instead.
            if (leftPosition + popoverWidth > window.innerWidth) {
                leftPosition = rect.right + window.scrollX - popoverWidth;
            }

            setPosition({
                top: rect.bottom + window.scrollY + 8,
                // Ensure it doesn't go off-screen to the left, with a small margin
                left: Math.max(8, leftPosition),
            });
        }
    }, [targetRef]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node) && targetRef.current && !targetRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [onClose, targetRef]);

    if (!position) return null;

    return ReactDOM.createPortal(
        <div 
            ref={popoverRef}
            className="absolute z-50 bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in w-80"
            style={{ top: position.top, left: position.left }}
        >
            <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200">{title}</h4>
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
        </div>,
        document.body
    );
};


const AiTextActions: React.FC<{
    onRefine: (command: 'shorter' | 'longer' | 'more_salesy' | 'more_informative' | 'simplify_language' | 'improve' | 'add_emojis') => void;
    isLoading: (command: string) => boolean;
}> = ({ onRefine, isLoading }) => {
    const actions = [
        { label: 'Kortare', command: 'shorter' },
        { label: 'Längre', command: 'longer' },
        { label: 'Säljande', command: 'more_salesy' },
        { label: 'Informativ', command: 'more_informative' },
        { label: 'Förenkla', command: 'simplify_language' },
        { label: 'Förbättra', command: 'improve' },
        { label: 'Emojis', command: 'add_emojis' },
    ];

    return (
        <div className="p-2 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
            <div className="flex flex-wrap gap-2 items-center">
                <SparklesIcon className="h-5 w-5 text-purple-500 flex-shrink-0" />
                {actions.map(({ label, command }) => (
                    <button
                        key={command}
                        type="button"
                        onClick={() => onRefine(command as any)}
                        disabled={isLoading(command)}
                        className="px-3 py-1 text-xs font-semibold rounded-full border transition-all bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-primary/70 flex items-center justify-center min-w-[60px]"
                    >
                        {isLoading(command) ? <LoadingSpinnerIcon className="h-4 w-4" /> : label}
                    </button>
                ))}
            </div>
        </div>
    );
};


export const Step1_Content: React.FC<{
    post: DisplayPost;
    onPostChange: (updatedPost: DisplayPost) => void;
    organization: Organization;
}> = ({ post, onPostChange, organization }) => {
    const { showToast } = useToast();
    const [aiLoading, setAiLoading] = useState<string | false>(false);

    const [activeSuggestions, setActiveSuggestions] = useState<'headline' | 'body' | null>(null);
    const [headlineSuggestions, setHeadlineSuggestions] = useState<string[]>([]);
    const [bodySuggestions, setBodySuggestions] = useState<string[]>([]);
    const headlineSuggestRef = useRef<HTMLButtonElement>(null);
    const bodySuggestRef = useRef<HTMLButtonElement>(null);
    
    // Undo/Redo state
    const [textHistory, setTextHistory] = useState<{ headline: string; body: string; }[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const isTypingRef = useRef(false);

    // Initialize history
    useEffect(() => {
        const initialState = { headline: post.headline || '', body: post.body || '' };
        setTextHistory([initialState]);
        setHistoryIndex(0);
    }, [post.id]); // Only on post change

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
            if (!isTypingRef.current) { // Prevents history spam on every keystroke
                isTypingRef.current = true;
                setTimeout(() => {
                    updateHistory({ headline: newPost.headline || '', body: newPost.body || '' });
                    isTypingRef.current = false;
                }, 500); // Debounce manual input for history
            }
        }
    };

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < textHistory.length - 1;

    const handleUndo = () => {
        if (!canUndo) return;
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        const prevState = textHistory[newIndex];
        onPostChange({ ...post, ...prevState });
    };

    const handleRedo = () => {
        if (!canRedo) return;
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        const nextState = textHistory[newIndex];
        onPostChange({ ...post, ...nextState });
    };

    const handleIdeaSelect = (idea: SkyltIdeSuggestion) => {
        const newState = {
            headline: idea.headline,
            body: idea.text,
        };
        onPostChange({
            ...post,
            ...newState,
            internalTitle: idea.headline || 'AI-förslag',
            aiImagePrompt: idea.visual.imageIdea,
            structuredImagePrompt: {
                subject: idea.visual.imageIdea,
                style: idea.visual.style,
                colorTone: idea.visual.colorPalette,
                mood: idea.visual.mood,
                composition: idea.visual.composition,
                lighting: idea.visual.lighting,
            },
        });
        updateHistory(newState);
        showToast({ message: "Text uppdaterad med AI-förslag.", type: 'info' });
    };
    
    // AI Actions
    const handleAiTextRefine = async (command: 'shorter' | 'longer' | 'more_salesy' | 'more_informative' | 'simplify_language' | 'improve' | 'add_emojis') => {
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
    
            onPostChange({ ...post, ...newContent });
            updateHistory(newContent);
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Ett fel inträffade.', type: 'error' });
        } finally {
            setAiLoading(false);
        }
    };

    const fetchHeadlineSuggestions = useCallback(async () => {
        if (!post.body) return;
        setAiLoading('suggest-headline');
        try {
            const suggestions = await generateHeadlineSuggestions(post.body, [post.headline || '']);
            setHeadlineSuggestions(suggestions);
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Ett fel inträffade.', type: 'error' });
            setActiveSuggestions(null);
        } finally {
            setAiLoading(false);
        }
    }, [post.body, post.headline, showToast]);

    const handleOpenHeadlineSuggestions = useCallback(() => {
        if (!post.body) {
            showToast({ message: 'Skriv en brödtext först.', type: 'info' });
            return;
        }
        setActiveSuggestions('headline');
        fetchHeadlineSuggestions();
    }, [post.body, showToast, fetchHeadlineSuggestions]);

    const fetchBodySuggestions = useCallback(async () => {
        if (!post.headline) return;
        setAiLoading('suggest-body');
        try {
            const suggestions = await generateBodySuggestions(post.headline, [post.body || '']);
            setBodySuggestions(suggestions);
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Ett fel inträffade.', type: 'error' });
            setActiveSuggestions(null);
        } finally {
            setAiLoading(false);
        }
    }, [post.headline, post.body, showToast]);

    const handleOpenBodySuggestions = useCallback(() => {
        if (!post.headline) {
            showToast({ message: 'Skriv en rubrik först.', type: 'info' });
            return;
        }
        setActiveSuggestions('body');
        fetchBodySuggestions();
    }, [post.headline, showToast, fetchBodySuggestions]);


    return (
        <div className="space-y-6">
            <div className="bg-slate-100 dark:bg-slate-900/50 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white pb-3 flex-shrink-0">
                    <SparklesIcon className="h-6 w-6 text-purple-500" />
                    Börja med en AI-idé
                </div>
                <AIIdeaGenerator
                    onIdeaSelect={handleIdeaSelect}
                    isLoading={!!aiLoading}
                    organization={organization}
                />
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Intern titel</label>
                    <StyledInput type="text" value={post.internalTitle || ''} onChange={(e) => handleFieldChange('internalTitle', e.target.value)} />
                </div>
                
                <div className="flex justify-end items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400">Ångra/Gör om text:</span>
                    <button onClick={handleUndo} disabled={!canUndo} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed">
                        <ArrowUturnLeftIcon className="h-5 w-5"/>
                    </button>
                     <button onClick={handleRedo} disabled={!canRedo} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed">
                        <ArrowUturnRightIcon className="h-5 w-5"/>
                    </button>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Rubrik</label>
                        <button
                            ref={headlineSuggestRef}
                            type="button"
                            onClick={handleOpenHeadlineSuggestions}
                            disabled={!!aiLoading || !post.body}
                            className="flex items-center gap-1 text-sm font-semibold text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-50"
                        >
                            <SparklesIcon className="h-4 w-4" />
                            Föreslå
                        </button>
                    </div>
                    <textarea rows={2} value={post.headline || ''} onChange={e => handleFieldChange('headline', e.target.value)} className="w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600" />
                </div>
                 <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Brödtext</label>
                         <button
                            ref={bodySuggestRef}
                            type="button"
                            onClick={handleOpenBodySuggestions}
                            disabled={!!aiLoading || !post.headline}
                            className="flex items-center gap-1 text-sm font-semibold text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-50"
                        >
                            <SparklesIcon className="h-4 w-4" />
                            Föreslå
                        </button>
                    </div>
                    <textarea rows={4} value={post.body || ''} onChange={e => handleFieldChange('body', e.target.value)} className="w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600" />
                </div>

                <AiTextActions onRefine={handleAiTextRefine} isLoading={(cmd) => aiLoading === `text-${cmd}`} />
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
                    targetRef={headlineSuggestRef}
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
                    targetRef={bodySuggestRef}
                />
            )}
        </div>
    );
};