
import React, { useState, useEffect } from 'react';
import { Organization, DisplayScreen, DisplayPost, AiAutomation, SuggestedPost, BookingCalendarEntry } from '../../types';
import { listenToSuggestedPosts, updateSuggestedPost, updateDisplayScreen } from '../../services/firebaseService'; // Using direct updateDisplayScreen here for simplicity as it's a specific action
import { Card } from '../Card';
import { PrimaryButton, SecondaryButton, DestructiveButton } from '../Buttons';
import { CompactToggleSwitch, PencilIcon, TrashIcon, LoadingSpinnerIcon, SparklesIcon, MonitorIcon } from '../icons';
import { SkylieEmptyState } from '../SkylieEmptyState';
import { AiAutomationEditorModal } from '../AiAutomationEditorModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { DisplayPostRenderer } from '../DisplayPostRenderer';
import { DnaStatusBadge } from '../DnaStatusBadge';
import { StyledInput, StyledSelect } from '../Forms';

// A helper to translate frequencies beautifully
const getFrequencyText = (auto: AiAutomation) => {
    const days = ['', 'Måndagar', 'Tisdagar', 'Onsdagar', 'Torsdagar', 'Fredagar', 'Lördagar', 'Söndagar'];
    const time = auto.timeOfDay || '09:00';
    if (auto.frequency === 'daily') {
        return `Dagligen kl ${time}`;
    } else if (auto.frequency === 'weekly') {
        const dayStr = auto.dayOfWeek ? days[auto.dayOfWeek] : 'Måndagar';
        return `Varje vecka på ${dayStr} kl ${time}`;
    } else {
        const dateStr = auto.dayOfMonth ? `${auto.dayOfMonth}:e` : '1:a';
        return `Månadsvis den ${dateStr} kl ${time}`;
    }
};

interface AiAutomationTabProps {
    organization: Organization;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
    onEditDisplayScreen: (screen: DisplayScreen, post?: DisplayPost) => void;
    onGoToBranding?: () => void;
}

export const AiAutomationTab: React.FC<AiAutomationTabProps> = ({ organization, onUpdateOrganization, onEditDisplayScreen, onGoToBranding }) => {
    const { showToast } = useToast();
    const [editingAutomation, setEditingAutomation] = useState<AiAutomation | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [automationToDelete, setAutomationToDelete] = useState<AiAutomation | null>(null);

    const [suggestedPosts, setSuggestedPosts] = useState<SuggestedPost[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);

    const defaultWorkingHours = {
        1: { enabled: true, start: '09:00', end: '17:00' }, // Mån
        2: { enabled: true, start: '09:00', end: '17:00' }, // Tis
        3: { enabled: true, start: '09:00', end: '17:00' }, // Ons
        4: { enabled: true, start: '09:00', end: '17:00' }, // Tor
        5: { enabled: true, start: '09:00', end: '17:00' }, // Fre
        6: { enabled: false, start: '09:00', end: '17:00' }, // Lör
        0: { enabled: false, start: '09:00', end: '17:00' }, // Sön
    };

    const weekdaysList = [
        { key: 1, name: 'Måndag' },
        { key: 2, name: 'Tisdag' },
        { key: 3, name: 'Onsdag' },
        { key: 4, name: 'Torsdag' },
        { key: 5, name: 'Fredag' },
        { key: 6, name: 'Lördag' },
        { key: 0, name: 'Söndag' },
    ];

    const [calendars, setCalendars] = useState<BookingCalendarEntry[]>(() => {
        return organization.bookingCalendars || [];
    });
    const [isCalendarsDirty, setIsCalendarsDirty] = useState(false);

    const [expandedCalendarId, setExpandedCalendarId] = useState<string | null>(null);
    const [isSavingCalendar, setIsSavingCalendar] = useState(false);

    useEffect(() => {
        if (isCalendarsDirty) return;
        setCalendars(organization.bookingCalendars || []);
    }, [organization.bookingCalendars, isCalendarsDirty]);

    const handleSaveCalendar = async () => {
        setIsSavingCalendar(true);
        const normalizedList = calendars.map(cal => {
            let normalizedIcsUrl = (cal.icsUrl || '').trim();
            if (normalizedIcsUrl.startsWith('webcal://')) {
                normalizedIcsUrl = 'https://' + normalizedIcsUrl.substring(9);
            }
            return {
                ...cal,
                icsUrl: normalizedIcsUrl,
                bookingUrl: cal.bookingUrl?.trim() || undefined
            };
        });

        try {
            await onUpdateOrganization(organization.id, { bookingCalendars: normalizedList });
            setIsCalendarsDirty(false);
            showToast({ message: "Bokningskalendrar har sparats framgångsrikt.", type: 'success' });
        } catch (e) {
            showToast({ message: "Kunde inte spara bokningskalendrar.", type: 'error' });
        } finally {
            setIsSavingCalendar(false);
        }
    };

    const handleAddCalendar = () => {
        const newEntry: BookingCalendarEntry = {
            id: 'cal_' + Math.random().toString(36).substring(2, 9),
            staffName: 'Ny personal',
            enabled: true,
            icsUrl: '',
            bookingUrl: '',
            slotMinutes: 60,
            workingHours: defaultWorkingHours
        };
        setCalendars(prev => [...prev, newEntry]);
        setIsCalendarsDirty(true);
        setExpandedCalendarId(newEntry.id);
    };

    const handleRemoveCalendar = (id: string) => {
        setCalendars(prev => prev.filter(cal => cal.id !== id));
        setIsCalendarsDirty(true);
    };

    const handleUpdateCalendarField = (id: string, field: keyof BookingCalendarEntry, value: any) => {
        setCalendars(prev => prev.map(cal => cal.id === id ? { ...cal, [field]: value } : cal));
        setIsCalendarsDirty(true);
    };

    const handleUpdateWorkingHours = (id: string, weekday: number, field: 'enabled' | 'start' | 'end', value: any) => {
        setCalendars(prev => prev.map(cal => {
            if (cal.id !== id) return cal;
            const currentHours = cal.workingHours || defaultWorkingHours;
            const dayConfig = currentHours[weekday] || { enabled: false, start: '09:00', end: '17:00' };
            return {
                ...cal,
                workingHours: {
                    ...currentHours,
                    [weekday]: {
                        ...dayConfig,
                        [field]: value
                    }
                }
            };
        }));
        setIsCalendarsDirty(true);
    };

    useEffect(() => {
        setIsLoadingSuggestions(true);
        const unsubscribe = listenToSuggestedPosts(organization.id, (posts) => {
            setSuggestedPosts(posts);
            setIsLoadingSuggestions(false);
        });
        return () => unsubscribe();
    }, [organization.id]);

    const handleSaveAutomation = async (automation: AiAutomation) => {
        const currentAutomations = organization.aiAutomations || [];
        const isNew = !currentAutomations.some(a => a.id === automation.id);
        const updatedAutomations = isNew
            ? [...currentAutomations, automation]
            : currentAutomations.map(a => a.id === automation.id ? automation : a);

        try {
            await onUpdateOrganization(organization.id, { aiAutomations: updatedAutomations });
            showToast({ message: `Automation ${isNew ? 'skapades' : 'uppdaterades'}.`, type: 'success' });
            setIsEditorOpen(false);
            setEditingAutomation(null);
        } catch (e) {
            showToast({ message: "Kunde inte spara automationen.", type: 'error' });
        }
    };

    const handleDeleteAutomation = async () => {
        if (!automationToDelete) return;
        const updatedAutomations = (organization.aiAutomations || []).filter(a => a.id !== automationToDelete.id);
        try {
            await onUpdateOrganization(organization.id, { aiAutomations: updatedAutomations });
            showToast({ message: "Automationen togs bort.", type: 'success' });
            setAutomationToDelete(null);
        } catch (e) {
            showToast({ message: "Kunde inte ta bort automationen.", type: 'error' });
        }
    };
    
    const handleEditSuggestion = (suggestion: SuggestedPost) => {
        const targetScreen = organization.displayScreens?.find(s => s.id === suggestion.targetScreenId);
        if (targetScreen) {
            const postToEdit: DisplayPost = {
                ...suggestion.postData,
                suggestionOriginId: suggestion.id,
            };
            onEditDisplayScreen(targetScreen, postToEdit);
        } else {
            showToast({ message: `Kanalen "${suggestion.targetScreenId}" kunde inte hittas.`, type: 'error' });
        }
    };

    const handleApproveSuggestion = async (suggestion: SuggestedPost) => {
        try {
            const screen = organization.displayScreens?.find(s => s.id === suggestion.targetScreenId);
            if (!screen) throw new Error("Målkanalen kunde inte hittas.");
            
            const auto = organization.aiAutomations?.find(a => a.id === suggestion.automationId);
            const duration = suggestion.postData.durationSeconds || auto?.durationSeconds || 15;
            
            const newPost = { 
                ...suggestion.postData, 
                id: `post-${Date.now()}`,
                durationSeconds: duration
            };
            const updatedPosts = [...(screen.posts || []), newPost];
            
            await updateDisplayScreen(organization.id, screen.id, { posts: updatedPosts });
            await updateSuggestedPost(organization.id, suggestion.id, { status: 'approved', finalPostId: newPost.id });

            showToast({ message: `Inlägget "${newPost.internalTitle}" har publicerats!`, type: 'success' });
        } catch (e) {
             showToast({ message: `Kunde inte godkänna förslaget: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
        }
    };

    const handleRejectSuggestion = async (suggestion: SuggestedPost) => {
         try {
            await updateSuggestedPost(organization.id, suggestion.id, { status: 'rejected' });
            showToast({ message: `Förslaget har arkiverats.`, type: 'info' });
        } catch (e) {
            showToast({ message: `Kunde inte arkivera förslaget.`, type: 'error' });
        }
    };
    
    const pendingSuggestions = suggestedPosts.filter(p => p.status === 'pending');

    return (
        <div className="space-y-10">
            {/* Top Coaching Overview Hero Banner */}
            <div className="relative rounded-2xl bg-gradient-to-br from-teal-50/70 via-emerald-50/40 to-white dark:from-slate-800/80 dark:via-slate-800/50 dark:to-slate-900/40 border border-emerald-100/80 dark:border-slate-700/60 p-6 md:p-8 shadow-sm overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-teal-200/10 dark:bg-teal-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <div className="space-y-2 max-w-2xl">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 dark:bg-teal-500/25 text-teal-700 dark:text-teal-300 font-medium text-xs tracking-wider uppercase">
                            <SparklesIcon className="w-3.5 h-3.5" />
                            Smart Skylt Rhythm Assist
                        </div>
                        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans sm:text-4xl">
                            Automatiskt anpassat välmående
                        </h2>
                        <p className="text-slate-600 dark:text-slate-300 text-sm md:text-base leading-relaxed">
                            Låt AI:n bygga relevanta kampanjer, hälsopepp och veckotips baserat på din varumärkesprofil. Granska inläggen nedan innan de går live, eller låt Smart Skylt rulla ut dem på autopilot.
                        </p>
                    </div>
                    <div className="flex-shrink-0 self-start md:self-center">
                        <PrimaryButton onClick={() => { setEditingAutomation(null); setIsEditorOpen(true); }} className="shadow-lg hover:shadow-xl hover:translate-y-[-1px] transition-all bg-teal-600 hover:bg-teal-500 text-white font-bold flex items-center gap-2">
                            <SparklesIcon className="w-4 h-4" />
                            Skapa ny automation
                        </PrimaryButton>
                    </div>
                </div>
            </div>

            {/* Active Automations block */}
            <Card
                title={
                    <div className="flex items-center gap-2">
                        <span className="p-1 px-2.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-bold">Smart</span>
                        <span>Aktiva Automationer</span>
                    </div>
                }
                subTitle="Hantera dina löpande AI-uppdateringar och tidscheman."
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {(organization.aiAutomations || []).length > 0 ? (
                        (organization.aiAutomations || []).map(auto => {
                            // Find corresponding screens
                            const targetScreens = auto.targetScreenIds || [];
                            return (
                                <div key={auto.id} className="group relative bg-white dark:bg-slate-800/40 hover:bg-slate-50/40 dark:hover:bg-slate-800/80 p-5 rounded-2xl flex flex-col justify-between border border-slate-200/80 dark:border-slate-700/60 shadow-sm transition-all duration-300 hover:shadow-md">
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-extrabold text-xl text-slate-900 dark:text-white group-hover:text-primary transition-colors font-sans tracking-tight">{auto.name}</p>
                                                <div className="inline-flex items-center gap-1.5 mt-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                                    {getFrequencyText(auto)}
                                                </div>
                                            </div>
                                            <div className="flex items-center">
                                                <CompactToggleSwitch checked={auto.isEnabled} onChange={(checked) => handleSaveAutomation({...auto, isEnabled: checked })} />
                                            </div>
                                        </div>

                                        {/* Auto-Description / Topic */}
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase block">Fokusområde</span>
                                            <p className="text-sm text-slate-600 dark:text-slate-300 italic">"{auto.topic}"</p>
                                        </div>

                                        {/* Target channels with screen icons */}
                                        <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-700/40">
                                            <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase block">Publiceras i kanaler</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {targetScreens.length > 0 ? (
                                                    targetScreens.map(screenId => {
                                                        const scr = organization.displayScreens?.find(s => s.id === screenId);
                                                        return (
                                                            <span key={screenId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-150 dark:bg-slate-750 text-slate-700 dark:text-slate-300 text-xs font-semibold">
                                                                <MonitorIcon className="w-3 h-3 text-slate-400" />
                                                                {scr ? scr.name : 'Okänd kanal'}
                                                            </span>
                                                        );
                                                    })
                                                ) : (
                                                    <span className="text-xs text-amber-500 font-semibold italic">Ingen kanal kopplad</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Footers & AI Suggestions insights if simulated */}
                                    <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700/40 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/10 p-3 -mx-5 -mb-5 rounded-b-2xl">
                                        <div className="text-xs text-slate-400 dark:text-slate-500">
                                            {auto.lastRunAt ? (
                                                <span>Senast körd: <strong className="font-semibold text-slate-600 dark:text-slate-300">{new Date(auto.lastRunAt).toLocaleDateString('sv-SE')}</strong></span>
                                            ) : (
                                                <span className="italic flex items-center gap-1 text-emerald-500">
                                                    <SparklesIcon className="w-3 h-3" /> Redo för start
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button 
                                                onClick={() => { setEditingAutomation(auto); setIsEditorOpen(true); }} 
                                                className="p-2 text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg shadow-sm transition-all"
                                                title="Redigera automation"
                                            >
                                                <PencilIcon className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => setAutomationToDelete(auto)} 
                                                className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 hover:bg-white dark:hover:bg-slate-700 rounded-lg shadow-sm transition-all"
                                                title="Ta bort"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="col-span-1 md:col-span-2 py-8">
                            <SkylieEmptyState
                                title="Skapa din första automation!"
                                message="Låt AI:n jobba åt dig! Skapa en automation för att regelbundet få nya inlogg och hälsotips publicerade direkt på skärmen."
                                action={{ text: 'Skapa ny automation', onClick: () => { setEditingAutomation(null); setIsEditorOpen(true); } }}
                            />
                        </div>
                    )}
                </div>
            </Card>

            {/* Booking Calendar Config Card */}
            <Card
                title={
                    <div className="flex flex-wrap items-center justify-between gap-4 w-full">
                        <div className="flex items-center gap-2">
                            <span className="p-1 px-2.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 text-sm font-bold">Koppling</span>
                            <span>Bokningskalendrar</span>
                        </div>
                        <SecondaryButton
                            onClick={handleAddCalendar}
                            className="text-xs font-bold py-1.5 px-3 flex items-center gap-1.5"
                        >
                            <span>+ Lägg till personal</span>
                        </SecondaryButton>
                    </div>
                }
                subTitle="Visa dagens lediga tider på skyltfönstret för din personal — koppla iCal-länkar (t.ex. från Bokadirekt)."
            >
                <div className="space-y-6">
                    {calendars.length === 0 ? (
                        <div className="text-center py-8 bg-slate-50 dark:bg-slate-900/10 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Ingen personal eller kalender har lagts till ännu.</p>
                            <PrimaryButton onClick={handleAddCalendar} className="text-xs">
                                Lägg till din första kalender
                            </PrimaryButton>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {calendars.map((cal, idx) => {
                                const isExpanded = expandedCalendarId === cal.id;
                                return (
                                    <div 
                                        key={cal.id} 
                                        className="bg-white dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800/60 rounded-xl overflow-hidden transition-all duration-200 shadow-sm"
                                    >
                                        {/* Calendar Header Row */}
                                        <div 
                                            className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800/40 cursor-pointer"
                                            onClick={() => setExpandedCalendarId(isExpanded ? null : cal.id)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-slate-400 w-6">#{idx + 1}</span>
                                                <span className="font-bold text-slate-800 dark:text-white">
                                                    {cal.staffName || 'Namnlös personal'}
                                                </span>
                                                {!cal.enabled && (
                                                    <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded text-[10px] font-bold uppercase">
                                                        Inaktiv
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <div className="flex items-center gap-4" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">Aktiv</span>
                                                    <CompactToggleSwitch 
                                                        checked={cal.enabled} 
                                                        onChange={(checked) => handleUpdateCalendarField(cal.id, 'enabled', checked)} 
                                                    />
                                                </div>
                                                
                                                <button
                                                    onClick={() => handleRemoveCalendar(cal.id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors"
                                                    title="Ta bort personal"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>

                                                <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold select-none">
                                                    {isExpanded ? '▲' : '▼'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Expandable Form */}
                                        {isExpanded && (
                                            <div className="p-6 space-y-6">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div>
                                                        <label className="block text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                                            Personalens namn
                                                        </label>
                                                        <StyledInput
                                                            type="text"
                                                            value={cal.staffName}
                                                            onChange={(e) => handleUpdateCalendarField(cal.id, 'staffName', e.target.value)}
                                                            placeholder="T.ex. Anna, Erik"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                                            Behandlingslängd (slot-längd)
                                                        </label>
                                                        <StyledSelect
                                                            value={cal.slotMinutes}
                                                            onChange={(e) => handleUpdateCalendarField(cal.id, 'slotMinutes', parseInt(e.target.value, 10))}
                                                        >
                                                            <option value={30}>30 minuter</option>
                                                            <option value={45}>45 minuter</option>
                                                            <option value={60}>60 minuter</option>
                                                            <option value={90}>90 minuter</option>
                                                        </StyledSelect>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div>
                                                        <label className="block text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                                            Kalenderlänk (iCal/.ics)
                                                        </label>
                                                        <StyledInput
                                                            type="text"
                                                            value={cal.icsUrl}
                                                            onChange={(e) => handleUpdateCalendarField(cal.id, 'icsUrl', e.target.value)}
                                                            placeholder="T.ex. https://www.bokadirekt.se/ical/subscription/..."
                                                        />
                                                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed">
                                                            I Bokadirekt: Inställningar &rarr; Kalendersynk &rarr; kopiera prenumerationslänken. Länkar som börjar med webcal:// fungerar också.
                                                        </p>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                                            Bokningssida (för QR-kod)
                                                        </label>
                                                        <StyledInput
                                                            type="text"
                                                            value={cal.bookingUrl || ''}
                                                            onChange={(e) => handleUpdateCalendarField(cal.id, 'bookingUrl', e.target.value)}
                                                            placeholder="T.ex. https://www.bokadirekt.se/places/..."
                                                        />
                                                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed">
                                                            Länken till din publika bokningssida. Används för att visa en QR-kod på skärmen så kunder kan boka direkt.
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Working Hours */}
                                                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800/60">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 dark:text-white">Arbetstider</h4>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">Markera de dagar och tider under vilka du vill att lediga tider ska sökas efter.</p>
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-4xl">
                                                        {weekdaysList.map(({ key, name }) => {
                                                            const dayConfig = cal.workingHours?.[key] || { enabled: false, start: '09:00', end: '17:00' };
                                                            const isDayEnabled = dayConfig.enabled;
                                                            
                                                            return (
                                                                <div key={key} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-800/45">
                                                                    <div className="flex items-center gap-3">
                                                                        <input
                                                                            type="checkbox"
                                                                            id={`day-${cal.id}-${key}`}
                                                                            checked={isDayEnabled}
                                                                            onChange={(e) => handleUpdateWorkingHours(cal.id, key, 'enabled', e.target.checked)}
                                                                            className="w-4 h-4 rounded text-teal-600 bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-600 focus:ring-teal-500 focus:ring-2 disabled:opacity-50"
                                                                        />
                                                                        <label htmlFor={`day-${cal.id}-${key}`} className={`text-sm font-semibold select-none ${isDayEnabled ? 'text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                                                                            {name}
                                                                        </label>
                                                                    </div>
                                                                    
                                                                    <div className="flex items-center gap-1.5">
                                                                        <input
                                                                            type="time"
                                                                            value={dayConfig.start || '09:00'}
                                                                            disabled={!isDayEnabled}
                                                                            onChange={(e) => handleUpdateWorkingHours(cal.id, key, 'start', e.target.value)}
                                                                            className="bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white p-1 px-2 text-xs rounded border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-40"
                                                                        />
                                                                        <span className="text-[10px] text-slate-400 font-bold uppercase">till</span>
                                                                        <input
                                                                            type="time"
                                                                            value={dayConfig.end || '17:00'}
                                                                            disabled={!isDayEnabled}
                                                                            onChange={(e) => handleUpdateWorkingHours(cal.id, key, 'end', e.target.value)}
                                                                            className="bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white p-1 px-2 text-xs rounded border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-40"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Action Block */}
                    {calendars.length > 0 && (
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-end">
                            {isCalendarsDirty && (
                                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 mr-3">
                                    Osparade ändringar
                                </span>
                            )}
                            {isCalendarsDirty && (
                                <button
                                    type="button"
                                    onClick={() => { setCalendars(organization.bookingCalendars || []); setIsCalendarsDirty(false); }}
                                    className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mr-3 transition-colors"
                                >
                                    Ångra ändringar
                                </button>
                            )}
                            <PrimaryButton
                                onClick={() => handleSaveCalendar()}
                                disabled={isSavingCalendar}
                                className="bg-teal-600 hover:bg-teal-500 text-white font-bold flex items-center gap-2"
                            >
                                {isSavingCalendar ? 'Sparar...' : 'Spara inställningar'}
                            </PrimaryButton>
                        </div>
                    )}

                    {/* Status under the configuration fields inside Card */}
                    {(() => {
                        const slotsData = organization.todaysAvailableSlots;
                        if (!slotsData || !slotsData.byCalendar) return null;

                        const calendarIds = Object.keys(slotsData.byCalendar);
                        if (calendarIds.length === 0) return null;

                        const stockholmToday = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
                        const isStale = slotsData.date !== stockholmToday;

                        const timeStr = slotsData.updatedAt 
                            ? new Date(slotsData.updatedAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
                            : 'okänd tid';

                        return (
                            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60 rounded-xl space-y-2 text-xs">
                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                                    <span>Senast synkroniserad {timeStr} &mdash; status per kalender:</span>
                                </div>
                                {isStale ? (
                                    <div className="p-2 text-slate-500 dark:text-slate-400 italic">
                                        Väntar på dagens synkronisering (senaste data är från {slotsData.date}).
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        {calendarIds.map(id => {
                                            const entry = slotsData.byCalendar[id];
                                            if (!entry) return null;
                                            const count = entry.slots?.length || 0;
                                            const hasError = !!entry.error;
                                            const isClosed = !!entry.closed;
                                            
                                            return (
                                                <div key={id} className="flex flex-wrap items-center justify-between gap-2 p-2 bg-white dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-slate-850">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-700 dark:text-slate-300">{entry.staffName}</span>
                                                        {hasError ? (
                                                            <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-semibold">
                                                                ⚠️ {entry.error}
                                                            </span>
                                                        ) : isClosed ? (
                                                            <span className="text-slate-400 dark:text-slate-500 font-medium">
                                                                &mdash; Stängt idag
                                                            </span>
                                                        ) : (
                                                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                                                &mdash; <strong>{count} lediga tider</strong> idag
                                                            </span>
                                                        )}
                                                    </div>
                                                    {!hasError && !isClosed && count > 0 && (
                                                        <div className="flex flex-wrap gap-1">
                                                            {entry.slots.map(slot => (
                                                                <span key={slot} className="px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded font-bold text-[10px]">
                                                                    {slot}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </Card>

            {/* Inläggsförslag till granskning section with actual preview phone/screen frames */}
            <Card
                title={
                    <div className="flex flex-wrap items-center gap-2 justify-between w-full">
                        <div className="flex items-center gap-2">
                            <span className="p-1 px-2.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm font-bold">Granska</span>
                            <span>Inläggsförslag att granska</span>
                        </div>
                        <DnaStatusBadge organization={organization} onGoToBranding={onGoToBranding} />
                    </div>
                }
                subTitle="Inlägg framtagna av AI-skribenten baserat på dina schemalagda önskemål. Granska, finjustera och klicka godkänn!"
            >
                {isLoadingSuggestions ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-3">
                        <LoadingSpinnerIcon className="h-10 w-10 text-primary animate-spin"/>
                        <p className="text-sm font-semibold text-slate-400 animate-pulse">Analyserar och hämtar förslag...</p>
                    </div>
                ) : pendingSuggestions.length > 0 ? (
                    <div className="space-y-8">
                        {pendingSuggestions.map(suggestion => {
                            const targetScreen = organization.displayScreens?.find(s => s.id === suggestion.targetScreenId);
                            return (
                               <div key={suggestion.id} className="relative bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700/60 shadow-md hover:shadow-xl transition-all duration-300 p-6 flex flex-col md:flex-row gap-6 overflow-hidden">
                                    {/* Background visual cue for AI-crafted quality */}
                                    <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-teal-500 to-emerald-400"></div>
                                    
                                    {/* Lefthand phone/tablet-style simulation frame showcasing the active display renderer in perfect miniature */}
                                    <div className="flex-shrink-0 self-center md:self-stretch flex items-center justify-center p-2 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-850">
                                        <div className="relative aspect-[9/16] w-[130px] md:w-[150px] flex-shrink-0 bg-slate-950 border-[5px] border-slate-900 rounded-[20px] shadow-lg overflow-hidden transition-all duration-350 select-none group">
                                            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-12 h-3.5 bg-slate-900 rounded-b-md z-40"></div>
                                            <div className="w-full h-full scale-[1.01] origin-center z-10">
                                                <DisplayPostRenderer post={suggestion.postData} mode="preview" allTags={organization.tags} organization={organization}/>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Righthand post details editor content */}
                                    <div className="flex-grow flex flex-col justify-between space-y-6">
                                        <div className="space-y-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="inline-flex items-center gap-1.5 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 text-[10px] font-extrabold tracking-widest px-2.5 py-1 rounded-full uppercase">
                                                    <SparklesIcon className="w-3 h-3" /> FÖRESLAGEN KAMPANJ
                                                </span>
                                                <span className="text-xs text-slate-400">
                                                    Skapad: {new Date(suggestion.createdAt).toLocaleDateString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>

                                            <p className="font-extrabold text-2xl text-slate-900 dark:text-white leading-tight tracking-tight font-sans">
                                                {suggestion.postData.internalTitle}
                                            </p>
                                            
                                            {/* Beautiful quote display for body text */}
                                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 relative border-l-4 border-slate-200 dark:border-slate-700">
                                                <p className="text-slate-600 dark:text-slate-300 text-sm md:text-base leading-relaxed tracking-wide font-medium">
                                                    {suggestion.postData.body}
                                                </p>
                                            </div>

                                            {/* Info items */}
                                            <div className="grid grid-cols-2 gap-4 pt-3 text-xs border-t border-slate-100 dark:border-slate-700/60">
                                                <div>
                                                    <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase block">Visningstid</span>
                                                    <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm mt-0.5">{suggestion.postData.durationSeconds || 15} sekunder</p>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase block">Publiceringskanal</span>
                                                    <p className="font-semibold text-primary dark:text-teal-400 text-sm mt-0.5">{targetScreen ? targetScreen.name : 'Välj kanal'}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions block with warm organic buttons and custom icons */}
                                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap gap-3 items-center justify-end">
                                             <button 
                                                 onClick={() => handleRejectSuggestion(suggestion)} 
                                                 className="px-4 py-2 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/10 rounded-xl transition-all"
                                             >
                                                 Arkivera
                                             </button>
                                             <button 
                                                 onClick={() => handleEditSuggestion(suggestion)} 
                                                 className="px-5 py-2 text-sm font-bold text-slate-700 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/85 rounded-xl transition-all flex items-center gap-1.5"
                                             >
                                                 <PencilIcon className="w-4 h-4" />
                                                 Redigera inlägg
                                             </button>
                                             <button 
                                                 onClick={() => handleApproveSuggestion(suggestion)} 
                                                 className="px-6 py-2.5 text-sm font-extrabold text-white bg-teal-600 hover:bg-teal-500 active:scale-[0.98] rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5"
                                             >
                                                 <SparklesIcon className="w-4 h-4" />
                                                 Godkänn & publicera
                                             </button>
                                        </div>
                                    </div>
                               </div>
                            );
                        })}
                    </div>
                ) : (
                     <SkylieEmptyState
                        title="Inga nya förslag just nu"
                        message="Dina automationer analyserar löpande ditt schema. När nya hälsotips eller peppande inlägg skapas dyker de upp här direkt."
                    />
                )}
            </Card>

            {isEditorOpen && (
                <AiAutomationEditorModal
                    isOpen={isEditorOpen}
                    onClose={() => setIsEditorOpen(false)}
                    onSave={handleSaveAutomation}
                    automation={editingAutomation}
                    organization={organization}
                />
            )}
            
            <ConfirmDialog
                isOpen={!!automationToDelete}
                onClose={() => setAutomationToDelete(null)}
                onConfirm={handleDeleteAutomation}
                title="Ta bort automation"
            >
                Är du säker på att du vill ta bort automationen "{automationToDelete?.name}"?
            </ConfirmDialog>
        </div>
    );
};
