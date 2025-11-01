import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Organization, DisplayScreen, DisplayPost, PostTemplate, CustomEvent, CampaignIdea, MediaItem, StyleProfile, UserRole } from '../types';
import { useToast } from '../context/ToastContext';
import { StarIcon, PencilIcon, CalendarDaysIcon } from './icons';
import { ConfirmDialog } from './ConfirmDialog';
import { useLocation } from '../context/StudioContext';
import { getSuggestedPostById, uploadMediaForGallery, updateSuggestedPost } from '../services/firebaseService';

import { 
    fileToBase64, 
    generateCampaignIdeasForEvent,
    generateDisplayPostImage,
    updateStyleProfileSummary,
    generateFollowUpPost,
    analyzePostDiff
} from '../services/geminiService';
import { calculatePlanningProfile } from '../utils/planningAnalytics';

import { PreviewPane } from './DisplayScreenEditor/PreviewPanes';
import { PostEditor } from './DisplayScreenEditor/PostEditor';
import { ControlPanel } from './DisplayScreenEditor/ControlPanel';
import { PlanningView } from './DisplayScreenEditor/PlanningView';
import { 
    CreatePostModal, 
    InputDialog,
    CampaignIdeaModal,
    DownloadAssetsModal,
    SharePostModal
} from './DisplayScreenEditor/Modals';
import { copyPostToScreens, syncSharedPosts } from './DisplayScreenEditor/sharedPostsUtils';


interface DisplayScreenEditorScreenProps {
    screen: DisplayScreen;
    initialPostToEdit?: DisplayPost | null;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
    userRole: UserRole;
}

export const DisplayScreenEditorScreen: React.FC<DisplayScreenEditorScreenProps> = ({ screen: initialScreen, initialPostToEdit, onUpdateOrganization, userRole }) => {
    // FIX: Removed 'updateDisplayScreens' from destructuring as it does not exist on the context. A new 'onUpdateDisplayScreens' function is defined below.
    const { selectedOrganization: organization, displayScreens, updateDisplayScreen } = useLocation();
    const { showToast } = useToast();

    // The screen object needs to be derived from the potentially updated organization object from context
    const screen = useMemo(() => displayScreens.find(s => s.id === initialScreen.id) || initialScreen, [displayScreens, initialScreen]);

    const [editingPost, setEditingPost] = useState<DisplayPost | null>(initialPostToEdit || null);
    const [originalPost, setOriginalPost] = useState<DisplayPost | null>(initialPostToEdit ? JSON.parse(JSON.stringify(initialPostToEdit)) : null);
    const [postToDownloadAssets, setPostToDownloadAssets] = useState<DisplayPost | null>(null);
    const [showStarAnimation, setShowStarAnimation] = useState(false);
    const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [generatingFollowUpPostId, setGeneratingFollowUpPostId] = useState<string | null>(null);
    
    const [view, setView] = useState<'editor' | 'planning'>('editor');

    const [isIdeaModalOpen, setIsIdeaModalOpen] = useState(false);
    const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
    const [generatedIdeas, setGeneratedIdeas] = useState<CampaignIdea[] | null>(null);
    const [followUpSuggestion, setFollowUpSuggestion] = useState<{ question: string; eventName: string; } | null>(null);
    const [ideaGenerationError, setIdeaGenerationError] = useState<string | null>(null);
    const [selectedEventForIdeas, setSelectedEventForIdeas] = useState<{ name: string } | null>(null);

    const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false);
    const [postToSaveAsTemplate, setPostToSaveAsTemplate] = useState<DisplayPost | null>(null);
    const [postToShare, setPostToShare] = useState<DisplayPost | null>(null);

    // FIX: This function provides the functionality previously expected from the context. It iterates through screens and updates those that have changed.
    const onUpdateDisplayScreens = useCallback(async (orgId: string, updatedScreens: DisplayScreen[]) => {
        if (!organization || orgId !== organization.id) return;
        
        for (const updatedScreen of updatedScreens) {
            const originalScreen = displayScreens.find(s => s.id === updatedScreen.id);
            // A simple but effective way to check for changes before writing to DB.
            if (originalScreen && JSON.stringify(originalScreen) !== JSON.stringify(updatedScreen)) {
                // The context's update function takes a partial object. Here we only care about posts.
                await updateDisplayScreen(updatedScreen.id, { posts: updatedScreen.posts });
            }
        }
    }, [organization, displayScreens, updateDisplayScreen]);

    useEffect(() => {
        if (showStarAnimation) {
             const timer = setTimeout(() => setShowStarAnimation(false), 1300);
             return () => clearTimeout(timer);
        }
    }, [showStarAnimation]);

    const handleUpdatePosts = (updatedPosts: DisplayPost[]) => {
        if (!organization) return;
        
        updateDisplayScreen(screen.id, { posts: updatedPosts });

        const allOrgScreens = displayScreens.map(s => s.id === screen.id ? { ...screen, posts: updatedPosts } : s);
        const allPostsForProfile = allOrgScreens.flatMap(s => s.posts || []);
        const newPlanningProfile = calculatePlanningProfile(allPostsForProfile);

        onUpdateOrganization(organization.id, { planningProfile: newPlanningProfile });
    };

    const handleSavePost = async () => {
        if (!editingPost || !organization) return;
        setIsSaving(true);
    
        try {
            const suggestionOriginId = editingPost.suggestionOriginId;
            const postWithStorageUrls = { ...editingPost };

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
    
            const newMediaForLibrary: MediaItem[] = [];
            const urlUploadCache = new Map<string, string>();
    
            const addMediaToLibrary = (url: string, type: 'image' | 'video', isAi: boolean, title: string, prompt?: string) => {
                const libraryHasItem = (organization.mediaLibrary || []).some(item => item.url === url);
                if (!libraryHasItem) {
                    newMediaForLibrary.push({
                        id: `media-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                        type,
                        url,
                        internalTitle: title,
                        createdAt: new Date().toISOString(),
                        createdBy: isAi ? 'ai' : 'user',
                        aiPrompt: prompt,
                    });
                }
            };

            const processUri = async (uri: string | undefined, isAi: boolean, title: string, prompt?: string): Promise<string | undefined> => {
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
    
                addMediaToLibrary(url, type as 'image' | 'video', isAi, title, prompt);
    
                return url;
            };
    
            postWithStorageUrls.imageUrl = await processUri(postWithStorageUrls.imageUrl, postWithStorageUrls.isAiGeneratedImage ?? false, `Bild från "${postWithStorageUrls.internalTitle}"`, postWithStorageUrls.aiImagePrompt);
    
            if (postWithStorageUrls.videoUrl) {
                if (postWithStorageUrls.videoUrl.includes('firebasestorage.googleapis.com')) {
                    if (postWithStorageUrls.isAiGeneratedVideo) {
                        addMediaToLibrary(postWithStorageUrls.videoUrl, 'video', true, `AI Video: ${postWithStorageUrls.internalTitle}`, postWithStorageUrls.aiVideoPrompt);
                    }
                } else if (postWithStorageUrls.videoUrl.startsWith('data:')) {
                    postWithStorageUrls.videoUrl = await processUri(postWithStorageUrls.videoUrl, postWithStorageUrls.isAiGeneratedVideo ?? false, `Video från "${postWithStorageUrls.internalTitle}"`, postWithStorageUrls.aiVideoPrompt);
                }
            }

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
                        if (item.type === 'video' && item.videoUrl) {
                            let finalVideoUrl = item.videoUrl;
                            if (item.videoUrl.includes('firebasestorage.googleapis.com')) {
                                if (item.isAiGeneratedVideo) {
                                    addMediaToLibrary(item.videoUrl, 'video', true, `AI Video Collage: ${postWithStorageUrls.internalTitle}`);
                                }
                            } else if (item.videoUrl.startsWith('data:')) {
                                finalVideoUrl = await processUri(item.videoUrl, item.isAiGeneratedVideo ?? false, `Collagevideo`);
                            }
                            return {...item, videoUrl: finalVideoUrl};
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
            
            await updateDisplayScreen(screen.id, { posts: updatedPosts });
            
            // Sync logic needs all screens, so we create a temporary org object
            const isOriginalPost = !finalPost.sharedFromPostId;
            if (isOriginalPost) {
                const tempOrgForSync = { ...organization, displayScreens };
                const syncedScreens = syncSharedPosts(finalPost, tempOrgForSync);
                // This is a bit tricky, we need to batch update all affected screens
                for (const syncedScreen of syncedScreens) {
                    if(JSON.stringify(syncedScreen) !== JSON.stringify(displayScreens.find(s => s.id === syncedScreen.id))) {
                        await updateDisplayScreen(syncedScreen.id, { posts: syncedScreen.posts });
                    }
                }
            }
            
            const allPostsForProfile = displayScreens.flatMap(s => s.id === screen.id ? updatedPosts : s.posts || []);
            const newPlanningProfile = calculatePlanningProfile(allPostsForProfile);
    
            const hasLibraryUpdates = newMediaForLibrary.length > 0;
            const updatedLibrary = hasLibraryUpdates ? [...(organization.mediaLibrary || []), ...newMediaForLibrary] : organization.mediaLibrary;

            // --- AI Style Profile Learning ---
            const styleProfile: StyleProfile = organization.styleProfile || { version: 0 };
            const newVersion = (styleProfile.version || 0) + 1;
            let updatedSummary = styleProfile.summary;
            let updatedProfile: StyleProfile = { ...styleProfile, version: newVersion };

            if (suggestionOriginId) { // This post came from a suggestion
                try {
                    const originalSuggestion = await getSuggestedPostById(organization.id, suggestionOriginId);
                    if (originalSuggestion) {
                        // Don't do the learning here, just show a toast. Server will handle it.
                        showToast({ message: "AI:n kommer att lära sig av dina ändringar.", type: 'info' });
                    }
                } catch(e) {
                    console.warn("Could not analyze post diff on client:", e);
                }
            } else { // This is a user-created post, run periodic summary update
                const shouldUpdateSummary = !styleProfile.summary || newVersion % 3 === 0;
                if (shouldUpdateSummary) {
                    try {
                        const postsForAnalysis = updatedPosts.slice(-5);
                        const result = await updateStyleProfileSummary(organization, postsForAnalysis);
                        updatedSummary = result.summary;
                    } catch (e) {
                        console.error("Failed to update style profile summary:", e);
                    }
                }
            }

            updatedProfile.summary = updatedSummary;
            updatedProfile.lastUpdatedAt = new Date().toISOString();

            // --- Update suggestion status if applicable ---
            if (suggestionOriginId) {
                try {
                    await updateSuggestedPost(organization.id, suggestionOriginId, { status: 'edited-and-published', finalPostId: finalPost.id });
                } catch (e) {
                    console.warn("Could not update suggestion status:", e);
                }
            }

            // --- Consolidated Update for Org-level data ---
            const orgUpdatePayload: Partial<Organization> = {
                mediaLibrary: updatedLibrary,
                styleProfile: updatedProfile,
                planningProfile: newPlanningProfile,
            };

            await onUpdateOrganization(organization.id, orgUpdatePayload);
    
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

    const handleRejectSuggestion = async () => {
        if (!editingPost?.suggestionOriginId || !organization) return;
        setIsSaving(true);
        try {
            await updateSuggestedPost(organization.id, editingPost.suggestionOriginId, { status: 'rejected' });
            showToast({ message: "Förslaget har förkastats och AI:n har fått feedback.", type: 'info' });
            handleConfirmCancel(); 
        } catch(e) {
            showToast({ message: "Kunde inte förkasta förslaget.", type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeletePost = (postId: string) => {
        if (window.confirm("Är du säker på att du vill ta bort detta inlägg?") && organization) {
            const updatedPosts = (screen.posts || []).filter(p => p.id !== postId);
            handleUpdatePosts(updatedPosts);
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
        // FIX: Changed 'setIdeaModalOpen' to 'setIsIdeaModalOpen' to match the state setter.
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

    const handleUpdateTextWidth = (width: number) => {
        if (!editingPost) return;
        setEditingPost(prev => prev ? { ...prev, textWidth: width } : null);
    };

    const handleDownloadPost = (post: DisplayPost) => {
        setPostToDownloadAssets(post);
    };

    const handleConfirmShare = async (targetScreenIds: string[]) => {
        if (!postToShare || !organization || targetScreenIds.length === 0) {
            return;
        }
    
        setIsSaving(true);
        try {
            const updatedScreens = copyPostToScreens(
                postToShare,
                targetScreenIds,
                screen.id,
                { ...organization, displayScreens }
            );

            // Batch update all changed screens
            for (const updatedScreen of updatedScreens) {
                const originalScreen = displayScreens.find(s => s.id === updatedScreen.id);
                if (JSON.stringify(originalScreen) !== JSON.stringify(updatedScreen)) {
                    await updateDisplayScreen(updatedScreen.id, { posts: updatedScreen.posts });
                }
            }
    
            showToast({
                message: `Inlägget har delats till ${targetScreenIds.length} ${targetScreenIds.length > 1 ? 'kanaler' : 'kanal'}.`,
                type: 'success'
            });
    
        } catch (e) {
            showToast({ message: `Kunde inte dela inlägget: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsSaving(false);
            setPostToShare(null);
        }
    };
    
    const handleUpdateScreen = async (data: Partial<DisplayScreen>) => {
        await updateDisplayScreen(screen.id, data);
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
                            onUpdateTextWidth={handleUpdateTextWidth}
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
                                onRejectSuggestion={handleRejectSuggestion}
                                isSaving={isSaving} 
                                aspectRatio={screen.aspectRatio}
                                onUpdateOrganization={onUpdateOrganization}
                                userRole={userRole}
                            />
                        ) : (
                            <ControlPanel
                                screen={screen} 
                                organization={organization}
                                onUpdateScreen={handleUpdateScreen}
                                onEditPost={(post) => {
                                    setOriginalPost(JSON.parse(JSON.stringify(post)));
                                    setEditingPost(post);
                                }} 
                                onDeletePost={handleDeletePost}
                                onDownloadPost={handleDownloadPost}
                                onInitiateCreatePost={() => setIsCreatePostModalOpen(true)}
                                onSaveAsTemplate={setPostToSaveAsTemplate}
                                onCreateFollowUp={handleCreateFollowUpPost}
                                generatingFollowUpPostId={generatingFollowUpPostId}
                                onSharePost={setPostToShare}
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
            {postToDownloadAssets && (
                <DownloadAssetsModal
                    post={postToDownloadAssets}
                    screen={screen}
                    organization={organization}
                    onClose={() => setPostToDownloadAssets(null)}
                />
            )}
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
            <SharePostModal
                isOpen={!!postToShare}
                onClose={() => setPostToShare(null)}
                onShare={handleConfirmShare}
                organization={{...organization, displayScreens}}
                currentScreenId={screen.id}
                postToShare={postToShare}
                isSharing={isSaving}
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
