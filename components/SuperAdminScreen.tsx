import React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Organization, CustomPage, UserRole, InfoCarousel, InfoMessage, DisplayScreen, DisplayPost, UserData, Tag, SystemSettings, ScreenPairingCode, BrandingOptions, PostTemplate, CampaignIdea, CustomEvent, PhysicalScreen, MediaItem, AiAutomation, SuggestedPost } from '../types';
import { ToggleSwitch, CompactToggleSwitch, MonitorIcon, PencilIcon, TrashIcon, CodeBracketIcon, MagnifyingGlassIcon, SparklesIcon, ShareIcon, DuplicateIcon, ChevronDownIcon, CheckCircleIcon, VideoCameraIcon, PlayIcon, PauseIcon, LightBulbIcon, Cog6ToothIcon } from './icons';
import { getAdminsForOrganization, setAdminRole, inviteUser, getSystemSettings, getPairingCode, pairAndActivateScreen, uploadMediaForGallery, deleteMediaFromStorage, unpairPhysicalScreen, isOffline, callTestFunction, updateDisplayScreen } from '../services/firebaseService';
import { MarkdownRenderer } from './CustomContentScreen';
import { useAuth } from '../context/AuthContext';
import { DisplayPostRenderer } from './DisplayPostRenderer';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from './ConfirmDialog';
import { PrimaryButton, SecondaryButton, DestructiveButton } from './Buttons';
import { StyledInput, StyledSelect } from './Forms';
import { EmptyState } from './EmptyState';
import { getSwedishHolidays } from '../data/holidays';
// FIX: Imported `generateEventReminderText` to resolve a 'Cannot find name' error.
import { generateCampaignIdeasForEvent, generateSeasonalCampaignIdeas, generateEventReminderText, generateDisplayPostCampaign, generateDisplayPostImage } from '../services/geminiService';
import QRCode from 'https://esm.sh/qrcode@1.5.3';
import { Card } from './Card';
import { OrganisationTab } from './OrganisationTab';
import { InputDialog } from './DisplayScreenEditor/Modals';
import { ProactiveRhythmBanner, ProactiveSeasonalBanner } from './ProactiveRhythmBanner';
import { AIGuideModal } from './AIGuideModal';
import { AiAutomationEditorModal } from './AiAutomationEditorModal';
import { useLocation } from '../context/StudioContext';


interface SuperAdminScreenProps {
    organization: Organization;
    adminRole: 'superadmin' | 'admin';
    userRole: UserRole;
    theme: string;
    onUpdateLogos: (organizationId: string, logos: { light: string; dark: string }) => Promise<void>;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
    onUpdateTags: (organizationId: string, tags: Tag[]) => Promise<void>;
    onUpdatePostTemplates: (organizationId: string, templates: PostTemplate[]) => Promise<void>;
    onEditDisplayScreen: (screen: DisplayScreen, post?: DisplayPost) => void;
}

const ShareModal: React.FC<{
    screen: DisplayScreen;
    organization: Organization;
    onClose: () => void;
}> = ({ screen, organization, onClose }) => {
    const [activeTab, setActiveTab] = useState<'embed' | 'link'>('embed');
    const embedUrl = `${window.location.origin}/embed/org/${organization.id}/screen/${screen.id}`;
    const iframeCode = `<iframe src="${embedUrl}" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>`;
    
    const [copiedCode, setCopiedCode] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');

    useEffect(() => {
        QRCode.toDataURL(embedUrl, { width: 256, margin: 1 })
            .then(setQrCodeDataUrl)
            .catch(console.error);
    }, [embedUrl]);

    const handleCopy = (text: string, type: 'code' | 'link') => {
        navigator.clipboard.writeText(text).then(() => {
            if (type === 'code') {
                setCopiedCode(true);
                setTimeout(() => setCopiedCode(false), 2000);
            } else {
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
            }
        });
    };

    const TabButton: React.FC<{
        tabId: 'embed' | 'link';
        children: React.ReactNode;
        icon: React.ReactNode;
    }> = ({ tabId, children, icon }) => (
        <button
            onClick={() => setActiveTab(tabId)}
            className={`flex-1 flex items-center justify-center gap-2 p-3 font-semibold rounded-t-lg transition-colors ${
                activeTab === tabId
                    ? 'bg-white dark:bg-slate-800 text-primary border-b-2 border-primary'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-900/30'
            }`}
        >
            {icon}
            {children}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => onClose()}>
            <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="text-2xl font-bold mb-1">Dela eller Bädda In</h2>
                    <p className="text-slate-600 dark:text-slate-300">Visa innehållsmallen "{screen.name}" på din hemsida eller dela en direktlänk.</p>
                </div>
                <div className="flex bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                    <TabButton tabId="embed" icon={<CodeBracketIcon className="h-5 w-5" />}>Bädda in på hemsida</TabButton>
                    <TabButton tabId="link" icon={<ShareIcon className="h-5 w-5" />}>Direktlänk & QR-kod</TabButton>
                </div>
                
                <div className="p-6">
                    {activeTab === 'embed' && (
                        <div className="space-y-4 animate-fade-in">
                            <p className="text-sm text-slate-600 dark:text-slate-300">För att visa innehållet direkt på din egen hemsida, kopiera och klistra in denna HTML-kod. Detta är standardmetoden för att 'bädda in' innehåll.</p>
                            <div className="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg">
                                <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all font-mono">
                                    <code>{iframeCode}</code>
                                </pre>
                            </div>
                            <div className="flex justify-end">
                                <PrimaryButton onClick={() => handleCopy(iframeCode, 'code')}>
                                    {copiedCode ? 'Kopierad!' : 'Kopiera kod'}
                                </PrimaryButton>
                            </div>
                        </div>
                    )}

                    {activeTab === 'link' && (
                        <div className="space-y-6 animate-fade-in">
                            <div>
                                <h3 className="font-semibold mb-1">Direktlänk</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">Dela denna länk för att låta andra se innehållet i helskärm. Perfekt för e-post eller sociala medier.</p>
                                <div className="flex gap-2">
                                    <input readOnly value={embedUrl} className="w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 font-mono text-sm" />
                                    <PrimaryButton onClick={() => handleCopy(embedUrl, 'link')}>
                                        {copiedLink ? 'Kopierad!' : 'Kopiera'}
                                    </PrimaryButton>
                                </div>
                            </div>
                             <div>
                                <h3 className="font-semibold mb-2">QR-kod</h3>
                                <div className="flex items-center gap-6">
                                    {qrCodeDataUrl ? (
                                        <div className="bg-white p-3 rounded-lg"><img src={qrCodeDataUrl} alt="QR Code" className="w-32 h-32" /></div>
                                    ) : (
                                        <div className="w-32 h-32 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
                                    )}
                                    <div className="space-y-2">
                                        <p className="text-sm text-slate-600 dark:text-slate-300">Skanna koden med en mobil för att snabbt öppna innehållet.</p>
                                        <a href={qrCodeDataUrl} download={`qr-code-${screen.name.replace(/\s+/g, '-')}.png`}>
                                            <SecondaryButton>Ladda ner QR-kod</SecondaryButton>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                 <div className="flex justify-end gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 rounded-b-xl">
                    <SecondaryButton onClick={onClose}>Stäng</SecondaryButton>
                </div>
            </div>
        </div>
    );
};


type AdminTab = 'skyltfonster' | 'organisation' | 'galleri' | 'automation' | 'admin';

const TabButton: React.FC<{
    tabId: AdminTab;
    activeTab: AdminTab;
    setActiveTab: (tabId: AdminTab) => void;
    children: React.ReactNode;
    highlight?: boolean;
}> = ({ tabId, activeTab, setActiveTab, children, highlight }) => {
    const isActive = activeTab === tabId;
    return (
        <button
            onClick={() => setActiveTab(tabId)}
            className={`relative px-4 py-2 text-base font-semibold transition-colors focus:outline-none rounded-t-lg ${isActive
                ? 'bg-white dark:bg-slate-800 text-primary border-b-2 border-primary'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                }`}
            role="tab"
            aria-selected={isActive}
        >
            {children}
            {highlight && !isActive && (
                <span className="absolute top-1 right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </span>
            )}
        </button>
    );
};

interface CampaignIdeaGeneratorForOrgProps {
    isOpen: boolean;
    onClose: () => void;
    event: { name: string; date: Date } | null;
    organization: Organization;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
    onEditDisplayScreen: (screen: DisplayScreen, post?: DisplayPost) => void;
    planningContext?: string;
}

const CampaignIdeaGeneratorForOrg: React.FC<CampaignIdeaGeneratorForOrgProps> = ({ isOpen, onClose, event, organization, onUpdateOrganization, onEditDisplayScreen, planningContext }) => {
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
                return; // Prevent reset during generation/update cycle
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
            // When modal closes, ensure the ref is reset for the next time.
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

    return (
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
        </>
    );
};

interface ProactiveUpcomingEventBannerProps {
    organization: Organization;
    onGenerateIdeas: (event: { name: string; date: Date; icon: string; }) => void;
}

const ProactiveUpcomingEventBanner: React.FC<ProactiveUpcomingEventBannerProps> = ({ organization, onGenerateIdeas }) => {
    const allEventsData = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const holidays = getSwedishHolidays(now.getFullYear()).concat(getSwedishHolidays(now.getFullYear() + 1));
        const customEvents = (organization.customEvents || []).map(ce => ({ date: new Date(`${ce.date}T12:00:00Z`), name: ce.name, icon: ce.icon }));

        const allEvents = [...holidays, ...customEvents];

        const upcomingEvents = allEvents
            .filter(event => event.date >= today)
            .sort((a, b) => a.date.getTime() - b.date.getTime());

        if (upcomingEvents.length === 0) return null;

        const nextEvent = upcomingEvents[0];
        const diffTime = nextEvent.date.getTime() - today.getTime();
        const daysUntil = Math.ceil(diffTime / (1000 * 3600 * 24));
        
        return { nextEvent, daysUntil };
    }, [organization]);


    if (!allEventsData) {
        return null;
    }
    
    const { nextEvent, daysUntil } = allEventsData;

    // Hide if event is today or has passed
    if (daysUntil < 1) {
        return null;
    }

    const reminderText = `${nextEvent.icon} ${nextEvent.name} är om ${daysUntil} ${daysUntil === 1 ? 'dag' : 'dagar'}!`;

    return (
        <div className="bg-purple-50 dark:bg-purple-900/30 px-4 py-3 rounded-xl flex items-center justify-between gap-4 shadow-sm border border-purple-200 dark:border-purple-800 animate-fade-in">
            <p className="font-semibold text-purple-800 dark:text-purple-200">{reminderText}</p>
            <button
                onClick={() => onGenerateIdeas(nextEvent)}
                className="font-bold text-purple-700 dark:text-purple-300 hover:underline flex-shrink-0 text-sm"
            >
                Hämta inläggsidéer →
            </button>
        </div>
    );
};

const CompleteProfileModal: React.FC<{
    isOpen: boolean;
    onSave: (data: Partial<Organization>) => Promise<void>;
    organization: Organization;
}> = ({ isOpen, onSave, organization }) => {
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();
    const [details, setDetails] = useState({
        address: organization.address || '',
        email: organization.email || '',
        phone: organization.phone || '',
        contactPerson: organization.contactPerson || '',
        orgNumber: organization.orgNumber || '',
    });

    useEffect(() => {
        setDetails({
            address: organization.address || '',
            email: organization.email || '',
            phone: organization.phone || '',
            contactPerson: organization.contactPerson || '',
            orgNumber: organization.orgNumber || '',
        });
    }, [organization]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setDetails(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave(details);
            showToast({ message: "Profil uppdaterad. Tack!", type: 'success' });
        } catch (error) {
            showToast({ message: "Kunde inte spara profilen.", type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const isFormValid = details.address.trim() && details.email.trim() && details.phone.trim() && details.contactPerson.trim() && details.orgNumber.trim();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
            <div 
                className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in"
            >
                <form onSubmit={handleSave}>
                    <h2 className="text-2xl font-bold mb-2">Slutför er organisationsprofil</h2>
                    <p className="text-slate-600 dark:text-slate-300 mb-6">Välkommen! För att komma igång behöver vi lite mer information om er organisation. Fyll i fälten nedan.</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Adress</label>
                            <StyledInput type="text" name="address" value={details.address} onChange={handleChange} required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Kontaktperson</label>
                            <StyledInput type="text" name="contactPerson" value={details.contactPerson} onChange={handleChange} required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Organisationsnummer</label>
                            <StyledInput type="text" name="orgNumber" value={details.orgNumber} onChange={handleChange} required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">E-post</label>
                            <StyledInput type="email" name="email" value={details.email} onChange={handleChange} required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Telefon</label>
                            <StyledInput type="tel" name="phone" value={details.phone} onChange={handleChange} required />
                        </div>
                    </div>
                    
                    <div className="flex justify-end mt-8">
                        <PrimaryButton type="submit" loading={isSaving} disabled={!isFormValid}>
                            Spara och fortsätt
                        </PrimaryButton>
                    </div>
                </form>
            </div>
        </div>
    );
};

// NEW: Modal for sharing selected media to channels
const ShareMediaToChannelModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onShare: (targetScreenIds: string[]) => void;
  screens: DisplayScreen[];
  isSharing: boolean;
}> = ({ isOpen, onClose, onShare, screens, isSharing }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen) setSelectedIds(new Set());
    }, [isOpen]);

    if (!isOpen) return null;

    const handleToggle = (screenId: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(screenId)) newSet.delete(screenId);
            else newSet.add(screenId);
            return newSet;
        });
    };

    return (
        <ConfirmDialog
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={() => onShare(Array.from(selectedIds))}
            title="Dela media till kanal(er)"
            confirmText={isSharing ? 'Delar...' : `Dela till ${selectedIds.size} kanal(er)`}
            variant="primary"
        >
            <p className="mb-4">Nya inlägg kommer att skapas för de valda mediefilerna i de kanaler du väljer nedan.</p>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {screens.map(screen => (
                    <label key={screen.id} className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer">
                        <input type="checkbox" checked={selectedIds.has(screen.id)} onChange={() => handleToggle(screen.id)} className="h-5 w-5 rounded text-primary focus:ring-primary" />
                        <span className="font-medium text-slate-800 dark:text-slate-200">{screen.name}</span>
                    </label>
                ))}
            </div>
        </ConfirmDialog>
    );
};

const MediaGalleryManager: React.FC<SuperAdminScreenProps> = ({ organization, onUpdateOrganization }) => {
    const { displayScreens } = useLocation();
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useToast();
    const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null);

    const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
    const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
    const [batchShareModal, setBatchShareModal] = useState(false);

    const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'unused'>(() => {
        try {
            return (localStorage.getItem('mediaGalleryFilter') as any) || 'all';
        } catch (e) {
            return 'all';
        }
    });
    const [sort, setSort] = useState<'newest' | 'oldest' | 'size'>(() => {
        try {
            return (localStorage.getItem('mediaGallerySort') as any) || 'newest';
        } catch (e) {
            return 'newest';
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem('mediaGalleryFilter', filter);
        } catch (e) { console.warn("Could not save media filter to localStorage", e); }
    }, [filter]);

    useEffect(() => {
        try {
            localStorage.setItem('mediaGallerySort', sort);
        } catch (e) { console.warn("Could not save media sort to localStorage", e); }
    }, [sort]);

    const mediaUsageMap = useMemo(() => {
        const usage = new Map<string, string[]>();
        if (!organization.mediaLibrary || !displayScreens) {
            return usage;
        }

        for (const media of organization.mediaLibrary) {
            usage.set(media.id, []);
        }

        for (const screen of displayScreens) {
            for (const post of (screen.posts || [])) {
                const urlsInPost = new Set<string | undefined>();
                urlsInPost.add(post.imageUrl);
                urlsInPost.add(post.videoUrl);
                urlsInPost.add(post.backgroundVideoUrl);
                (post.subImages || []).forEach(si => urlsInPost.add(si.imageUrl));
                (post.collageItems || []).forEach(ci => {
                    if (ci) {
                      urlsInPost.add(ci.imageUrl);
                      urlsInPost.add(ci.videoUrl);
                    }
                });

                for (const url of urlsInPost) {
                    if (url) {
                        const mediaItem = organization.mediaLibrary.find(m => m.url === url);
                        if (mediaItem) {
                            const screens = usage.get(mediaItem.id) || [];
                            if (!screens.includes(screen.name)) {
                                screens.push(screen.name);
                                usage.set(mediaItem.id, screens);
                            }
                        }
                    }
                }
            }
        }
        return usage;
    }, [organization.mediaLibrary, displayScreens]);
    
    const processedMedia = useMemo(() => {
        const library = organization.mediaLibrary || [];
        
        const filtered = library.filter(item => {
            switch (filter) {
                case 'image': return item.type === 'image';
                case 'video': return item.type === 'video';
                case 'unused': return (mediaUsageMap.get(item.id) || []).length === 0;
                case 'all': default: return true;
            }
        });
        
        return filtered.sort((a, b) => {
            switch (sort) {
                case 'oldest': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                case 'size': return (b.sizeBytes || 0) - (a.sizeBytes || 0);
                case 'newest': default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
        });
    }, [organization.mediaLibrary, filter, sort, mediaUsageMap]);


    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const { url, type, size } = await uploadMediaForGallery(organization.id, file, (progress) => {
                setUploadProgress(progress);
            });
            
            const newMediaItem: MediaItem = {
                id: `media-${Date.now()}`,
                type: type as 'image' | 'video',
                url,
                internalTitle: file.name,
                createdAt: new Date().toISOString(),
                createdBy: 'user',
                sizeBytes: size,
            };

            const updatedLibrary = [...(organization.mediaLibrary || []), newMediaItem];
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
            
            showToast({ message: "Media uppladdad!", type: 'success' });

        } catch (error) {
            console.error(error);
            showToast({ message: `Kunde inte ladda upp fil: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
            if(fileInputRef.current) {
                fileInputRef.current.value = ""; // Reset file input
            }
        }
    };

    const handleDelete = async (mediaItem: MediaItem) => {
        if (!window.confirm("Är du säker på att du vill ta bort denna media?")) return;

        try {
            if (mediaItem.url.includes('firebasestorage.googleapis.com')) {
                await deleteMediaFromStorage(mediaItem.url);
            }
            const updatedLibrary = (organization.mediaLibrary || []).filter(item => item.id !== mediaItem.id);
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
            showToast({ message: "Media borttagen.", type: 'success' });
        } catch (error) {
            console.error(error);
            showToast({ message: `Kunde inte ta bort media: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        }
    };
    
    // --- Batch Action Handlers ---
    const handleToggleSelection = (mediaId: string) => {
        setSelectedMediaIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(mediaId)) newSet.delete(mediaId);
            else newSet.add(mediaId);
            return newSet;
        });
    };

    const handleSelectAllVisible = () => setSelectedMediaIds(new Set(processedMedia.map(item => item.id)));
    const handleClearSelection = () => setSelectedMediaIds(new Set());

    const handleBatchDelete = async () => {
        setBatchDeleteConfirm(false);
        const itemsToDelete = (organization.mediaLibrary || []).filter(item => selectedMediaIds.has(item.id));
        
        try {
            await Promise.all(itemsToDelete.map(item => {
                if (item.url.includes('firebasestorage.googleapis.com')) {
                    return deleteMediaFromStorage(item.url);
                }
                return Promise.resolve();
            }));
            const updatedLibrary = (organization.mediaLibrary || []).filter(item => !selectedMediaIds.has(item.id));
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
            showToast({ message: `${itemsToDelete.length} filer togs bort.`, type: 'success' });
        } catch (error) {
            showToast({ message: `Kunde inte ta bort alla filer: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            handleClearSelection();
        }
    };
    
    const handleBatchDownload = () => {
        showToast({ message: `Laddar ner ${selectedMediaIds.size} filer. Du kan behöva godkänna flera nedladdningar.`, type: 'info', duration: 8000 });
        const selectedItems = (organization.mediaLibrary || []).filter(item => selectedMediaIds.has(item.id));
        selectedItems.forEach((item, index) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = item.url;
                const urlParts = item.url.split('?')[0].split('.');
                const extension = urlParts.length > 1 ? urlParts.pop() : (item.type === 'video' ? 'mp4' : 'jpg');
                link.download = `${item.internalTitle.replace(/[^a-z0-9]/gi, '_')}.${extension}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, index * 300);
        });
    };
    
    const handleBatchShareConfirm = async (targetScreenIds: string[]) => {
        const { updateDisplayScreen } = useLocation();
        const selectedItems = (organization.mediaLibrary || []).filter(item => selectedMediaIds.has(item.id));

        try {
            for (const screenId of targetScreenIds) {
                const screen = displayScreens.find(s => s.id === screenId);
                if (!screen) continue;

                const newPosts: DisplayPost[] = selectedItems.map(item => ({
                    id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    internalTitle: `Delat från galleri: ${item.internalTitle}`,
                    layout: item.type === 'image' ? 'image-fullscreen' : 'video-fullscreen',
                    imageUrl: item.type === 'image' ? item.url : undefined,
                    videoUrl: item.type === 'video' ? item.url : undefined,
                    durationSeconds: 15,
                    startDate: new Date().toISOString(),
                }));
                
                const updatedPosts = [...(screen.posts || []), ...newPosts];
                await updateDisplayScreen(screenId, { posts: updatedPosts });
            }
            showToast({ message: `Delade ${selectedItems.length} filer till ${targetScreenIds.length} kanal(er).`, type: 'success' });
        } catch (e) {
            showToast({ message: "Kunde inte dela filerna.", type: 'error' });
        } finally {
            handleClearSelection();
            setBatchShareModal(false);
        }
    };


    const formatBytes = (bytes?: number, decimals = 2) => {
        if (!bytes) return 'N/A';
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    
    const LazyMediaItemThumbnail: React.FC<{
        item: MediaItem;
        usageText: string;
        isSelected: boolean;
        selectionActive: boolean;
        onToggleSelection: (id: string) => void;
        onPreview: (item: MediaItem) => void;
        onDelete: (item: MediaItem) => void;
    }> = ({ item, usageText, isSelected, selectionActive, onToggleSelection, onPreview, onDelete }) => {
        const ref = useRef<HTMLDivElement>(null);
        const [isInView, setIsInView] = useState(false);
        const [hasError, setHasError] = useState(false);

        useEffect(() => {
            const observer = new IntersectionObserver(
                ([entry]) => {
                    if (entry.isIntersecting) {
                        setIsInView(true);
                        observer.disconnect();
                    }
                }, { rootMargin: '200px' }
            );
            if (ref.current) observer.observe(ref.current);
            return () => observer.disconnect();
        }, []);

        const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#E2E8F0"/><text x="50" y="50" font-family="sans-serif" font-size="8" fill="#94A3B8" text-anchor="middle" dominant-baseline="middle">Laddar...</text></svg>`;
        const PLACEHOLDER_URL = `data:image/svg+xml;base64,${btoa(PLACEHOLDER_SVG)}`;
        
        const handleClick = () => {
            if (selectionActive) {
                onToggleSelection(item.id);
            } else {
                onPreview(item);
            }
        };

        return (
             <div ref={ref} className="group flex flex-col gap-2">
                <div 
                    className={`relative aspect-square bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden cursor-pointer transition-all ${isSelected ? 'ring-4 ring-primary' : ''}`}
                    onClick={handleClick}
                >
                    {isInView ? (
                        <>
                            {item.type === 'image' ? (
                                <img src={hasError ? PLACEHOLDER_URL : item.url} alt={item.internalTitle} className="w-full h-full object-cover" onError={() => setHasError(true)} />
                            ) : (
                                <>
                                    <video src={hasError ? undefined : item.url} muted loop playsInline className="w-full h-full object-cover" onError={() => setHasError(true)} onMouseEnter={e => e.currentTarget.play()} onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }} />
                                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none group-hover:bg-black/10 transition-colors">
                                        <PlayIcon className="h-10 w-10 text-white/80 drop-shadow-lg group-hover:opacity-0 transition-opacity" />
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <img src={PLACEHOLDER_URL} alt="Loading..." className="w-full h-full object-contain p-2" />
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex justify-between items-start">
                         <button onClick={(e) => { e.stopPropagation(); onPreview(item); }} className="p-2 bg-slate-100/20 hover:bg-slate-100/40 text-white rounded-full" aria-label="Förhandsgranska"><MagnifyingGlassIcon className="h-4 w-4" /></button>
                         <button onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="p-2 bg-red-600/80 hover:bg-red-500 text-white rounded-full" aria-label="Ta bort"><TrashIcon className="h-4 w-4" /></button>
                    </div>
                    <div className={`absolute top-2 left-2 z-10 transition-opacity ${selectionActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} onClick={e => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelection(item.id)}
                            className="w-5 h-5 rounded text-primary focus:ring-primary border-slate-400 bg-white/50 shadow"
                        />
                    </div>
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{item.internalTitle}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{usageText}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(item.createdAt).toLocaleDateString('sv-SE')}
                        {item.sizeBytes ? ` • ${formatBytes(item.sizeBytes)}` : ''}
                    </p>
                </div>
            </div>
        );
    };

    const FilterButton: React.FC<{ label: string; value: typeof filter; current: typeof filter; onClick: (value: typeof filter) => void; }> = ({ label, value, current, onClick }) => (
        <button
            onClick={() => onClick(value)}
            className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-shadow ${
                current === value 
                ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' 
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
            }`}
        >
            {label}
        </button>
    );

    const allVisibleSelected = processedMedia.length > 0 && processedMedia.every(item => selectedMediaIds.has(item.id));
    const selectionActive = selectedMediaIds.size > 0;

    return (
        <Card title="Galleri" subTitle="Hantera dina återanvändbara bilder och videos.">
            <div className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <h4 className="font-semibold text-lg mb-2">Ladda upp ny media</h4>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/mp4" />
                <PrimaryButton onClick={() => fileInputRef.current?.click()} loading={isUploading} disabled={isUploading}>
                    {isUploading ? `Laddar upp... ${uploadProgress.toFixed(0)}%` : 'Välj fil (bild eller video)'}
                </PrimaryButton>
            </div>
            
            {selectionActive && (
                <div className="bg-primary/10 dark:bg-primary/20 p-3 rounded-lg flex items-center justify-between gap-4 my-4 border border-primary/20 sticky top-16 z-30 animate-fade-in">
                    <div>
                        <span className="font-bold text-primary">{selectedMediaIds.size} filer valda</span>
                        <button onClick={allVisibleSelected ? handleClearSelection : handleSelectAllVisible} className="ml-4 text-sm font-bold text-primary hover:underline">
                            {allVisibleSelected ? 'Avmarkera alla' : 'Markera alla synliga'}
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <SecondaryButton onClick={() => setBatchShareModal(true)}>Dela till kanal...</SecondaryButton>
                        <SecondaryButton onClick={handleBatchDownload}>Ladda ner</SecondaryButton>
                        <DestructiveButton onClick={() => setBatchDeleteConfirm(true)}>Ta bort</DestructiveButton>
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <FilterButton label="Alla filer" value="all" current={filter} onClick={setFilter} />
                    <FilterButton label="Bilder" value="image" current={filter} onClick={setFilter} />
                    <FilterButton label="Videos" value="video" current={filter} onClick={setFilter} />
                    <FilterButton label="Ej i bruk" value="unused" current={filter} onClick={setFilter} />
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                    <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Sortera:</label>
                    <StyledSelect value={sort} onChange={e => setSort(e.target.value as any)}>
                        <option value="newest">Senaste först</option>
                        <option value="oldest">Äldsta först</option>
                        <option value="size">Störst filstorlek</option>
                    </StyledSelect>
                </div>
            </div>

            {processedMedia.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6 mt-6">
                    {processedMedia.map(item => {
                        const usage = mediaUsageMap.get(item.id) || [];
                        const usageText = usage.length > 0 ? `Används i: ${usage.join(', ')}` : 'Ej i bruk';
                        return (
                           <LazyMediaItemThumbnail
                                key={item.id}
                                item={item}
                                usageText={usageText}
                                isSelected={selectedMediaIds.has(item.id)}
                                selectionActive={selectionActive}
                                onToggleSelection={handleToggleSelection}
                                onPreview={setPreviewMedia}
                                onDelete={handleDelete}
                            />
                        );
                    })}
                </div>
            ) : (
                <div className="mt-6">
                    {(organization.mediaLibrary || []).length > 0 ? (
                        <EmptyState 
                            icon={<MagnifyingGlassIcon className="h-12 w-12 text-slate-400" />}
                            title="Inga träffar"
                            message="Inga filer i galleriet matchar dina filterval."
                        />
                    ) : (
                        <EmptyState 
                            icon={<VideoCameraIcon className="h-12 w-12 text-slate-400" />}
                            title="Galleriet är tomt"
                            message="Ladda upp bilder och videos för att enkelt kunna återanvända dem i dina inlägg och collage."
                        />
                    )}
                </div>
            )}
            {previewMedia && (
                <MediaPreviewModal 
                    media={previewMedia} 
                    onClose={() => setPreviewMedia(null)}
                    usageText={(mediaUsageMap.get(previewMedia.id) || []).join(', ') || 'Ej i bruk'}
                />
            )}
            <ConfirmDialog
                isOpen={batchDeleteConfirm}
                onClose={() => setBatchDeleteConfirm(false)}
                onConfirm={handleBatchDelete}
                title={`Ta bort ${selectedMediaIds.size} filer?`}
                confirmText="Ja, ta bort"
            >
                Är du säker? Filerna tas bort permanent från lagringen och galleriet.
            </ConfirmDialog>
            <ShareMediaToChannelModal
                isOpen={batchShareModal}
                onClose={() => setBatchShareModal(false)}
                onShare={handleBatchShareConfirm}
                screens={displayScreens}
                isSharing={isUploading}
            />
        </Card>
    );
};

const MediaPreviewModal: React.FC<{
    media: MediaItem;
    onClose: () => void;
    usageText: string;
}> = ({ media, onClose, usageText }) => {
    const [isExiting, setIsExiting] = useState(false);
    const { showToast } = useToast();

    const handleClose = useCallback(() => {
        setIsExiting(true);
        setTimeout(onClose, 200);
    }, [onClose]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && handleClose();
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleClose]);
    
    const formatBytes = (bytes?: number, decimals = 2) => {
        if (!bytes) return 'N/A';
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    const handleCopyUrl = () => {
        navigator.clipboard.writeText(media.url).then(() => {
            showToast({ message: "URL kopierad!", type: 'success' });
        });
    };

    return (
        <div 
            className={`fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-200 ${isExiting ? 'opacity-0' : 'opacity-100'}`}
            onClick={handleClose}
        >
            <div 
                className={`flex flex-col md:flex-row gap-6 transition-transform duration-200 w-full max-w-4xl max-h-[90vh] ${isExiting ? 'scale-95' : 'scale-100'}`} 
                onClick={e => e.stopPropagation()}
            >
                <div className="flex-grow bg-black/30 rounded-lg flex items-center justify-center overflow-hidden">
                    {media.type === 'image' ? (
                        <img src={media.url} alt="Media preview" className="max-h-full max-w-full object-contain" />
                    ) : (
                        <video src={media.url} controls autoPlay loop className="max-h-full max-w-full object-contain" />
                    )}
                </div>
                <div className="w-full md:w-80 flex-shrink-0 bg-white dark:bg-slate-800 rounded-lg p-6 space-y-4 overflow-y-auto">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white break-words">{media.internalTitle}</h3>
                    <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                        <p><strong>Typ:</strong> {media.type === 'image' ? 'Bild' : 'Video'}</p>
                        <p><strong>Uppladdad:</strong> {new Date(media.createdAt).toLocaleString('sv-SE')}</p>
                        <p><strong>Storlek:</strong> {formatBytes(media.sizeBytes)}</p>
                        <p><strong>Används i:</strong> {usageText}</p>
                    </div>
                    {media.aiPrompt && (
                        <div className="p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg text-xs italic text-slate-500 dark:text-slate-400">
                            <strong>AI-prompt:</strong> {media.aiPrompt}
                        </div>
                    )}
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-2">
                        <PrimaryButton onClick={handleCopyUrl}>Kopiera URL</PrimaryButton>
                        <SecondaryButton onClick={handleClose}>Stäng</SecondaryButton>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const SuperAdminScreen: React.FC<SuperAdminScreenProps> = (props) => {
    const { organization, theme, onUpdateOrganization, onEditDisplayScreen } = props;
    const { displayScreens } = useLocation();
    const [activeTab, setActiveTab] = useState<AdminTab>('skyltfonster');
    
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    const [isSettingsLoading, setIsSettingsLoading] = useState(true);
    
    const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
    const [screenToPreview, setScreenToPreview] = useState<DisplayScreen | null>(null);
    const [screenToShare, setScreenToShare] = useState<DisplayScreen | null>(null);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [isAiGuideModalOpen, setIsAiGuideModalOpen] = useState(false);
    
    const [isBrandingGuideVisible, setIsBrandingGuideVisible] = useState(false);
    const brandingGuideDismissedKey = `smart-skylt-branding-guide-dismissed-${organization.id}`;

    const isBrandingProfileIncomplete = useMemo(() => {
        return !organization.businessDescription || !organization.businessType || organization.businessType.length === 0;
    }, [organization.businessDescription, organization.businessType]);

    useEffect(() => {
        const dismissed = localStorage.getItem(brandingGuideDismissedKey);
        if (isBrandingProfileIncomplete && !dismissed) {
            setIsBrandingGuideVisible(true);
        } else {
            setIsBrandingGuideVisible(false);
        }
    }, [isBrandingProfileIncomplete, brandingGuideDismissedKey]);

    const handleDismissBrandingGuide = () => {
        localStorage.setItem(brandingGuideDismissedKey, 'true');
        setIsBrandingGuideVisible(false);
    };

    const handleGoToBrandingFromGuide = () => {
        setActiveTab('organisation');
        handleDismissBrandingGuide();
    };

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const settings = await getSystemSettings();
                setSystemSettings(settings);
            } catch (error) {
                console.error("Failed to load system settings", error);
            } finally {
                setIsSettingsLoading(false);
            }
        };
        fetchSettings();
    }, []);
    
     useEffect(() => {
        // Check if essential information is missing
        if (organization && (!organization.address || !organization.phone || !organization.orgNumber || !organization.contactPerson)) {
            setIsProfileModalOpen(true);
        } else {
            setIsProfileModalOpen(false);
        }
    }, [organization]);

    const handleSaveProfile = async (data: Partial<Organization>) => {
        await onUpdateOrganization(organization.id, data);
        // The modal will close automatically because the organization prop will update, and the useEffect will set isOpen to false.
    };

    const displayLogoUrl = theme === 'dark' 
        ? (organization.logoUrlDark || organization.logoUrlLight)
        : (organization.logoUrlLight || organization.logoUrlDark);

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8 animate-fade-in pb-12">
            {/* Identity Header */}
            <div className="text-center mb-4 min-h-[64px] flex items-center justify-center">
                {displayLogoUrl ? (
                    <img src={displayLogoUrl} alt={`${organization.name} logotyp`} className="max-h-16 object-contain" />
                ) : (
                    <h1 className="text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">{organization.name}</h1>
                )}
            </div>

            {isBrandingGuideVisible && (
                <BrandingSetupGuide 
                    onGoToBranding={handleGoToBrandingFromGuide} 
                    onDismiss={handleDismissBrandingGuide} 
                />
            )}

            <div className="flex justify-between items-end border-b border-slate-200 dark:border-slate-700">
                <div className="flex" role="tablist">
                    <TabButton tabId="skyltfonster" activeTab={activeTab} setActiveTab={setActiveTab}>
                        Skyltfönster
                    </TabButton>
                    <TabButton 
                        tabId="organisation" 
                        activeTab={activeTab} 
                        setActiveTab={setActiveTab}
                        highlight={isBrandingGuideVisible}
                    >
                        Varumärke
                    </TabButton>
                    <TabButton tabId="galleri" activeTab={activeTab} setActiveTab={setActiveTab}>
                        Galleri
                    </TabButton>
                    <TabButton tabId="automation" activeTab={activeTab} setActiveTab={setActiveTab}>
                        Automation
                    </TabButton>
                    <TabButton tabId="admin" activeTab={activeTab} setActiveTab={setActiveTab}>
                        Administration
                    </TabButton>
                </div>
                <div>
                    {/* // Tidigare snabbguide ersatt med permanent AI-guide-modal för bättre tillgänglighet. */}
                    <SecondaryButton onClick={() => setIsAiGuideModalOpen(true)}>
                        💡 AI-guide
                    </SecondaryButton>
                </div>
            </div>

            <div className="space-y-8">
                {activeTab === 'skyltfonster' && <SkyltfonsterContent {...props} displayScreens={displayScreens} systemSettings={systemSettings} onOpenPairingModal={() => setIsPairingModalOpen(true)} onPreviewScreen={setScreenToPreview} onShareScreen={setScreenToShare} />}
                {activeTab === 'organisation' && <OrganisationTab {...props} />}
                {activeTab === 'galleri' && <MediaGalleryManager {...props} />}
                {activeTab === 'automation' && <AiAutomationContent {...props} />}
                {activeTab === 'admin' && <AdminContent {...props} />}
            </div>
            
            <PairingModal
                isOpen={isPairingModalOpen}
                onClose={() => setIsPairingModalOpen(false)}
                organization={organization}
                systemSettings={systemSettings}
                onPairSuccess={(newScreen) => {
                    // This is now handled by the context listener, but we might keep it for optimistic updates
                }}
            />
            {screenToPreview && (
                <DisplayScreenPreviewModal
                    screen={screenToPreview}
                    organization={organization}
                    onClose={() => setScreenToPreview(null)}
                />
            )}
            {screenToShare && (
                <ShareModal
                    screen={screenToShare}
                    organization={organization}
                    onClose={() => setScreenToShare(null)}
                />
            )}
            <CompleteProfileModal
                isOpen={isProfileModalOpen}
                onSave={handleSaveProfile}
                organization={organization}
            />
            <AIGuideModal
                isOpen={isAiGuideModalOpen}
                onClose={() => setIsAiGuideModalOpen(false)}
            />
        </div>
    );
};

const BrandingSetupGuide: React.FC<{ onGoToBranding: () => void; onDismiss: () => void }> = ({ onGoToBranding, onDismiss }) => {
    return (
        <div className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white p-6 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-6 shadow-lg relative animate-fade-in">
            <button onClick={onDismiss} className="absolute top-3 right-3 text-cyan-100 hover:text-white" title="Dölj guide">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="text-5xl">
                    <SparklesIcon className="w-12 h-12" />
                </div>
                <div>
                    <h3 className="text-2xl font-bold">Börja här för bästa resultat!</h3>
                    <p className="text-cyan-100 mt-1">Fyll i din varumärkesprofil så kan AI:n skapa innehåll som är perfekt anpassat för dig.</p>
                </div>
            </div>
            <PrimaryButton onClick={onGoToBranding} className="bg-white/90 hover:bg-white text-teal-600 font-bold flex-shrink-0">
                Fyll i varumärkesprofil
            </PrimaryButton>
        </div>
    );
};

// --- Content Components for each Tab ---

const ScreenStats: React.FC<{ screen: DisplayScreen }> = ({ screen }) => {
    const now = new Date();

    const activePosts = (screen.posts || []).filter(post => {
        const startDate = post.startDate ? new Date(post.startDate) : null;
        const endDate = post.endDate ? new Date(post.endDate) : null;
        if (startDate && startDate > now) return false;
        if (endDate && endDate < now) return false;
        return true;
    });

    const activePostCount = activePosts.length;
    
    // Logic to calculate days remaining until the last post expires
    let latestEndDate: Date | null = null;
    (screen.posts || []).forEach(post => {
        if (post.endDate) {
            const endDate = new Date(post.endDate);
            if (!latestEndDate || endDate > latestEndDate) {
                latestEndDate = endDate;
            }
        }
    });

    let daysRemaining: number | null = null;
    let daysRemainingText = '';
    let textColorClass = 'text-slate-500 dark:text-slate-400';

    if (latestEndDate && latestEndDate > now) {
        const diffTime = latestEndDate.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (daysRemaining <= 7) {
            textColorClass = 'text-red-500 font-bold';
        } else if (daysRemaining <= 14) {
            textColorClass = 'text-yellow-500';
        }
        
        daysRemainingText = `${daysRemaining} ${daysRemaining === 1 ? 'dag' : 'dagar'} kvar`;
    }

    return (
        <div className="flex items-center gap-4 text-sm font-semibold">
            {daysRemainingText && (
                <span className={textColorClass} title={`Sista inlägget går ut om ${daysRemaining} ${daysRemaining === 1 ? 'dag' : 'dagar'}.`}>
                    {daysRemainingText}
                </span>
            )}
            <span className="text-slate-600 dark:text-slate-300" title={`${activePostCount} inlägg är aktiva just nu.`}>
                {activePostCount} {activePostCount === 1 ? 'inlägg' : 'inlägg'}
            </span>
        </div>
    );
};

interface ScreenManagerProps {
    screens: DisplayScreen[];
    isSaving: boolean;
    onEditDisplayScreen: (screen: DisplayScreen) => void;
    onPreview: (screen: DisplayScreen) => void;
    onShare: (screen: DisplayScreen) => void;
    onCreateScreenTemplate: () => void;
}

const ScreenManager: React.FC<ScreenManagerProps> = ({ screens, isSaving, onEditDisplayScreen, onPreview, onShare, onCreateScreenTemplate }) => {
    const { updateDisplayScreen, deleteDisplayScreen } = useLocation();
    const { showToast } = useToast();
    const [renamingScreenId, setRenamingScreenId] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [screenToDelete, setScreenToDelete] = useState<DisplayScreen | null>(null);

    const confirmDeleteScreen = async () => {
        if (!screenToDelete) return;
        try {
            await deleteDisplayScreen(screenToDelete.id);
            showToast({message: 'Kanalen togs bort.', type: 'success'});
        } catch (e) {
            showToast({message: 'Kunde inte ta bort kanalen.', type: 'error'});
        } finally {
            setScreenToDelete(null);
        }
    };

    const handleSaveName = async (screenId: string) => {
        if (newName.trim() === '') return;
        try {
            await updateDisplayScreen(screenId, { name: newName.trim() });
            showToast({message: 'Namnet uppdaterades.', type: 'success'});
        } catch (e) {
            showToast({message: 'Kunde inte uppdatera namnet.', type: 'error'});
        } finally {
            setRenamingScreenId(null);
        }
    };

    return (
        <>
            <div className="space-y-3">
                {(screens || []).length > 0 ? (
                    screens.map(screen => (
                        <div key={screen.id} className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg flex flex-col sm:flex-row justify-between items-center gap-4 border border-slate-200 dark:border-slate-700">
                            {renamingScreenId === screen.id ? (
                                <div className="w-full flex-grow flex items-center gap-2">
                                    <StyledInput
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveName(screen.id)}
                                    />
                                    <PrimaryButton onClick={() => handleSaveName(screen.id)}>Spara</PrimaryButton>
                                    <SecondaryButton onClick={() => setRenamingScreenId(null)}>Avbryt</SecondaryButton>
                                </div>
                            ) : (
                                <>
                                    <div className="flex-grow flex items-center gap-2 text-center sm:text-left justify-center sm:justify-start">
                                        <p className="font-semibold text-lg text-slate-900 dark:text-white">{screen.name}</p>
                                        <button
                                            onClick={() => { setRenamingScreenId(screen.id); setNewName(screen.name); }}
                                            disabled={isSaving}
                                            className="text-slate-400 hover:text-primary dark:hover:text-primary transition-colors p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600"
                                            aria-label={`Byt namn på ${screen.name}`}
                                        >
                                            <PencilIcon className="h-5 w-5" />
                                        </button>
                                    </div>
                                    <div className="flex items-center flex-wrap justify-center sm:justify-end gap-2">
                                        <div className="flex-shrink-0 mr-2">
                                            <ScreenStats screen={screen} />
                                        </div>
                                        <PrimaryButton onClick={() => onEditDisplayScreen(screen)} disabled={isSaving} className="bg-blue-600 hover:bg-blue-500">Öppna</PrimaryButton>
                                        {/* <button onClick={() => onShare(screen)} disabled={isSaving} title="Dela / Bädda in" className="p-3 rounded-lg bg-slate-600 hover:bg-slate-500 text-white transition-colors"><ShareIcon className="h-5 w-5"/></button> */}
                                        <button onClick={() => onPreview(screen)} disabled={isSaving} title="Förhandsgranska" className="p-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition-colors"><MagnifyingGlassIcon className="h-5 w-5"/></button>
                                        <button onClick={() => setScreenToDelete(screen)} disabled={isSaving} title="Ta bort" className="p-3 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"><TrashIcon className="h-5 w-5"/></button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))
                ) : (
                   <EmptyState 
                        icon={<MonitorIcon className="h-12 w-12 text-slate-400" />}
                        title="Tomt på kanaler"
                        message="Skapa din första kanal för att komma igång."
                        action={{ text: 'Skapa första kanalen', onClick: onCreateScreenTemplate, disabled: isSaving }}
                   />
                )}
            </div>
            
            <ConfirmDialog
                isOpen={!!screenToDelete}
                onClose={() => setScreenToDelete(null)}
                onConfirm={confirmDeleteScreen}
                title="Bekräfta borttagning"
            >
                <p>Är du säker på att du vill ta bort kanalen "{screenToDelete?.name}" och allt dess innehåll? Detta kan inte ångras.</p>
            </ConfirmDialog>
        </>
    );
};


interface SkyltfonsterContentProps extends SuperAdminScreenProps {
    displayScreens: DisplayScreen[];
    systemSettings: SystemSettings | null;
    onOpenPairingModal: () => void;
    onPreviewScreen: (screen: DisplayScreen) => void;
    onShareScreen: (screen: DisplayScreen) => void;
}

const WorkflowGuide: React.FC<{ onDismiss: () => void; }> = ({ onDismiss }) => {
    const Step: React.FC<{ num: number; icon: React.ReactNode; title: string; children: React.ReactNode; color: string; }> = ({ num, icon, title, children, color }) => (
        <div className="flex-1 flex items-start gap-4">
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-base ${color}`}>
                {num}
            </div>
            <div>
                <div className="flex items-center gap-2">
                    <span className="text-slate-500 dark:text-slate-400">{icon}</span>
                    <h4 className="font-bold text-lg text-slate-800 dark:text-white">{title}</h4>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{children}</p>
            </div>
        </div>
    );

    return (
        <div className="bg-white dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative animate-fade-in">
            <button onClick={onDismiss} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="Dölj guide">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 text-center">Så här kommer du igång!</h3>
            <div className="flex flex-col md:flex-row items-start gap-4">
                <Step num={1} icon={<PencilIcon className="h-5 w-5" />} title="Skapa en Kanal" color="bg-blue-500">
                    En kanal är en "spellista" eller mall för vad som ska visas. Du kan ha olika kanaler för olika skärmar, t.ex. en för kassan och en för entrén.
                </Step>
                <div className="hidden md:block text-slate-300 dark:text-slate-600 self-center transform rotate-90 md:rotate-0">
                    <ChevronDownIcon className="h-8 w-8" />
                </div>
                <Step num={2} icon={<MonitorIcon className="h-5 w-5" />} title="Fyll den med Inlägg" color="bg-purple-500">
                    Gå in på "Hantera" för din nya kanal och skapa inlägg. Det är här du lägger till text, bilder och videos som ska visas på skärmen.
                </Step>
                <div className="hidden md:block text-slate-300 dark:text-slate-600 self-center transform rotate-90 md:rotate-0">
                    <ChevronDownIcon className="h-8 w-8" />
                </div>
                 <Step num={3} icon={<CheckCircleIcon className="h-5 w-5" />} title="Anslut Skyltfönster" color="bg-teal-500">
                    När du är nöjd med din kanal, anslut en fysisk TV eller skärm genom att följa instruktionerna nedan. Du "parar ihop" skärmen med din kanal.
                </Step>
            </div>
        </div>
    );
};


const SkyltfonsterContent: React.FC<SkyltfonsterContentProps> = (props) => {
    const { organization, displayScreens, onUpdateOrganization, onEditDisplayScreen, onOpenPairingModal, onPreviewScreen, onShareScreen, systemSettings } = props;
    const { addDisplayScreen } = useLocation();
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();
    const [ideaModalEvent, setIdeaModalEvent] = useState<{ name: string; date: Date } | null>(null);
    const [isWorkflowGuideVisible, setIsWorkflowGuideVisible] = useState(() => {
        try {
            return !localStorage.getItem('onboardingDismissed');
        } catch (e) {
            console.warn("Could not access localStorage. Onboarding guide will be hidden.", e);
            return false;
        }
    });
    const [isRhythmIdeaModalOpen, setIsRhythmIdeaModalOpen] = useState(false);
    const [rhythmContext, setRhythmContext] = useState('');
    const [isSeasonalIdeaModalOpen, setIsSeasonalIdeaModalOpen] = useState(false);
    const [seasonalContext, setSeasonalContext] = useState('');
    
    const physicalScreens = organization.physicalScreens || [];


    const handleGenerateIdeasClick = (event: { name: string; date: Date; icon: string; }) => {
        setIdeaModalEvent(event);
    };
    
    const handleDismissWorkflowGuide = () => {
        try {
            localStorage.setItem('onboardingDismissed', 'true');
            setIsWorkflowGuideVisible(false);
        } catch (e) {
            console.error("Failed to set localStorage item", e);
            // Still hide it for the current session even if localStorage fails
            setIsWorkflowGuideVisible(false);
        }
    };
    
    const handleCreateScreenTemplate = async () => {
        setIsSaving(true);
        try {
            const newScreen: Omit<DisplayScreen, 'id'> = {
                name: 'Ny Kanal',
                isEnabled: true,
                posts: [],
                aspectRatio: '16:9',
            };
            await addDisplayScreen(newScreen);
            showToast({ message: "Ny kanal skapad.", type: 'success' });
        } catch(e) {
             console.error(e);
             showToast({ message: `Ett fel uppstod: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-8">
            <ProactiveUpcomingEventBanner
                organization={organization}
                onGenerateIdeas={handleGenerateIdeasClick}
            />

            {isWorkflowGuideVisible && <WorkflowGuide onDismiss={handleDismissWorkflowGuide} />}

            <ProactiveSeasonalBanner
                organization={organization}
                onGenerateIdeas={(context) => {
                    setSeasonalContext(context);
                    setIsSeasonalIdeaModalOpen(true);
                }}
            />
            
            <ProactiveRhythmBanner
                organization={organization}
                onGenerateIdeas={(context) => {
                    setRhythmContext(context);
                    setIsRhythmIdeaModalOpen(true);
                }}
            />

            <div>
                <Card 
                    title="Dina kanaler" 
                    subTitle="Skapa och hantera kanaler som sedan kan visas på dina skyltfönster." 
                    saving={isSaving}
                    actions={
                        <SecondaryButton onClick={handleCreateScreenTemplate} disabled={isSaving}>
                            Skapa ny kanal
                        </SecondaryButton>
                    }
                >
                    <ScreenManager
                        screens={displayScreens}
                        isSaving={isSaving}
                        onEditDisplayScreen={onEditDisplayScreen}
                        onPreview={onPreviewScreen}
                        onShare={onShareScreen}
                        onCreateScreenTemplate={handleCreateScreenTemplate}
                    />
                </Card>

                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <Card 
                        title="Anslutna skyltfönster" 
                        subTitle={`Här ser du vilka skärmar som är kopplade till dina kanaler. Du har ${physicalScreens.length} anslutna skyltfönster.`} 
                        saving={isSaving}
                        actions={
                            <PrimaryButton onClick={onOpenPairingModal} className="bg-teal-600 hover:bg-teal-500">
                                Anslut nytt skyltfönster
                            </PrimaryButton>
                        }
                    >
                        <PhysicalScreenManager 
                            organization={organization}
                            allDisplayScreens={displayScreens}
                            onUpdateOrganization={onUpdateOrganization}
                        />
                    </Card>
                </div>
            </div>

            <CampaignIdeaGeneratorForOrg
                isOpen={!!ideaModalEvent}
                onClose={() => setIdeaModalEvent(null)}
                event={ideaModalEvent}
                organization={organization}
                onUpdateOrganization={onUpdateOrganization}
                onEditDisplayScreen={onEditDisplayScreen}
            />
            <CampaignIdeaGeneratorForOrg
                isOpen={isRhythmIdeaModalOpen}
                onClose={() => setIsRhythmIdeaModalOpen(false)}
                event={{ name: `Inläggsförslag`, date: new Date() }}
                organization={organization}
                onUpdateOrganization={onUpdateOrganization}
                onEditDisplayScreen={onEditDisplayScreen}
                planningContext={rhythmContext}
            />
            <CampaignIdeaGeneratorForOrg
                isOpen={isSeasonalIdeaModalOpen}
                onClose={() => setIsSeasonalIdeaModalOpen(false)}
                event={{ name: `Idéer baserat på förra året`, date: new Date() }}
                organization={organization}
                onUpdateOrganization={onUpdateOrganization}
                onEditDisplayScreen={onEditDisplayScreen}
                planningContext={seasonalContext}
            />
        </div>
    );
};


// --- NEW Component to manage the list of physical screens
const PhysicalScreenManager: React.FC<{ 
    organization: Organization;
    allDisplayScreens: DisplayScreen[];
    onUpdateOrganization: (orgId: string, data: Partial<Organization>) => Promise<void>;
}> = ({ organization, allDisplayScreens, onUpdateOrganization }) => {
    const { showToast } = useToast();
    const [screenToRename, setScreenToRename] = useState<PhysicalScreen | null>(null);
    const [screenToDisconnect, setScreenToDisconnect] = useState<PhysicalScreen | null>(null);
    const physicalScreens = organization.physicalScreens || [];
    
    const getChannelName = (displayScreenId: string) => {
        return allDisplayScreens.find(s => s.id === displayScreenId)?.name || 'Okänd kanal';
    };

    const handleSaveName = async (newName: string) => {
        if (!screenToRename) return;
        const updatedScreens = physicalScreens.map(s => 
            s.id === screenToRename.id ? { ...s, name: newName } : s
        );
        try {
            await onUpdateOrganization(organization.id, { physicalScreens: updatedScreens });
            showToast({ message: "Namnet har ändrats.", type: 'success' });
        } catch (e) {
            showToast({ message: "Kunde inte ändra namnet.", type: 'error' });
        } finally {
            setScreenToRename(null);
        }
    };

    const confirmDisconnect = async () => {
        if (!screenToDisconnect) return;
        try {
            await unpairPhysicalScreen(organization.id, screenToDisconnect.id);
            // The UI will update automatically via the onSnapshot listener in StudioContext for online mode.
            // For offline mode, we need to trigger a state update manually.
            if (isOffline) {
                const updatedScreens = (organization.physicalScreens || []).filter(s => s.id !== screenToDisconnect.id);
                // This prop chain eventually updates the context state, forcing a re-render.
                await onUpdateOrganization(organization.id, { physicalScreens: updatedScreens });
            }
            showToast({ message: "Skyltfönstret har kopplats från.", type: 'success' });
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "Ett okänt fel inträffade.";
            showToast({ message: `Kunde inte koppla från: ${errorMessage}`, type: 'error' });
            if ((window as any).DEBUG_MODE) {
                console.error("Full unpair error object:", e);
            }
        } finally {
            setScreenToDisconnect(null);
        }
    };

    return (
        <>
            <div className="space-y-3">
                {physicalScreens.length > 0 ? (
                    physicalScreens.map(screen => (
                        <div key={screen.id} className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg flex flex-col sm:flex-row justify-between items-center gap-4 border border-slate-200 dark:border-slate-700">
                            <div className="flex-grow text-center sm:text-left">
                                <p className="font-semibold text-lg text-slate-900 dark:text-white">{screen.name}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Visar: "{getChannelName(screen.displayScreenId)}"</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <SecondaryButton onClick={() => setScreenToRename(screen)}>Byt namn</SecondaryButton>
                                <DestructiveButton onClick={() => setScreenToDisconnect(screen)}>Koppla från</DestructiveButton>
                            </div>
                        </div>
                    ))
                ) : (
                    <EmptyState 
                        icon={<MonitorIcon className="h-12 w-12 text-slate-400" />}
                        title="Inga skyltfönster anslutna"
                        message="Använd knappen 'Anslut Skyltfönster till Kanal' för att para ihop en TV och aktivera din första licens."
                    />
                )}
            </div>

            <InputDialog
                isOpen={!!screenToRename}
                onClose={() => setScreenToRename(null)}
                onSave={handleSaveName}
                title="Byt namn på skyltfönster"
                labelText="Nytt namn"
                initialValue={screenToRename?.name || ''}
                saveText="Spara namn"
            />

            <ConfirmDialog
                isOpen={!!screenToDisconnect}
                onClose={() => setScreenToDisconnect(null)}
                onConfirm={confirmDisconnect}
                title="Koppla från skyltfönster"
                confirmText="Ja, koppla från"
            >
                <p>Är du säker på att du vill koppla från "{screenToDisconnect?.name}"? Skärmen kommer att återgå till anslutningsläget och behöver paras ihop på nytt för att visa innehåll.</p>
            </ConfirmDialog>
        </>
    );
};

const AdminContent: React.FC<SuperAdminScreenProps> = ({ organization, adminRole, onUpdateOrganization }) => {
    const [name, setName] = useState(organization.name);
    const [address, setAddress] = useState(organization.address || '');
    const [email, setEmail] = useState(organization.email || '');
    const [phone, setPhone] = useState(organization.phone || '');
    const [contactPerson, setContactPerson] = useState(organization.contactPerson || '');
    const [orgNumber, setOrgNumber] = useState(organization.orgNumber || '');
    const [isSavingOrgDetails, setIsSavingOrgDetails] = useState(false);
    const [isTestingFunction, setIsTestingFunction] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        setName(organization.name);
        setAddress(organization.address || '');
        setEmail(organization.email || '');
        setPhone(organization.phone || '');
        setContactPerson(organization.contactPerson || '');
        setOrgNumber(organization.orgNumber || '');
    }, [organization]);
    
    const handleSaveGrunduppgifter = async () => {
        setIsSavingOrgDetails(true);
        try {
            await onUpdateOrganization(organization.id, { 
                name: name.trim(),
                address: address.trim(),
                email: email.trim(),
                phone: phone.trim(),
                contactPerson: contactPerson.trim(),
                orgNumber: orgNumber.trim(),
            });
            showToast({ message: "Organisationsuppgifter sparade.", type: 'success' });
        } catch (e) {
            showToast({ message: `Kunde inte spara: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsSavingOrgDetails(false);
        }
    };
    
    const isGrunduppgifterDirty = 
        name.trim() !== organization.name ||
        address.trim() !== (organization.address || '') ||
        email.trim() !== (organization.email || '') ||
        phone.trim() !== (organization.phone || '') ||
        contactPerson.trim() !== (organization.contactPerson || '') ||
        orgNumber.trim() !== (organization.orgNumber || '');

    const handleTestCloudFunction = async () => {
        setIsTestingFunction(true);
        try {
            const result = await callTestFunction();
            console.log("Svar från Cloud Function:", result);
            showToast({
                message: result.message || "Okänt svar från funktionen.",
                type: 'success',
                duration: 8000
            });
        } catch (error) {
            console.error(error);
            showToast({
                message: `Fel vid anrop: ${error instanceof Error ? error.message : 'Okänt fel'}`,
                type: 'error',
                duration: 8000
            });
        } finally {
            setIsTestingFunction(false);
        }
    };

    return (
        <div className="space-y-8">
            <Card title="Grunduppgifter" saving={isSavingOrgDetails}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Organisationsnamn</label>
                        <StyledInput type="text" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Organisationsnummer</label>
                        <StyledInput type="text" value={orgNumber} onChange={e => setOrgNumber(e.target.value)} />
                    </div>
                     <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Adress</label>
                        <StyledInput type="text" value={address} onChange={e => setAddress(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Kontaktperson</label>
                        <StyledInput type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">E-post</label>
                        <StyledInput type="email" value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Telefon</label>
                        <StyledInput type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
                    </div>
                </div>
                 <div className="flex justify-end mt-4">
                    <PrimaryButton 
                        onClick={handleSaveGrunduppgifter} 
                        disabled={!isGrunduppgifterDirty} 
                        loading={isSavingOrgDetails}
                        title={!isGrunduppgifterDirty ? "Inga ändringar att spara" : ""}
                    >
                        Spara
                    </PrimaryButton>
                </div>
            </Card>

            <Card title="Användare">
                <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                    <h4 className="font-semibold text-lg text-slate-900 dark:text-white">Kontakta oss för att lägga till nya användare</h4>
                    <p className="mt-2 text-slate-600 dark:text-slate-300">
                        För att lägga till en ny administratör eller innehållsskapare, vänligen skicka ett mail till <a href="mailto:info@flexibelfriskvardhalsa.se" className="text-primary font-semibold hover:underline">info@flexibelfriskvardhalsa.se</a> med personens e-postadress och önskad roll.
                    </p>
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                        <h5 className="font-semibold text-slate-800 dark:text-slate-200">Roller:</h5>
                        <ul className="mt-2 space-y-2 list-disc list-inside text-slate-600 dark:text-slate-300">
                            <li>
                                <strong className="font-semibold text-slate-800 dark:text-slate-200">Organisationsadmin:</strong> Har fullständig tillgång att hantera allt för er organisation, inklusive skyltfönster, varumärke, innehåll och andra användare.
                            </li>
                            <li>
                                <strong className="font-semibold text-slate-800 dark:text-slate-200">Innehållsskapare:</strong> Har begränsad tillgång till att endast skapa och hantera innehåll (skyltfönster och inlägg). Kan inte ändra varumärkesinställningar eller hantera användare.
                            </li>
                        </ul>
                    </div>
                </div>
            </Card>

            {adminRole === 'superadmin' && (
                 <Card title="Utvecklarverktyg">
                    <div className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <h4 className="font-semibold text-lg mb-2">Testa Cloud Function</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Denna knapp anropar en testfunktion (`testFunction`) i Firebase för att verifiera att kopplingen mellan frontend och backend fungerar. Svaret visas som en notis.
                        </p>
                        <PrimaryButton
                            onClick={handleTestCloudFunction}
                            loading={isTestingFunction}
                            disabled={isTestingFunction}
                        >
                            Kör testfunktion
                        </PrimaryButton>
                    </div>
                </Card>
            )}
        </div>
    );
};

const PairingModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    organization: Organization;
    systemSettings: SystemSettings | null;
    onPairSuccess: (newScreen: PhysicalScreen) => void;
}> = ({ isOpen, onClose, organization, systemSettings, onPairSuccess }) => {
    const { displayScreens } = useLocation();
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    const [step, setStep] = useState<'code' | 'assign' | 'success'>('code');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [codeInput, setCodeInput] = useState('');
    
    const [displayScreenId, setDisplayScreenId] = useState('');
    const [physicalScreenName, setPhysicalScreenName] = useState('');
    
    useEffect(() => {
        if (isOpen) {
            setStep('code');
            setIsLoading(false);
            setError('');
            setCodeInput('');
            setDisplayScreenId('');
            setPhysicalScreenName('');
        }
    }, [isOpen]);

    const physicalScreensCount = organization.physicalScreens?.length || 0;
    const isFirstScreen = physicalScreensCount === 0;
    const discount = organization.discountScreen || 0;

    const confirmationText = useMemo(() => {
        if (!systemSettings) return 'En ny licens kommer att aktiveras.';

        const activationDate = new Date();
        const year = activationDate.getFullYear();
        const month = activationDate.getMonth(); // 0-11

        const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
        const remainingDays = daysInCurrentMonth - activationDate.getDate() + 1;

        const nextMonthDate = new Date(year, month + 1, 1);
        const periodEnd = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1, 0);

        const nextMonthDays = new Date(year, month + 2, 0).getDate();
        const daysToBill = remainingDays + nextMonthDays;

        const periodStartStr = activationDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
        const periodEndStr = periodEnd.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
        const periodText = `${periodStartStr} – ${periodEndStr} (${daysToBill} dagar)`;

        const helperText = "Inkluderar delmånad fram till månadsskifte + nästa hela månad för synkroniserad fakturering.";

        if (isFirstScreen) {
            const basePrice = systemSettings?.basePriceIncludingFirstScreen ?? 0;
            const finalMonthlyPrice = basePrice * (1 - discount / 100);
            
            const partialMonthCost = (remainingDays / daysInCurrentMonth) * finalMonthlyPrice;
            const totalInitialCost = partialMonthCost + finalMonthlyPrice;

            const nextRegularBillDate = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 1);

            return `## Aktivera ert abonnemang\n\nDu ansluter er första skärm, vilket aktiverar ert grundabonnemang.\n\n**Första fakturan (${periodText}):**\n**${Math.round(totalInitialCost).toLocaleString('sv-SE')} kr** (exkl. moms)\n\n*${helperText}*\n\nNästa ordinarie faktura (för perioden som börjar ${nextRegularBillDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}) kommer att vara på **${Math.round(finalMonthlyPrice).toLocaleString('sv-SE')} kr/mån**.`;
        } else { // It's an additional screen
            const additionalMonthlyCost = systemSettings?.pricePerScreenAdditional ?? 0;
            const finalMonthlyPrice = additionalMonthlyCost * (1 - discount / 100);

            const partialMonthCost = (remainingDays / daysInCurrentMonth) * finalMonthlyPrice;
            const totalInitialCost = partialMonthCost + finalMonthlyPrice;

            const priceText = `**Kostnad för första perioden (${periodText}):**\n**${Math.round(totalInitialCost).toLocaleString('sv-SE')} kr** (exkl. moms)\n\n*${helperText}*\n\nDärefter läggs den löpande kostnaden på **${Math.round(finalMonthlyPrice).toLocaleString('sv-SE')} kr/mån** till på er faktura.`;

            return `## Anslut ett till skyltfönster\n\nDu är på väg att ansluta ytterligare en skärm. Ni har för närvarande ${physicalScreensCount} anslutna skyltfönster.\n\n${priceText}`;
        }
    }, [systemSettings, isFirstScreen, physicalScreensCount, discount]);


    const handleVerifyCode = async () => {
        setIsLoading(true);
        setError('');
        const code = codeInput.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        if (code.length !== 6) {
            setError('Koden måste vara 6 tecken lång.');
            setIsLoading(false);
            return;
        }
        try {
            const codeDoc = await getPairingCode(code);
            if (codeDoc && codeDoc.status === 'pending') {
                setStep('assign');
            } else {
                setError('Ogiltig eller redan använd kod.');
            }
        } catch (e) {
            setError('Kunde inte verifiera koden. Försök igen.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleAssign = async () => {
        if (!displayScreenId || !physicalScreenName.trim() || !currentUser) return;
        setIsLoading(true);
        setError('');
        try {
            const newScreen = await pairAndActivateScreen(
                codeInput.replace(/[^A-Z0-9]/gi, '').toUpperCase(),
                organization.id,
                currentUser.uid,
                { name: physicalScreenName.trim(), displayScreenId }
            );
            
            onUpdateOrganization(organization.id, { physicalScreens: [...(organization.physicalScreens || []), newScreen]});
            
            showToast({ message: `Skärmen "${newScreen.name}" ansluten!`, type: 'success' });

            setStep('success');
        } catch(e) {
             setError(`Kunde inte ansluta skärmen: ${e instanceof Error ? e.message : 'Okänt fel'}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => onClose()}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                {step === 'code' && (
                    <>
                        <h2 className="text-2xl font-bold mb-2">Anslut ett nytt skyltfönster</h2>
                        <p className="text-slate-600 dark:text-slate-300 mb-6">
                            Öppna webbläsaren på den nya skärmen och skriv in den korta adressen: <strong className="font-mono text-primary bg-slate-100 dark:bg-slate-900/50 px-2 py-1 rounded-md">skylt.smartskylt.se</strong>.
                            Skärmen visar då en 6-siffrig kod. Ange koden här för att para ihop skärmen med en av dina kanaler.
                        </p>
                        <StyledInput 
                            value={codeInput}
                            onChange={(e) => setCodeInput(e.target.value)}
                            placeholder="Ange 6-siffrig kod"
                            maxLength={7}
                            className="text-center text-3xl font-mono tracking-widest"
                            disabled={isLoading}
                        />
                         {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}
                        <div className="flex justify-end gap-4 mt-6">
                            <SecondaryButton onClick={onClose} disabled={isLoading}>Avbryt</SecondaryButton>
                            <PrimaryButton onClick={handleVerifyCode} disabled={codeInput.length < 6} loading={isLoading}>
                                Anslut
                            </PrimaryButton>
                        </div>
                    </>
                )}
                {step === 'assign' && (
                    <>
                        <h2 className="text-2xl font-bold mb-2">Aktivera & Konfigurera</h2>
                        <p className="text-slate-600 dark:text-slate-300 mb-6">Namnge skyltfönstret och välj vilken kanal den ska visa.</p>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Namnge skyltfönstret</label>
                                <StyledInput value={physicalScreenName} onChange={e => setPhysicalScreenName(e.target.value)} placeholder="T.ex. Butik A - Kassa"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Välj kanal</label>
                                <StyledSelect value={displayScreenId} onChange={e => setDisplayScreenId(e.target.value)}>
                                    <option value="">Välj en kanal...</option>
                                    {(displayScreens || []).map(screen => <option key={screen.id} value={screen.id}>{screen.name}</option>)}
                                </StyledSelect>
                            </div>
                            <div className="!mt-6 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg">
                                <MarkdownRenderer content={confirmationText} className="" />
                            </div>
                        </div>
                         {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}
                        <div className="flex justify-end gap-4 mt-6">
                            <SecondaryButton onClick={() => setStep('code')} disabled={isLoading}>Tillbaka</SecondaryButton>
                            <PrimaryButton onClick={handleAssign} disabled={!displayScreenId || !physicalScreenName.trim()} loading={isLoading}>
                                Anslut & Aktivera
                            </PrimaryButton>
                        </div>
                    </>
                )}
                {step === 'success' && (
                     <div className="text-center">
                        <h2 className="text-2xl font-bold mb-2 text-primary">Ansluten!</h2>
                        <p className="text-slate-600 dark:text-slate-300 mb-6">Skärmen är nu ansluten och bör uppdateras inom några sekunder. Du kan se den i listan "Anslutna Skyltfönster".</p>
                        <PrimaryButton onClick={onClose}>Stäng</PrimaryButton>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- PREVIEW MODAL ---

const ChevronLeftIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
);
const ChevronRightIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
);

const PreviewProgressBar: React.FC<{ duration: number; isPaused: boolean; key: any }> = ({ duration, isPaused, key }) => {
    const animationStyle: React.CSSProperties = {
        animationDuration: `${duration}s`,
        animationPlayState: isPaused ? 'paused' : 'running',
    };
    return (
        <div className="absolute bottom-0 left-0 h-1.5 bg-white/20 w-full">
            <div
                key={key}
                className="h-full bg-white animate-progress-bar"
                style={animationStyle}
            ></div>
            <style>{`
                @keyframes progress-bar-animation {
                    from { width: 0%; }
                    to { width: 100%; }
                }
                .animate-progress-bar {
                    animation-name: progress-bar-animation;
                    animation-timing-function: linear;
                    animation-fill-mode: forwards;
                }
            `}</style>
        </div>
    );
};

const getAspectRatioClass = (ratio?: DisplayScreen['aspectRatio']): string => {
    switch (ratio) {
        case '9:16': return 'aspect-[9/16]';
        case '4:3': return 'aspect-[4/3]';
        case '3:4': return 'aspect-[3/4]';
        case '16:9':
        default: return 'aspect-[16/9]';
    }
};

const DisplayScreenPreviewModal: React.FC<{
    screen: DisplayScreen;
    organization: Organization;
    onClose: () => void;
}> = ({ screen, organization, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [cycleCount, setCycleCount] = useState(0);
    const timerRef = useRef<number | null>(null);

    const isPortrait = screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4';

    const activePosts = useMemo(() => {
        if (!screen.isEnabled || !screen.posts) return [];
        const now = new Date();
        return screen.posts.filter(post => {
            const hasStartDate = post.startDate && post.startDate.length > 0;
            const hasEndDate = post.endDate && post.endDate.length > 0;
            if (hasStartDate && new Date(post.startDate!) > now) return false;
            if (hasEndDate && new Date(post.endDate!) < now) return false;
            return true;
        });
    }, [screen]);
    
    const advance = useCallback((direction: 'next' | 'prev') => {
        if (activePosts.length === 0) return;

        setCycleCount(c => c + 1);

        if (activePosts.length > 1) {
            setCurrentIndex(prev => {
                if (direction === 'next') {
                    return (prev + 1) % activePosts.length;
                } else {
                    return (prev - 1 + activePosts.length) % activePosts.length;
                }
            });
        }
    }, [activePosts.length]);

    useEffect(() => {
        const cleanup = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };

        if (isPaused || activePosts.length === 0) return cleanup;
        
        const currentPost = activePosts[currentIndex];
        if (!currentPost) return cleanup;

        if (currentPost.layout === 'video-fullscreen' && currentPost.videoUrl) {
            return cleanup;
        }

        const duration = (currentPost.durationSeconds || 10) * 1000;
        timerRef.current = window.setTimeout(() => advance('next'), duration);
        
        return cleanup;
    }, [currentIndex, activePosts, advance, isPaused, cycleCount]);

    const currentPost = activePosts[currentIndex];

    if (!currentPost) {
         return (
             <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => onClose()}>
                 <div className="bg-white dark:bg-slate-800 p-8 rounded-lg text-slate-900 dark:text-white">
                     <h3 className="text-xl font-bold mb-2">Förhandsgranskning</h3>
                     <p>Det finns inga aktiva inlägg att visa för denna kanal.</p>
                 </div>
             </div>
         );
    }

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50 p-4" onClick={() => onClose()}>
             <div 
                className={`${getAspectRatioClass(screen.aspectRatio)} ${isPortrait ? 'h-full max-h-[85vh]' : 'w-full max-w-5xl'} bg-slate-900 rounded-lg overflow-hidden relative border-2 border-slate-600 shadow-2xl`}
                onClick={e => e.stopPropagation()}
            >
                <DisplayPostRenderer 
                    post={currentPost} 
                    allTags={organization.tags} 
                    onVideoEnded={() => advance('next')}
                    primaryColor={organization.primaryColor}
                    cycleCount={cycleCount}
                    organization={organization}
                    aspectRatio={screen.aspectRatio}
                />
                 {activePosts.length > 1 && currentPost.layout !== 'video-fullscreen' && (
                    <PreviewProgressBar duration={currentPost.durationSeconds} isPaused={isPaused} key={cycleCount}/>
                 )}
            </div>
            
            {activePosts.length > 1 && (
                <div className="mt-4 flex items-center gap-6 p-2 bg-slate-800/50 rounded-full border border-slate-700" onClick={e => e.stopPropagation()}>
                    <button onClick={() => advance('prev')} className="p-2 text-white rounded-full hover:bg-slate-700"><ChevronLeftIcon className="h-6 w-6" /></button>
                    <button onClick={() => setIsPaused(!isPaused)} className="p-3 bg-primary text-white rounded-full hover:brightness-110">
                        {isPaused ? <PlayIcon className="h-6 w-6" /> : <PauseIcon className="h-6 w-6" />}
                    </button>
                    <button onClick={() => advance('next')} className="p-2 text-white rounded-full hover:bg-slate-700"><ChevronRightIcon className="h-6 w-6" /></button>
                </div>
            )}
        </div>
    );
};
