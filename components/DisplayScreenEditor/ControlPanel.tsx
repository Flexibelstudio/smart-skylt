import React, { useState, useEffect } from 'react';
import { Organization, DisplayScreen, DisplayPost, BrandingOptions, Tag } from '../../types';
import { ToggleSwitch, PencilIcon, TrashIcon, ChevronDownIcon, StarIcon, CampaignIcon, FacebookIcon, SparklesIcon, LinkIcon, LoadingSpinnerIcon, InstagramIcon } from '../icons';
import { DisplayPostRenderer } from '../DisplayPostRenderer';
import { PrimaryButton } from '../Buttons';

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


const Accordion: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-4 font-bold text-xl text-slate-900 dark:text-white" aria-expanded={isOpen}>
                <span>{title}</span>
                <ChevronDownIcon className={`h-6 w-6 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && <div className="border-t border-slate-200 dark:border-slate-700">{children}</div>}
        </div>
    );
};


interface ControlPanelProps {
    screen: DisplayScreen;
    organization: Organization;
    onUpdateDisplayScreens: (organizationId: string, displayScreens: DisplayScreen[]) => Promise<void>;
    onEditPost: (post: DisplayPost) => void;
    onDeletePost: (postId: string) => void;
    onSharePost: (post: DisplayPost) => void;
    onInitiateCreatePost: () => void;
    onSaveAsTemplate: (post: DisplayPost) => void;
    onCreateFollowUp: (post: DisplayPost) => void;
    generatingFollowUpPostId: string | null;
    onSharePostToInstagram: (post: DisplayPost) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
    screen, organization, onUpdateDisplayScreens, onEditPost, onDeletePost, onSharePost,
    onInitiateCreatePost, onSaveAsTemplate, onCreateFollowUp, generatingFollowUpPostId, onSharePostToInstagram
}) => {
    const [isSaving, setIsSaving] = useState(false);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [orderedPosts, setOrderedPosts] = useState<DisplayPost[]>(screen.posts || []);
    
    const configKey = `channel-configured-${screen.id}`;
    const [isFirstTimeConfiguring, setIsFirstTimeConfiguring] = useState(() => {
        try {
            return !localStorage.getItem(configKey);
        } catch (e) {
            return false;
        }
    });

    useEffect(() => { setOrderedPosts(screen.posts || []); }, [screen.posts]);

    const handleUpdate = async (updatedScreen: DisplayScreen) => {
        setIsSaving(true);
        try {
            const updatedScreens = (organization.displayScreens || []).map(s => s.id === updatedScreen.id ? updatedScreen : s);
            await onUpdateDisplayScreens(organization.id, updatedScreens);
        } catch (e) {
            console.error(e);
            alert(`Ett fel uppstod: ${e instanceof Error ? e.message : 'Okänt fel'}`);
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleSettingChange = (field: keyof DisplayScreen | `branding.${keyof BrandingOptions}`, value: any) => {
        let updatedScreen: DisplayScreen;
        if (typeof field === 'string' && field.startsWith('branding.')) {
            const brandingField = field.split('.')[1] as keyof BrandingOptions;
            const newBranding: BrandingOptions = { isEnabled: false, showLogo: true, showName: false, position: 'bottom-left', ...(screen.branding || {}), [brandingField]: value };
            updatedScreen = { ...screen, branding: newBranding };
        } else {
            updatedScreen = { ...screen, [field as keyof DisplayScreen]: value };
        }
        
        handleUpdate(updatedScreen);

        if (isFirstTimeConfiguring) {
            try {
                localStorage.setItem(configKey, 'true');
            } catch (e) { console.error("Failed to set localStorage item", e); }
            setIsFirstTimeConfiguring(false);
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
        handleUpdate({ ...screen, posts: reordered });
        setDragIndex(null);
    };
    
    return (
        <div className="space-y-6">
            <Accordion title="⚙️ Kanalinställningar" defaultOpen={isFirstTimeConfiguring}>
                <div className="p-4">
                    {isFirstTimeConfiguring && (
                        <div className="p-4 mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-700 dark:text-blue-200">
                            <p>✨ **Tips:** Välj bildförhållande (stående eller liggande) och aktivera din logotyp så skärmen ser ut som du vill.</p>
                            <p className="mt-1">✅ **Klart!** Du behöver inte ändra detta igen.</p>
                        </div>
                    )}
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
            <Accordion title={`Inlägg (${(orderedPosts || []).length})`} defaultOpen={!isFirstTimeConfiguring}>
                 <div className="space-y-3 p-4">
                    {(orderedPosts).map((post, index) => (
                        <div key={post.id} draggable onDragStart={() => handleDragStart(index)} onDragOver={handleDragOver} onDrop={() => handleDrop(index)} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg flex items-center gap-3 border border-slate-200 dark:border-slate-700 cursor-grab active:cursor-grabbing" style={{ opacity: dragIndex === index ? 0.5 : 1 }}>
                            <div className="flex-shrink-0 w-24 h-14 bg-black rounded-md overflow-hidden"><DisplayPostRenderer post={post} mode="preview" allTags={organization.tags} showTags={false} organization={organization}/></div>
                            <div className="flex-grow">
                                <p className="font-semibold text-slate-900 dark:text-white">{post.internalTitle}</p>
                                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
                                    <PostStatusBadge post={post} />
                                </div>
                            </div>
                            <div className="flex gap-1">
                               <button onClick={() => onCreateFollowUp(post)} disabled={isSaving || !!generatingFollowUpPostId} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-blue-500 disabled:cursor-not-allowed" title="Skapa uppföljande inlägg">
                                   {generatingFollowUpPostId === post.id
                                       ? <LoadingSpinnerIcon className="h-5 w-5" />
                                       : <LinkIcon className="h-5 w-5"/>
                                   }
                               </button>
                               <button onClick={() => onSaveAsTemplate(post)} disabled={isSaving} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-yellow-400" title="Spara som mall"><StarIcon /></button>
                               <button onClick={() => onSharePost(post)} disabled={isSaving} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-blue-500" title="Dela till Facebook"><FacebookIcon /></button>
                               <button onClick={() => onSharePostToInstagram(post)} disabled={isSaving} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-pink-500" title="Dela på Instagram"><InstagramIcon /></button>
                               <button onClick={() => onEditPost(post)} disabled={isSaving} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-primary" title="Redigera"><PencilIcon /></button>
                               <button onClick={() => onDeletePost(post.id)} disabled={isSaving} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-red-500" title="Ta bort"><TrashIcon /></button>
                            </div>
                        </div>
                    ))}
                 </div>
                 <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex flex-wrap justify-start items-center gap-4">
                    <PrimaryButton onClick={onInitiateCreatePost} disabled={isSaving}>Skapa nytt inlägg</PrimaryButton>
                </div>
            </Accordion>
        </div>
    );
};
