
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
import { SparklesIcon, ChevronDownIcon, PencilIcon, TrashIcon, EyeIcon } from '../icons';
import { PlanningView } from '../DisplayScreenEditor/PlanningView';
import { parseToDate } from '../../utils/dateUtils';

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
                    <SkylieEmptyState
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
                        <SecondaryButton onClick={handleCreateScreenTemplate} disabled={isSaving}>
                            Skapa ny kanal
                        </SecondaryButton>
                    }
                >
                     <div className="space-y-3">
                        {(displayScreens || []).length > 0 ? (
                            displayScreens.map(screen => {
                                const isExpanded = expandedScreenId === screen.id;
                                return (
                                <div key={screen.id} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 transition-all duration-300">
                                   {renamingScreenId === screen.id ? (
                                        <div className="p-4 w-full flex-grow flex items-center gap-2">
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
                                        <div className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                                            <div className="flex-grow flex items-center gap-4 text-center sm:text-left justify-center sm:justify-start">
                                                <button 
                                                    onClick={() => setExpandedScreenId(prev => prev === screen.id ? null : screen.id)}
                                                    className="flex items-center gap-2 font-semibold text-slate-600 dark:text-slate-300 hover:text-primary dark:hover:text-primary transition-colors group p-2 -m-2 rounded-lg"
                                                    aria-expanded={isExpanded}
                                                    aria-controls={`planering-${screen.id}`}
                                                >
                                                    <ChevronDownIcon className={`h-6 w-6 text-slate-400 group-hover:text-primary transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                    <span className="text-base">{isExpanded ? 'Dölj planering' : 'Visa planering'}</span>
                                                </button>
                                                <div className="w-px h-6 bg-slate-200 dark:border-slate-700"></div>
                                                <p className="font-semibold text-lg text-slate-900 dark:text-white">{screen.name}</p>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setRenamingScreenId(screen.id); setNewName(screen.name); }}
                                                    disabled={isSaving}
                                                    className="text-slate-400 hover:text-primary dark:hover:text-primary transition-colors p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600"
                                                    aria-label={`Byt namn på ${screen.name}`}
                                                >
                                                    <PencilIcon className="h-5 w-5" />
                                                </button>
                                            </div>
                                            <div onClick={e => e.stopPropagation()} className="flex items-center flex-wrap justify-center sm:justify-end gap-2">
                                                <div className="flex-shrink-0 mr-2">
                                                    <ScreenStats screen={screen} />
                                                </div>
                                                <PrimaryButton onClick={() => onEditDisplayScreen(screen)} disabled={isSaving} className="bg-blue-600 hover:bg-blue-500">Hantera inlägg</PrimaryButton>
                                                <button onClick={() => onPreviewScreen(screen)} disabled={isSaving} title="Förhandsgranska" className="p-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition-colors">
                                                    <EyeIcon className="h-5 w-5" />
                                                </button>
                                                <button onClick={() => setScreenToDelete(screen)} disabled={isSaving} title="Ta bort" className="p-3 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"><TrashIcon className="h-5 w-5"/></button>
                                            </div>
                                        </div>
                                    )}

                                    {isExpanded && (
                                        <div id={`planering-${screen.id}`} className="border-t border-slate-200 dark:border-slate-700 p-0 sm:p-4 bg-slate-100 dark:bg-slate-900/50 animate-fade-in">
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
        </div>
    );
};
