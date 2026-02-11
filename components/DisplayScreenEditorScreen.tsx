
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Organization, DisplayScreen, DisplayPost, PostTemplate, CustomEvent, CampaignIdea, MediaItem, StyleProfile, UserRole, AiImageVariant } from '../types';
import { useToast } from '../context/ToastContext';
import { StarIcon } from './icons';
import { useLocation } from '../context/StudioContext';
import { getSuggestedPostById, updateSuggestedPost, uploadPostAsset, addMediaItemsToLibrary } from '../services/firebaseService';

import { 
    generateCampaignIdeasForEvent,
    updateStyleProfileSummary,
} from '../services/geminiService';
import { calculatePlanningProfile } from '../utils/planningAnalytics';

import { PreviewPane } from './DisplayScreenEditor/PreviewPanes';
import { PostEditor } from './DisplayScreenEditor/PostEditor';
import { ControlPanel } from './DisplayScreenEditor/ControlPanel';
import { 
    CampaignIdeaModal,
    DownloadAssetsModal,
    SharePostModal
} from './DisplayScreenEditor/Modals';
import { syncSharedPosts, copyPostToScreens } from './DisplayScreenEditor/sharedPostsUtils';
import { ConfirmDialog } from './ConfirmDialog';


interface DisplayScreenEditorScreenProps {
    screen: DisplayScreen;
    initialPostToEdit?: DisplayPost | null;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
    userRole: UserRole;
}

const dataUriToBlob = (dataURI: string): Blob => {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
};


export const DisplayScreenEditorScreen: React.FC<DisplayScreenEditorScreenProps> = ({ screen: initialScreen, initialPostToEdit, onUpdateOrganization, userRole }) => {
    const { selectedOrganization: organization, displayScreens, updateDisplayScreen } = useLocation();
    const { showToast } = useToast();

    const screen = useMemo(() => displayScreens.find(s => s.id === initialScreen.id) || initialScreen, [displayScreens, initialScreen]);

    const [editingPost, setEditingPost] = useState<DisplayPost | null>(initialPostToEdit || null);
    const [originalPost, setOriginalPost] = useState<DisplayPost | null>(initialPostToEdit ? JSON.parse(JSON.stringify(initialPostToEdit)) : null);
    const [postToDownloadAssets, setPostToDownloadAssets] = useState<DisplayPost | null>(null);
    const [showStarAnimation, setShowStarAnimation] = useState(false);
    
    const [isIdeaModalOpen, setIsIdeaModalOpen] = useState(false);
    const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
    const [generatedIdeas, setGeneratedIdeas] = useState<CampaignIdea[] | null>(null);
    const [followUpSuggestion, setFollowUpSuggestion] = useState<{ question: string; eventName: string; } | null>(null);
    const [ideaGenerationError, setIdeaGenerationError] = useState<string | null>(null);
    const [selectedEventForIdeas, setSelectedEventForIdeas] = useState<{ name: string } | null>(null);

    const [postToShare, setPostToShare] = useState<DisplayPost | null>(null);
    const [isSharing, setIsSharing] = useState(false);

    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [postIdToDelete, setPostIdToDelete] = useState<string | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpenDropdownId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        if (showStarAnimation) {
             const timer = setTimeout(() => setShowStarAnimation(false), 1300);
             return () => clearTimeout(timer);
        }
    }, [showStarAnimation]);

    const handleUpdatePosts = async (updatedPosts: DisplayPost[]) => {
        if (!organization) return;
        
        await updateDisplayScreen(screen.id, { posts: updatedPosts });

        const allOrgScreens = displayScreens.map(s => s.id === screen.id ? { ...screen, posts: updatedPosts } : s);
        const allPostsForProfile = allOrgScreens.flatMap(s => s.posts || []);
        const newPlanningProfile = calculatePlanningProfile(allPostsForProfile);

        await onUpdateOrganization(organization.id, { planningProfile: newPlanningProfile });
    };

    const handleSavePost = async (postToSave: DisplayPost) => {
        if (!organization) return;
    
        const isNewPost = postToSave.id.startsWith('new-');
        const finalPostId = isNewPost ? `post-${Date.now()}` : postToSave.id;
        let postWithStorageUrls = { ...postToSave, id: finalPostId };
    
        const wasAiDataUri = postToSave.imageUrl?.startsWith('data:') && postToSave.isAiGeneratedImage;
        const aiCollageItems: MediaItem[] = [];
    
        try {
            const processUrl = async (url: string | undefined): Promise<string | undefined> => {
                if (!url || !url.startsWith('data:')) return url;
                const blob = dataUriToBlob(url);
                
                const timestamp = Date.now();
                const randomId = Math.random().toString(36).substring(2, 8);
                let extension = 'png';
                
                if (blob.type.includes('video')) {
                    extension = 'mp4';
                } else if (blob.type.includes('jpeg') || blob.type.includes('jpg')) {
                    extension = 'jpg';
                } else if (blob.type.includes('gif')) {
                    extension = 'gif';
                }

                const filename = `asset-${timestamp}-${randomId}.${extension}`;
                const file = new File([blob], filename, { type: blob.type });
                
                return await uploadPostAsset(organization.id, finalPostId, file, () => {});
            };
    
            if (postWithStorageUrls.imageUrl?.startsWith('data:')) {
                postWithStorageUrls.imageUrl = await processUrl(postWithStorageUrls.imageUrl);
            }
            if (postWithStorageUrls.videoUrl?.startsWith('data:')) {
                postWithStorageUrls.videoUrl = await processUrl(postWithStorageUrls.videoUrl);
            }
            
            if (postWithStorageUrls.aiImageVariants) {
                postWithStorageUrls.aiImageVariants = await Promise.all(
                    postWithStorageUrls.aiImageVariants.map(async (variant) => {
                        if (variant.url.startsWith('data:')) {
                            const storageUrl = await processUrl(variant.url);
                            return { ...variant, url: storageUrl! };
                        }
                        return variant;
                    })
                );
            }
            
            // Process SubImages (Carousel)
            if (postWithStorageUrls.subImages) {
                postWithStorageUrls.subImages = await Promise.all(
                    postWithStorageUrls.subImages.map(async (img) => {
                        if (img.imageUrl.startsWith('data:')) {
                            const storageUrl = await processUrl(img.imageUrl);
                            return { ...img, imageUrl: storageUrl! };
                        }
                        return img;
                    })
                );
            }
    
            if (postWithStorageUrls.collageItems) {
                postWithStorageUrls.collageItems = await Promise.all(
                    postWithStorageUrls.collageItems.map(async (item) => {
                        if (!item) return item;
                        const newItem = { ...item };
                        const wasCollageAi = item.isAiGeneratedImage && item.imageUrl?.startsWith('data:');
                        
                        if (newItem.imageUrl?.startsWith('data:')) {
                            const newUrl = await processUrl(newItem.imageUrl);
                            newItem.imageUrl = newUrl;
                            
                            // Collect AI-generated collage items to add to gallery
                            if (wasCollageAi && newUrl) {
                                aiCollageItems.push({
                                    id: `media-ai-collage-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                                    type: 'image',
                                    url: newUrl,
                                    internalTitle: `AI Collage: ${postToSave.internalTitle || 'Bild'}`,
                                    createdAt: new Date().toISOString(),
                                    createdBy: 'ai',
                                    aiPrompt: "Collage Image"
                                });
                            }
                        }
                        if (newItem.videoUrl?.startsWith('data:')) {
                            newItem.videoUrl = await processUrl(newItem.videoUrl);
                        }
                        return newItem;
                    })
                );
            }
    
        } catch (uploadError) {
            console.error("Error uploading media during save:", uploadError);
            showToast({ message: "Kunde inte ladda upp media till molnet. Försök igen.", type: 'error' });
            throw uploadError;
        }

        const sanitizedPost = JSON.parse(JSON.stringify(postWithStorageUrls));
    
        const updatedPosts = isNewPost
            ? [...(screen.posts || []), sanitizedPost]
            : (screen.posts || []).map(p => p.id === sanitizedPost.id ? sanitizedPost : p);
        
        await updateDisplayScreen(screen.id, { posts: updatedPosts });
        
        const isOriginalPost = !sanitizedPost.sharedFromPostId;
        if (isOriginalPost) {
            const tempOrgForSync = { ...organization, displayScreens };
            const syncedScreens = syncSharedPosts(sanitizedPost, tempOrgForSync);
            for (const syncedScreen of syncedScreens) {
                if (JSON.stringify(syncedScreen) !== JSON.stringify(displayScreens.find(s => s.id === syncedScreen.id))) {
                    await updateDisplayScreen(syncedScreen.id, { posts: syncedScreen.posts });
                }
            }
        }
        
        const allPostsForProfile = displayScreens.flatMap(s => s.id === screen.id ? updatedPosts : s.posts || []);
        const newPlanningProfile = calculatePlanningProfile(allPostsForProfile);
    
        const styleProfile: StyleProfile = organization.styleProfile || { version: 0 };
        const newVersion = (styleProfile.version || 0) + 1;
        let updatedSummary = styleProfile.summary;
        let updatedProfile: StyleProfile = { ...styleProfile, version: newVersion };
    
        if (postToSave.suggestionOriginId) {
            showToast({ message: "AI:n kommer att lära sig av dina ändringar.", type: 'info' });
        } else {
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
    
        if (postToSave.suggestionOriginId) {
            try {
                await updateSuggestedPost(organization.id, postToSave.suggestionOriginId, { status: 'edited-and-published', finalPostId: sanitizedPost.id });
            } catch (e) {
                console.warn("Could not update suggestion status:", e);
            }
        }
    
        let orgUpdatePayload: Partial<Organization> = {
            styleProfile: updatedProfile,
            planningProfile: newPlanningProfile,
        };
        
        let newMediaItems: MediaItem[] = [];

        if (wasAiDataUri && sanitizedPost.imageUrl) {
            const newMediaItem: MediaItem = {
                id: `media-ai-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                type: 'image',
                url: sanitizedPost.imageUrl,
                internalTitle: `AI: ${postToSave.aiImagePrompt?.slice(0, 30) || postToSave.internalTitle || 'Bild'}...`,
                createdAt: new Date().toISOString(),
                createdBy: 'ai',
                aiPrompt: postToSave.aiImagePrompt,
            };
            newMediaItems.push(newMediaItem);
        }
        
        if (aiCollageItems.length > 0) {
            newMediaItems.push(...aiCollageItems);
        }

        const updatePromises: Promise<any>[] = [];

        if (newMediaItems.length > 0) {
            updatePromises.push(addMediaItemsToLibrary(organization.id, newMediaItems));
        }
    
        updatePromises.push(onUpdateOrganization(organization.id, orgUpdatePayload));

        await Promise.all(updatePromises);
    
        showToast({ message: "Inlägget sparades.", type: 'success' });
    
        setEditingPost(null);
        setOriginalPost(null);
        if (isNewPost) setShowStarAnimation(true);
    };

    const handleCreatePost = (template?: PostTemplate) => {
        if (!organization) return;
        const basePost = template ? { ...template.postData } : { layout: 'text-only' as const, durationSeconds: 10 };
        const newPost: DisplayPost = {
            id: `new-${Date.now()}`,
            internalTitle: template ? template.templateName : 'Nytt inlägg',
            ...basePost,
            headlineFontFamily: template?.postData.headlineFontFamily ?? organization.headlineFontFamily,
            bodyFontFamily: template?.postData.bodyFontFamily ?? organization.bodyFontFamily,
        };
        setOriginalPost(JSON.parse(JSON.stringify(newPost)));
        setEditingPost(newPost);
    };

    const handleCancelEdit = () => {
        setEditingPost(null);
        setOriginalPost(null);
    };

    const handleDeletePost = async () => {
        if (postIdToDelete && organization) {
            const updatedPosts = (screen.posts || []).filter(p => p.id !== postIdToDelete);
            await handleUpdatePosts(updatedPosts);
            setPostIdToDelete(null);
            showToast({ message: "Inlägget togs bort.", type: 'success' });
        }
    };
    
    const handleGetCampaignIdeas = async (event: { name: string; date: Date }) => {
        if (!organization) return;
    
        const now = new Date();
        const diffTime = event.date.getTime() - now.getTime();
        const daysUntil = Math.max(0, Math.ceil(diffTime / (1000 * 3600 * 24)));
    
        setSelectedEventForIdeas({ name: event.name });
        setIsIdeaModalOpen(true);
        setIsGeneratingIdeas(true);
        setGeneratedIdeas(null);
        setFollowUpSuggestion(null);
        setIdeaGenerationError(null);
        try {
            const { ideas, followUpSuggestion: suggestion } = await generateCampaignIdeasForEvent(
                event.name,
                daysUntil,
                organization,
            );
            setGeneratedIdeas(ideas);
            setFollowUpSuggestion(suggestion || null);
        } catch (error) {
            setIdeaGenerationError(error instanceof Error ? error.message : "Kunde inte hämta idéer.");
        } finally {
            setIsGeneratingIdeas(false);
        }
    };

    const handleFollowUpClick = (eventName: string) => {
        handleGetCampaignIdeas({ name: eventName, date: new Date() });
    };

    const handleConfirmShare = async (targetScreenIds: string[]) => {
        if (!postToShare || !organization || targetScreenIds.length === 0) return;
    
        setIsSharing(true);
        try {
            const updatedScreens = copyPostToScreens(
                postToShare,
                targetScreenIds,
                screen.id,
                { ...organization, displayScreens }
            );

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
            setIsSharing(false);
            setPostToShare(null);
        }
    };
    
    const handleUpdateScreen = async (data: Partial<DisplayScreen>) => {
        await updateDisplayScreen(screen.id, data);
    };

    const handleSaveAsTemplate = async (postToSave: DisplayPost) => {
        if (!organization) return;
        const templateName = prompt("Ange ett namn för mallen:", postToSave.internalTitle);
        if (templateName) {
            const { id, startDate, endDate, internalTitle, ...postData } = postToSave;
            const newTemplate: PostTemplate = {
                id: `template-${Date.now()}`,
                templateName,
                postData: postData,
            };
            const updatedTemplates = [...(organization.postTemplates || []), newTemplate];
            await onUpdateOrganization(organization.id, { postTemplates: updatedTemplates });
            showToast({ message: "Inlägget sparades som en mall.", type: 'success' });
        }
    };

    const handleSharePost = (post: DisplayPost) => {
        setPostToShare(post);
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
            
            {editingPost ? (
                <PostEditor
                    post={editingPost}
                    originalPost={originalPost}
                    screen={screen}
                    organization={organization}
                    onPostChange={setEditingPost}
                    onSave={handleSavePost}
                    onCancel={handleCancelEdit}
                    onUpdateOrganization={onUpdateOrganization}
                    userRole={userRole}
                />
            ) : (
                <>
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Hantera inlägg: {screen.name}</h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">Här kan du skapa, redigera och sortera inläggen i din kanal.</p>
                    </div>
                    
                    <ControlPanel
                        screen={screen} 
                        organization={organization}
                        onUpdateScreen={handleUpdateScreen}
                        onEditPost={(post) => {
                            setOriginalPost(JSON.parse(JSON.stringify(post)));
                            setEditingPost(post);
                        }} 
                        onDeletePost={(id) => setPostIdToDelete(id)}
                        onDownloadPost={setPostToDownloadAssets}
                        onInitiateCreatePost={() => handleCreatePost()}
                        onSaveAsTemplate={handleSaveAsTemplate}
                        onSharePost={handleSharePost}
                        openDropdownId={openDropdownId}
                        setOpenDropdownId={setOpenDropdownId}
                        dropdownRef={dropdownRef}
                    />
                </>
            )}
            
            <ConfirmDialog
                isOpen={!!postIdToDelete}
                onClose={() => setPostIdToDelete(null)}
                onConfirm={handleDeletePost}
                title="Ta bort inlägg?"
                confirmText="Ja, ta bort"
            >
                Är du säker på att du vill ta bort detta inlägg? Detta går inte att ångra.
            </ConfirmDialog>

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
            <SharePostModal
                isOpen={!!postToShare}
                onClose={() => setPostToShare(null)}
                onShare={handleConfirmShare}
                organization={{...organization, displayScreens}}
                currentScreenId={screen.id}
                postToShare={postToShare}
                isSharing={isSharing}
            />
        </div>
    );
};
