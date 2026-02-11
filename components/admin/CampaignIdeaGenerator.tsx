
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Organization, CampaignIdea, DisplayScreen, DisplayPost } from '../../types';
import { generateCampaignIdeasForEvent, generateSeasonalCampaignIdeas } from '../../services/geminiService';
import { SparklesIcon } from '../icons';
import { PrimaryButton, SecondaryButton } from '../Buttons';
import { StyledSelect } from '../Forms';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../ConfirmDialog';
import { useLocation } from '../../context/StudioContext';

interface CampaignIdeaGeneratorProps {
    isOpen: boolean;
    onClose: () => void;
    event: { name: string; date: Date } | null;
    organization: Organization;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
    onEditDisplayScreen: (screen: DisplayScreen, post?: DisplayPost) => void;
    planningContext?: string;
}

export const CampaignIdeaGenerator: React.FC<CampaignIdeaGeneratorProps> = ({ isOpen, onClose, event, organization, onUpdateOrganization, onEditDisplayScreen, planningContext }) => {
    const { displayScreens } = useLocation();
    const [isLoading, setIsLoading] = useState(false);
    const [ideas, setIdeas] = useState<CampaignIdea[] | null>(null);
    const [followUpSuggestion, setFollowUpSuggestion] = useState<{ question: string; eventName: string; } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { showToast } = useToast();
    const isGeneratingRef = useRef(false);
    const [modalTitle, setModalTitle] = useState('');

    const [step, setStep] = useState<'ideas' | 'configure' | 'generating'>('ideas');
    const [selectedIdea, setSelectedIdea] = useState<CampaignIdea | null>(null);
    const [selectedScreenId, setSelectedScreenId] = useState<string>('');
    const [generationStatus, setGenerationStatus] = useState('');
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);

    useEffect(() => {
        if (displayScreens && displayScreens.length > 0) {
            setSelectedScreenId(displayScreens[0].id);
        }
    }, [displayScreens]);

    const fetchEventIdeas = useCallback(async (eventForIdeas: { name: string, date: Date }) => {
        setModalTitle(`✨ AI-inläggsidéer för "${eventForIdeas.name}"`);
        setIsLoading(true);
        setIdeas(null);
        setFollowUpSuggestion(null);
        setError(null);
        try {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const eventDate = new Date(eventForIdeas.date.getFullYear(), eventForIdeas.date.getMonth(), eventForIdeas.date.getDate());
            const diffTime = eventDate.getTime() - today.getTime();
            const daysUntil = Math.max(0, Math.ceil(diffTime / (1000 * 3600 * 24)));
            const { ideas: fetchedIdeas, followUpSuggestion: suggestion } = await generateCampaignIdeasForEvent(eventForIdeas.name, daysUntil, organization);
            setIdeas(fetchedIdeas);
            setFollowUpSuggestion(suggestion || null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Kunde inte hämta idéer.");
        } finally {
            setIsLoading(false);
        }
    }, [organization]);

    useEffect(() => {
        if (isOpen) {
            if (isGeneratingRef.current) {
                return; 
            }
            setStep('ideas');
            setSelectedIdea(null);
            
            if (event) {
                fetchEventIdeas(event);
            } else if (planningContext) {
                setModalTitle(`✨ AI-inläggsidéer`);
                const fetchSeasonalIdeas = async () => {
                    setIsLoading(true);
                    setIdeas(null);
                    setFollowUpSuggestion(null);
                    try {
                        const { ideas: fetchedIdeas } = await generateSeasonalCampaignIdeas(organization, planningContext);
                        setIdeas(fetchedIdeas);
                        setFollowUpSuggestion(null);
                    } catch (e) {
                        setError(e instanceof Error ? e.message : "Kunde inte hämta idéer.");
                    } finally {
                        setIsLoading(false);
                    }
                };
                fetchSeasonalIdeas();
            }
        } else {
            isGeneratingRef.current = false;
        }
    }, [isOpen, event, organization, planningContext, fetchEventIdeas]);

    const handleSelectIdea = (idea: CampaignIdea) => {
        setSelectedIdea(idea);
        setStep('configure');
    };

    const handleBackToIdeas = () => {
        setSelectedIdea(null);
        setStep('ideas');
    };

    const handleAttemptClose = () => {
        if (step === 'configure' || step === 'generating') {
            setIsConfirmCloseOpen(true);
        } else {
            onClose();
        }
    };
    
    const handleConfirmClose = () => {
        onClose();
        setIsConfirmCloseOpen(false);
    };

    const handleGenerateCampaign = async () => {
        if (!selectedIdea || !selectedScreenId) return;
    
        isGeneratingRef.current = true;
        setStep('generating');
        setGenerationStatus('Skapar inläggsutkast...');
        setError(null);
        try {
            const screen = displayScreens.find(s => s.id === selectedScreenId);
            if (!screen) throw new Error("Valt skyltfönster kunde inte hittas.");
    
            const newPost: DisplayPost = {
                id: `new-${Date.now()}`,
                internalTitle: selectedIdea.headline || 'AI-genererat inlägg',
                headline: selectedIdea.headline,
                body: selectedIdea.text,
                layout: 'image-fullscreen',
                durationSeconds: 15,
                imageUrl: undefined,
                videoUrl: undefined,
                aiImagePrompt: selectedIdea.visual.imageIdea,
                isAiGeneratedImage: false,
                isAiGeneratedVideo: false,
                backgroundColor: 'black',
                textColor: 'white',
                imageOverlayEnabled: false,
                headlineFontFamily: organization.headlineFontFamily,
                bodyFontFamily: organization.bodyFontFamily,
            };
    
            showToast({ message: `Utkast skapat! Öppnar redigeraren för "${screen.name}".`, type: 'success' });
            
            onEditDisplayScreen(screen, newPost);
            onClose();
    
        } catch (e) {
            setError(e instanceof Error ? e.message : "Kunde inte skapa inlägg.");
            setStep('configure');
            isGeneratingRef.current = false;
        } finally {
            setGenerationStatus('');
        }
    };
    
    const handleFollowUpClick = (eventName: string) => {
        fetchEventIdeas({ name: eventName, date: new Date() });
    };

    if (!isOpen) return null;

    let portalRoot = document.getElementById('modal-root');
    if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = 'modal-root';
        document.body.appendChild(portalRoot);
    }

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="text-center py-12">
                   <SparklesIcon className="h-10 w-10 text-primary animate-pulse mx-auto" />
                   <p className="mt-4 text-slate-600 dark:text-slate-300">Genererar kreativa idéer...</p>
               </div>
           );
        }
        if (error && step === 'ideas') {
             return (
                <div className="text-center py-12">
                    <p className="text-red-400">Ett fel inträffade:</p>
                    <p className="text-slate-600 dark:text-slate-300 mt-2">{error}</p>
                </div>
            );
        }

        switch (step) {
            case 'generating':
                return (
                    <div className="text-center py-12">
                        <SparklesIcon className="h-10 w-10 text-primary animate-pulse mx-auto" />
                        <p className="mt-4 text-slate-600 dark:text-slate-300">{generationStatus || 'AI:n arbetar...'}</p>
                    </div>
                );
            case 'configure':
                return (
                    <>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold">Konfigurera Inlägg</h2>
                            <SecondaryButton onClick={handleBackToIdeas}>Tillbaka till idéer</SecondaryButton>
                        </div>
                        <div className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600 mb-6">
                            <h3 className="font-bold text-primary">{selectedIdea?.headline}</h3>
                            <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">{selectedIdea?.text}</p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Lägg till i kanal</label>
                                {displayScreens && displayScreens.length > 0 ? (
                                    <StyledSelect value={selectedScreenId} onChange={e => setSelectedScreenId(e.target.value)}>
                                        {displayScreens.map(screen => <option key={screen.id} value={screen.id}>{screen.name}</option>)}
                                    </StyledSelect>
                                ) : (
                                    <p className="text-sm text-yellow-400 bg-yellow-900/50 p-3 rounded-lg">Du måste skapa ett skyltfönster (en kanal) först.</p>
                                )}
                            </div>
                        </div>
                        {error && <p className="text-red-400 mt-4">{error}</p>}
                    </>
                );
            case 'ideas':
            default:
                return (
                    <>
                        <h2 className="text-2xl font-bold mb-2">{modalTitle}</h2>
                        <div className="space-y-4 mt-6">
                            <p className="text-slate-600 dark:text-slate-300">Här är några förslag. Välj en idé för att låta AI:n bygga ett inlägg.</p>
                            {ideas && ideas.map((idea, index) => (
                                <div key={index} className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div className="flex-grow">
                                        <h3 className="font-bold text-primary">{idea.headline}</h3>
                                        <p className="text-slate-600 dark:text-slate-300 text-sm mt-1 mb-3">{idea.text}</p>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 italic space-y-1">
                                            <p><strong>Visuell Idé:</strong> {idea.visual.imageIdea}</p>
                                            <p><strong>Stil:</strong> {idea.visual.style}, {idea.visual.mood}, {idea.visual.colorPalette}</p>
                                        </div>
                                    </div>
                                    <PrimaryButton onClick={() => handleSelectIdea(idea)} className="flex-shrink-0 self-start sm:self-center">
                                        Använd denna inläggsidé
                                    </PrimaryButton>
                                </div>
                            ))}
                            {followUpSuggestion && (
                                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-600 text-center">
                                    <button
                                        onClick={() => handleFollowUpClick(followUpSuggestion.eventName)}
                                        className="text-sm text-purple-400 italic hover:underline hover:text-purple-300 transition-colors"
                                    >
                                        {followUpSuggestion.question}
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                );
        }
    }

    return ReactDOM.createPortal(
        <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => handleAttemptClose()}>
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                    {renderContent()}
                    <div className="flex justify-end gap-4 mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
                        {step === 'configure' && (
                            <PrimaryButton 
                                onClick={handleGenerateCampaign} 
                                disabled={!selectedScreenId || (displayScreens?.length || 0) === 0}
                            >
                                Skapa Utkast
                            </PrimaryButton>
                        )}
                        <SecondaryButton onClick={handleAttemptClose}>Stäng</SecondaryButton>
                    </div>
                </div>
            </div>
            <ConfirmDialog
                isOpen={isConfirmCloseOpen}
                onClose={() => setIsConfirmCloseOpen(false)}
                onConfirm={handleConfirmClose}
                title="Avbryta skapandet?"
                confirmText="Ja, avbryt"
                variant="destructive"
            >
                <p>Är du säker på att du vill stänga? Dina val kommer inte att sparas och du får börja om från början.</p>
            </ConfirmDialog>
        </>,
        portalRoot
    );
};
