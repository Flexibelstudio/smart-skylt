
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
import { unpairPhysicalScreen, changeScreenChannel, isOffline, listenToScreenSessions } from '../../services/firebaseService';
import { getSwedishHolidays } from '../../data/holidays';
import { generateEventReminderText } from '../../services/geminiService';
import { SparklesIcon, ChevronDownIcon, PencilIcon, TrashIcon, EyeIcon, EllipsisVerticalIcon, Cog6ToothIcon, MonitorIcon } from '../icons';
import { OnboardingChecklist } from '../OnboardingChecklist';
import { PlanningView } from '../DisplayScreenEditor/PlanningView';
import { parseToDate } from '../../utils/dateUtils';
import { ChannelSettingsModal } from './ChannelSettingsModal';
import { DisplayPostRenderer } from '../DisplayPostRenderer';
import { ScaledPreviewWrapper } from '../DisplayScreenEditor/PreviewPanes';

// --- Local Subcomponents ---

const FormatGlyph: React.FC<{ aspectRatio?: string; className?: string }> = ({ aspectRatio, className }) => {
    const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
    return (
        <span
            className={`inline-block flex-shrink-0 rounded-[3px] border-2 ${
                isPortrait
                    ? 'w-3 h-[18px] border-purple-400 bg-purple-100 dark:border-purple-600 dark:bg-purple-950'
                    : 'w-[18px] h-3 border-teal-400 bg-teal-100 dark:border-teal-600 dark:bg-teal-950'
            } ${className || ''}`}
            title={isPortrait ? 'Stående format' : 'Liggande format'}
        />
    );
};

const ScreenStats: React.FC<{ screen: DisplayScreen }> = ({ screen }) => {
    const now = new Date();
    const posts = screen.posts || [];
    
    let activePosCount = 0;
    let scheduledCount = 0;
    let draftCount = 0;

    posts.forEach(p => {
        if (p.status === 'archived') return;
        
        const isDraft = p.status === 'draft' || !p.startDate;
        if (isDraft) {
            draftCount++;
            return;
        }

        const start = parseToDate(p.startDate, false);
        const end = p.endDate ? parseToDate(p.endDate, true) : null;

        if (start && start > now) {
            scheduledCount++;
        } else if (end && end < now) {
            // Already ended/expired (could also be considered processed, let's group as draft or skip)
            draftCount++;
        } else {
            activePosCount++;
        }
    });
    
    let latestEndDate: Date | null = null;
    posts.forEach(post => {
        if (post.status === 'archived' || post.status === 'draft') return;
        if (post.endDate) {
            const endDate = parseToDate(post.endDate, true);
            if (endDate && (!latestEndDate || endDate > latestEndDate)) {
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
        <div className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1 text-xs font-semibold">
            {daysRemainingText && (
                <span className={`${textColorClass} flex items-center shrink-0`} title={`Sista inlägget går ut om ${daysRemaining} ${daysRemaining === 1 ? 'dag' : 'dagar'}.`}>
                    🕒 {daysRemainingText}
                </span>
            )}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400" title={`${activePosCount} inlägg visas på skärmen just nu.`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {activePosCount} aktiv{activePosCount === 1 ? 't' : 'a'}
                </span>
                {scheduledCount > 0 && (
                    <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400" title={`${scheduledCount} inlägg är schemalagda för framtiden.`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        {scheduledCount} schemalagda
                    </span>
                )}
                {draftCount > 0 && (
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400" title={`${draftCount} utkast eller avslutade inlägg.`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        {draftCount} utkast
                    </span>
                )}
            </div>
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

const MyScreenSummaryPanel: React.FC<{
    physicalScreens: PhysicalScreen[];
    displayScreens: DisplayScreen[];
    screenSessions: Record<string, { lastHeartbeat?: Date; status?: string; displayScreenId?: string; deviceInfo?: any }>;
    statusNow: number;
}> = ({ physicalScreens, displayScreens, screenSessions, statusNow }) => {
    if (!physicalScreens || physicalScreens.length === 0) {
        return null; // FALL 1 — inga fysiska skärmar anslutna
    }

    const getScreenStatus = (physicalScreenId: string): { state: 'online' | 'offline' | 'unknown'; since?: Date } => {
        const session = screenSessions[physicalScreenId];
        if (!session?.lastHeartbeat) return { state: 'unknown' };
        const ageMs = statusNow - session.lastHeartbeat.getTime();
        return ageMs < 150000
            ? { state: 'online' }
            : { state: 'offline', since: session.lastHeartbeat };
    };

    const countActivePosts = (screen?: DisplayScreen): number => {
        if (!screen || !screen.posts) return 0;
        const now = new Date();
        let count = 0;
        screen.posts.forEach(p => {
            if (p.status === 'archived' || p.status === 'draft' || !p.startDate) return;
            const start = parseToDate(p.startDate, false);
            const end = p.endDate ? parseToDate(p.endDate, true) : null;
            if ((!start || start <= now) && (!end || end >= now)) {
                count++;
            }
        });
        return count;
    };

    const screenStatuses = physicalScreens.map(s => ({
        screen: s,
        status: getScreenStatus(s.id),
        channel: displayScreens.find(ds => ds.id === s.displayScreenId)
    }));

    const offlineItem = screenStatuses.find(item => item.status.state === 'offline');
    const unknownItem = screenStatuses.find(item => item.status.state === 'unknown');
    const allOnline = screenStatuses.every(item => item.status.state === 'online');

    if (allOnline) {
        return null;
    }

    let mode: 'amber' | 'gray' = 'amber';
    let headline = '';
    let description = '';

    if (offlineItem) {
        mode = 'amber';
        headline = `⚠️ ${offlineItem.screen.name} verkar vara avstängd`;
        const timeStr = offlineItem.status.since
            ? offlineItem.status.since.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
            : '';
        description = `Senast sedd ${timeStr}. Kontrollera att TV:n har ström och nätverk — den startar oftast igen av sig själv.`;
    } else if (unknownItem) {
        mode = 'gray';
        headline = `Vi har inte hört från ${unknownItem.screen.name} ännu`;
        description = `Vi har inte hört från ${unknownItem.screen.name} ännu — starta om TV:n så kopplar den upp sig.`;
    } else {
        return null;
    }

    const cardStyles = {
        amber: 'bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50 border-l-4 border-l-amber-500',
        gray: 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 border-l-4 border-l-slate-400'
    };

    return (
        <div className={`p-6 rounded-2xl border shadow-sm transition-all relative overflow-hidden ${cardStyles[mode]}`}>
            <div className="space-y-2">
                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight">
                    {headline}
                </h2>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 max-w-2xl leading-relaxed">
                    {description}
                </p>
            </div>

            {physicalScreens.length > 1 && (
                <div className="mt-5 pt-4 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Alla skyltfönster
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {screenStatuses.map(({ screen, status, channel }) => {
                            const isOnline = status.state === 'online';
                            const isOfflineState = status.state === 'offline';
                            const activeCount = countActivePosts(channel);

                            return (
                                <div
                                    key={screen.id}
                                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 text-xs font-semibold"
                                >
                                    <span className="text-slate-900 dark:text-white truncate font-bold">
                                        {screen.name}
                                    </span>
                                    <span className="flex items-center gap-1.5 shrink-0">
                                        <span className={`w-2 h-2 rounded-full ${
                                            isOnline ? 'bg-emerald-500 animate-pulse' :
                                            isOfflineState ? 'bg-red-500' : 'bg-slate-400'
                                        }`} />
                                        <span className={
                                            isOnline ? 'text-emerald-700 dark:text-emerald-400' :
                                            isOfflineState ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
                                        }>
                                            {isOnline ? `${activeCount} inlägg` : isOfflineState ? 'Avstängd' : 'Ej kontaktad'}
                                        </span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const getFormatColor = (aspectRatio?: string) =>
    aspectRatio === '16:9' || aspectRatio === '4:3' ? 'bg-teal-500' : 'bg-purple-500';

const getFirstActivePost = (screen?: DisplayScreen): DisplayPost | undefined => {
    if (!screen || !screen.posts) return undefined;
    const now = new Date();
    for (const p of screen.posts) {
        if (p.status === 'archived' || p.status === 'draft' || !p.startDate) continue;
        const start = parseToDate(p.startDate, false);
        const end = p.endDate ? parseToDate(p.endDate, true) : null;
        if ((!start || start <= now) && (!end || end >= now)) {
            return p;
        }
    }
    return undefined;
};

const formatDeviceInfo = (info?: Record<string, any>): string | null => {
    if (!info) return null;
    const width = info.screenWidth || info.viewportWidth;
    const height = info.screenHeight || info.viewportHeight;
    const res = width && height ? `${width}×${height}` : '';
    
    let browser = '';
    const ua = info.userAgent || '';
    if (/chrome|crios|crmo/i.test(ua) && !/edg/i.test(ua)) {
        const match = ua.match(/(?:chrome|crios|crmo)\/(\d+)/i);
        browser = match ? `Chrome ${match[1]}` : 'Chrome';
    } else if (/edg/i.test(ua)) {
        const match = ua.match(/edg\/(\d+)/i);
        browser = match ? `Edge ${match[1]}` : 'Edge';
    } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
        const match = ua.match(/version\/(\d+)/i);
        browser = match ? `Safari ${match[1]}` : 'Safari';
    } else if (/firefox|fxios/i.test(ua)) {
        const match = ua.match(/(?:firefox|fxios)\/(\d+)/i);
        browser = match ? `Firefox ${match[1]}` : 'Firefox';
    } else if (ua) {
        browser = ua.slice(0, 20);
    }

    const parts = [res, browser].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : null;
};

const PhysicalScreenManager: React.FC<{ 
    organization: Organization;
    allDisplayScreens: DisplayScreen[];
    onUpdateOrganization: (orgId: string, data: Partial<Organization>) => Promise<void>;
    screenSessions?: Record<string, { lastHeartbeat?: Date; status?: string; displayScreenId?: string; deviceInfo?: any }>;
    statusNow?: number;
    onPreviewScreen?: (screen: DisplayScreen) => void;
}> = ({ organization, allDisplayScreens, onUpdateOrganization, screenSessions: propSessions, statusNow: propNow, onPreviewScreen }) => {
    const { showToast } = useToast();
    const [screenToRename, setScreenToRename] = useState<PhysicalScreen | null>(null);
    const [screenToDisconnect, setScreenToDisconnect] = useState<PhysicalScreen | null>(null);
    const [screenToChangeChannel, setScreenToChangeChannel] = useState<PhysicalScreen | null>(null);
    const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
    const physicalScreens = organization.physicalScreens || [];

    const [internalSessions, setInternalSessions] = useState<Record<string, { lastHeartbeat?: Date; status?: string; displayScreenId?: string; deviceInfo?: any }>>({});
    const [internalNow, setInternalNow] = useState(Date.now());

    useEffect(() => {
        if (propSessions) return;
        if (!organization?.id) return;
        const unsubscribe = listenToScreenSessions(organization.id, setInternalSessions);
        return () => unsubscribe();
    }, [organization?.id, propSessions]);

    useEffect(() => {
        if (propNow !== undefined) return;
        const t = setInterval(() => setInternalNow(Date.now()), 30000);
        return () => clearInterval(t);
    }, [propNow]);

    const screenSessions = propSessions ?? internalSessions;
    const statusNow = propNow ?? internalNow;

    const getScreenStatus = (physicalScreenId: string): { state: 'online' | 'offline' | 'unknown'; since?: Date } => {
        const session = screenSessions[physicalScreenId];
        if (!session?.lastHeartbeat) return { state: 'unknown' };
        const ageMs = statusNow - session.lastHeartbeat.getTime();
        return ageMs < 150000
            ? { state: 'online' }
            : { state: 'offline', since: session.lastHeartbeat };
    };
    
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {physicalScreens.map(screen => {
                            const channel = allDisplayScreens.find(s => s.id === screen.displayScreenId);
                            const screenStatus = getScreenStatus(screen.id);
                            const state = screenStatus.state;
                            const firstActivePost = getFirstActivePost(channel);
                            const devInfoText = formatDeviceInfo(screenSessions[screen.id]?.deviceInfo);

                            const aspectClass = channel?.aspectRatio === '9:16' ? 'aspect-[9/16] w-[130px]'
                                              : channel?.aspectRatio === '3:4' ? 'aspect-[3/4] w-[140px]'
                                              : channel?.aspectRatio === '4:3' ? 'aspect-[4/3] w-[210px]'
                                              : 'aspect-[16/9] w-[220px]';

                            return (
                                <div 
                                    key={screen.id} 
                                    className="bg-white dark:bg-slate-800/80 rounded-2xl p-5 border border-slate-200 dark:border-slate-700/80 shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-between text-center relative"
                                >
                                    {/* TV Frame Container */}
                                    <div className="flex flex-col items-center my-2">
                                        <div 
                                            onClick={() => {
                                                if (state === 'online' && channel && onPreviewScreen) {
                                                    onPreviewScreen(channel);
                                                }
                                            }}
                                            title={state === 'online' && channel ? "Förhandsgranska" : undefined}
                                            className={`${aspectClass} bg-slate-950 rounded-xl ring-4 ring-slate-900 shadow-lg relative overflow-hidden flex items-center justify-center ${
                                                state === 'online' && channel ? 'cursor-pointer hover:ring-slate-700 transition-all' : ''
                                            }`}
                                        >
                                            {state === 'online' ? (
                                                firstActivePost ? (
                                                    <ScaledPreviewWrapper aspectRatio={channel?.aspectRatio || '16:9'}>
                                                        <DisplayPostRenderer
                                                            post={firstActivePost}
                                                            organization={organization}
                                                            mode="preview"
                                                            showTags={false}
                                                        />
                                                    </ScaledPreviewWrapper>
                                                ) : (
                                                    <div className="p-3 text-slate-500 text-xs font-medium text-center">
                                                        Inga inlägg visas
                                                    </div>
                                                )
                                            ) : state === 'offline' ? (
                                                <div className="bg-black w-full h-full p-3 flex flex-col items-center justify-center text-center text-xs font-semibold text-red-500">
                                                    ⚠️ Offline sedan {screenStatus.since ? screenStatus.since.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : ''}
                                                </div>
                                            ) : (
                                                <div className="bg-slate-900 w-full h-full p-3 flex items-center justify-center text-center text-xs font-medium text-slate-400">
                                                    Väntar på kontakt — starta om TV:n
                                                </div>
                                            )}
                                        </div>
                                        {/* TV Stand foot */}
                                        <div className="w-10 h-2 bg-slate-700 dark:bg-slate-800 rounded-b-sm shadow-sm" />
                                    </div>

                                    {/* Info under TV */}
                                    <div className="w-full mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex flex-col items-center gap-2">
                                        <div className="w-full flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 truncate">
                                                <p className="font-bold text-base text-slate-900 dark:text-white truncate">{screen.name}</p>
                                                {state === 'online' && (
                                                    <span 
                                                        title={devInfoText ? `Hårdvara: ${devInfoText}` : undefined}
                                                        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/50 px-2 py-0.5 rounded-full shrink-0 cursor-default"
                                                    >
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                                                    </span>
                                                )}
                                                {state === 'offline' && (
                                                    <span 
                                                        title={devInfoText ? `Hårdvara: ${devInfoText}` : undefined}
                                                        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200/60 dark:border-red-800/50 px-2 py-0.5 rounded-full shrink-0 cursor-default"
                                                    >
                                                        Offline
                                                    </span>
                                                )}
                                                {state === 'unknown' && (
                                                    <span 
                                                        title={devInfoText ? `Hårdvara: ${devInfoText}` : undefined}
                                                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full shrink-0 cursor-default"
                                                    >
                                                        Okänd
                                                    </span>
                                                )}
                                            </div>

                                            {/* Dropdown Menu ⋮ */}
                                            <div className="relative shrink-0">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveDropdownId(prev => prev === screen.id ? null : screen.id);
                                                    }}
                                                    title="Alternativ"
                                                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-300 transition-all shadow-sm cursor-pointer"
                                                >
                                                    <EllipsisVerticalIcon className="h-4 w-4" />
                                                </button>

                                                {activeDropdownId === screen.id && (
                                                    <>
                                                        <div 
                                                            className="fixed inset-0 z-40 cursor-default" 
                                                            onClick={(e) => { e.stopPropagation(); setActiveDropdownId(null); }}
                                                        />
                                                        <div 
                                                            onClick={(e) => e.stopPropagation()} 
                                                            className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl py-1.5 z-50 text-left text-slate-800 dark:text-slate-100"
                                                        >
                                                            {devInfoText && (
                                                                <div className="px-3.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium border-b border-slate-100 dark:border-slate-700/60 truncate" title={devInfoText}>
                                                                    🖥️ {devInfoText}
                                                                </div>
                                                            )}
                                                            <button
                                                                onClick={() => {
                                                                    setActiveDropdownId(null);
                                                                    setScreenToChangeChannel(screen);
                                                                }}
                                                                className="w-full px-3.5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 transition-colors cursor-pointer"
                                                            >
                                                                <MonitorIcon className="h-4 w-4 text-slate-400" />
                                                                Byt kanal
                                                            </button>
                                                            <div className="border-t border-slate-100 dark:border-slate-700 my-1"></div>
                                                            <button
                                                                onClick={() => {
                                                                    setActiveDropdownId(null);
                                                                    setScreenToRename(screen);
                                                                }}
                                                                className="w-full px-3.5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 transition-colors cursor-pointer"
                                                            >
                                                                <PencilIcon className="h-4 w-4 text-slate-400" />
                                                                Byt namn
                                                            </button>
                                                            <div className="border-t border-slate-100 dark:border-slate-700 my-1"></div>
                                                            <button
                                                                onClick={() => {
                                                                    setActiveDropdownId(null);
                                                                    setScreenToDisconnect(screen);
                                                                }}
                                                                className="w-full px-3.5 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 flex items-center gap-2 transition-colors cursor-pointer"
                                                            >
                                                                <TrashIcon className="h-4 w-4 text-red-500" />
                                                                Koppla från
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Channel & Format chips */}
                                        <div className="w-full flex items-center justify-start flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-900/20 truncate">
                                                Visar: {getChannelName(screen.displayScreenId)}
                                            </span>
                                            {channel && (
                                                channel.aspectRatio === '9:16' || channel.aspectRatio === '3:4' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-900/40">
                                                        <FormatGlyph aspectRatio={channel.aspectRatio} className="scale-75 -mx-0.5" />
                                                        Stående {channel.aspectRatio}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-900/40">
                                                        <FormatGlyph aspectRatio={channel.aspectRatio} className="scale-75 -mx-0.5" />
                                                        Liggande {channel.aspectRatio || '16:9'}
                                                    </span>
                                                )
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
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

            {/* Byt kanal dialog */}
            {screenToChangeChannel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
                                Byt kanal på {screenToChangeChannel.name}
                            </h3>
                            <button
                                onClick={() => setScreenToChangeChannel(null)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl font-bold p-1"
                            >
                                ✕
                            </button>
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Välj vilken kanal skyltfönstret ska visa. Ändringen sker direkt på skärmen utan omparning.
                        </p>

                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                            {allDisplayScreens.map(ch => {
                                const isCurrent = ch.id === screenToChangeChannel.displayScreenId;
                                return (
                                    <button
                                        key={ch.id}
                                        disabled={isCurrent}
                                        onClick={async () => {
                                            try {
                                                await changeScreenChannel(organization.id, screenToChangeChannel.id, ch.id);
                                                const updatedScreens = physicalScreens.map(s => 
                                                    s.id === screenToChangeChannel.id ? { ...s, displayScreenId: ch.id } : s
                                                );
                                                await onUpdateOrganization(organization.id, { physicalScreens: updatedScreens });
                                                showToast({ message: `${screenToChangeChannel.name} visar nu ${ch.name}.`, type: 'success' });
                                                setScreenToChangeChannel(null);
                                            } catch (e) {
                                                showToast({ message: `Kunde inte byta kanal: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
                                            }
                                        }}
                                        className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                                            isCurrent
                                                ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 opacity-75 cursor-not-allowed'
                                                : 'border-slate-200 dark:border-slate-800 hover:border-teal-500 hover:bg-teal-500/5 bg-white dark:bg-slate-900 cursor-pointer'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                                                {ch.name}
                                            </span>
                                            {isCurrent && (
                                                <span className="text-xs font-semibold text-slate-400 italic">
                                                    (visas nu)
                                                </span>
                                            )}
                                        </div>
                                        
                                        {ch.aspectRatio === '9:16' || ch.aspectRatio === '3:4' ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-900/40 flex-shrink-0">
                                                <FormatGlyph aspectRatio={ch.aspectRatio} className="scale-75 -mx-0.5" />
                                                Stående {ch.aspectRatio}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-900/40 flex-shrink-0">
                                                <FormatGlyph aspectRatio={ch.aspectRatio} className="scale-75 -mx-0.5" />
                                                Liggande {ch.aspectRatio || '16:9'}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex justify-end pt-2">
                            <SecondaryButton onClick={() => setScreenToChangeChannel(null)}>
                                Avbryt
                            </SecondaryButton>
                        </div>
                    </div>
                </div>
            )}

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
    isOnboardingDismissed: boolean;
    onDismissOnboarding: () => void;
    onGoToBranding?: () => void;
}

export const SkyltfonsterTab: React.FC<SkyltfonsterTabProps> = (props) => {
    const { 
        organization, 
        displayScreens, 
        onUpdateOrganization, 
        onEditDisplayScreen, 
        onOpenPairingModal, 
        onPreviewScreen, 
        onShareScreen,
        isOnboardingDismissed,
        onDismissOnboarding,
        onGoToBranding
    } = props;
    const { addDisplayScreen, updateDisplayScreen, deleteDisplayScreen, locationLoading, screensReady } = useLocation();
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();
    
    const hasChannel = (displayScreens || []).length > 0;
    const hasPost = (displayScreens || []).some(screen => (screen.posts || []).length > 0);
    const hasConnectedScreen = (organization.physicalScreens || []).length > 0;
    const allStepsCompleted = hasChannel && hasPost && hasConnectedScreen;

    // Auto-dismiss ENDAST för befintliga kunder: körs en gång, direkt när datat laddats klart.
    // Om stegen slutförs senare under sessionen visas firandet och användaren stänger själv.
    const initialOnboardingCheckDone = useRef(false);
    useEffect(() => {
        if (locationLoading || !screensReady || initialOnboardingCheckDone.current) return;
        initialOnboardingCheckDone.current = true;
        if (allStepsCompleted && !isOnboardingDismissed) {
            onDismissOnboarding();
        }
    }, [locationLoading, screensReady, allStepsCompleted, isOnboardingDismissed, onDismissOnboarding]);

    const handleCreatePost = () => {
        if (displayScreens && displayScreens.length > 0) {
            onEditDisplayScreen(displayScreens[0]);
        }
    };

    const handleOpenSkylie = () => {
        window.dispatchEvent(new Event('open-skylie'));
    };
    
    // Idea Generation States
    const [ideaModalEvent, setIdeaModalEvent] = useState<{ name: string; date: Date } | null>(null);
    const [isRhythmIdeaModalOpen, setIsRhythmIdeaModalOpen] = useState(false);
    const [rhythmContext, setRhythmContext] = useState('');
    const [isSeasonalIdeaModalOpen, setIsSeasonalIdeaModalOpen] = useState(false);
    const [seasonalContext, setSeasonalContext] = useState('');

    // Screen Management States
    const [screenToDelete, setScreenToDelete] = useState<DisplayScreen | null>(null);
    const [expandedScreenId, setExpandedScreenId] = useState<string | null>(null);
    const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
    const [selectedSettingsScreen, setSelectedSettingsScreen] = useState<DisplayScreen | null>(null);

    const physicalScreens = organization.physicalScreens || [];

    const [screenSessions, setScreenSessions] = useState<Record<string, { lastHeartbeat?: Date; status?: string; displayScreenId?: string }>>({});
    const [statusNow, setStatusNow] = useState(Date.now());

    useEffect(() => {
        if (!organization?.id) return;
        const unsubscribe = listenToScreenSessions(organization.id, setScreenSessions);
        return () => unsubscribe();
    }, [organization?.id]);

    useEffect(() => {
        const t = setInterval(() => setStatusNow(Date.now()), 30000);
        return () => clearInterval(t);
    }, []);

    const handleGenerateIdeasClick = (event: { name: string; date: Date; icon: string; }) => {
        setIdeaModalEvent(event);
    };
    
    const handleCreateScreenTemplate = async () => {
        setIsSaving(true);
        try {
            const existingNames = new Set((displayScreens || []).map(s => s.name));
            let n = 1;
            while (existingNames.has(`Kanal ${n}`)) n++;

            const newScreen: Omit<DisplayScreen, 'id'> = {
                name: `Kanal ${n}`,
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

    return (
        <div className="space-y-8">
            {!isOnboardingDismissed && !locationLoading && screensReady && (
                <OnboardingChecklist
                    hasChannel={hasChannel}
                    hasPost={hasPost}
                    hasConnectedScreen={hasConnectedScreen}
                    onCreateChannel={handleCreateScreenTemplate}
                    onCreatePost={handleCreatePost}
                    onConnectScreen={onOpenPairingModal}
                    onOpenSkylie={handleOpenSkylie}
                    onDismiss={onDismissOnboarding}
                    onGoToBranding={onGoToBranding}
                />
            )}

            <MyScreenSummaryPanel
                physicalScreens={physicalScreens}
                displayScreens={displayScreens}
                screenSessions={screenSessions}
                statusNow={statusNow}
            />

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
                                const screensShowingChannel = (organization.physicalScreens || []).filter(ps => ps.displayScreenId === screen.id);
                                return (
                                <div 
                                    key={screen.id} 
                                    className={`bg-white dark:bg-slate-800/90 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm hover:shadow-md transition-all duration-300 relative group/row ${
                                        activeDropdownId === screen.id ? 'overflow-visible z-30' : 'overflow-hidden'
                                    }`}
                                >
                                   {/* Left accent border representing layout orientation/aspect-ratio */}
                                   <div className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors duration-300 ${getFormatColor(screen.aspectRatio)}`} />
                                   
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
                                               aria-controls={`tabla-${screen.id}`}
                                           >
                                               <ChevronDownIcon className={`h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-slate-700 dark:text-slate-200' : ''}`} />
                                               <span>{isExpanded ? 'Dölj tablå' : 'Visa tablå'}</span>
                                           </button>
                                           
                                           <div className="hidden sm:block w-px h-6 bg-slate-200 dark:bg-slate-700"></div>
                                           <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:gap-3 flex-wrap">
                                               <div className="flex items-center gap-2">
                                                   <FormatGlyph aspectRatio={screen.aspectRatio} />
                                                   <p className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">{screen.name}</p>
                                               </div>
                                               
                                               {screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4' ? (
                                                   <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-900/40">
                                                       <FormatGlyph aspectRatio={screen.aspectRatio} className="scale-75 -mx-0.5" />
                                                       Stående {screen.aspectRatio}
                                                   </span>
                                               ) : (
                                                   <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-900/40">
                                                       <FormatGlyph aspectRatio={screen.aspectRatio} className="scale-75 -mx-0.5" />
                                                       Liggande {screen.aspectRatio}
                                                   </span>
                                               )}

                                               {screensShowingChannel.length > 0 ? (
                                                   screensShowingChannel.map(ps => (
                                                       <span key={ps.id} className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-900/40">
                                                           📺 {ps.name}
                                                       </span>
                                                   ))
                                               ) : (
                                                   <span className="text-xs text-slate-400">
                                                       Visas inte på någon skärm ännu
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
                                                   className="bg-teal-600 hover:bg-teal-500 shadow-sm active:scale-95 transition-all text-sm font-semibold !px-4"
                                               >
                                                   Hantera inlägg
                                               </PrimaryButton>
                                               

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
                                                                       onPreviewScreen(screen);
                                                                   }}
                                                                   className="w-full px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2.5 transition-colors cursor-pointer"
                                                               >
                                                                   <EyeIcon className="h-4 w-4 text-slate-400" />
                                                                   Förhandsgranska
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

                                    {isExpanded && (
                                        <div id={`tabla-${screen.id}`} className="border-t border-slate-200 dark:border-slate-700/80 p-0 sm:p-5 bg-slate-50 dark:bg-slate-900/30 animate-fade-in">
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
                            screenSessions={screenSessions}
                            statusNow={statusNow}
                            onPreviewScreen={onPreviewScreen}
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
