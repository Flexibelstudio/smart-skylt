
import React, { useState, useEffect, useRef } from 'react';
import { Organization, DisplayScreen, DisplayPost, SystemSettings, PhysicalScreen, PostTemplate, Tag } from '../../types';
import { useLocation } from '../../context/StudioContext';
import { Card } from '../Card';
import { PrimaryButton, SecondaryButton, DestructiveButton } from '../Buttons';
import { StyledInput, StyledSelect } from '../Forms';
import { useToast } from '../../context/ToastContext';
import { SkylieEmptyState } from '../SkylieEmptyState';
import { ConfirmDialog } from '../ConfirmDialog';
import { InputDialog } from '../DisplayScreenEditor/Modals';
import { ProactiveRhythmBanner, ProactiveSeasonalBanner } from '../ProactiveRhythmBanner';
import { CampaignIdeaGenerator } from './CampaignIdeaGenerator';
import { unpairPhysicalScreen, isOffline } from '../../services/firebaseService';
import { getSwedishHolidays } from '../../data/holidays';
import { generateEventReminderText } from '../../services/geminiService';
import { SparklesIcon, ChevronDownIcon, PencilIcon, TrashIcon, EyeIcon, EllipsisVerticalIcon, Cog6ToothIcon } from '../icons';
import { PlanningView } from '../DisplayScreenEditor/PlanningView';
import { parseToDate } from '../../utils/dateUtils';
import { ChannelSettingsModal } from './ChannelSettingsModal';
import { ExpressPublishTab } from './ExpressPublishTab';

// --- Local Subcomponents ---

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

const ProactiveUpcomingEventBannerLocal: React.FC<{
    organization: Organization;
    onGenerateIdeas: (event: { name: string; date: Date; icon: string; }) => void;
}> = ({ organization, onGenerateIdeas }) => {
    const [event, setEvent] = useState<{ name: string; date: Date; icon: string; } | null>(null);
    const [reminder, setReminder] = useState<{ headline: string, subtext: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const now = new Date();
        const year = now.getFullYear();
        const holidays = getSwedishHolidays(year); 
        const customEvents = (organization.customEvents || []).map(ce => ({ ...ce, date: parseToDate(ce.date) as Date }));
        
        const allEvents = [...holidays, ...customEvents].filter(e => e.date && e.date >= now);
        allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
        
        const nextEvent = allEvents[0];
        
        if (!nextEvent) {
            setIsLoading(false);
            setEvent(null);
            return;
        }

        const diffDays = (nextEvent.date.getTime() - now.getTime()) / (1000 * 3600 * 24);

        if (diffDays <= 30) {
            const hasExistingCampaign = (organization.displayScreens || []).some(screen =>
                (screen.posts || []).some(post => post.internalTitle.toLowerCase().includes(nextEvent.name.toLowerCase()))
            );

            if (!hasExistingCampaign) {
                setEvent(nextEvent);
            } else {
                setEvent(null);
                setIsLoading(false);
            }
        } else {
            setEvent(null);
            setIsLoading(false);
        }
    }, [organization]);

    useEffect(() => {
        if (event) {
            const now = new Date();
            const diffTime = event.date.getTime() - now.getTime();
            const daysUntil = Math.max(0, Math.ceil(diffTime / (1000 * 3600 * 24)));

            generateEventReminderText(event, daysUntil, organization, false)
                .then(setReminder)
                .catch(err => {
                    console.warn("Using fallback for event reminder due to AI error:", err.message);
                    setReminder({
                        headline: `${event.name} närmar sig!`,
                        subtext: 'Ska vi skapa en kampanj?'
                    });
                })
                .finally(() => setIsLoading(false));
        } else {
            setReminder(null);
        }
    }, [event, organization]);

    if (isLoading || !reminder || !event) {
        return null;
    }

    return (
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-4 rounded-xl shadow-lg animate-fade-in flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="text-4xl">{event.icon}</div>
                <div>
                    <h3 className="text-xl font-bold">{reminder.headline}</h3>
                    <p className="text-pink-200 mt-1">{reminder.subtext}</p>
                </div>
                                                    </div>
            <PrimaryButton onClick={() => onGenerateIdeas(event)} className="bg-white/90 hover:bg-white text-pink-600 font-bold flex-shrink-0">
                <SparklesIcon className="h-5 w-5 mr-2"/>
                Generera Idéer
            </PrimaryButton>
        </div>
    );
};

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
            if (isOffline) {
                const updatedScreens = (organization.physicalScreens || []).filter(s => s.id !== screenToDisconnect.id);
                await onUpdateOrganization(organization.id, { physicalScreens: updatedScreens });
            }
            showToast({ message: "Skyltfönstret har kopplats från.", type: 'success' });
        } catch (e) {
            showToast({ message: `Kunde inte koppla från: ${e instanceof Error ? e.message : "Okänt fel"}`, type: 'error' });
        } finally {
            setScreenToDisconnect(null);
        }
    };

    return (
        <>
            <div className="space-y-4">
                {physicalScreens.length > 0 ? (
                    physicalScreens.map(screen => {
                        const channel = allDisplayScreens.find(s => s.id === screen.displayScreenId);
                        const isPortrait = channel?.aspectRatio === '9:16' || channel?.aspectRatio === '3:4';
                        return (
                            <div key={screen.id} className="bg-white dark:bg-slate-800/80 rounded-xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 border border-slate-200 dark:border-slate-700/80 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden">
                                {/* Left connection stripe status */}
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                                
                                <div className="flex-grow flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
                                    {/* Physical status icon */}
                                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-900/30 flex-shrink-0 relative">
                                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                        {/* Pulsing indicator */}
                                        <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                        </span>
                                    </div>
                                    
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                            <p className="font-bold text-lg text-slate-900 dark:text-white leading-tight">{screen.name}</p>
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/30">
                                                Aktiv
                                            </span>
                                        </div>
                                        <div className="flex-grow flex items-center justify-center sm:justify-start gap-2 text-sm text-slate-500 dark:text-slate-400 mt-1">
                                            <span>Visar kanal:</span>
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold ${
                                                isPortrait
                                                    ? 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-900/20'
                                                    : 'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-900/20'
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${isPortrait ? 'bg-purple-500' : 'bg-teal-500'}`} />
                                                "{getChannelName(screen.displayScreenId)}"
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-2.5 w-full md:w-auto justify-center md:justify-end">
                                    <SecondaryButton 
                                        onClick={() => setScreenToRename(screen)}
                                        className="border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 font-semibold text-sm transition-all"
                                    >
                                        Byt namn
                                    </SecondaryButton>
                                    <DestructiveButton 
                                        onClick={() => setScreenToDisconnect(screen)}
                                        className="bg-transparent hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40 hover:border-red-300 font-semibold text-sm transition-all"
                                    >
                                        Koppla från
                                    </DestructiveButton>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <SkylieEmptyState
                        bgOpacityClass="bg-gradient-to-br from-emerald-500/5 to-teal-500/5"
                        title="Dags att ansluta en skärm!"
                        message={<>Nu när du har en kanal är det dags att koppla den till en fysisk TV eller skärm. Använd knappen 'Anslut nytt skyltfönster' för att komma igång! 💡</>}
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

// --- Main Tab Component ---

interface SkyltfonsterTabProps {
    displayScreens: DisplayScreen[];
    organization: Organization;
    systemSettings: SystemSettings | null;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
    onEditDisplayScreen: (screen: DisplayScreen, post?: DisplayPost) => void;
    onOpenPairingModal: () => void;
    onPreviewScreen: (screen: DisplayScreen) => void;
    onShareScreen: (screen: DisplayScreen) => void;
}

export const SkyltfonsterTab: React.FC<SkyltfonsterTabProps> = (props) => {
    const { organization, displayScreens, onUpdateOrganization, onEditDisplayScreen, onOpenPairingModal, onPreviewScreen, onShareScreen } = props;
    const { addDisplayScreen, updateDisplayScreen, deleteDisplayScreen } = useLocation();
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();
    
    // Idea Generation States
    const [ideaModalEvent, setIdeaModalEvent] = useState<{ name: string; date: Date } | null>(null);
    const [isRhythmIdeaModalOpen, setIsRhythmIdeaModalOpen] = useState(false);
    const [rhythmContext, setRhythmContext] = useState('');
    const [isSeasonalIdeaModalOpen, setIsSeasonalIdeaModalOpen] = useState(false);
    const [seasonalContext, setSeasonalContext] = useState('');

    // Screen Management States
    const [renamingScreenId, setRenamingScreenId] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [screenToDelete, setScreenToDelete] = useState<DisplayScreen | null>(null);
    const [expandedScreenId, setExpandedScreenId] = useState<string | null>(null);
    const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
    const [selectedSettingsScreen, setSelectedSettingsScreen] = useState<DisplayScreen | null>(null);
    const [expressPublishScreenId, setExpressPublishScreenId] = useState<string | null>(null);

    const physicalScreens = organization.physicalScreens || [];

    const handleGenerateIdeasClick = (event: { name: string; date: Date; icon: string; }) => {
        setIdeaModalEvent(event);
    };
    
    const handleCreateScreenTemplate = async () => {
        setIsSaving(true);
        try {
            const newScreen: Omit<DisplayScreen, 'id'> = {
                name: 'Ny Kanal',
                isEnabled: true,
                posts: [],
                aspectRatio: '9:16',
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
        <div className="space-y-8">
            <ProactiveUpcomingEventBannerLocal
                organization={organization}
                onGenerateIdeas={handleGenerateIdeasClick}
            />

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
                        <SecondaryButton onClick={handleCreateScreenTemplate} disabled={isSaving} className="border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-all font-medium">
                            Skapa ny kanal
                        </SecondaryButton>
                    }
                >
                     <div className="space-y-4">
                        {(displayScreens || []).length > 0 ? (
                            displayScreens.map(screen => {
                                const isExpanded = expandedScreenId === screen.id;
                                return (
                                <div 
                                    key={screen.id} 
                                    className={`bg-white dark:bg-slate-800/90 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm hover:shadow-md transition-all duration-300 relative group/row ${
                                        activeDropdownId === screen.id ? 'overflow-visible z-30' : 'overflow-hidden'
                                    }`}
                                >
                                   {/* Left accent border representing layout orientation/aspect-ratio */}
                                   <div className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors duration-300 ${screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4' ? 'bg-purple-500' : 'bg-teal-500'}`} />
                                   
                                   {renamingScreenId === screen.id ? (
                                        <div className="p-5 pl-7 w-full flex-grow flex items-center gap-3">
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
                                        <div className="p-4 pl-6 flex flex-col lg:flex-row justify-between items-center gap-4">
                                            <div className="flex-grow flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left justify-center sm:justify-start">
                                                <button 
                                                    onClick={() => setExpandedScreenId(prev => prev === screen.id ? null : screen.id)}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all select-none ${
                                                        isExpanded 
                                                            ? 'bg-slate-100 dark:bg-slate-700/60 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 shadow-inner' 
                                                            : 'bg-slate-50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/50 dark:hover:bg-slate-700/30'
                                                    }`}
                                                    aria-expanded={isExpanded}
                                                    aria-controls={`planering-${screen.id}`}
                                                >
                                                    <ChevronDownIcon className={`h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-slate-700 dark:text-slate-200' : ''}`} />
                                                    <span>{isExpanded ? 'Dölj planering' : 'Visa planering'}</span>
                                                </button>
                                                
                                                <div className="hidden sm:block w-px h-6 bg-slate-200 dark:bg-slate-700"></div>
                                                 <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:gap-3">
                                                    <p className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">{screen.name}</p>
                                                    
                                                    {screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4' ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-900/40">
                                                            <span className="w-1.5 h-3 border border-purple-400 dark:border-purple-600 rounded bg-purple-200 dark:bg-purple-950 flex-shrink-0" />
                                                            Stående {screen.aspectRatio}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-900/40">
                                                            <span className="w-3 h-1.5 border border-teal-400 dark:border-teal-600 rounded bg-teal-200 dark:bg-teal-950 flex-shrink-0" />
                                                            Liggande {screen.aspectRatio}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div onClick={e => e.stopPropagation()} className="flex items-center flex-wrap justify-center sm:justify-end gap-3 w-full lg:w-auto">
                                                <div className="flex-shrink-0 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-slate-700/50">
                                                    <ScreenStats screen={screen} />
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <PrimaryButton 
                                                        onClick={() => onEditDisplayScreen(screen)} 
                                                        disabled={isSaving} 
                                                        className="bg-blue-600 hover:bg-blue-500 shadow-sm active:scale-95 transition-all text-sm font-semibold !px-4"
                                                    >
                                                        Hantera inlägg
                                                    </PrimaryButton>
                                                    
                                                    <SecondaryButton
                                                        onClick={() => onPreviewScreen(screen)}
                                                        disabled={isSaving}
                                                        className="!py-2 !px-4 text-sm font-semibold flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-650 hover:bg-slate-200/80 dark:hover:bg-slate-600/80 text-slate-700 dark:text-slate-200 shadow-sm active:scale-95 transition-all"
                                                    >
                                                        <EyeIcon className="h-4.5 w-4.5 text-slate-500 dark:text-slate-400" />
                                                        Se flödet
                                                    </SecondaryButton>
                                                    
                                                    <div className="relative">
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); setActiveDropdownId(prev => prev === screen.id ? null : screen.id); }}
                                                            disabled={isSaving} 
                                                            title="Alternativ" 
                                                            className={`p-2.5 rounded-lg border transition-all shadow-sm ${
                                                                activeDropdownId === screen.id
                                                                    ? 'bg-slate-105 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-955 dark:text-white'
                                                                    : 'border-slate-200 dark:border-slate-705 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-300'
                                                            }`}
                                                        >
                                                            <EllipsisVerticalIcon className="h-5 w-5" />
                                                        </button>
 
                                                        {activeDropdownId === screen.id && (
                                                            <>
                                                                {/* Backdrop to close dropdown on click outside */}
                                                                <div 
                                                                    className="fixed inset-0 z-40 cursor-default" 
                                                                    onClick={(e) => { e.stopPropagation(); setActiveDropdownId(null); }}
                                                                />
                                                                <div 
                                                                    onClick={(e) => e.stopPropagation()} 
                                                                    className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-701 shadow-xl py-2 z-50 animate-fade-in text-left text-slate-800 dark:text-slate-100"
                                                                >
                                                                    <button
                                                                        onClick={() => {
                                                                            setActiveDropdownId(null);
                                                                            setRenamingScreenId(screen.id);
                                                                            setNewName(screen.name);
                                                                        }}
                                                                        className="w-full px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2.5 transition-colors"
                                                                    >
                                                                        <PencilIcon className="h-4 w-4 text-slate-400" />
                                                                        Byt namn på kanalen
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            setActiveDropdownId(null);
                                                                            setSelectedSettingsScreen(screen);
                                                                        }}
                                                                        className="w-full px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2.5 transition-colors"
                                                                    >
                                                                        <Cog6ToothIcon className="h-4 w-4 text-slate-400" />
                                                                        Kanalinställningar
                                                                    </button>
                                                                    <div className="border-t border-slate-100 dark:border-slate-700 my-1"></div>
                                                                    <button
                                                                        onClick={() => {
                                                                            setActiveDropdownId(null);
                                                                            setScreenToDelete(screen);
                                                                        }}
                                                                        className="w-full px-4 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 flex items-center gap-2.5 transition-colors"
                                                                    >
                                                                        <TrashIcon className="h-4 w-4 text-red-500" />
                                                                        Ta bort kanal
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                     </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {isExpanded && (
                                        <div id={`planering-${screen.id}`} className="border-t border-slate-200 dark:border-slate-700/80 p-0 sm:p-5 bg-slate-50 dark:bg-slate-900/30 animate-fade-in">
                                            <PlanningView 
                                                screen={screen}
                                                posts={screen.posts || []}
                                                organization={organization}
                                                onUpdateOrganization={onUpdateOrganization}
                                                onGetCampaignIdeas={handleGenerateIdeasClick}
                                                isAIAssistantEnabled={true}
                                                onUpdatePosts={(updatedPosts) => updateDisplayScreen(screen.id, { posts: updatedPosts })}
                                            />
                                        </div>
                                    )}
                                </div>
                            )})
                        ) : (
                           <SkylieEmptyState
                                bgOpacityClass="bg-gradient-to-br from-teal-500/5 to-blue-500/5"
                                title="Dags att skapa en kanal!"
                                message={<>En 'kanal' är som en spellista för ditt innehåll. Du kan ha olika kanaler för olika skärmar. Ska vi hjälpa dig skapa din första? 💡</>}
                                action={{ text: 'Skapa första kanalen', onClick: handleCreateScreenTemplate, disabled: isSaving }}
                           />
                        )}
                    </div>
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

            <CampaignIdeaGenerator
                isOpen={!!ideaModalEvent}
                onClose={() => setIdeaModalEvent(null)}
                event={ideaModalEvent}
                organization={organization}
                onUpdateOrganization={onUpdateOrganization}
                onEditDisplayScreen={onEditDisplayScreen}
            />
            <CampaignIdeaGenerator
                isOpen={isRhythmIdeaModalOpen}
                onClose={() => setIsRhythmIdeaModalOpen(false)}
                event={{ name: `Inläggsförslag`, date: new Date() }}
                organization={organization}
                onUpdateOrganization={onUpdateOrganization}
                onEditDisplayScreen={onEditDisplayScreen}
                planningContext={rhythmContext}
            />
            <CampaignIdeaGenerator
                isOpen={isSeasonalIdeaModalOpen}
                onClose={() => setIsSeasonalIdeaModalOpen(false)}
                event={{ name: `Idéer baserat på förra året`, date: new Date() }}
                organization={organization}
                onUpdateOrganization={onUpdateOrganization}
                onEditDisplayScreen={onEditDisplayScreen}
                planningContext={seasonalContext}
            />

            <ConfirmDialog
                isOpen={!!screenToDelete}
                onClose={() => setScreenToDelete(null)}
                onConfirm={confirmDeleteScreen}
                title="Bekräfta borttagning"
            >
                <p>Är du säker på att du vill ta bort kanalen "{screenToDelete?.name}" och allt dess innehåll? Detta kan inte ångras.</p>
            </ConfirmDialog>

            {selectedSettingsScreen && (
                <ChannelSettingsModal
                    isOpen={!!selectedSettingsScreen}
                    onClose={() => setSelectedSettingsScreen(null)}
                    screen={selectedSettingsScreen}
                    onUpdateScreen={async (screenId, updates) => {
                        await updateDisplayScreen(screenId, updates);
                        showToast({ message: "Kanalinställningar har sparats.", type: 'success' });
                    }}
                />
            )}
        </div>
    );
};
