import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { DisplayPost, Organization, DisplayScreen, MediaItem, CollageItem, AiImageVariant, StructuredImagePrompt, VideoOperation } from '../../../types';
import { PrimaryButton, SecondaryButton } from '../../Buttons';
import { SparklesIcon, TrashIcon, PhotoIcon, VideoCameraIcon, MicrophoneIcon, PencilIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, CheckCircleIcon, ExclamationTriangleIcon, LoadingSpinnerIcon, DownloadIcon, StarIcon } from '../../icons';
import { useToast } from '../../../context/ToastContext';
import { uploadPostAsset, uploadMediaForGallery, addMediaItemsToLibrary, listenToVideoOperationForPost } from '../../../services/firebaseService';
import { generateDisplayPostImage, generateVideoFromPrompt, fileToBase64, urlToBase64, editDisplayPostImage } from '../../../services/geminiService';
import { useAuth } from '../../../context/AuthContext';
import { MediaPickerModal, AiStudioModifierGroup } from '../Modals';
import { useSpeechRecognition } from '../../../hooks/useSpeechRecognition';
import { ThinkingDots } from '../../HelpBot';

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

// --- Sub-components for different media states ---

const AiImageEditorModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (prompt: string) => void;
  isLoading: boolean;
}> = ({ isOpen, onClose, onGenerate, isLoading }) => {
  const [prompt, setPrompt] = useState('');

  if (!isOpen) return null;

  const handleGenerate = () => {
    if (prompt.trim()) {
      onGenerate(prompt.trim());
    }
  };

  const portalRoot = document.getElementById('modal-root') || document.body;
  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[52] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-2">Redigera bild med AI</h2>
        <p className="text-slate-600 dark:text-slate-300 mb-6">Beskriv ändringen du vill göra, t.ex. "lägg till en solnedgång i bakgrunden" eller "gör färgerna mer levande".</p>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Din redigeringsinstruktion..."
          rows={3}
          className="w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
          disabled={isLoading}
        />
        <div className="flex justify-end gap-4 mt-6">
          <SecondaryButton onClick={onClose} disabled={isLoading}>Avbryt</SecondaryButton>
          <PrimaryButton onClick={handleGenerate} loading={isLoading} disabled={!prompt.trim()}>
            <SparklesIcon className="h-5 w-5 mr-2"/>
            Generera ny variant
          </PrimaryButton>
        </div>
      </div>
    </div>,
    portalRoot
  );
};


const NoMediaNeeded: React.FC = () => (
    <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-900/50 text-center border border-slate-200 dark:border-slate-700">
        <h4 className="font-semibold text-slate-700 dark:text-slate-300">Ingen media behövs</h4>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Den valda layouten använder inte bilder eller video.</p>
    </div>
);

// --- NEW Structured AI Prompt Builder Component ---

const colorToneOptions = [
    { label: 'Varm', value: 'warm tones' },
    { label: 'Kall', value: 'cool tones' },
    { label: 'Pastell', value: 'pastel colors' },
    { label: 'Kontrastig', value: 'high contrast' },
    { label: 'Monokrom', value: 'monochrome' },
    { label: 'Premium', value: 'premium color grading' },
];

const perspectiveOptions = [
    { label: 'Närbild', value: 'close-up shot' },
    { label: 'Halvkropp', value: 'medium shot' },
    { label: 'Översiktsbild', value: 'wide shot' },
    { label: 'Makrodetalj', value: 'macro detail' },
    { label: 'Fågelperspektiv', value: "bird's-eye view" },
    { label: 'Grodperspektiv', value: "frog's-eye view" },
];

const compositionOptions = [
    { label: 'Centrerad', value: 'centered composition' },
    { label: 'Tredjedelsregeln', value: 'rule of thirds' },
    { label: 'Negativt utrymme', value: 'minimalist with negative space' },
    { label: 'Symmetrisk', value: 'symmetrical' },
    { label: 'Asymmetrisk', value: 'asymmetrical' },
];

const styleOptions = [
    { label: 'Studiofoto', value: 'studio photography' },
    { label: 'Lifestyle', value: 'lifestyle photography' },
    { label: 'Produktfoto', value: 'product photography' },
    { label: 'Flatlay', value: 'flatlay photography' },
    { label: 'Minimalism', value: 'clean minimalism' },
    { label: 'Cinematisk', value: 'cinematic still' },
];

const storyOptions = [
    { label: 'Före/efter', value: 'before and after concept' },
    { label: 'Steg-för-steg', value: 'step-by-step sequence' },
    { label: 'Temaserie', value: 'themed series' },
    { label: 'Produktserie', value: 'product line-up' },
    { label: 'Rörelse', value: 'action shot' },
    { label: 'Stilla', value: 'still life' },
];

const StructuredAiPromptBuilder: React.FC<{
    prompt: Partial<StructuredImagePrompt>;
    onPromptChange: (prompt: Partial<StructuredImagePrompt>) => void;
    disabled?: boolean;
    showSpeechButton?: boolean;
    onSpeechClick?: () => void;
    isListening?: boolean;
}> = ({ prompt, onPromptChange, disabled, showSpeechButton, onSpeechClick, isListening }) => {
    const handleChange = <K extends keyof StructuredImagePrompt>(field: K, value: StructuredImagePrompt[K]) => {
        onPromptChange({ ...prompt, [field]: value });
    };

    const handleSelect = <K extends keyof StructuredImagePrompt>(field: K, value: StructuredImagePrompt[K]) => {
        onPromptChange({ ...prompt, [field]: prompt[field] === value ? undefined : value });
    };
    
    return (
        <div className="space-y-4">
            <div className="relative">
                <textarea
                    value={prompt.subject || ''}
                    onChange={e => handleChange('subject', e.target.value)}
                    placeholder="Beskriv motivet för bilden du vill skapa..."
                    rows={3}
                    className={`w-full bg-white dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors ${showSpeechButton ? 'pr-12' : ''}`}
                    disabled={disabled}
                />
                {showSpeechButton && (
                    <button
                        type="button"
                        onClick={onSpeechClick}
                        disabled={disabled}
                        className={`absolute top-2 right-2 p-2.5 rounded-lg transition-colors ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                        title="Använd röstinmatning"
                    >
                        <MicrophoneIcon className="h-5 w-5" />
                    </button>
                )}
            </div>
            <div className="space-y-3">
                <AiStudioModifierGroup label="Stil" options={styleOptions} selectedValue={prompt.style || ''} onSelect={(v) => handleSelect('style', v)} />
                <AiStudioModifierGroup label="Färg & ton" options={colorToneOptions} selectedValue={prompt.colorTone || ''} onSelect={(v) => handleSelect('colorTone', v)} />
                <AiStudioModifierGroup label="Perspektiv" options={perspectiveOptions} selectedValue={prompt.perspective || ''} onSelect={(v) => handleSelect('perspective', v)} />
                <AiStudioModifierGroup label="Komposition" options={compositionOptions} selectedValue={prompt.composition || ''} onSelect={(v) => handleSelect('composition', v)} />
                <AiStudioModifierGroup label="Story / Användningsscenario" options={storyOptions} selectedValue={prompt.story || ''} onSelect={(v) => handleSelect('story', v)} />
            </div>
        </div>
    );
};


const SingleMediaEditor: React.FC<{
    post: DisplayPost;
    onPostChange: (updatedPost: DisplayPost) => void;
    handleFileChange: (file: File) => void;
    aiLoading: string | false;
    setAiLoading: (loading: string | false) => void;
    uploadProgress: number | null;
    organization: Organization;
    screen: DisplayScreen;
    onUpdateOrganization: (orgId: string, data: Partial<Organization>) => Promise<void>;
}> = ({ post, onPostChange, handleFileChange, aiLoading, setAiLoading, uploadProgress, organization, screen, onUpdateOrganization }) => {
    const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
    const [isAiEditorOpen, setIsAiEditorOpen] = useState(false);
    const [isSavingToGallery, setIsSavingToGallery] = useState(false);
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    const [videoProgressText, setVideoProgressText] = useState("");
    const [useImageForVideo, setUseImageForVideo] = useState(false);
    const [isImageAliveEnabled, setIsImageAliveEnabled] = useState(false);

    const { isListening, transcript, error: speechError, startListening, stopListening, browserSupportsSpeechRecognition } = useSpeechRecognition();

    useEffect(() => {
        if (transcript) {
          const newPrompt = { ...(post.structuredImagePrompt || {}), subject: transcript };
          handleStructuredPromptChange(newPrompt);
        }
    // We only want to react to transcript changes, so we disable the exhaustive-deps lint rule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transcript]);

    useEffect(() => {
        if (speechError) {
          showToast({ message: `Röstigenkänning misslyckades: ${speechError}`, type: 'error' });
        }
    }, [speechError, showToast]);
    
    // Reset toggles if image is removed
    useEffect(() => {
        if (!post.imageUrl) {
            setUseImageForVideo(false);
            setIsImageAliveEnabled(false);
        }
    }, [post.imageUrl]);

    const handleStructuredPromptChange = (newPrompt: Partial<StructuredImagePrompt>) => {
        const fullPrompt = [newPrompt.subject, newPrompt.style, newPrompt.colorTone, newPrompt.perspective, newPrompt.composition, newPrompt.story].filter(Boolean).join(', ');
        onPostChange({
            ...post,
            aiImagePrompt: fullPrompt,
            structuredImagePrompt: {
                ...(post.structuredImagePrompt || {}),
                ...newPrompt,
                subject: newPrompt.subject || '', // ensure subject is not undefined
            },
        });
    };
    
    const handleGenerateImage = async () => {
        const promptToGenerate = post.aiImagePrompt;
        if (!promptToGenerate || !promptToGenerate.trim()) return;

        const aspectRatio = screen.aspectRatio;

        setAiLoading('generate-image');
        try {
            const { imageBytes, mimeType } = await generateDisplayPostImage(promptToGenerate, aspectRatio);
            const dataUri = `data:${mimeType};base64,${imageBytes}`;
            
            onPostChange({
                ...post,
                imageUrl: dataUri,
                videoUrl: undefined,
                isAiGeneratedImage: true,
            });
            showToast({ message: 'AI-bild genererad!', type: 'success' });
    
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Kunde inte generera bild.', type: 'error' });
        } finally {
            setAiLoading(false);
        }
    };

    const handleGenerateVideo = async () => {
        if (!post.aiVideoPrompt && !isImageAliveEnabled) {
            showToast({ message: "Skriv en beskrivning av videon först.", type: 'info' });
            return;
        }
        if (!currentUser) return;
        
        let imagePayload = undefined;
        // Check if we should use existing image as starting frame
        const shouldAnimateImage = (useImageForVideo || isImageAliveEnabled) && post.imageUrl;

        if (shouldAnimateImage) {
             try {
                 setAiLoading('preparing-image');
                 const { mimeType, data } = await urlToBase64(post.imageUrl);
                 imagePayload = { mimeType, data };
             } catch (e) {
                 console.error("Failed to process start image for video", e);
                 showToast({ message: "Kunde inte använda bilden för animering.", type: 'error' });
                 setAiLoading(false);
                 return;
             }
        }

        let finalPrompt = post.aiVideoPrompt || '';
        if (isImageAliveEnabled) {
            const aliveSuffix = "Add subtle, looping ambient motion. Maintain absolute consistency with the starting frame. If there is liquid, add ripples or steam. If there is vegetation, add a gentle breeze. If there are lights, add subtle glimmers. The result should be a high-quality cinematic cinemagraph.";
            finalPrompt = finalPrompt ? `${finalPrompt}. ${aliveSuffix}` : aliveSuffix;
        }

        setAiLoading('generate-video');
        setVideoProgressText("Startar...");

        try {
            const videoUrl = await generateVideoFromPrompt(
                finalPrompt,
                organization.id,
                screen.id,
                post.id,
                (status) => setVideoProgressText(status),
                imagePayload
            );
            
            showToast({ message: 'Videogenerering klar!', type: 'success' });
            
            onPostChange({
                ...post,
                videoUrl: videoUrl,
                isAiGeneratedVideo: true,
                imageUrl: undefined
            });

        } catch (error) {
            console.error("Video generation failed:", error);
            showToast({ message: error instanceof Error ? error.message : 'Kunde inte starta videogenerering.', type: 'error' });
        } finally {
            setAiLoading(false);
            setVideoProgressText("");
        }
    };

    const handleSelectFromGallery = (item: MediaItem) => {
        const newLayout = (item.type === 'video' && post.layout === 'image-fullscreen') 
            ? 'video-fullscreen' 
            : (item.type === 'image' && post.layout === 'video-fullscreen')
            ? 'image-fullscreen'
            : post.layout;

        onPostChange({
            ...post,
            layout: newLayout,
            imageUrl: item.type === 'image' ? item.url : undefined,
            videoUrl: item.type === 'video' ? item.url : undefined,
            isAiGeneratedImage: item.createdBy === 'ai',
        });
        setIsMediaPickerOpen(false);
    };

    const handleEditImage = async (editPrompt: string) => {
        if (!post.imageUrl || !currentUser) return;
        setIsAiEditorOpen(false);
        setAiLoading('edit-image');
    
        try {
            const { mimeType, data } = await urlToBase64(post.imageUrl);
            
            const currentVariant: AiImageVariant = {
                id: `variant-${Date.now()}`,
                url: post.imageUrl,
                prompt: post.aiImagePrompt || '',
                createdAt: new Date().toISOString(),
                createdByUid: currentUser.uid,
            };
            
            const { imageBytes: newImageBytes, mimeType: newMimeType } = await editDisplayPostImage(data, mimeType, editPrompt);
            const newDataUri = `data:${newMimeType};base64,${newImageBytes}`;

            const newVariants = [...(post.aiImageVariants || []), currentVariant];
            onPostChange({ 
                ...post, 
                imageUrl: newDataUri, 
                aiImageVariants: newVariants, 
                aiImagePrompt: editPrompt,
                isAiGeneratedImage: true
            });
    
            showToast({ message: 'Ny bildvariant skapad!', type: 'success' });
        } catch (error) {
            console.error("AI Edit failed:", error);
            showToast({ message: error instanceof Error ? error.message : 'Kunde inte redigera bilden.', type: 'error' });
        } finally {
            setAiLoading(false);
        }
    };

    const handleUndoImageEdit = () => {
        if (!post.aiImageVariants || post.aiImageVariants.length === 0) return;
        
        const variants = [...post.aiImageVariants];
        const lastVariant = variants.pop()!;
        
        onPostChange({
            ...post,
            imageUrl: lastVariant.url,
            aiImagePrompt: lastVariant.prompt,
            aiImageVariants: variants,
        });
        
        showToast({ message: 'Återställde föregående bild.', type: 'info' });
    };

    const handleMicClick = () => {
        if (!browserSupportsSpeechRecognition) {
          showToast({ message: 'Din webbläsare stöder inte röstinmatning.', type: 'error' });
          return;
        }
        if (isListening) {
          stopListening();
        } else {
          startListening();
        }
    };

    const handleSaveToGallery = async () => {
        const mediaUrl = post.imageUrl || post.videoUrl;
        if (!mediaUrl) return;

        setIsSavingToGallery(true);
        try {
            let finalUrl = mediaUrl;
            let type: 'image' | 'video' = post.imageUrl ? 'image' : 'video';
            let createdBy: 'user' | 'ai' = (post.isAiGeneratedImage || post.isAiGeneratedVideo) ? 'ai' : 'user';

            if (mediaUrl.startsWith('data:')) {
                const blob = dataUriToBlob(mediaUrl);
                const extension = type === 'image' ? 'png' : 'mp4';
                const file = new File([blob], `gallery-item-${Date.now()}.${extension}`, { type: blob.type });
                const { url } = await uploadMediaForGallery(organization.id, file, () => {});
                finalUrl = url;
            }

            const newItem: MediaItem = {
                id: `media-${Date.now()}`,
                type,
                url: finalUrl,
                internalTitle: post.internalTitle || 'Bild från inlägg',
                createdAt: new Date().toISOString(),
                createdBy,
                aiPrompt: post.aiImagePrompt || post.aiVideoPrompt
            };

            await addMediaItemsToLibrary(organization.id, [newItem]);
            showToast({ message: "Media sparad i ditt galleri! 📸", type: 'success' });
        } catch (error) {
            console.error("Save to gallery failed:", error);
            showToast({ message: "Kunde inte spara till galleriet.", type: 'error' });
        } finally {
            setIsSavingToGallery(false);
        }
    };
    
    const isVideoGenerating = aiLoading === 'generate-video' || aiLoading === 'preparing-image';
    const isImageGenerating = aiLoading === 'generate-image' || aiLoading === 'edit-image';

    return (
        <>
            <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                    <PrimaryButton onClick={() => document.getElementById('file-upload-step2')?.click()} disabled={!!aiLoading}>
                        <PhotoIcon className="w-5 h-5 mr-2" /> Ladda upp
                    </PrimaryButton>
                    <SecondaryButton onClick={() => setIsMediaPickerOpen(true)} disabled={!!aiLoading}>
                        Välj från galleri
                    </SecondaryButton>
                </div>
                <input id="file-upload-step2" type="file" onChange={e => e.target.files && handleFileChange(e.target.files[0])} className="hidden" accept="image/*,video/mp4,video/quicktime"/>
                
                <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800/50 space-y-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-purple-800 dark:text-purple-300">
                        <SparklesIcon className="w-5 h-5"/>
                        Skapa bild med AI
                    </label>
                    <StructuredAiPromptBuilder 
                        prompt={post.structuredImagePrompt || { subject: post.aiImagePrompt || '' }}
                        onPromptChange={handleStructuredPromptChange}
                        disabled={!!aiLoading}
                        showSpeechButton={browserSupportsSpeechRecognition}
                        isListening={isListening}
                        onSpeechClick={handleMicClick}
                    />
                    <div className="flex gap-2 pt-2">
                        <PrimaryButton onClick={handleGenerateImage} loading={aiLoading === 'generate-image'} disabled={!post.aiImagePrompt?.trim() || !!aiLoading} className="bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-500/20">
                            Generera bild
                        </PrimaryButton>
                    </div>
                </div>

                <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800/50 space-y-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-indigo-800 dark:text-indigo-300">
                        <VideoCameraIcon className="w-5 h-5"/>
                        Skapa video med AI
                    </label>
                    {isVideoGenerating ? (
                        <div className="flex items-center gap-3 p-4 bg-indigo-600 dark:bg-indigo-700 rounded-lg text-white border border-indigo-500 shadow-xl animate-pulse">
                            <LoadingSpinnerIcon className="w-6 h-6 animate-spin" />
                            <div>
                                <p className="font-bold flex items-center gap-2">
                                    {videoProgressText || (aiLoading === 'preparing-image' ? "Förbereder bild..." : "Skapar video...")}
                                    <ThinkingDots className="text-white/70" />
                                </p>
                                <p className="text-xs opacity-80 mt-1">Skylie renderar din vision. Det här kan ta en stund.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {post.imageUrl && (
                                <div className="space-y-2 mb-1 p-3 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg border border-indigo-200 dark:border-indigo-700/50">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="useImageForVideo"
                                            checked={useImageForVideo}
                                            onChange={(e) => setUseImageForVideo(e.target.checked)}
                                            className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-indigo-300 cursor-pointer"
                                            disabled={!!aiLoading}
                                        />
                                        <label htmlFor="useImageForVideo" className="text-sm font-medium text-indigo-800 dark:text-indigo-200 cursor-pointer select-none">
                                            Använd inläggets bild som startbild
                                        </label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="makeImageAlive"
                                            checked={isImageAliveEnabled}
                                            onChange={(e) => setIsImageAliveEnabled(e.target.checked)}
                                            className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-indigo-300 cursor-pointer"
                                            disabled={!!aiLoading}
                                        />
                                        <label htmlFor="makeImageAlive" className="text-sm font-bold text-indigo-900 dark:text-white cursor-pointer select-none flex items-center gap-1">
                                            ✨ Gör bilden levande (rök, vind, ljusblänk)
                                        </label>
                                    </div>
                                </div>
                            )}
                            <textarea
                                value={post.aiVideoPrompt || ''}
                                onChange={e => onPostChange({ ...post, aiVideoPrompt: e.target.value })}
                                placeholder={isImageAliveEnabled ? "Skriv inget här för automatisk 'liv', eller beskriv rörelsen själv..." : (useImageForVideo ? "Beskriv hur bilden ska röra sig (t.ex. 'Kameran zoomar långsamt in', 'Vågorna rör sig')..." : "Beskriv en kort video du vill skapa...")}
                                rows={3}
                                className="w-full bg-white dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                                disabled={!!aiLoading}
                            />
                            <PrimaryButton onClick={handleGenerateVideo} loading={aiLoading === 'generate-video'} disabled={(!post.aiVideoPrompt?.trim() && !isImageAliveEnabled) || !!aiLoading} className="bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20">
                                {isImageAliveEnabled ? "Skapa magisk rörelse" : (useImageForVideo ? "Animera bild" : "Generera video")}
                            </PrimaryButton>
                        </>
                    )}
                </div>

                {isImageGenerating && (
                    <div className="flex items-center gap-3 p-4 bg-purple-600 dark:bg-purple-700 rounded-lg text-white border border-purple-500 shadow-xl animate-pulse">
                        <SparklesIcon className="w-6 h-6 animate-spin" />
                        <div>
                            <p className="font-bold flex items-center gap-2">
                                Skylie genererar bild...
                                <ThinkingDots className="text-white/70" />
                            </p>
                            <p className="text-xs opacity-80 mt-1">Bilden skapas utifrån din DNA-profil och dina instruktioner.</p>
                        </div>
                    </div>
                )}

                {uploadProgress !== null && (
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mt-2">
                        <div className="bg-primary h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                )}

                {(post.imageUrl || post.videoUrl) && (
                    <div className="mt-4 space-y-4">
                        <div className="relative w-48 group">
                            {post.imageUrl && <img src={post.imageUrl} className="w-full rounded-md shadow-md" alt="Post media preview" />}
                            {post.videoUrl && <video src={post.videoUrl} className="w-full rounded-md shadow-md" autoPlay muted loop playsInline />}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 gap-2 rounded-md">
                                <button onClick={() => onPostChange({ ...post, imageUrl: undefined, videoUrl: undefined })} disabled={!!aiLoading} className="w-32 bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-full shadow-lg text-sm">
                                    Ta bort
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                            {post.imageUrl && (
                                <button type="button" onClick={() => setIsAiEditorOpen(true)} className="flex items-center gap-1 text-sm font-semibold text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-50" disabled={!!aiLoading}>
                                    <PencilIcon className="h-4 w-4"/> Redigera bild med AI
                                </button>
                            )}
                            
                            <button type="button" onClick={handleSaveToGallery} disabled={!!aiLoading || isSavingToGallery} className="flex items-center gap-1 text-sm font-bold text-teal-600 dark:text-teal-400 hover:underline disabled:opacity-50">
                                {isSavingToGallery ? <LoadingSpinnerIcon className="w-4 h-4" /> : <StarIcon className="w-4 h-4" />}
                                Spara i galleriet
                            </button>

                            {post.aiImageVariants && post.aiImageVariants.length > 0 && (
                                <button type="button" onClick={handleUndoImageEdit} className="flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:underline disabled:opacity-50" disabled={!!aiLoading}>
                                    <ArrowUturnLeftIcon className="h-4 w-4"/> Backa ett steg
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
            
            <MediaPickerModal
                isOpen={isMediaPickerOpen}
                onClose={() => setIsMediaPickerOpen(false)}
                mediaLibrary={organization.mediaLibrary || []}
                onSelect={handleSelectFromGallery}
                filter={undefined} 
                postAiVariants={post.aiImageVariants}
            />
            <AiImageEditorModal
                isOpen={isAiEditorOpen}
                onClose={() => setIsAiEditorOpen(false)}
                onGenerate={handleEditImage}
                isLoading={aiLoading === 'edit-image'}
            />
        </>
    );
};


// NEW: Component specifically for managing media in a collage layout
const CollageMediaEditor: React.FC<{
    post: DisplayPost;
    onPostChange: (updatedPost: DisplayPost) => void;
    organization: Organization;
    screen: DisplayScreen;
    onUpdateOrganization: (orgId: string, data: Partial<Organization>) => Promise<void>;
}> = ({ post, onPostChange, organization, screen, onUpdateOrganization }) => {
    const { showToast } = useToast();
    const [aiLoading, setAiLoading] = useState<string | false>(false);
    const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [structuredPrompt, setStructuredPrompt] = useState<Partial<StructuredImagePrompt>>({ subject: '' });
    const [editingCollageItem, setEditingCollageItem] = useState<CollageItem | null>(null);
    const [isAiEditorOpen, setIsAiEditorOpen] = useState(false);
    const [isSavingToGalleryId, setIsSavingToGalleryId] = useState<string | null>(null);

    useEffect(() => {
        if (post.layout === 'collage' && (!post.collageItems || post.collageItems.length === 0)) {
            let initialItem: CollageItem | null = null;
            if (post.imageUrl) {
                initialItem = {
                    id: `item-${Date.now()}`,
                    type: 'image',
                    imageUrl: post.imageUrl,
                    isAiGeneratedImage: post.isAiGeneratedImage
                };
            } else if (post.videoUrl) {
                initialItem = {
                    id: `item-${Date.now()}`,
                    type: 'video',
                    videoUrl: post.videoUrl,
                    isAiGeneratedVideo: post.isAiGeneratedVideo
                };
            }
            if (initialItem) {
                onPostChange({ ...post, collageItems: [initialItem] });
            }
        }
    }, [post.id, post.layout, post.imageUrl, post.videoUrl, post.isAiGeneratedImage, post.isAiGeneratedVideo, post.collageItems, onPostChange]);

    const handleAddItem = (newItem: Omit<CollageItem, 'id'>) => {
        const itemWithId: CollageItem = { ...newItem, id: `item-${Date.now()}` };
        onPostChange({ ...post, collageItems: [...(post.collageItems || []), itemWithId] });
    };

    const handleAddFile = async (file: File) => {
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const isVideo = file.type.startsWith('video/');
                handleAddItem({
                    type: isVideo ? 'video' : 'image',
                    imageUrl: isVideo ? undefined : e.target?.result as string,
                    videoUrl: isVideo ? e.target?.result as string : undefined,
                });
            };
            reader.readAsDataURL(file);
        } catch (error) {
            showToast({ message: `Kunde inte läsa fil: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        }
    };
    
    const handleSelectFromGallery = (item: MediaItem) => {
        handleAddItem({
            type: item.type,
            imageUrl: item.type === 'image' ? item.url : undefined,
            videoUrl: item.type === 'video' ? item.url : undefined,
            isAiGeneratedImage: item.createdBy === 'ai',
        });
        setIsMediaPickerOpen(false);
    };

    const handleGenerateImage = async () => {
        const fullPrompt = [structuredPrompt.subject, structuredPrompt.style, structuredPrompt.colorTone, structuredPrompt.perspective, structuredPrompt.composition, structuredPrompt.story].filter(Boolean).join(', ');
        if (!fullPrompt.trim()) return;
        setAiLoading('generate-collage-image');
        try {
            const { imageBytes, mimeType } = await generateDisplayPostImage(fullPrompt.trim(), screen.aspectRatio);
            const dataUri = `data:${mimeType};base64,${imageBytes}`;
            handleAddItem({
                type: 'image',
                imageUrl: dataUri,
                isAiGeneratedImage: true,
            });
            showToast({ message: 'AI-bild genererad och tillagd i collage!', type: 'success' });
            setStructuredPrompt({ subject: '' });
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Kunde inte generera bild.', type: 'error' });
        } finally {
            setAiLoading(false);
        }
    };
    
    const handleEditCollageItem = async (editPrompt: string) => {
        if (!editingCollageItem || !editingCollageItem.imageUrl) return;
        setIsAiEditorOpen(false);
        setAiLoading('edit-collage-image');
    
        try {
            const { mimeType, data } = await urlToBase64(editingCollageItem.imageUrl);
            const { imageBytes: newImageBytes, mimeType: newMimeType } = await editDisplayPostImage(data, mimeType, editPrompt);
            const newDataUri = `data:${newMimeType};base64,${newImageBytes}`;
    
            const newMediaItem: MediaItem = {
                id: `media-ai-${Date.now()}`,
                type: 'image',
                url: newDataUri,
                internalTitle: `AI Edit: collage item`,
                createdAt: new Date().toISOString(),
                createdBy: 'ai',
                aiPrompt: editPrompt,
            };
            const updatedLibrary = [...(organization.mediaLibrary || []), newMediaItem];
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
            
            const updatedCollageItems = (post.collageItems || []).map(item =>
                item.id === editingCollageItem.id
                    ? { ...item, imageUrl: newDataUri, isAiGeneratedImage: true }
                    : item
            );
            onPostChange({ ...post, collageItems: updatedCollageItems });
    
            showToast({ message: 'Collagebild uppdaterad med AI!', type: 'success' });
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Kunde inte redigera bilden.', type: 'error' });
        } finally {
            setAiLoading(false);
            setEditingCollageItem(null);
        }
    };

    const handleRemoveItem = (idToRemove: string) => {
        onPostChange({ ...post, collageItems: (post.collageItems || []).filter(item => item.id !== idToRemove) });
    };

    const handleMoveItem = (index: number, direction: 'up' | 'down') => {
        const items = [...(post.collageItems || [])];
        if (direction === 'up' && index > 0) {
            [items[index - 1], items[index]] = [items[index], items[index - 1]];
        }
        if (direction === 'down' && index < items.length - 1) {
            [items[index + 1], items[index]] = [items[index], items[index + 1]];
        }
        onPostChange({ ...post, collageItems: items });
    };

    const handleSaveItemToGallery = async (item: CollageItem) => {
        const mediaUrl = item.imageUrl || item.videoUrl;
        if (!mediaUrl) return;

        setIsSavingToGalleryId(item.id);
        try {
            let finalUrl = mediaUrl;
            let createdBy: 'user' | 'ai' = (item.isAiGeneratedImage || item.isAiGeneratedVideo) ? 'ai' : 'user';

            if (mediaUrl.startsWith('data:')) {
                const blob = dataUriToBlob(mediaUrl);
                const extension = item.type === 'image' ? 'png' : 'mp4';
                const file = new File([blob], `gallery-item-${Date.now()}.${extension}`, { type: blob.type });
                const { url } = await uploadMediaForGallery(organization.id, file, () => {});
                finalUrl = url;
            }

            const newMediaItem: MediaItem = {
                id: `media-${Date.now()}`,
                type: item.type,
                url: finalUrl,
                internalTitle: `Bild från collage (${item.id})`,
                createdAt: new Date().toISOString(),
                createdBy,
            };

            await addMediaItemsToLibrary(organization.id, [newMediaItem]);
            showToast({ message: "Bild sparad i ditt galleri! 📸", type: 'success' });
        } catch (error) {
            console.error("Save to gallery failed:", error);
            showToast({ message: "Kunde inte spara till galleriet.", type: 'error' });
        } finally {
            setIsSavingToGalleryId(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                <PrimaryButton onClick={() => fileInputRef.current?.click()} disabled={!!aiLoading}>
                    <PhotoIcon className="w-5 h-5 mr-2" /> Lägg till media
                </PrimaryButton>
                <SecondaryButton onClick={() => setIsMediaPickerOpen(true)} disabled={!!aiLoading}>
                    Välj från galleri
                </SecondaryButton>
            </div>
            <input type="file" ref={fileInputRef} onChange={e => e.target.files && handleAddFile(e.target.files[0])} className="hidden" accept="image/*,video/mp4,video/quicktime"/>

            <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800/50 space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-purple-800 dark:text-purple-300"><SparklesIcon className="w-5 h-5"/> Skapa bild med AI</label>
                <StructuredAiPromptBuilder 
                    prompt={structuredPrompt}
                    onPromptChange={setStructuredPrompt}
                    disabled={!!aiLoading}
                />
                <PrimaryButton onClick={handleGenerateImage} loading={aiLoading === 'generate-collage-image'} disabled={!structuredPrompt.subject?.trim()} className="bg-purple-600 hover:bg-purple-500">
                    Generera & Lägg till
                </PrimaryButton>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(post.collageItems || []).map((item, index) => (
                    <div key={item.id} className="relative group aspect-square bg-slate-200 dark:bg-slate-700 rounded-lg">
                        {item.imageUrl && <img src={item.imageUrl} className="w-full h-full object-cover rounded-lg" alt="" />}
                        {item.videoUrl && <video src={item.videoUrl} className="w-full h-full object-cover rounded-lg" autoPlay muted loop playsInline />}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-1 gap-1 rounded-lg">
                            <div className="flex gap-1">
                                {item.type === 'image' && (
                                    <button onClick={() => { setEditingCollageItem(item); setIsAiEditorOpen(true); }} className="p-2 bg-purple-600/80 hover:bg-purple-500 text-white rounded-full" title="Redigera med AI">
                                        <SparklesIcon className="h-4 w-4" />
                                    </button>
                                )}
                                <button onClick={() => handleSaveItemToGallery(item)} disabled={isSavingToGalleryId === item.id} className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-full" title="Spara till galleri">
                                    {isSavingToGalleryId === item.id ? <LoadingSpinnerIcon className="h-4 w-4" /> : <DownloadIcon className="h-4 w-4" />}
                                </button>
                                <button onClick={() => handleMoveItem(index, 'up')} disabled={index === 0} className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-full disabled:opacity-30" title="Flytta bakåt"><ArrowUturnLeftIcon className="h-4 w-4 rotate-90" /></button>
                                <button onClick={() => handleMoveItem(index, 'down')} disabled={index === (post.collageItems || []).length - 1} className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-full disabled:opacity-30" title="Flytta framåt"><ArrowUturnRightIcon className="h-4 w-4 -rotate-90" /></button>
                            </div>
                            <button onClick={() => handleRemoveItem(item.id)} className="p-2 bg-red-600/80 hover:bg-red-500 text-white rounded-full" title="Ta bort"><TrashIcon className="h-4 w-4" /></button>
                        </div>
                    </div>
                ))}
            </div>

             <MediaPickerModal
                isOpen={isMediaPickerOpen}
                onClose={() => setIsMediaPickerOpen(false)}
                mediaLibrary={organization.mediaLibrary || []}
                onSelect={handleSelectFromGallery}
                filter={undefined} 
            />
            <AiImageEditorModal
                isOpen={isAiEditorOpen}
                onClose={() => setEditingCollageItem(null)}
                onGenerate={handleEditCollageItem}
                isLoading={aiLoading === 'edit-collage-image'}
            />
        </div>
    );
};

// Main component
export const Step2_Media: React.FC<{
    post: DisplayPost;
    onPostChange: (updatedPost: DisplayPost) => void;
    organization: Organization;
    screen: DisplayScreen;
    onUpdateOrganization: (orgId: string, data: Partial<Organization>) => Promise<void>;
}> = ({ post, onPostChange, organization, screen, onUpdateOrganization }) => {
    const [aiLoading, setAiLoading] = useState<string | false>(false);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const { showToast } = useToast();

    const handleFileChange = async (file: File) => {
        setUploadProgress(0); 
        try {
            const reader = new FileReader();
            reader.onprogress = (event) => {
                if (event.lengthComputable) {
                    const progress = (event.loaded / event.total) * 100;
                    setUploadProgress(progress);
                }
            };
            reader.onload = (e) => {
                const isVideo = file.type.startsWith('video/');
                const updatedPost = {
                    ...post,
                    imageUrl: isVideo ? undefined : e.target?.result as string,
                    videoUrl: isVideo ? e.target?.result as string : undefined,
                };
                onPostChange(updatedPost);
                setUploadProgress(null); 
            };
            reader.readAsDataURL(file);
        } catch (error) {
            showToast({ message: `Kunde inte ladda upp fil: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
            setUploadProgress(null);
        }
    };
    
    if (['text-only', 'webpage', 'instagram-latest', 'instagram-stories'].includes(post.layout)) {
        return <NoMediaNeeded />;
    }
    
    if (post.layout === 'collage') {
        return (
            <CollageMediaEditor
                post={post}
                onPostChange={onPostChange}
                organization={organization}
                screen={screen}
                onUpdateOrganization={onUpdateOrganization}
            />
        );
    }
    
    if (['image-fullscreen', 'video-fullscreen', 'image-left', 'image-right'].includes(post.layout)) {
        return (
            <SingleMediaEditor 
                post={post}
                onPostChange={onPostChange}
                handleFileChange={handleFileChange}
                aiLoading={aiLoading}
                setAiLoading={setAiLoading}
                uploadProgress={uploadProgress}
                organization={organization}
                screen={screen}
                onUpdateOrganization={onUpdateOrganization}
            />
        );
    }

    return null;
};