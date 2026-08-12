import React, { useState, useMemo, useEffect } from 'react';
import { DisplayScreen, Organization, DisplayPost } from '../../types';
import { useToast } from '../../context/ToastContext';
import { PrimaryButton } from '../Buttons';
import { 
    PencilIcon, TrashIcon, EllipsisVerticalIcon, SparklesIcon, 
    ShareIcon, DownloadIcon, 
    VideoCameraIcon, MagnifyingGlassIcon,
    ListBulletIcon, FunnelIcon, ArrowUturnLeftIcon,
    ChevronDownIcon, CalendarIcon
} from '../icons';
import { RemixModal } from './Modals';
import { DisplayPostRenderer } from '../DisplayPostRenderer';
import { ScaledPreviewWrapper } from './PreviewPanes';
import { listenToQrScanCounts } from '../../services/firebaseService';
import { parseToDate } from '../../utils/dateUtils';

interface ControlPanelProps {
    screen: DisplayScreen;
    organization: Organization;
    onUpdateScreen: (data: Partial<DisplayScreen>) => Promise<void>;
    onEditPost: (post: DisplayPost) => void;
    onDeletePost: (id: string) => void;
    onDownloadPost: (post: DisplayPost) => void;
    onInitiateCreatePost: () => void;
    onInitiateExpressPublish: () => void;
    onSharePost: (post: DisplayPost) => void;
    openDropdownId: string | null;
    setOpenDropdownId: (id: string | null) => void;
    dropdownRef: React.RefObject<HTMLDivElement>;
}

type PostStatus = 'active' | 'scheduled' | 'ended' | 'archived' | 'draft';
type FilterOption = 'all' | 'active' | 'scheduled' | 'ended' | 'archived' | 'draft';

export const ControlPanel: React.FC<ControlPanelProps> = ({
    screen,
    organization,
    onUpdateScreen,
    onEditPost,
    onDeletePost,
    onDownloadPost,
    onInitiateCreatePost,
    onInitiateExpressPublish,
    onSharePost,
    openDropdownId,
    setOpenDropdownId,
    dropdownRef
}) => {
    const [remixPost, setRemixPost] = useState<DisplayPost | null>(null);
    const [scheduleEditorPostId, setScheduleEditorPostId] = useState<string | null>(null);
    const { showToast } = useToast();

    const handleUpdatePostSchedule = async (
        postId: string,
        changes: Partial<Pick<DisplayPost, 'startDate' | 'endDate' | 'status'>>
    ) => {
        try {
            const updatedPosts = (screen.posts || []).map(p =>
                p.id === postId ? { ...p, ...changes } : p
            );
            await onUpdateScreen({ posts: updatedPosts });
        } catch (err) {
            console.error('Schemauppdatering misslyckades för inlägg', postId, err);
            showToast({
                message: `Kunde inte spara datumet: ${err instanceof Error ? err.message : 'Okänt fel'}`,
                type: 'error'
            });
        }
    };

    // Fältet heter isExpressSold av historiska skäl men används numera för SÅLD-stämpeln på alla inlägg
    const handleToggleSold = async (post: DisplayPost) => {
        try {
            const updatedPosts = (screen.posts || []).map(p =>
                p.id === post.id ? { ...p, isExpressSold: !p.isExpressSold } : p
            );
            await onUpdateScreen({ posts: updatedPosts });
        } catch (err) {
            console.error('Kunde inte ändra SÅLD-status för inlägg', post.id, err);
            showToast({
                message: `Kunde inte ändra status: ${err instanceof Error ? err.message : 'Okänt fel'}`,
                type: 'error'
            });
        }
    };

    const [qrScanCounts, setQrScanCounts] = useState<Record<string, { count: number; lastScanAt?: Date; daily?: Record<string, number>; screenId?: string }>>({});

    useEffect(() => {
        if (!organization?.id) return;
        const unsubscribe = listenToQrScanCounts(organization.id, setQrScanCounts);
        return () => unsubscribe();
    }, [organization?.id]);

    // Aggregerad QR-statistik för denna skärm, senaste 7 dagarna (UTC-datum, samma som loggningen)
    const qrWeekStats = useMemo(() => {
        const postIds = new Set((screen.posts || []).map(p => p.id));
        const dayLabels = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
        const days: { date: string; label: string; total: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push({ date: d.toISOString().slice(0, 10), label: dayLabels[d.getDay()], total: 0 });
        }
        let allTimeTotal = 0;
        Object.entries(qrScanCounts).forEach(([postId, data]) => {
            if (!postIds.has(postId)) return;
            allTimeTotal += data.count || 0;
            days.forEach(day => { day.total += data.daily?.[day.date] || 0; });
        });
        const weekTotal = days.reduce((sum, d) => sum + d.total, 0);
        return { days, weekTotal, allTimeTotal };
    }, [qrScanCounts, screen.posts]);
    
    // View State
    const [sortOption, setSortOption] = useState<'manual' | 'newest' | 'alpha'>('manual');
    const [filterStatus, setFilterStatus] = useState<FilterOption>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const counts = useMemo(() => {
        const posts = screen.posts || [];
        let active = 0;
        let scheduled = 0;
        let draft = 0;
        let archived = 0;

        posts.forEach(p => {
            if (p.status === 'archived') {
                archived++;
                return;
            }
            if (!p.startDate || p.status === 'draft') {
                draft++;
                return;
            }
            const now = new Date();
            const start = parseToDate(p.startDate, false);
            const end = p.endDate ? parseToDate(p.endDate, true) : null;

            if (start && start > now) {
                scheduled++;
            } else if (end && end < now) {
                draft++; // Ended is counted as expired / draft
            } else {
                active++;
            }
        });

        return { active, scheduled, draft, archived };
    }, [screen.posts]);
    
    const getPostStatus = (post: DisplayPost): PostStatus => {
        if (post.status === 'archived') return 'archived';
        if (post.status === 'draft' || !post.startDate) return 'draft';

        const now = new Date();
        const start = parseToDate(post.startDate, false);
        const end = post.endDate ? parseToDate(post.endDate, true) : null;

        if (start && start > now) return 'scheduled';
        if (end && end < now) return 'ended';
        return 'active';
    };

    const filteredPosts = useMemo(() => {
        let posts = [...(screen.posts || [])];

        // 1. Filter by Status
        if (filterStatus === 'archived') {
            // Only show archived posts
            posts = posts.filter(p => p.status === 'archived');
        } else {
            // For all other views, HIDE archived posts first
            posts = posts.filter(p => p.status !== 'archived');

            if (filterStatus !== 'all') {
                posts = posts.filter(p => getPostStatus(p) === filterStatus);
            }
        }

        // 2. Filter by Search
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            posts = posts.filter(p => p.internalTitle.toLowerCase().includes(lowerQuery) || p.headline?.toLowerCase().includes(lowerQuery));
        }

        // 3. Sort
        switch (sortOption) {
            case 'newest':
                return posts.sort((a, b) => {
                    const timeA = parseInt(a.id.split('-')[1] || '0');
                    const timeB = parseInt(b.id.split('-')[1] || '0');
                    return timeB - timeA;
                });
            case 'alpha':
                return posts.sort((a, b) => a.internalTitle.localeCompare(b.internalTitle));
            case 'manual':
            default:
                return posts;
        }
    }, [screen.posts, sortOption, searchQuery, filterStatus]);

    const handleMovePost = async (post: DisplayPost, direction: 'up' | 'down') => {
        const visibleIdx = filteredPosts.findIndex(p => p.id === post.id);
        const neighbor = filteredPosts[visibleIdx + (direction === 'up' ? -1 : 1)];
        if (!neighbor) return;
        const newPosts = [...(screen.posts || [])];
        const fromIdx = newPosts.findIndex(p => p.id === post.id);
        const toIdx = newPosts.findIndex(p => p.id === neighbor.id);
        if (fromIdx === -1 || toIdx === -1) return;
        newPosts.splice(fromIdx, 1);
        newPosts.splice(toIdx, 0, post);
        await onUpdateScreen({ posts: newPosts });
    };

    const handleArchivePost = async (post: DisplayPost) => {
        const updatedPosts = (screen.posts || []).map(p => 
            p.id === post.id ? { ...p, status: 'archived' as const } : p
        );
        await onUpdateScreen({ posts: updatedPosts });
        showToast({ message: "Inlägget har arkiverats.", type: 'success' });
    };

    const handleRestorePost = async (post: DisplayPost) => {
        const updatedPosts = (screen.posts || []).map(p => 
            p.id === post.id ? { ...p, status: 'active' as const } : p
        );
        await onUpdateScreen({ posts: updatedPosts });
        showToast({ message: "Inlägget har återställts.", type: 'success' });
    };

    const handleToggleTagOnPost = async (post: DisplayPost, tagId: string) => {
        try {
            const currentTagIds = post.tagIds || [];
            const nextTagIds = currentTagIds.includes(tagId)
                ? currentTagIds.filter(id => id !== tagId)
                : [...currentTagIds, tagId];
            
            const updatedPosts = (screen.posts || []).map(p => 
                p.id === post.id ? { ...p, tagIds: nextTagIds } : p
            );

            await onUpdateScreen({ posts: updatedPosts });
            showToast({ message: "Skärmen har uppdaterats!", type: 'success' });
        } catch (error) {
            console.error(error);
            showToast({ message: "Kunde inte spara stämpel.", type: 'error' });
        }
    };

    const handleRemixSelect = (variant: DisplayPost) => {
        const newPost = { ...variant, id: `post-${Date.now()}` };
        const updatedPosts = [newPost, ...(screen.posts || [])];
        onUpdateScreen({ posts: updatedPosts }).then(() => {
            showToast({ message: "Remix tillagd!", type: 'success' });
            setRemixPost(null);
        });
    };

    const formatDate = (isoString?: string) => {
        if (!isoString) return '';
        const d = parseToDate(isoString, false);
        return d ? d.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' }) : '';
    };

    const StatusPill: React.FC<{ status: PostStatus, post: DisplayPost }> = ({ status, post }) => {
        let bgClass = 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600';
        let dotClass = 'bg-slate-400';
        let text = 'Okänd status';

        switch (status) {
            case 'active':
                bgClass = 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800';
                dotClass = 'bg-green-500';
                text = `Publicerad ${formatDate(post.startDate)} - ${formatDate(post.endDate) || 'tills vidare'}`;
                break;
            case 'scheduled':
                bgClass = 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
                dotClass = 'bg-blue-500';
                text = `Schemalagd ${formatDate(post.startDate)}`;
                break;
            case 'ended':
                bgClass = 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600';
                dotClass = 'bg-slate-400';
                text = `Avslutades ${formatDate(post.endDate)}`;
                break;
            case 'archived':
                bgClass = 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-500 border border-yellow-200 dark:border-yellow-800';
                dotClass = 'bg-yellow-500';
                text = 'Arkiverad';
                break;
            case 'draft':
                bgClass = 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 dashed-border';
                dotClass = 'bg-gray-400';
                text = 'Utkast (inget datum)';
                break;
        }

        return (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${bgClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                {text}
            </span>
        );
    };

    const isPortrait = screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4';
    const thumbClass = isPortrait ? 'w-12 h-20' : 'w-20 h-12';

    return (
        <div className="space-y-6">
            
            {/* --- Inlägg (Posts) list is now Card 1 --- */}

            {/* --- Card 2: Inlägg (Posts) --- */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-4">
                
                {/* Top Row: Header & Actions */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex flex-col gap-1 w-full sm:w-auto">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-lg text-slate-800 dark:text-white">Inlägg</h3>
                            <span className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold px-2 py-0.5 rounded-full" title={screen.postsUnreadable ? "Inläggen kunde inte läsas in" : "Aktiva inlägg i flödet"}>
                                {screen.postsUnreadable ? '– aktiva' : `${counts.active} aktiv${counts.active === 1 ? 't' : 'a'}`}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                            {screen.postsUnreadable ? (
                                <span className="flex items-center gap-1 shrink-0" title="Inläggen kunde inte läsas in">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    – utkast
                                </span>
                            ) : (
                                <>
                                    {counts.scheduled > 0 && (
                                        <span className="flex items-center gap-1 shrink-0" title={`${counts.scheduled} inlägg kommer startas i framtiden`}>
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                            {counts.scheduled} schemalagda
                                        </span>
                                    )}
                                    {counts.draft > 0 && (
                                        <span className="flex items-center gap-1 shrink-0" title={`${counts.draft} utkast`}>
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                            {counts.draft} utkast
                                        </span>
                                    )}
                                    {counts.archived > 0 && (
                                        <span className="flex items-center gap-1 shrink-0" title={`${counts.archived} arkiverade inlägg`}>
                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-450" />
                                            {counts.archived} arkiv
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="w-full sm:w-auto flex flex-wrap items-center gap-2.5 justify-end">
                        <button
                            type="button"
                            onClick={onInitiateExpressPublish}
                            disabled={screen.postsUnreadable}
                            title={screen.postsUnreadable ? "Inläggen kunde inte läsas — ladda om sidan först." : undefined}
                            className={`py-2 px-4 shadow-sm text-sm font-semibold flex items-center justify-center gap-1.5 bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900/50 hover:bg-teal-100 dark:hover:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-xl transition-all h-[38px] ${screen.postsUnreadable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
                        >
                            <span>Skapa snabb-inlägg</span>
                            <span className="text-amber-500 font-bold">⚡</span>
                        </button>
                        <PrimaryButton 
                            onClick={onInitiateCreatePost} 
                            disabled={screen.postsUnreadable}
                            title={screen.postsUnreadable ? "Inläggen kunde inte läsas — ladda om sidan först." : undefined}
                            className="shadow-lg shadow-primary/20 !h-[38px] flex items-center justify-center"
                        >
                            + Skapa inlägg
                        </PrimaryButton>
                    </div>
                </div>

                {/* Bottom Row: Filters (Collapsible or Always visible) */}
                <div className="flex flex-col lg:flex-row gap-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                    <div className="relative flex-grow">
                        <input
                            type="text"
                            placeholder="Sök inlägg..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                        />
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    </div>
                    
                    <div className="flex gap-2 w-full lg:w-auto">
                        <div className="relative flex-1 lg:w-48">
                            <select 
                                value={filterStatus} 
                                onChange={(e) => setFilterStatus(e.target.value as FilterOption)}
                                className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm px-3 py-2 pr-8 focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
                            >
                                <option value="all">Visa alla</option>
                                <option value="active">Endast Publicerade</option>
                                <option value="draft">Utkast</option>
                                <option value="scheduled">Endast Schemalagda</option>
                                <option value="ended">Endast Avslutade</option>
                                <option value="archived">Arkiverade</option>
                            </select>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <FunnelIcon className="w-4 h-4" />
                            </div>
                        </div>

                        <div className="relative flex-1 lg:w-48">
                            <select 
                                value={sortOption} 
                                onChange={(e) => setSortOption(e.target.value as any)}
                                className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm px-3 py-2 pr-8 focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
                            >
                                <option value="manual">Manuell ordning</option>
                                <option value="newest">Senast skapad</option>
                                <option value="alpha">Namn (A-Ö)</option>
                            </select>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <ListBulletIcon className="w-4 h-4" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Warning if sorting/filtering is active */}
            {sortOption !== 'manual' && (
                <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 text-sm px-4 py-2 rounded-lg flex items-center gap-2 border border-blue-200 dark:border-blue-800/50">
                    <FunnelIcon className="w-4 h-4" />
                    <span>Listan är sorterad. Byt till <strong>Manuell ordning</strong> för att kunna flytta inlägg.</span>
                </div>
            )}

            {qrWeekStats.allTimeTotal > 0 && (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 flex items-center justify-between gap-4 mb-3">
                    <div>
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400">QR-skanningar senaste 7 dagarna</div>
                        <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">{qrWeekStats.weekTotal}</div>
                        <div className="text-[10px] text-slate-400">Totalt {qrWeekStats.allTimeTotal} sedan start</div>
                    </div>
                    <div className="flex items-end gap-1.5">
                        {qrWeekStats.days.map(day => {
                            const max = Math.max(...qrWeekStats.days.map(d => d.total), 1);
                            const barHeight = Math.max(3, Math.round((day.total / max) * 40));
                            return (
                                <div key={day.date} className="flex flex-col items-center gap-0.5" title={`${day.date}: ${day.total} skanningar`}>
                                    <div className="w-4 bg-emerald-400 dark:bg-emerald-500 rounded-sm" style={{ height: `${barHeight}px` }} />
                                    <span className="text-[8px] text-slate-400">{day.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Post List */}
            <div className="space-y-3">
                {screen.postsUnreadable && (
                    <div className="bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-sm p-4 rounded-lg border border-amber-200 dark:border-amber-800/50 border-l-4 border-l-amber-500 font-medium">
                        ⚠️ Inläggen kunde inte läsas in. Ladda om sidan innan du ändrar något — sparar du nu riskerar du att radera inlägg.
                    </div>
                )}
                {filteredPosts.length > 0 ? (
                    filteredPosts.map((post, index) => {
                        const status = getPostStatus(post);
                        const isMenuOpen = openDropdownId === post.id;
                        const isArchivedView = filterStatus === 'archived';
                        
                        const isExpress = post.internalTitle?.startsWith('⚡ Express:');
                        const displayTitle = isExpress ? post.internalTitle.replace(/^⚡ Express:\s*/, '') : post.internalTitle;
                        
                        const cardBorders = isExpress
                            ? 'border-l-[5px] border-l-amber-500 dark:border-l-amber-600 bg-amber-500/[0.01] dark:bg-amber-500/[0.02]'
                            : '';
                        
                        let opacityClass = status === 'ended' || status === 'archived' ? 'opacity-75 bg-slate-50 dark:bg-slate-800/50' : 'opacity-100';
                        
                        return (
                            <div 
                                key={post.id} 
                                className={`group bg-white dark:bg-slate-800 p-3 rounded-lg border flex flex-col gap-1 transition-all hover:shadow-md border-slate-200 dark:border-slate-700 ${cardBorders} ${opacityClass} ${isMenuOpen ? 'relative z-20' : 'relative z-0'}`}
                            >
                                <div className="flex items-start gap-4 w-full">
                                    {sortOption === 'manual' && (
                                        <div className="flex flex-col gap-0.5 flex-shrink-0 mt-1">
                                            <button 
                                                type="button" 
                                                onClick={(e) => { e.stopPropagation(); handleMovePost(post, 'up'); }} 
                                                disabled={index === 0 || screen.postsUnreadable} 
                                                className="p-0.5 rounded text-slate-300 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" 
                                                title={screen.postsUnreadable ? "Inläggen kunde inte läsas — ladda om sidan först." : "Flytta upp"}
                                            >
                                                <ChevronDownIcon className="w-4 h-4 rotate-180" />
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={(e) => { e.stopPropagation(); handleMovePost(post, 'down'); }} 
                                                disabled={index === filteredPosts.length - 1 || screen.postsUnreadable} 
                                                className="p-0.5 rounded text-slate-300 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" 
                                                title={screen.postsUnreadable ? "Inläggen kunde inte läsas — ladda om sidan först." : "Flytta ned"}
                                            >
                                                <ChevronDownIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                    
                                    {/* Thumbnail - Responsive to Aspect Ratio */}
                                    <div className={`${thumbClass} bg-slate-100 dark:bg-slate-900 rounded overflow-hidden flex-shrink-0 relative border border-slate-100 dark:border-slate-700 shadow-sm mt-1`}>
                                        <ScaledPreviewWrapper aspectRatio={screen.aspectRatio}>
                                            <DisplayPostRenderer 
                                                post={post} 
                                                organization={organization} 
                                                mode="preview" 
                                                showTags={false} 
                                                aspectRatio={screen.aspectRatio}
                                            />
                                        </ScaledPreviewWrapper>
                                        {post.layout.includes('video') && <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none"><VideoCameraIcon className="w-4 h-4 text-white drop-shadow-md"/></div>}
                                    </div>
     
                                    {/* Info */}
                                    <div className="flex-grow min-w-0 flex flex-col justify-start">
                                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                            {isExpress && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950/45 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-805/40 select-none">
                                                    <span>⚡ Snabb-inlägg</span>
                                                </span>
                                            )}
                                            {post.qrCodeUrl && (qrScanCounts[post.id]?.count ?? 0) > 0 && (
                                                <span
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/50 select-none"
                                                    title="Antal skanningar av inläggets QR-kod från skyltfönstret"
                                                >
                                                    📱 {qrScanCounts[post.id].count} skanningar
                                                </span>
                                            )}
                                            <h4 className="font-bold text-slate-800 dark:text-slate-200 truncate text-sm sm:text-base" title={post.internalTitle}>{displayTitle}</h4>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <StatusPill status={status} post={post} />
                                            <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-2">
                                                <span>|</span>
                                                <span className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono text-slate-600 dark:text-slate-300">{post.durationSeconds}s</span>
                                                <span className="capitalize hidden sm:inline">{post.layout.replace(/-/g, ' ')}</span>
                                            </div>
                                        </div>

                                        {/* Action tags/stamps toggle on posts */}
                                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 w-full">
                                            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 select-none">
                                                <span>Stämplar:</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {/* SÅLD Stamp */}
                                                <button
                                                    type="button"
                                                    disabled={screen.postsUnreadable}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleSold(post);
                                                    }}
                                                    className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 select-none ${
                                                        screen.postsUnreadable 
                                                            ? 'opacity-50 cursor-not-allowed' 
                                                            : 'cursor-pointer active:scale-95'
                                                    } ${
                                                        post.isExpressSold
                                                            ? 'bg-[#ef4444] text-white border-[#ef4444]'
                                                            : 'border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/30'
                                                    }`}
                                                    title={screen.postsUnreadable ? "Inläggen kunde inte läsas — ladda om sidan först." : (post.isExpressSold ? 'Klicka för att ta bort SÅLD' : 'Klicka för att markera som såld')}
                                                >
                                                    <span>🔴</span>
                                                    <span>SÅLD</span>
                                                    {post.isExpressSold && (
                                                        <span className="text-[9px] bg-white/20 dark:bg-black/20 px-1 rounded ml-1 font-mono font-extrabold text-white">AKTIV</span>
                                                    )}
                                                </button>

                                                {organization.tags && organization.tags.length > 0 ? (
                                                    organization.tags.map(tag => {
                                                        const isActive = (post.tagIds || []).includes(tag.id);
                                                        return (
                                                            <button
                                                                type="button"
                                                                key={tag.id}
                                                                disabled={screen.postsUnreadable}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleToggleTagOnPost(post, tag.id);
                                                                }}
                                                                className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 border-slate-200 dark:border-slate-700/80 select-none ${
                                                                    screen.postsUnreadable 
                                                                        ? 'opacity-50 cursor-not-allowed' 
                                                                        : 'cursor-pointer active:scale-95 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/30'
                                                                }`}
                                                                style={isActive ? { backgroundColor: tag.backgroundColor, color: tag.textColor, borderColor: tag.backgroundColor } : {}}
                                                                title={screen.postsUnreadable ? "Inläggen kunde inte läsas — ladda om sidan först." : `Klicka för att ${isActive ? 'avaktivera' : 'aktivera'} ${tag.text}`}
                                                            >
                                                                <span>{tag.displayType === 'stamp' ? '💮' : '🏷️'}</span>
                                                                <span>{tag.text}</span>
                                                                {isActive && (
                                                                    <span className="text-[9px] bg-white/20 dark:bg-black/20 px-1 rounded ml-1 font-mono font-extrabold text-white">AKTIV</span>
                                                                )}
                                                            </button>
                                                        );
                                                    })
                                                ) : (
                                                    <span className="text-[11px] text-slate-400 dark:text-slate-500 italic select-none ml-1">
                                                        Mallen har inga övriga stämplar definierade.
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
     
                                    {/* Actions */}
                                    <div className="relative mt-1 flex items-center gap-1" ref={isMenuOpen ? dropdownRef : null}>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setScheduleEditorPostId(scheduleEditorPostId === post.id ? null : post.id); }}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                            title="Schemalägg & publicera"
                                        >
                                            <CalendarIcon className="w-4 h-4" />
                                            {['active', 'scheduled'].includes(getPostStatus(post)) ? 'Ändra datum' : 'Publicera'}
                                        </button>

                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setOpenDropdownId(isMenuOpen ? null : post.id); }}
                                            className={`p-2 rounded-full transition-colors ${isMenuOpen ? 'bg-slate-100 dark:bg-slate-700 text-slate-900' : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                                        >
                                            <EllipsisVerticalIcon className="w-5 h-5" />
                                        </button>
                                        
                                        {isMenuOpen && (
                                            <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-10 overflow-hidden animate-fade-in origin-top-right ring-1 ring-black/5">
                                                <div className="py-1">
                                                    {isArchivedView ? (
                                                        <>
                                                            <button onClick={() => { handleRestorePost(post); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2.5 text-sm font-medium text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center gap-3">
                                                                <ArrowUturnLeftIcon className="w-4 h-4" /> Återställ
                                                            </button>
                                                            <div className="h-px bg-slate-200 dark:bg-slate-700 my-1"></div>
                                                            <button onClick={() => { onDeletePost(post.id); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3">
                                                                <TrashIcon className="w-4 h-4" /> Radera permanent
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => { onEditPost(post); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3">
                                                                <PencilIcon className="w-4 h-4 text-slate-400" /> Redigera
                                                            </button>
                                                            <button onClick={() => { setRemixPost(post); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2.5 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 flex items-center gap-3">
                                                                <SparklesIcon className="w-4 h-4 text-purple-500" /> Remixa med AI
                                                            </button>
                                                            <button onClick={() => { onSharePost(post); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3">
                                                                <ShareIcon className="w-4 h-4 text-slate-400" /> Dela till kanal
                                                            </button>
                                                            <button onClick={() => { onDownloadPost(post); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3">
                                                                <DownloadIcon className="w-4 h-4 text-slate-400" /> Ladda ner
                                                            </button>
                                                            <div className="h-px bg-slate-200 dark:bg-slate-700 my-1"></div>
                                                            <button onClick={() => { handleArchivePost(post); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700 flex items-center gap-3">
                                                                <TrashIcon className="w-4 h-4 text-slate-400" /> Arkivera
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {scheduleEditorPostId === post.id && (
                                    <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg flex flex-wrap items-end gap-3 text-sm">
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Startdatum</label>
                                            <input type="date"
                                                value={(post.startDate || '').slice(0, 10)}
                                                onChange={e => handleUpdatePostSchedule(post.id, { startDate: e.target.value || undefined })}
                                                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-white" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Slutdatum (tomt = tills vidare)</label>
                                            <input type="date"
                                                value={(post.endDate || '').slice(0, 10)}
                                                onChange={e => handleUpdatePostSchedule(post.id, { endDate: e.target.value || undefined })}
                                                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-white" />
                                        </div>
                                        <div className="flex items-center gap-2 ml-auto">
                                            {post.status !== 'archived' && (
                                                getPostStatus(post) === 'active' ? (
                                                    <button type="button"
                                                        onClick={() => handleUpdatePostSchedule(post.id, { status: 'draft' })}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                                                        Avpublicera
                                                    </button>
                                                ) : (
                                                    <button type="button"
                                                        onClick={() => {
                                                            const d = new Date();
                                                            const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                                            handleUpdatePostSchedule(post.id, { status: 'active', startDate: post.startDate || today });
                                                        }}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">
                                                        Publicera
                                                    </button>
                                                )
                                            )}
                                            <button type="button" onClick={() => setScheduleEditorPostId(null)}
                                                className="px-2 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                                Stäng
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : !screen.postsUnreadable ? (
                    <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center">
                        <div className="w-16 h-16 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center mb-4 shadow-sm">
                            <SparklesIcon className="w-8 h-8 text-slate-300 dark:text-slate-500" />
                        </div>
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white">Inga inlägg hittades</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6 max-w-xs mx-auto">
                            {filterStatus !== 'all' ? 'Inga inlägg matchar ditt filter.' : 'Kanalen är tom. Skapa ditt första inlägg manuellt eller låt AI:n hjälpa dig.'}
                        </p>
                        {filterStatus === 'all' && (
                            <PrimaryButton 
                                onClick={onInitiateCreatePost}
                                disabled={screen.postsUnreadable}
                                title={screen.postsUnreadable ? "Inläggen kunde inte läsas — ladda om sidan först." : undefined}
                            >
                                Skapa första inlägget
                            </PrimaryButton>
                        )}
                    </div>
                ) : null}
            </div>

            {/* Modals */}
            {remixPost && (
                <RemixModal 
                    isOpen={!!remixPost} 
                    onClose={() => setRemixPost(null)} 
                    post={remixPost} 
                    organization={organization} 
                    onSelectVariant={handleRemixSelect} 
                />
            )}
        </div>
    );
};
