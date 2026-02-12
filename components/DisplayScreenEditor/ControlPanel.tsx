
import React, { useState, useEffect, useMemo } from 'react';
import { Organization, DisplayScreen, DisplayPost, BrandingOptions, Tag } from '../../types';
import { ToggleSwitch, PencilIcon, TrashIcon, ChevronDownIcon, StarIcon, CampaignIcon, DownloadIcon, SparklesIcon, InstagramIcon, ShareIcon, DuplicateIcon, EllipsisVerticalIcon, MagnifyingGlassIcon } from '../icons';
import { DisplayPostRenderer } from '../DisplayPostRenderer';
import { PrimaryButton } from '../Buttons';
import { StyledSelect } from '../Forms';
import { getPostVisibility } from './sharedPostsUtils';
import { useToast } from '../../context/ToastContext';
import { RemixModal } from './Modals';

const PostStatusBadge: React.FC<{ post: DisplayPost }> = ({ post }) => {
    const now = new Date();
    const startDate = post.startDate ? new Date(post.startDate) : null;
    const endDate = post.endDate ? new Date(post.endDate) : null;

    const formatDate = (date: Date | null): string => {
        if (!date) return '';
        return date.toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    let text: string;
    let colorClasses: string;

    if (endDate && endDate < now) {
        text = `Arkiverad sedan ${formatDate(endDate)}`;
        colorClasses = 'bg-slate-500/20 text-slate-700 dark:text-slate-300';
    } else if (startDate && startDate > now) {
        colorClasses = 'bg-blue-500/20 text-blue-800 dark:text-blue-200';
        text = `Publiceras: ${formatDate(startDate)}`;
    } else {
        colorClasses = 'bg-green-500/20 text-green-800 dark:text-green-200';
        if (startDate && endDate) {
            text = `Publicerad: ${formatDate(startDate)} - ${formatDate(endDate)}`;
        } else if (startDate) {
            text = `Publicerad sedan ${formatDate(startDate)}`;
        } else if (endDate) {
            text = `Publicerad till ${formatDate(endDate)}`;
        } else {
            return null;
        }
    }

    return <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${colorClasses}`}>{text}</span>;
};


const Accordion: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean; actions?: React.ReactNode }> = ({ title, children, defaultOpen = false, actions }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-4 font-bold text-xl text-slate-900 dark:text-white" aria-expanded={isOpen}>
                <span>{title}</span>
                <div className="flex items-center gap-4">
                    {actions && <div onClick={e => e.stopPropagation()}>{actions}</div>}
                    <ChevronDownIcon className={`h-6 w-6 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>
            {isOpen && <div className="border-t border-slate-200 dark:border-slate-700">{children}</div>}
        </div>
    );
};


interface ControlPanelProps {
    screen: DisplayScreen;
    organization: Organization;
    onUpdateScreen: (data: Partial<DisplayScreen>) => Promise<void>;
    onEditPost: (post: DisplayPost) => void;
    onDeletePost: (postId: string) => void;
    onDownloadPost: (post: DisplayPost) => void;
    onInitiateCreatePost: () => void;
    onSaveAsTemplate: (post: DisplayPost) => void;
    onSharePost: (post: DisplayPost) => void;
    openDropdownId: string | null;
    setOpenDropdownId: (id: string | null) => void;
    dropdownRef: React.RefObject<HTMLDivElement>;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
    screen, organization, onUpdateScreen, onEditPost, onDeletePost, onDownloadPost,
    onInitiateCreatePost, onSaveAsTemplate, onSharePost,
    openDropdownId, setOpenDropdownId, dropdownRef
}) => {
    const [isSaving, setIsSaving] = useState(false);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [remixPost, setRemixPost] = useState<DisplayPost | null>(null);
    const { showToast } = useToast();
    
    // Sort & Search State
    const [sortOption, setSortOption] = useState<'manual' | 'newest' | 'status' | 'alpha'>('manual');
    const [searchQuery, setSearchQuery] = useState('');
    
    const configKey = `channel-configured-${screen.id}`;
    const [isFirstTimeConfiguring, setIsFirstTimeConfiguring] = useState(() => {
        try {
            return !localStorage.getItem(configKey);
        } catch (e) {
            return false;
        }
    });

    const handleSettingChange = async (field: keyof DisplayScreen | `branding.${keyof BrandingOptions}`, value: any) => {
        setIsSaving(true);
        try {
            let updateData: Partial<DisplayScreen>;

            if (typeof field === 'string' && field.startsWith('branding.')) {
                const brandingField = field.split('.')[1] as keyof BrandingOptions;
                const newBranding: BrandingOptions = { isEnabled: false, showLogo: true, showName: false, position: 'bottom-left', ...(screen.branding || {}), [brandingField]: value };
                updateData = { branding: newBranding };
            } else {
                updateData = { [field as keyof DisplayScreen]: value };
            }

            await onUpdateScreen(updateData);
            
            if (isFirstTimeConfiguring) {
                try {
                    localStorage.setItem(configKey, 'true');
                } catch (e) { console.error("Failed to set localStorage item", e); }
                setIsFirstTimeConfiguring(false);
            }
        } catch (e) {
            console.error(e);
            showToast({ message: `Ett fel uppstod: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    // --- Sorting & Filtering Logic ---
    const displayedPosts = useMemo(() => {
        let posts = [...(screen.posts || [])];

        // 1. Filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            posts = posts.filter(p => p.internalTitle.toLowerCase().includes(q));
        }

        // 2. Sort
        if (sortOption === 'newest') {
            posts.sort((a, b) => {
                // Try to parse timestamp from ID (e.g. post-171...) or new-171...
                const timeA = parseInt(a.id.split('-')[1]) || 0;
                const timeB = parseInt(b.id.split('-')[1]) || 0;
                return timeB - timeA;
            });
        } else if (sortOption === 'alpha') {
            posts.sort((a, b) => a.internalTitle.localeCompare(b.internalTitle));
        } else if (sortOption === 'status') {
            const now = new Date();
            const getStatusRank = (p: DisplayPost) => {
                if (p.status === 'archived') return 3;
                const start = p.startDate ? new Date(p.startDate) : null;
                const end = p.endDate ? new Date(p.endDate) : null;
                if (end && end < now) return 3; // Expired/Archived
                if (start && start > now) return 2; // Scheduled
                return 1; // Active
            };
            posts.sort((a, b) => getStatusRank(a) - getStatusRank(b));
        }
        
        return posts;
    }, [screen.posts, sortOption, searchQuery]);

    const isManualMode = sortOption === 'manual' && !searchQuery.trim();

    const handleDragStart = (index: number) => {
        if (isManualMode) setDragIndex(index);
    };
    
    const handleDragOver = (e: React.DragEvent) => {
        if (isManualMode) e.preventDefault();
    };
    
    const handleDrop = (dropIndex: number) => {
        if (dragIndex === null || dragIndex === dropIndex) return;
        if (!isManualMode) return; 

        const reordered = [...(screen.posts || [])];
        const [dragged] = reordered.splice(dragIndex, 1);
        reordered.splice(dropIndex, 0, dragged);
        
        onUpdateScreen({ posts: reordered });
        setDragIndex(null);
    };

    const handleRemixSelect = async (variant: DisplayPost) => {
        setIsSaving(true);
        setRemixPost(null); 
        try {
            // Prepend remix
            const updatedPosts = [variant, ...(screen.posts || [])];
            await onUpdateScreen({ posts: updatedPosts });
            showToast({ message: "Remixad version sparad!", type: 'success' });
        } catch(e) {
            showToast({ message: "Kunde inte spara remix.", type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <div className="space-y-6">
            <Accordion title="⚙️ Kanalinställningar" defaultOpen={false}>
                <div className="p-4">
                    <div className="space-y-6">
                        <div>
                            <h4 className="text-base font-semibold text-slate-600 dark:text-slate-300 mb-2">Allmänt</h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-500 dark:text-gray-400 mb-2">Bildförhållande</label>
                                    <div className="flex gap-4">
                                        <button type="button" onClick={() => handleSettingChange('aspectRatio', '16:9')} className={`w-32 h-20 flex flex-col justify-center items-center font-bold rounded-lg border-2 ${screen.aspectRatio === '16:9' ? 'bg-primary/10 border-primary text-primary' : 'bg-slate-100 dark:bg-slate-700 border-transparent hover:border-slate-400'}`}>
                                            <span>16:9</span>
                                            <span className="text-xs font-normal">Liggande</span>
                                        </button>
                                        <button type="button" onClick={() => handleSettingChange('aspectRatio', '9:16')} className={`w-20 h-32 flex flex-col justify-center items-center font-bold rounded-lg border-2 ${screen.aspectRatio === '9:16' ? 'bg-primary/10 border-primary text-primary' : 'bg-slate-100 dark:bg-slate-700 border-transparent hover:border-slate-400'}`}>
                                            <span>9:16</span>
                                            <span className="text-xs font-normal">Stående</span>
                                        </button>
                                    </div>
                                </div>
                                <ToggleSwitch label="Aktivera denna kanal" checked={screen.isEnabled} onChange={c => handleSettingChange('isEnabled', c)} />
                            </div>
                        </div>

                        <div>
                            <h4 className="text-base font-semibold text-slate-600 dark:text-slate-300 mb-2 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">Varumärkesvisning</h4>
                            <div className="space-y-4">
                                <ToggleSwitch label="Aktivera varumärkesvisning" checked={screen.branding?.isEnabled ?? false} onChange={c => handleSettingChange('branding.isEnabled', c)} />
                                <div className={screen.branding?.isEnabled ? 'space-y-4' : 'opacity-50 pointer-events-none space-y-4'}>
                                    <ToggleSwitch label="Visa logotyp" checked={screen.branding?.showLogo ?? true} onChange={c => handleSettingChange('branding.showLogo', c)} />
                                    <ToggleSwitch label="Visa organisationsnamn" checked={screen.branding?.showName ?? false} onChange={c => handleSettingChange('branding.showName', c)} />
                                    <div>
                                         <label className="block text-sm font-medium text-slate-500 dark:text-gray-400 mb-2">Position</label>
                                         <div className="grid grid-cols-2 gap-2 w-32 h-32 p-2 rounded-lg bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600">
                                            {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map(pos => {
                                                const isActive = (screen.branding?.position || 'bottom-left') === pos;
                                                return (
                                                    <button
                                                        key={pos}
                                                        type="button"
                                                        onClick={() => handleSettingChange('branding.position', pos)}
                                                        className={`rounded-md transition-colors ${isActive ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600'}`}
                                                        aria-label={`Position ${pos.replace('-', ' ')}`}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Accordion>
            
            <Accordion 
                title={`Inlägg (${(displayedPosts || []).length})`} 
                defaultOpen={true}
                actions={<PrimaryButton onClick={onInitiateCreatePost} disabled={isSaving}>Skapa nytt inlägg</PrimaryButton>}
            >
                 <div className="p-4 space-y-4">
                    {/* Cockpit Toolbar */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-grow">
                            <input 
                                type="text" 
                                placeholder="Sök inlägg..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-shadow"
                            />
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        </div>
                        <div className="min-w-[220px]">
                            <StyledSelect 
                                value={sortOption} 
                                onChange={e => setSortOption(e.target.value as any)}
                                className="!h-10 !py-1 !text-sm"
                            >
                                <option value="manual">Manuell ordning (Spellista)</option>
                                <option value="newest">Senast skapad</option>
                                <option value="status">Status (Aktiva först)</option>
                                <option value="alpha">Namn (A-Ö)</option>
                            </StyledSelect>
                        </div>
                    </div>
                    { !isManualMode && (
                        <div className="text-xs text-slate-500 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded border border-yellow-200 dark:border-yellow-800/50 flex items-center gap-2">
                            <span>⚠️</span> Sortering aktiv. Byt till "Manuell ordning" för att ändra ordning i spellistan.
                        </div>
                    )}

                    <div className="space-y-3">
                        {displayedPosts.length > 0 ? (
                            displayedPosts.map((post, index) => {
                                const visibility = getPostVisibility(post, screen.id, organization);
                                return (
                                    <div 
                                        key={post.id} 
                                        draggable={isManualMode}
                                        onDragStart={() => handleDragStart(index)} 
                                        onDragOver={handleDragOver} 
                                        onDrop={() => handleDrop(index)} 
                                        className={`bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg flex items-center gap-3 border border-slate-200 dark:border-slate-700 ${isManualMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} transition-opacity`}
                                        style={{ opacity: dragIndex === index ? 0.5 : 1 }}
                                    >
                                        <div className="flex-shrink-0 w-24 h-14 bg-black rounded-md overflow-hidden relative group">
                                            <DisplayPostRenderer post={post} mode="preview" allTags={organization.tags} showTags={false} organization={organization}/>
                                            {!isManualMode && <div className="absolute inset-0 bg-white/10 dark:bg-black/10" />}
                                        </div>
                                        <div className="flex-grow min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                                            <div className="min-w-0">
                                                <p className="font-semibold text-slate-900 dark:text-white truncate">{post.internalTitle}</p>
                                                {visibility.isShared ? (
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                        <span className="font-semibold">Delas från:</span> {visibility.sourceScreenName}
                                                    </div>
                                                ) : visibility.visibleIn.length > 1 ? (
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-semibold">Synkas till:</span>
                                                        {visibility.visibleIn.map(s => (
                                                        <span key={s.id} className="font-bold bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 rounded">
                                                            {s.name}
                                                        </span>
                                                        ))}
                                                    </div>
                                                ) : null}
                                                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
                                                    <PostStatusBadge post={post} />
                                                </div>
                                            </div>
                                            <div className="flex gap-1 flex-shrink-0 mt-2 sm:mt-0 self-end sm:self-auto">
                                                {/* Responsive actions */}
                                                <div className="hidden sm:flex items-center gap-1">
                                                    <button onClick={() => setRemixPost(post)} disabled={isSaving} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-purple-500" title="Remixa - Skapa varianter">
                                                        <SparklesIcon className="h-5 w-5"/>
                                                    </button>

                                                    <button onClick={() => onSharePost(post)} disabled={isSaving || !!post.sharedFromPostId} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-green-500 disabled:opacity-50 disabled:cursor-not-allowed" title={post.sharedFromPostId ? 'Kan inte dela ett redan delat inlägg' : 'Dela till annan kanal'}><ShareIcon className="h-5 w-5"/></button>
                                                    <button onClick={() => onSaveAsTemplate(post)} disabled={isSaving} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-yellow-400" title="Spara som mall"><StarIcon /></button>
                                                    <button onClick={() => onDownloadPost(post)} disabled={isSaving} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-cyan-500" title="Ladda ner material"><DownloadIcon className="h-5 w-5"/></button>
                                                </div>
                                                <button onClick={() => onEditPost(post)} disabled={isSaving} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-primary" title="Redigera"><PencilIcon /></button>
                                                <button onClick={() => onDeletePost(post.id)} disabled={isSaving} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-red-500" title="Ta bort"><TrashIcon /></button>
                                                {/* Mobile "More" button */}
                                                <div className="sm:hidden relative" ref={openDropdownId === post.id ? dropdownRef : null}>
                                                    <button onClick={() => setOpenDropdownId(openDropdownId === post.id ? null : post.id)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500">
                                                        <EllipsisVerticalIcon className="h-5 w-5"/>
                                                    </button>
                                                    {openDropdownId === post.id && (
                                                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-md shadow-lg border border-slate-200 dark:border-slate-700 z-10 animate-fade-in">
                                                            <button onClick={() => setRemixPost(post)} disabled={isSaving} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">
                                                                <SparklesIcon className="h-4 w-4 text-purple-500"/> Remixa
                                                            </button>
                                                            <button onClick={() => onSharePost(post)} disabled={isSaving || !!post.sharedFromPostId} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50">
                                                                <ShareIcon className="h-4 w-4"/> Dela till kanal
                                                            </button>
                                                            <button onClick={() => onSaveAsTemplate(post)} disabled={isSaving} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">
                                                                <StarIcon className="h-4 w-4"/> Spara som mall
                                                            </button>
                                                            <button onClick={() => onDownloadPost(post)} disabled={isSaving} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">
                                                                <DownloadIcon className="h-4 w-4"/> Ladda ner
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        ) : (
                            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                                Inga inlägg hittades.
                            </div>
                        )}
                    </div>
                 </div>
            </Accordion>

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
