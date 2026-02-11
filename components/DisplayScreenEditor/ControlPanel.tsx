
import React, { useState, useEffect } from 'react';
import { Organization, DisplayScreen, DisplayPost, BrandingOptions, Tag } from '../../types';
import { ToggleSwitch, PencilIcon, TrashIcon, ChevronDownIcon, StarIcon, CampaignIcon, DownloadIcon, SparklesIcon, InstagramIcon, ShareIcon, DuplicateIcon, EllipsisVerticalIcon } from '../icons';
import { DisplayPostRenderer } from '../DisplayPostRenderer';
import { PrimaryButton } from '../Buttons';
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
    const [orderedPosts, setOrderedPosts] = useState<DisplayPost[]>(screen.posts || []);
    const [remixPost, setRemixPost] = useState<DisplayPost | null>(null);
    const { showToast } = useToast();
    
    const configKey = `channel-configured-${screen.id}`;
    const [isFirstTimeConfiguring, setIsFirstTimeConfiguring] = useState(() => {
        try {
            // Fallback to false (closed) if localStorage is not available.
            return !localStorage.getItem(configKey);
        } catch (e) {
            return false;
        }
    });

    useEffect(() => { setOrderedPosts(screen.posts || []); }, [screen.posts]);

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

    const handleDragStart = (index: number) => setDragIndex(index);
    const handleDragOver = (e: React.DragEvent) => e.preventDefault();
    const handleDrop = (dropIndex: number) => {
        if (dragIndex === null || dragIndex === dropIndex) return;
        const reordered = [...orderedPosts];
        const [dragged] = reordered.splice(dragIndex, 1);
        reordered.splice(dropIndex, 0, dragged);
        setOrderedPosts(reordered);
        onUpdateScreen({ posts: reordered });
        setDragIndex(null);
    };

    const handleRemixSelect = async (variant: DisplayPost) => {
        setIsSaving(true);
        setRemixPost(null); // Close modal immediately
        try {
            // Add as new post
            const updatedPosts = [...(screen.posts || []), variant];
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
            {/* Ändrad till stängd som standard för en renare startvy. */}
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
                                {/* Använder nullish coalescing operator (??) för att säkerställa att togglen är avstängd (false) om screen.branding eller screen.branding.isEnabled är undefined, enligt önskemål. */}
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
            {/* Inläggssektionen är nu öppen som standard för att användaren snabbt ska se och skapa inlägg. */}
            <Accordion 
                title={`Inlägg (${(orderedPosts || []).length})`} 
                defaultOpen={true}
                actions={<PrimaryButton onClick={onInitiateCreatePost} disabled={isSaving}>Skapa nytt inlägg</PrimaryButton>}
            >
                 <div className="space-y-3 p-4">
                    {(orderedPosts).map((post, index) => {
                        const visibility = getPostVisibility(post, screen.id, organization);
                        return (
                            <div key={post.id} draggable onDragStart={() => handleDragStart(index)} onDragOver={handleDragOver} onDrop={() => handleDrop(index)} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg flex items-center gap-3 border border-slate-200 dark:border-slate-700 cursor-grab active:cursor-grabbing" style={{ opacity: dragIndex === index ? 0.5 : 1 }}>
                                <div className="flex-shrink-0 w-24 h-14 bg-black rounded-md overflow-hidden"><DisplayPostRenderer post={post} mode="preview" allTags={organization.tags} showTags={false} organization={organization}/></div>
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
                                            
                                            {/* REMIX BUTTON */}
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
                    })}
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
