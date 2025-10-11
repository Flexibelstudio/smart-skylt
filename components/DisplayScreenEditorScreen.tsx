import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Organization, DisplayScreen, DisplayPost, PostTemplate, CustomEvent, CampaignIdea, MediaItem, StyleProfile } from '../types';
import { useToast } from '../context/ToastContext';
import { StarIcon, PencilIcon, CalendarDaysIcon } from './icons';
import { ConfirmDialog } from './ConfirmDialog';
import { useLocation } from '../context/StudioContext';
import { uploadMediaForGallery } from '../services/firebaseService';

import { 
    fileToBase64, 
    generateCampaignIdeasForEvent,
    generateDisplayPostImage,
    updateStyleProfileSummary,
    generateFollowUpPost
} from '../services/geminiService';
import { calculatePlanningProfile } from '../utils/planningAnalytics';

import { PreviewPane } from './DisplayScreenEditor/PreviewPanes';
import { PostEditor } from './DisplayScreenEditor/PostEditor';
import { ControlPanel } from './DisplayScreenEditor/ControlPanel';
import { PlanningView } from './DisplayScreenEditor/PlanningView';
import { 
    ShareToFacebookModal, 
    ShareToInstagramModal,
    CreatePostModal, 
    InputDialog,
    CampaignIdeaModal
} from './DisplayScreenEditor/Modals';


interface DisplayScreenEditorScreenProps {
    screen: DisplayScreen;
    initialPostToEdit?: DisplayPost | null;
    onUpdateDisplayScreens: (organizationId: string, displayScreens: DisplayScreen[]) => Promise<void>;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
}

export const DisplayScreenEditorScreen: React.FC<DisplayScreenEditorScreenProps> = ({ screen: initialScreen, initialPostToEdit, onUpdateDisplayScreens, onUpdateOrganization }) => {
    const { selectedOrganization: organization } = useLocation();
    const { showToast } = useToast();

    // The screen object needs to be derived from the potentially updated organization object from context
    const screen = useMemo(() => organization?.displayScreens?.find(s => s.id === initialScreen.id) || initialScreen, [organization, initialScreen]);

    const [editingPost, setEditingPost] = useState<DisplayPost | null>(initialPostToEdit || null);
    const [originalPost, setOriginalPost] = useState<DisplayPost | null>(initialPostToEdit ? JSON.parse(JSON.stringify(initialPostToEdit)) : null);
    const [postToShare, setPostToShare] = useState<DisplayPost | null>(null);
    const [postToShareOnInstagram, setPostToShareOnInstagram] = useState<DisplayPost | null>(null);
    const [showStarAnimation, setShowStarAnimation] = useState(false);
    const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [generatingFollowUpPostId, setGeneratingFollowUpPostId] = useState<string | null>(null);
    
    const [view, setView] = useState<'editor' | 'planning'>('editor');

    const [isIdeaModalOpen, setIsIdeaModalOpen] = useState(false);
    const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
    const [generatedIdeas, setGeneratedIdeas] = useState<CampaignIdea[] | null>(null);
    // FIX: Changed state type to match the object returned by the API for `followUpSuggestion`.
    const [followUpSuggestion, setFollowUpSuggestion] = useState<{ question: string; eventName: string; } | null>(null);
    const [ideaGenerationError, setIdeaGenerationError] = useState<string | null>(null);
    const [selectedEventForIdeas, setSelectedEventForIdeas] = useState<{ name: string } | null>(null);

    const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false);
    const [postToSaveAsTemplate, setPostToSaveAsTemplate] = useState<DisplayPost | null>(null);


    useEffect(() => {
        if (showStarAnimation) {
             const timer = setTimeout(() => setShowStarAnimation(false), 1300);
             return () => clearTimeout(timer);
        }
    }, [showStarAnimation]);

    const handleUpdatePosts = (updatedPosts: DisplayPost[]) => {
        if (!organization) return;
        const updatedScreen = { ...screen, posts: updatedPosts };
        const updatedScreens = (organization.displayScreens || []).map(s => s.id === updatedScreen.id ? updatedScreen : s);
        
        const allPostsForProfile = updatedScreens.flatMap(s => s.posts || []);
        const newPlanningProfile = calculatePlanningProfile(allPostsForProfile);

        onUpdateOrganization(organization.id, {
            displayScreens: updatedScreens,
            planningProfile: newPlanningProfile,
        });
    };

    const handleSavePost = async () => {
        if (!editingPost || !organization) return;
        setIsSaving(true);
    
        try {
            const dataUriToFile = async (uri: string): Promise<File | null> => {
                try {
                    const response = await fetch(uri);
                    const blob = await response.blob();
                    const filename = `media-${Date.now()}.${blob.type.split('/')[1] || 'png'}`;
                    return new File([blob], filename, { type: blob.type });
                } catch (e) {
                    console.error("Could not convert data URI to file", e);
                    return null;
                }
            };
    
            const postWithStorageUrls = { ...editingPost };
            const newMediaForLibrary: MediaItem[] = [];
            const urlUploadCache = new Map<string, string>();
    
            const processUri = async (uri: string | undefined, isAi: boolean, title: string): Promise<string | undefined> => {
                if (!uri || !uri.startsWith('data:') || uri.startsWith('data:image/svg+xml')) {
                    return uri;
                }
    
                if (urlUploadCache.has(uri)) {
                    return urlUploadCache.get(uri);
                }
    
                const file = await dataUriToFile(uri);
                if (!file) return uri;
    
                const { url, type } = await uploadMediaForGallery(organization.id, file, () => {});
                urlUploadCache.set(uri, url);
    
                newMediaForLibrary.push({
                    id: `media-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                    type: type as 'image' | 'video', url, internalTitle: title, createdAt: new Date().toISOString(),
                    createdBy: isAi ? 'ai' : 'user',
                });
    
                return url;
            };
    
            postWithStorageUrls.imageUrl = await processUri(postWithStorageUrls.imageUrl, postWithStorageUrls.isAiGeneratedImage ?? false, `Bild från "${postWithStorageUrls.internalTitle}"`);
    
            if (postWithStorageUrls.subImages) {
                postWithStorageUrls.subImages = await Promise.all(
                    postWithStorageUrls.subImages.map(async sub => ({...sub, imageUrl: await processUri(sub.imageUrl, false, `Karusellbild`) ?? sub.imageUrl}))
                );
            }
            
            if (postWithStorageUrls.collageItems) {
                postWithStorageUrls.collageItems = await Promise.all(
                    postWithStorageUrls.collageItems.map(async item => {
                        if (item.type === 'image') {
                            return {...item, imageUrl: await processUri(item.imageUrl, item.isAiGeneratedImage ?? false, `Collagebild`) ?? item.imageUrl};
                        }
                        return item;
                    })
                );
            }
    
            const isNewPost = postWithStorageUrls.id.startsWith('new-');
            const finalPost = isNewPost ? { ...postWithStorageUrls, id: `post-${Date.now()}` } : postWithStorageUrls;
    
            const updatedPosts = isNewPost
                ? [...(screen.posts || []), finalPost]
                : (screen.posts || []).map(p => p.id === finalPost.id ? finalPost : p);
            
            const updatedScreen = { ...screen, posts: updatedPosts };
            const updatedScreens = (organization.displayScreens || []).map(s => s.id === updatedScreen.id ? updatedScreen : s);
            
            const allPostsForProfile = updatedScreens.flatMap(s => s.posts || []);
            const newPlanningProfile = calculatePlanningProfile(allPostsForProfile);
    
            const hasLibraryUpdates = newMediaForLibrary.length > 0;
            const updatedLibrary = hasLibraryUpdates ? [...(organization.mediaLibrary || []), ...newMediaForLibrary] : organization.mediaLibrary;

            // --- AI Style Profile Learning ---
            const styleProfile: StyleProfile = organization.styleProfile || { version: 0 };
            const newVersion = (styleProfile.version || 0) + 1;
            let updatedSummary = styleProfile.summary;
            
            const shouldUpdateSummary = !styleProfile.summary || newVersion % 3 === 0;

            if (shouldUpdateSummary) {
                try {
                    const postsForAnalysis = updatedPosts.slice(-5); // Use last 5 posts
                    const result = await updateStyleProfileSummary(organization, postsForAnalysis);
                    updatedSummary = result.summary;
                } catch (e) {
                    console.error("Failed to update style profile summary:", e);
                    // Non-blocking error
                }
            }

            const updatedProfile: StyleProfile = {
                ...styleProfile,
                version: newVersion,
                summary: updatedSummary,
            };

            // --- Consolidated Update ---
            const updatePayload: Partial<Organization> = {
                displayScreens: updatedScreens,
                mediaLibrary: updatedLibrary,
                styleProfile: updatedProfile,
                planningProfile: newPlanningProfile,
            };

            await onUpdateOrganization(organization.id, updatePayload);
    
            showToast({ message: "Inlägget sparades.", type: 'success' });
            if (hasLibraryUpdates) {
                showToast({ message: `${newMediaForLibrary.length} mediafil(er) sparades i galleriet.`, type: 'info' });
            }
    
            setEditingPost(null);
            setOriginalPost(null);
            if (isNewPost) setShowStarAnimation(true);
    
        } catch (e) {
            console.error("Failed to save post:", e);
            showToast({ message: `Kunde inte spara inlägg: ${e instanceof Error ? e.message : "Ett okänt fel inträffade."}`, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreatePostFromTemplate = (template?: PostTemplate) => {
        if (!organization) return;
        const basePost = template ? { ...template.postData } : { layout: 'image-fullscreen' as const, durationSeconds: 10, backgroundColor: 'black', textColor: 'white' };
        const newPostHeadline = (basePost as Partial<DisplayPost>).headline;
        const newPost: DisplayPost = {
            id: `new-${Date.now()}`,
            internalTitle: newPostHeadline || (template ? template.templateName : 'Nytt inlägg'),
            ...basePost,
            headlineFontFamily: template?.postData.headlineFontFamily ?? organization.headlineFontFamily,
            bodyFontFamily: template?.postData.bodyFontFamily ?? organization.bodyFontFamily,
        };
        setOriginalPost(JSON.parse(JSON.stringify(newPost)));
        setEditingPost(newPost);
        setIsCreatePostModalOpen(false);
    };
    
    const handleCancelEdit = () => {
        if (originalPost && editingPost) {
            const isDirty = JSON.stringify(originalPost) !== JSON.stringify(editingPost);
            if (isDirty) {
                setIsCancelConfirmOpen(true);
                return;
            }
        }
        setEditingPost(null);
        setOriginalPost(null);
    };

    const handleConfirmCancel = () => {
        setEditingPost(null);
        setOriginalPost(null);
        setIsCancelConfirmOpen(false);
    };

    const handleDeletePost = (postId: string) => {
        if (window.confirm("Är du säker på att du vill ta bort detta inlägg?") && organization) {
            const updatedPosts = (screen.posts || []).filter(p => p.id !== postId);
            const updatedScreen = { ...screen, posts: updatedPosts };
            const updatedScreens = (organization.displayScreens || []).map(s => s.id === updatedScreen.id ? updatedScreen : s);
            
            const allPostsForProfile = updatedScreens.flatMap(s => s.posts || []);
            const newPlanningProfile = calculatePlanningProfile(allPostsForProfile);
            
            onUpdateOrganization(organization.id, {
                displayScreens: updatedScreens,
                planningProfile: newPlanningProfile,
            });
        }
    };
    
    const handleGetCampaignIdeas = async (event: { name: string; date: Date }) => {
        if (!organization) return;
    
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const eventDate = new Date(event.date.getFullYear(), event.date.getMonth(), event.date.getDate());
        const diffTime = eventDate.getTime() - today.getTime();
        const daysUntil = Math.max(0, Math.ceil(diffTime / (1000 * 3600 * 24)));
    
        setSelectedEventForIdeas({ name: event.name });
        setIsIdeaModalOpen(true);
        setIsGeneratingIdeas(true);
        setGeneratedIdeas(null);
        setFollowUpSuggestion(null);
        setIdeaGenerationError(null);
        try {
            const { ideas, followUpSuggestion } = await generateCampaignIdeasForEvent(
                event.name,
                daysUntil,
                organization,
            );
            setGeneratedIdeas(ideas);
            setFollowUpSuggestion(followUpSuggestion || null);
        } catch (error) {
            setIdeaGenerationError(error instanceof Error ? error.message : "Kunde inte hämta idéer.");
        } finally {
            setIsGeneratingIdeas(false);
        }
    };

    const handleFollowUpClick = (eventName: string) => {
        handleGetCampaignIdeas({ name: eventName, date: new Date() });
    };

    const handleSavePostAsTemplate = async (templateName: string) => {
        if (!postToSaveAsTemplate || !organization) return;
        const { id, startDate, endDate, internalTitle, ...postData } = postToSaveAsTemplate;
        const newTemplate: PostTemplate = { id: `template-${Date.now()}`, templateName: templateName.trim(), postData };
        const updatedTemplates = [...(organization.postTemplates || []), newTemplate];
        try {
            await onUpdateOrganization(organization.id, { postTemplates: updatedTemplates });
            showToast({ message: `Mallen "${templateName.trim()}" har sparats.`, type: 'success' });
            setPostToSaveAsTemplate(null);
        } catch (e) {
            showToast({ message: `Kunde inte spara mall: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
        }
    };

    const handleCreateFollowUpPost = async (originalPost: DisplayPost) => {
        if (!organization) return;
        setGeneratingFollowUpPostId(originalPost.id);
        showToast({ message: "AI:n skapar ett uppföljande inlägg...", type: 'info' });

        try {
            const { postData, imageUrl } = await generateFollowUpPost(originalPost, organization, screen.aspectRatio);

            const newPost: DisplayPost = {
                ...postData,
                id: `new-${Date.now()}`,
                internalTitle: postData.headline || 'Uppföljande inlägg',
                layout: postData.layout!,
                durationSeconds: 15,
                imageUrl,
                isAiGeneratedImage: !!imageUrl,
                headlineFontFamily: organization.headlineFontFamily,
                bodyFontFamily: organization.bodyFontFamily,
                startDate: undefined,
                endDate: undefined,
            };

            setOriginalPost(JSON.parse(JSON.stringify(newPost)));
            setEditingPost(newPost);
            
            showToast({ message: "Nytt utkast skapat! Granska och spara.", type: 'success' });
        } catch (error) {
            showToast({ message: `Kunde inte skapa uppföljning: ${error instanceof Error ? error.message : "Ett okänt fel inträffade."}`, type: 'error' });
        } finally {
            setGeneratingFollowUpPostId(null);
        }
    };

    const handleUpdateTagPosition = (tagId: string, newPosition: { x: number, y: number, rotation: number }) => {
        if (!editingPost) return;
        const currentOverrides = editingPost.tagPositionOverrides || [];
        const existingOverrideIndex = currentOverrides.findIndex(o => o.tagId === tagId);
        const newOverrides = existingOverrideIndex > -1
            ? currentOverrides.map(o => o.tagId === tagId ? { ...o, ...newPosition } : o)
            : [...currentOverrides, { tagId, ...newPosition }];
        setEditingPost({ ...editingPost, tagPositionOverrides: newOverrides });
    };

    const handleUpdateTextPosition = (pos: { x: number, y: number }) => {
        if (!editingPost) return;
        setEditingPost(prev => prev ? { ...prev, textPositionX: pos.x, textPositionY: pos.y } : null);
    };

    if (!organization) {
        return <div>Laddar organisation...</div>;
    }

    return (
        <div className="w-full max-w-full mx-auto animate-fade-in pb-12 relative">
             {showStarAnimation && (
                <div className="absolute top-4 right-4 z-[100] animate-shoot-star pointer-events-none">
                    <StarIcon className="w-16 h-16 text-yellow-300 drop-shadow-[0_0_10px_rgba(253,224,71,0.9)]" filled={true} />
                </div>
            )}
             <div className="mb-6">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Redigerar: {screen.name}</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Växla mellan att redigera enskilda inlägg och planera ditt innehåll i kalendern.</p>
             </div>
             
             <div className="border-b border-slate-200 dark:border-slate-700 mb-8">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setView('editor')} 
                        className={`flex items-center gap-2 px-3 py-3 text-base font-semibold border-b-2 transition-colors ${view === 'editor' ? 'border-primary text-primary' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-primary'}`}
                    >
                        <PencilIcon className="h-5 w-5"/> Redigera Inlägg
                    </button>
                    <button 
                        onClick={() => setView('planning')} 
                        className={`flex items-center gap-2 px-3 py-3 text-base font-semibold border-b-2 transition-colors relative ${view === 'planning' ? 'border-primary text-primary' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-primary'}`}
                    >
                        <CalendarDaysIcon className="h-5 w-5"/> Planering & Kalender
                        <span className="ml-2 bg-teal-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">NY FUNKTION</span>
                    </button>
                </div>
            </div>
            
            {view === 'editor' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                    <div className="lg:sticky lg:top-8 self-start">
                        <PreviewPane
                            editingPost={editingPost}
                            screen={screen}
                            organization={organization}
                            onUpdateTagPosition={handleUpdateTagPosition}
                            onUpdateTextPosition={handleUpdateTextPosition}
                        />
                    </div>
                    <div className="space-y-6">
                        {editingPost ? (
                            <PostEditor 
                                post={editingPost} 
                                organization={organization} 
                                onSave={handleSavePost}
                                onPostChange={setEditingPost}
                                onCancel={handleCancelEdit} 
                                isSaving={isSaving} 
                                aspectRatio={screen.aspectRatio}
                                onUpdateOrganization={onUpdateOrganization}
                            />
                        ) : (
                            <ControlPanel
                                screen={screen} 
                                organization={organization} 
                                onUpdateDisplayScreens={onUpdateDisplayScreens}
                                onEditPost={(post) => {
                                    setOriginalPost(JSON.parse(JSON.stringify(post)));
                                    setEditingPost(post);
                                }} 
                                onDeletePost={handleDeletePost}
                                onSharePost={setPostToShare}
                                onSharePostToInstagram={setPostToShareOnInstagram}
                                onInitiateCreatePost={() => setIsCreatePostModalOpen(true)}
                                onSaveAsTemplate={setPostToSaveAsTemplate}
                                onCreateFollowUp={handleCreateFollowUpPost}
                                generatingFollowUpPostId={generatingFollowUpPostId}
                            />
                        )}
                    </div>
                </div>
            )}

            {view === 'planning' && (
                <PlanningView
                    screen={screen}
                    posts={screen.posts || []}
                    organization={organization}
                    onUpdateOrganization={onUpdateOrganization}
                    onGetCampaignIdeas={(event) => handleGetCampaignIdeas({name: event.name, date: event.date})}
                    isAIAssistantEnabled={true}
                    onUpdatePosts={handleUpdatePosts}
                />
            )}
            
            <CampaignIdeaModal
                isOpen={isIdeaModalOpen}
                onClose={() => setIsIdeaModalOpen(false)}
                isLoading={isGeneratingIdeas}
                ideas={generatedIdeas}
                error={ideaGenerationError}
                eventName={selectedEventForIdeas?.name}
                followUpSuggestion={followUpSuggestion}
                onFollowUp={handleFollowUpClick}
                organization={organization}
                onUpdateDisplayScreens={onUpdateDisplayScreens}
                onEditGeneratedPost={(post) => {
                    setOriginalPost(JSON.parse(JSON.stringify(post)));
                    setEditingPost(post);
                }}
            />
            <ShareToFacebookModal
                isOpen={!!postToShare} onClose={() => setPostToShare(null)}
                post={postToShare} organization={organization} screen={screen}
            />
            <ShareToInstagramModal
                isOpen={!!postToShareOnInstagram}
                onClose={() => setPostToShareOnInstagram(null)}
                post={postToShareOnInstagram}
            />
            <CreatePostModal
                isOpen={isCreatePostModalOpen} onClose={() => setIsCreatePostModalOpen(false)}
                templates={organization.postTemplates || []} onCreate={handleCreatePostFromTemplate}
            />
            <InputDialog
                isOpen={!!postToSaveAsTemplate} onClose={() => setPostToSaveAsTemplate(null)}
                onSave={handleSavePostAsTemplate} title="Spara inlägg som mall"
                labelText="Vad vill du kalla mallen?" initialValue={postToSaveAsTemplate?.internalTitle || ''}
                saveText="Spara mall"
            />
            <ConfirmDialog
                isOpen={isCancelConfirmOpen}
                onClose={() => setIsCancelConfirmOpen(false)}
                onConfirm={handleConfirmCancel}
                title="Avbryt ändringar"
                confirmText="Ja, avbryt"
            >
                Är du säker på att du vill avbryta? Dina ändringar kommer inte att sparas.
            </ConfirmDialog>
        </div>
    );
};