
import React, { useState, useMemo } from 'react';
import { DisplayScreen, Organization, DisplayPost, BrandingOptions } from '../../types';
import { useToast } from '../../context/ToastContext';
import { StyledSelect, StyledInput } from '../Forms';
import { PrimaryButton } from '../Buttons';
import { 
    PencilIcon, TrashIcon, EllipsisVerticalIcon, SparklesIcon, 
    ShareIcon, DownloadIcon, 
    VideoCameraIcon, MagnifyingGlassIcon, MoveIcon,
    ToggleSwitch, ListBulletIcon, FunnelIcon, ArrowUturnLeftIcon,
    Cog6ToothIcon, ChevronDownIcon, CheckCircleIcon
} from '../icons';
import { RemixModal } from './Modals';
import { DisplayPostRenderer } from '../DisplayPostRenderer';

interface ControlPanelProps {
    screen: DisplayScreen;
    organization: Organization;
    onUpdateScreen: (data: Partial<DisplayScreen>) => Promise<void>;
    onEditPost: (post: DisplayPost) => void;
    onDeletePost: (id: string) => void;
    onDownloadPost: (post: DisplayPost) => void;
    onInitiateCreatePost: () => void;
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
    onSharePost,
    openDropdownId,
    setOpenDropdownId,
    dropdownRef
}) => {
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [remixPost, setRemixPost] = useState<DisplayPost | null>(null);
    const { showToast } = useToast();
    
    // View State
    const [sortOption, setSortOption] = useState<'manual' | 'newest' | 'alpha'>('manual');
    const [filterStatus, setFilterStatus] = useState<FilterOption>('all');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Settings Panel State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    // Local state for channel settings editing
    const [channelName, setChannelName] = useState(screen.name);

    const getPostStatus = (post: DisplayPost): PostStatus => {
        if (post.status === 'archived') return 'archived';
        if (!post.startDate) return 'draft'; // New: Missing start date = Draft

        const now = new Date();
        const start = new Date(post.startDate);
        const end = post.endDate ? new Date(post.endDate) : null;

        if (start > now) return 'scheduled';
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

    const handleDragStart = (e: React.DragEvent, index: number) => {
        if (sortOption !== 'manual' || searchQuery || filterStatus !== 'all') return;
        setDragIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        if (sortOption !== 'manual' || searchQuery || filterStatus !== 'all' || dragIndex === null || dragIndex === index) return;
        e.preventDefault();
    };

    const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
        if (sortOption !== 'manual' || searchQuery || filterStatus !== 'all' || dragIndex === null) return;
        e.preventDefault();
        
        const newPosts = [...(screen.posts || [])];
        const draggedItem = newPosts[dragIndex];
        newPosts.splice(dragIndex, 1);
        newPosts.splice(dropIndex, 0, draggedItem);
        
        setDragIndex(null);
        await onUpdateScreen({ posts: newPosts });
    };

    const handleBrandingChange = async (key: keyof BrandingOptions, value: any) => {
        const currentBranding = screen.branding || { isEnabled: false, showLogo: false, showName: false, position: 'bottom-right' };
        const newBranding = { ...currentBranding, [key]: value };
        await onUpdateScreen({ branding: newBranding });
    };
    
    const handleChannelSettingsSave = async () => {
        if (channelName.trim()) {
            await onUpdateScreen({ name: channelName });
            showToast({ message: "Kanalinställningar sparade.", type: 'success' });
        }
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
        return new Date(isoString).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' });
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

    return (
        <div className="space-y-6">
            
            {/* --- Card 1: Kanalinställningar (Collapsible) --- */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <button 
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    className="w-full flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors text-left"
                >
                    <div className="flex items-center gap-2 text-slate-800 dark:text-white font-bold text-lg">
                        <Cog6ToothIcon className="w-5 h-5 text-slate-500" />
                        Kanalinställningar
                    </div>
                    <ChevronDownIcon className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isSettingsOpen ? 'rotate-180' : ''}`} />
                </button>

                {isSettingsOpen && (
                    <div className="p-6 border-t border-slate-200 dark:border-slate-700 space-y-6 animate-fade-in">
                        {/* Row 1: Basic Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Kanalens namn</label>
                                <div className="flex gap-2">
                                    <StyledInput 
                                        type="text" 
                                        value={channelName} 
                                        onChange={(e) => setChannelName(e.target.value)} 
                                        placeholder="Namn på kanalen"
                                    />
                                    <PrimaryButton onClick={handleChannelSettingsSave} disabled={channelName === screen.name}>Spara</PrimaryButton>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Skärmriktning</label>
                                <div className="flex gap-4">
                                    {/* Landscape Option */}
                                    <button
                                        onClick={() => onUpdateScreen({ aspectRatio: '16:9' })}
                                        className={`relative flex-1 p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 group ${
                                            screen.aspectRatio === '16:9'
                                                ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                                                : 'border-slate-200 dark:border-slate-700 hover:border-primary/50 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800'
                                        }`}
                                    >
                                        <div className={`w-12 h-8 border-2 rounded transition-colors ${screen.aspectRatio === '16:9' ? 'border-primary bg-primary/20' : 'border-slate-400 dark:border-slate-500 group-hover:border-primary/50'}`} />
                                        <span className="text-sm font-semibold">Liggande (16:9)</span>
                                        {screen.aspectRatio === '16:9' && (
                                            <div className="absolute top-2 right-2 text-primary">
                                                <CheckCircleIcon className="w-5 h-5" />
                                            </div>
                                        )}
                                    </button>

                                    {/* Portrait Option */}
                                    <button
                                        onClick={() => onUpdateScreen({ aspectRatio: '9:16' })}
                                        className={`relative flex-1 p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 group ${
                                            screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4'
                                                ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                                                : 'border-slate-200 dark:border-slate-700 hover:border-primary/50 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800'
                                        }`}
                                    >
                                        <div className={`w-6 h-10 border-2 rounded transition-colors ${screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4' ? 'border-primary bg-primary/20' : 'border-slate-400 dark:border-slate-500 group-hover:border-primary/50'}`} />
                                        <span className="text-sm font-semibold">Stående (9:16)</span>
                                        {(screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4') && (
                                            <div className="absolute top-2 right-2 text-primary">
                                                <CheckCircleIcon className="w-5 h-5" />
                                            </div>
                                        )}
                                    </button>
                                </div>
                                <p className="text-xs text-slate-400 mt-2">Välj format baserat på hur din fysiska TV är monterad.</p>
                            </div>
                        </div>

                        {/* Row 2: Branding (Design) */}
                        <div className="pt-6 border-t border-slate-100 dark:border-slate-700/50">
                            <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                                <SparklesIcon className="w-4 h-4 text-purple-500" />
                                Skärmdesign & Varumärke
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                <ToggleSwitch 
                                    label="Visa logotyp" 
                                    checked={screen.branding?.showLogo ?? false} 
                                    onChange={(c) => handleBrandingChange('showLogo', c)} 
                                />
                                <ToggleSwitch 
                                    label="Visa företagsnamn" 
                                    checked={screen.branding?.showName ?? false} 
                                    onChange={(c) => handleBrandingChange('showName', c)} 
                                />
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Position</label>
                                    <StyledSelect 
                                        value={screen.branding?.position || 'bottom-right'} 
                                        onChange={(e) => handleBrandingChange('position', e.target.value)}
                                        className="!text-sm !py-1"
                                    >
                                        <option value="top-left">Uppe vänster</option>
                                        <option value="top-right">Uppe höger</option>
                                        <option value="bottom-left">Nere vänster</option>
                                        <option value="bottom-right">Nere höger</option>
                                    </StyledSelect>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* --- Card 2: Inlägg (Posts) --- */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-4">
                
                {/* Top Row: Header & Actions */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <h3 className="font-bold text-lg text-slate-800 dark:text-white">Inlägg</h3>
                        <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-1 rounded-full">
                            {screen.posts?.length || 0}
                        </span>
                    </div>

                    <div className="w-full sm:w-auto flex justify-end">
                        <PrimaryButton onClick={onInitiateCreatePost} className="shadow-lg shadow-primary/20">
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
            {(sortOption !== 'manual' || filterStatus !== 'all' || searchQuery) && (
                <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 text-sm px-4 py-2 rounded-lg flex items-center gap-2 border border-blue-200 dark:border-blue-800/50">
                    <FunnelIcon className="w-4 h-4" />
                    <span>Visar filtrerad/sorterad lista. Byt till <strong>Visa alla</strong> och <strong>Manuell ordning</strong> för att ändra ordning på inläggen.</span>
                </div>
            )}

            {/* Post List */}
            <div className="space-y-3">
                {filteredPosts.length > 0 ? (
                    filteredPosts.map((post, index) => {
                        const status = getPostStatus(post);
                        const isMenuOpen = openDropdownId === post.id;
                        const canDrag = sortOption === 'manual' && !searchQuery && filterStatus === 'all';
                        const isArchivedView = filterStatus === 'archived';
                        
                        let opacityClass = status === 'ended' || status === 'archived' ? 'opacity-75 bg-slate-50 dark:bg-slate-800/50' : 'opacity-100';
                        
                        return (
                            <div 
                                key={post.id} 
                                draggable={canDrag}
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={(e) => handleDrop(e, index)}
                                className={`group bg-white dark:bg-slate-800 p-3 rounded-lg border flex items-center gap-4 transition-all hover:shadow-md border-slate-200 dark:border-slate-700 ${opacityClass} ${dragIndex === index ? 'opacity-50 ring-2 ring-primary border-transparent scale-[0.98]' : ''} ${isMenuOpen ? 'relative z-20' : 'relative z-0'}`}
                            >
                                {/* Drag Handle */}
                                {canDrag && (
                                    <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 dark:hover:text-slate-400 flex-shrink-0 p-1">
                                        <MoveIcon className="w-5 h-5" />
                                    </div>
                                )}
                                
                                {/* Thumbnail */}
                                <div className="w-20 h-12 bg-slate-100 dark:bg-slate-900 rounded overflow-hidden flex-shrink-0 relative border border-slate-100 dark:border-slate-700 shadow-sm">
                                    <DisplayPostRenderer post={post} organization={organization} mode="preview" showTags={false} />
                                    {post.layout.includes('video') && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><VideoCameraIcon className="w-4 h-4 text-white drop-shadow-md"/></div>}
                                </div>

                                {/* Info */}
                                <div className="flex-grow min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-bold text-slate-800 dark:text-slate-200 truncate text-sm sm:text-base" title={post.internalTitle}>{post.internalTitle}</h4>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusPill status={status} post={post} />
                                        <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-2">
                                            <span>|</span>
                                            <span className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono text-slate-600 dark:text-slate-300">{post.durationSeconds}s</span>
                                            <span className="capitalize hidden sm:inline">{post.layout.replace(/-/g, ' ')}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="relative" ref={isMenuOpen ? dropdownRef : null}>
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
                                                            <SparklesIcon className="w-4 h-4" /> Remixa med AI
                                                        </button>
                                                        <button onClick={() => { onSharePost(post); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3">
                                                            <ShareIcon className="w-4 h-4 text-slate-400" /> Dela till kanal
                                                        </button>
                                                        <button onClick={() => { onDownloadPost(post); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3">
                                                            <DownloadIcon className="w-4 h-4 text-slate-400" /> Ladda ner
                                                        </button>
                                                        <div className="h-px bg-slate-200 dark:bg-slate-700 my-1"></div>
                                                        <button onClick={() => { handleArchivePost(post); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700 flex items-center gap-3">
                                                            <TrashIcon className="w-4 h-4" /> Arkivera
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center">
                        <div className="w-16 h-16 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center mb-4 shadow-sm">
                            <SparklesIcon className="w-8 h-8 text-slate-300 dark:text-slate-500" />
                        </div>
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white">Inga inlägg hittades</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6 max-w-xs mx-auto">
                            {filterStatus !== 'all' ? 'Inga inlägg matchar ditt filter.' : 'Kanalen är tom. Skapa ditt första inlägg manuellt eller låt AI:n hjälpa dig.'}
                        </p>
                        {filterStatus === 'all' && (
                            <PrimaryButton onClick={onInitiateCreatePost}>Skapa första inlägget</PrimaryButton>
                        )}
                    </div>
                )}
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
