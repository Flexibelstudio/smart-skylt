
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DisplayScreen, Organization, DisplayPost, BrandingOptions } from '../../types';
import { useToast } from '../../context/ToastContext';
import { StyledInput, StyledSelect } from '../../Forms';
import { PrimaryButton, SecondaryButton, DestructiveButton } from '../../Buttons';
import { 
    PencilIcon, TrashIcon, EllipsisVerticalIcon, SparklesIcon, 
    CalendarIcon, ShareIcon, DownloadIcon, DuplicateIcon, 
    VideoCameraIcon, PhotoIcon, MagnifyingGlassIcon, MoveIcon,
    CubeIcon, ToggleSwitch, CheckCircleIcon
} from '../icons';
import { RemixModal } from './Modals';
import { RealityCheckModal } from '../RealityCheckModal';
import { parseToDate } from '../../utils/dateUtils';
import { DisplayPostRenderer } from '../DisplayPostRenderer';

interface ControlPanelProps {
    screen: DisplayScreen;
    organization: Organization;
    onUpdateScreen: (data: Partial<DisplayScreen>) => Promise<void>;
    onEditPost: (post: DisplayPost) => void;
    onDeletePost: (id: string) => void;
    onDownloadPost: (post: DisplayPost) => void;
    onInitiateCreatePost: () => void;
    onSaveAsTemplate: (post: DisplayPost) => void;
    onSharePost: (post: DisplayPost) => void;
    openDropdownId: string | null;
    setOpenDropdownId: (id: string | null) => void;
    dropdownRef: React.RefObject<HTMLDivElement>;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
    screen,
    organization,
    onUpdateScreen,
    onEditPost,
    onDeletePost,
    onDownloadPost,
    onInitiateCreatePost,
    onSaveAsTemplate,
    onSharePost,
    openDropdownId,
    setOpenDropdownId,
    dropdownRef
}) => {
    const [isSaving, setIsSaving] = useState(false);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [remixPost, setRemixPost] = useState<DisplayPost | null>(null);
    const { showToast } = useToast();
    const [isRealityCheckOpen, setIsRealityCheckOpen] = useState(false);
    
    // Sort & Search State
    const [sortOption, setSortOption] = useState<'manual' | 'newest' | 'status' | 'alpha'>('newest');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Branding Settings State
    const [showBrandingSettings, setShowBrandingSettings] = useState(false);

    const filteredPosts = useMemo(() => {
        let posts = [...(screen.posts || [])];

        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            posts = posts.filter(p => p.internalTitle.toLowerCase().includes(lowerQuery) || p.headline?.toLowerCase().includes(lowerQuery));
        }

        switch (sortOption) {
            case 'newest':
                // Assuming newer posts are added to the beginning or end? 
                // Usually newest created implies simple order or ID check, but let's assume array order is manual unless specified.
                // If "Newest" means created date, we don't strictly have createdAt on DisplayPost, usually we rely on array order for "Manual".
                // But let's assume reverse array order for "Newest" if they are appended.
                // If using ID with timestamp:
                return posts.sort((a, b) => {
                    const timeA = parseInt(a.id.split('-')[1] || '0');
                    const timeB = parseInt(b.id.split('-')[1] || '0');
                    return timeB - timeA;
                });
            case 'alpha':
                return posts.sort((a, b) => a.internalTitle.localeCompare(b.internalTitle));
            case 'status':
                return posts.sort((a, b) => (a.status || 'active').localeCompare(b.status || 'active'));
            case 'manual':
            default:
                return posts;
        }
    }, [screen.posts, sortOption, searchQuery]);

    const handleDragStart = (e: React.DragEvent, index: number) => {
        if (sortOption !== 'manual') return;
        setDragIndex(index);
        e.dataTransfer.effectAllowed = "move";
        // e.dataTransfer.setDragImage(e.currentTarget as Element, 20, 20); // Optional
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        if (sortOption !== 'manual' || dragIndex === null || dragIndex === index) return;
        e.preventDefault();
        
        // Reorder
        const newPosts = [...(screen.posts || [])];
        const draggedItem = newPosts[dragIndex];
        newPosts.splice(dragIndex, 1);
        newPosts.splice(index, 0, draggedItem);
        
        // Update local state or trigger update (might be heavy to do onDragOver, usually onDrop)
        // Here we just prevent default to allow drop
    };

    const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
        if (sortOption !== 'manual' || dragIndex === null) return;
        e.preventDefault();
        
        const newPosts = [...(screen.posts || [])];
        const draggedItem = newPosts[dragIndex];
        newPosts.splice(dragIndex, 1);
        newPosts.splice(dropIndex, 0, draggedItem);
        
        setDragIndex(null);
        
        // Optimistic update handled by parent usually, but here we call API
        await onUpdateScreen({ posts: newPosts });
    };

    const handleBrandingChange = async (key: keyof BrandingOptions, value: any) => {
        const currentBranding = screen.branding || { isEnabled: false, showLogo: false, showName: false, position: 'bottom-right' };
        const newBranding = { ...currentBranding, [key]: value };
        await onUpdateScreen({ branding: newBranding });
    };

    const handleRemixSelect = (variant: DisplayPost) => {
        // Add the variant as a new post
        const newPost = { ...variant, id: `post-${Date.now()}` };
        const updatedPosts = [newPost, ...(screen.posts || [])];
        onUpdateScreen({ posts: updatedPosts }).then(() => {
            showToast({ message: "Remix tillagd!", type: 'success' });
            setRemixPost(null);
        });
    };

    const formatDate = (isoString?: string) => {
        if (!isoString) return 'Tills vidare';
        return new Date(isoString).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' });
    };

    const isActive = (post: DisplayPost) => {
        if (post.status === 'archived') return false;
        const now = new Date();
        if (post.startDate && new Date(post.startDate) > now) return false;
        if (post.endDate && new Date(post.endDate) < now) return false;
        return true;
    };

    return (
        <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex gap-2 w-full sm:w-auto">
                    <div className="relative flex-grow sm:flex-grow-0">
                        <input
                            type="text"
                            placeholder="Sök inlägg..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm w-full sm:w-64 focus:ring-2 focus:ring-primary focus:outline-none"
                        />
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    </div>
                    <select 
                        value={sortOption} 
                        onChange={(e) => setSortOption(e.target.value as any)}
                        className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-primary focus:outline-none"
                    >
                        <option value="newest">Nyast först</option>
                        <option value="manual">Manuell ordning</option>
                        <option value="alpha">A-Ö</option>
                        <option value="status">Status</option>
                    </select>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button 
                        onClick={() => setIsRealityCheckOpen(true)}
                        className="p-2 text-slate-500 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                        title="Reality Check (3D)"
                    >
                        <CubeIcon className="w-5 h-5" />
                    </button>
                    <button 
                        onClick={() => setShowBrandingSettings(!showBrandingSettings)}
                        className={`p-2 rounded-lg transition-colors ${showBrandingSettings ? 'bg-purple-100 text-purple-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                        title="Skärminställningar"
                    >
                        <SparklesIcon className="w-5 h-5" />
                    </button>
                    <PrimaryButton onClick={onInitiateCreatePost} className="flex-grow sm:flex-grow-0">
                        + Skapa inlägg
                    </PrimaryButton>
                </div>
            </div>

            {/* Branding Settings Panel */}
            {showBrandingSettings && (
                <div className="bg-slate-50 dark:bg-slate-700/30 p-4 rounded-xl border border-slate-200 dark:border-slate-700 animate-fade-in">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                        <SparklesIcon className="w-4 h-4 text-purple-500" />
                        Skärmens utseende (Branding)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            )}

            {/* Post List */}
            <div className="space-y-3">
                {filteredPosts.length > 0 ? (
                    filteredPosts.map((post, index) => {
                        const active = isActive(post);
                        const isMenuOpen = openDropdownId === post.id;
                        
                        return (
                            <div 
                                key={post.id} 
                                draggable={sortOption === 'manual'}
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={(e) => handleDrop(e, index)}
                                className={`group bg-white dark:bg-slate-800 p-3 rounded-lg border flex items-center gap-4 transition-all hover:shadow-md ${
                                    active ? 'border-slate-200 dark:border-slate-700' : 'border-slate-200 dark:border-slate-700 opacity-60 bg-slate-50'
                                } ${dragIndex === index ? 'opacity-50 ring-2 ring-primary border-transparent' : ''}`}
                            >
                                {sortOption === 'manual' && (
                                    <div className="cursor-grab text-slate-300 hover:text-slate-500 dark:hover:text-slate-400 flex-shrink-0">
                                        <MoveIcon className="w-5 h-5" />
                                    </div>
                                )}
                                
                                {/* Thumbnail */}
                                <div className="w-16 h-10 bg-slate-100 dark:bg-slate-900 rounded overflow-hidden flex-shrink-0 relative border border-slate-100 dark:border-slate-700">
                                    <DisplayPostRenderer post={post} organization={organization} mode="preview" showTags={false} />
                                    {post.layout.includes('video') && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><VideoCameraIcon className="w-4 h-4 text-white drop-shadow-md"/></div>}
                                </div>

                                <div className="flex-grow min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={post.internalTitle}>{post.internalTitle}</h4>
                                        {!active && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600 uppercase">Inaktiv</span>}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3"/> {formatDate(post.startDate)} - {formatDate(post.endDate)}</span>
                                        <span>•</span>
                                        <span>{post.durationSeconds}s</span>
                                        {post.layout && (
                                            <>
                                                <span>•</span>
                                                <span className="capitalize">{post.layout.replace('-', ' ')}</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="relative" ref={isMenuOpen ? dropdownRef : null}>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setOpenDropdownId(isMenuOpen ? null : post.id); }}
                                        className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                    >
                                        <EllipsisVerticalIcon className="w-5 h-5" />
                                    </button>
                                    
                                    {isMenuOpen && (
                                        <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-10 overflow-hidden animate-fade-in origin-top-right">
                                            <div className="py-1">
                                                <button onClick={() => { onEditPost(post); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2">
                                                    <PencilIcon className="w-4 h-4" /> Redigera
                                                </button>
                                                <button onClick={() => { setRemixPost(post); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 flex items-center gap-2">
                                                    <SparklesIcon className="w-4 h-4" /> Remixa med AI
                                                </button>
                                                <button onClick={() => { onSharePost(post); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2">
                                                    <ShareIcon className="w-4 h-4" /> Dela till kanal
                                                </button>
                                                <button onClick={() => { onSaveAsTemplate(post); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2">
                                                    <DuplicateIcon className="w-4 h-4" /> Spara som mall
                                                </button>
                                                <button onClick={() => { onDownloadPost(post); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2">
                                                    <DownloadIcon className="w-4 h-4" /> Ladda ner
                                                </button>
                                                <div className="h-px bg-slate-200 dark:bg-slate-700 my-1"></div>
                                                <button onClick={() => { onDeletePost(post.id); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                                                    <TrashIcon className="w-4 h-4" /> Ta bort
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700">
                        <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
                            <SparklesIcon className="w-6 h-6" />
                        </div>
                        <h4 className="text-slate-900 dark:text-white font-medium">Inga inlägg än</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">Kanalen är tom. Skapa ditt första inlägg för att komma igång.</p>
                        <PrimaryButton onClick={onInitiateCreatePost}>Skapa inlägg</PrimaryButton>
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
            
            <RealityCheckModal 
                isOpen={isRealityCheckOpen} 
                onClose={() => setIsRealityCheckOpen(false)}
                aspectRatio={screen.aspectRatio}
            >
                {/* We need to render the current channel content inside the Reality Check. 
                    Since we don't have the 'live' cycling view here easily without duplicating DisplayWindowScreen logic, 
                    we can render the first active post or a placeholder message if empty. */}
                {filteredPosts.length > 0 ? (
                    <DisplayPostRenderer post={filteredPosts[0]} organization={organization} mode="live" aspectRatio={screen.aspectRatio} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-black text-white p-10 text-center">
                        <div>
                            <h1 className="text-4xl font-bold mb-4">{organization.brandName}</h1>
                            <p className="text-xl">Välkommen! Just nu finns inget innehåll.</p>
                        </div>
                    </div>
                )}
            </RealityCheckModal>
        </div>
    );
};
