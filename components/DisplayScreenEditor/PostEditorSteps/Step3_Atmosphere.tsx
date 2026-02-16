
import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { DisplayPost, Organization, DisplayScreen, MediaItem, CollageItem, AiImageVariant, StructuredImagePrompt, SubImage } from '../../../types';
import { PrimaryButton, SecondaryButton } from '../../Buttons';
import { SparklesIcon, TrashIcon, PhotoIcon, VideoCameraIcon, MicrophoneIcon, PencilIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, LoadingSpinnerIcon, DownloadIcon, StarIcon, MoveIcon, ToggleSwitch, MagnifyingGlassIcon } from '../../icons';
import { useToast } from '../../../context/ToastContext';
import { uploadPostAsset, uploadMediaForGallery, addMediaItemsToLibrary } from '../../../services/firebaseService';
import { generateDisplayPostImage, generateVideoFromPrompt, urlToBase64, editDisplayPostImage, fileToBase64 } from '../../../services/geminiService';
import { useAuth } from '../../../context/AuthContext';
import { MediaPickerModal, AiStudioModifierGroup, AiImageEditorModal } from '../Modals';
import { useSpeechRecognition } from '../../../hooks/useSpeechRecognition';
import { ThinkingDots } from '../../HelpBot';
import { StyledInput, StyledSelect } from '../../Forms';
import { ColorPaletteInput, ColorOpacityControl } from '../../SharedComponents';

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

// --- SubImage Manager (Bildkarusell) ---
const SubImageManager: React.FC<{
    post: DisplayPost;
    onPostChange: (updatedPost: DisplayPost) => void;
}> = ({ post, onPostChange }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useToast();

    const handleAddSubImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newImages: SubImage[] = [];
            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i];
                try {
                    const { data, mimeType } = await fileToBase64(file);
                    newImages.push({
                        id: `sub-${Date.now()}-${i}`,
                        imageUrl: `data:${mimeType};base64,${data}`
                    });
                } catch (error) {
                    showToast({ message: "Kunde inte läsa en av bilderna.", type: 'error' });
                }
            }
            onPostChange({ ...post, subImages: [...(post.subImages || []), ...newImages] });
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleRemoveSubImage = (id: string) => {
        onPostChange({ ...post, subImages: (post.subImages || []).filter(img => img.id !== id) });
    };

    const handleConfigChange = (field: keyof typeof post.subImageConfig, value: any) => {
        onPostChange({
            ...post,
            subImageConfig: {
                animation: 'scroll',
                position: 'bottom-center',
                size: 'md',
                intervalSeconds: 30,
                ...(post.subImageConfig),
                [field]: value
            }
        });
    };

    const hasSubImages = (post.subImages || []).length > 0;

    return (
        <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 mt-4">
            <div className="flex justify-between items-center mb-4">
                <h5 className="font-semibold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <PhotoIcon className="w-4 h-4" /> Bildkarusell (Tillval)
                </h5>
                <PrimaryButton onClick={() => fileInputRef.current?.click()} className="py-1 px-3 text-xs">
                    + Lägg till bilder
                </PrimaryButton>
                <input 
                    type="file" 
                    multiple 
                    accept="image/*" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleAddSubImages} 
                />
            </div>

            {hasSubImages ? (
                <div className="space-y-4">
                    {/* Thumbnail list */}
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {post.subImages?.map((img) => (
                            <div key={img.id} className="relative flex-shrink-0 w-20 h-20 group">
                                <img src={img.imageUrl} className="w-full h-full object-cover rounded-md border border-slate-300 dark:border-slate-600" alt="Sub" />
                                <button 
                                    onClick={() => handleRemoveSubImage(img.id)}
                                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                >
                                    <TrashIcon className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Controls */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-600">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Position</label>
                            <StyledSelect 
                                value={post.subImageConfig?.position || 'bottom-center'} 
                                onChange={(e) => handleConfigChange('position', e.target.value)}
                                className="!text-sm !py-1"
                            >
                                <option value="top-center">Längst upp</option>
                                <option value="middle-center">I mitten</option>
                                <option value="bottom-center">Längst ner</option>
                            </StyledSelect>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Storlek</label>
                            <StyledSelect 
                                value={post.subImageConfig?.size || 'md'} 
                                onChange={(e) => handleConfigChange('size', e.target.value)}
                                className="!text-sm !py-1"
                            >
                                <option value="sm">Liten</option>
                                <option value="md">Mellan</option>
                                <option value="lg">Stor</option>
                                <option value="xl">Extra Stor</option>
                            </StyledSelect>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                Hastighet (Sekunder för att rulla förbi)
                            </label>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">Snabb</span>
                                <input 
                                    type="range" 
                                    min="10" 
                                    max="60" 
                                    step="5" 
                                    value={post.subImageConfig?.intervalSeconds || 30} 
                                    onChange={(e) => handleConfigChange('intervalSeconds', parseInt(e.target.value))}
                                    className="flex-grow h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="text-xs text-slate-400">Långsam</span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                    Ladda upp bilder för att skapa en rullande karusell, t.ex. för att visa interiörbilder, detaljer eller sponsorer.
                </p>
            )}
        </div>
    );
};

// --- Helper: Get Slot Count ---
const getCollageSlotCount = (layout?: string): number => {
    switch (layout) {
        case 'landscape-1-2':
        case 'landscape-3-horiz':
        case 'portrait-1-2':
        case 'portrait-3-vert':
            return 3;
        case 'landscape-4-grid':
        case 'portrait-4-grid':
            return 4;
        case 'landscape-2-horiz':
        case 'landscape-2-vert':
        case 'portrait-2-horiz':
        case 'portrait-2-vert':
            return 2;
        default:
            return 2; // Default fallback
    }
};

// --- Structured AI Prompt Builder ---
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
                
                <details className="group">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-500 hover:text-primary transition-colors select-none mb-2">
                        Fler alternativ (Perspektiv, Komposition, Story)
                    </summary>
                    <div className="space-y-3 pl-2 border-l-2 border-slate-200 dark:border-slate-700 mt-2">
                        <AiStudioModifierGroup label="Perspektiv" options={perspectiveOptions} selectedValue={prompt.perspective || ''} onSelect={(v) => handleSelect('perspective', v)} />
                        <AiStudioModifierGroup label="Komposition" options={compositionOptions} selectedValue={prompt.composition || ''} onSelect={(v) => handleSelect('composition', v)} />
                        <AiStudioModifierGroup label="Story / Scenario" options={storyOptions} selectedValue={prompt.story || ''} onSelect={(v) => handleSelect('story', v)} />
                    </div>
                </details>
            </div>
        </div>
    );
};

// --- Modal for Creating AI Images in Collage ---
const CollageAiCreationModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (prompt: Partial<StructuredImagePrompt>) => void;
    isLoading: boolean;
    browserSupportsSpeechRecognition: boolean;
    isListening: boolean;
    onMicClick: () => void;
    transcript: string;
}> = ({ isOpen, onClose, onGenerate, isLoading, browserSupportsSpeechRecognition, isListening, onMicClick, transcript }) => {
    const [prompt, setPrompt] = useState<Partial<StructuredImagePrompt>>({ subject: '' });

    useEffect(() => {
        if (transcript) {
            setPrompt(p => ({ ...p, subject: transcript }));
        }
    }, [transcript]);

    if (!isOpen) return null;

    const portalRoot = document.getElementById('modal-root') || document.body;
    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[52] p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <SparklesIcon className="text-purple-500 h-6 w-6" />
                    Skapa bild för collage-ruta
                </h2>
                <StructuredAiPromptBuilder
                    prompt={prompt}
                    onPromptChange={setPrompt}
                    disabled={isLoading}
                    showSpeechButton={browserSupportsSpeechRecognition}
                    isListening={isListening}
                    onSpeechClick={onMicClick}
                />
                <div className="flex justify-end gap-4 mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
                    <SecondaryButton onClick={onClose} disabled={isLoading}>Avbryt</SecondaryButton>
                    <PrimaryButton onClick={() => onGenerate(prompt)} loading={isLoading} disabled={!prompt.subject?.trim()}>
                        Generera & Lägg till
                    </PrimaryButton>
                </div>
            </div>
        </div>,
        portalRoot
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
    const [cooldown, setCooldown] = useState(0);
    const [videoProgressText, setVideoProgressText] = useState("");
    const [useImageForVideo, setUseImageForVideo] = useState(false);
    const [isImageAliveEnabled, setIsImageAliveEnabled] = useState(false);
    
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    const { isListening, transcript, error: speechError, startListening, stopListening, browserSupportsSpeechRecognition } = useSpeechRecognition();

    useEffect(() => {
        if (transcript) {
          const newPrompt = { ...(post.structuredImagePrompt || {}), subject: transcript };
          handleStructuredPromptChange(newPrompt);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transcript]);

    // Handle cooldown
    useEffect(() => {
        let timer: any;
        if (cooldown > 0) {
            timer = setInterval(() => setCooldown(prev => prev - 1), 1000);
        }
        return () => clearInterval(timer);
    }, [cooldown]);

    // Reset video toggles if media changes
    useEffect(() => {
        if (!post.imageUrl && !post.videoUrl) {
            setUseImageForVideo(false);
            setIsImageAliveEnabled(false);
        }
    }, [post.imageUrl, post.videoUrl]);

    const startCooldown = () => setCooldown(10);

    const handleStructuredPromptChange = (newPrompt: Partial<StructuredImagePrompt>) => {
        const fullPrompt = [newPrompt.subject, newPrompt.style, newPrompt.colorTone, newPrompt.perspective, newPrompt.composition, newPrompt.story].filter(Boolean).join(', ');
        onPostChange({
            ...post,
            aiImagePrompt: fullPrompt,
            structuredImagePrompt: { ...(post.structuredImagePrompt || {}), ...newPrompt, subject: newPrompt.subject || '' },
        });
    };
    
    const handleGenerateImage = async () => {
        const promptToGenerate = post.aiImagePrompt;
        if (!promptToGenerate || !promptToGenerate.trim()) return;
        setAiLoading('generate-image');
        try {
            // Spara nuvarande bild till historiken innan vi genererar en ny
            const currentVariants = [...(post.aiImageVariants || [])];
            if (post.imageUrl) {
                currentVariants.push({
                    id: `history-${Date.now()}`,
                    url: post.imageUrl,
                    prompt: post.aiImagePrompt || '',
                    createdAt: new Date().toISOString(),
                    createdByUid: currentUser?.uid || ''
                });
            }

            const { imageBytes, mimeType } = await generateDisplayPostImage(promptToGenerate, screen.aspectRatio);
            const dataUri = `data:${mimeType};base64,${imageBytes}`;
            
            onPostChange({ 
                ...post, 
                imageUrl: dataUri, 
                videoUrl: undefined, 
                isAiGeneratedImage: true,
                aiImageVariants: currentVariants
            });
            showToast({ message: 'AI-bild genererad!', type: 'success' });
            startCooldown();
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Kunde inte generera bild.', type: 'error' });
            startCooldown();
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
        const shouldAnimateImage = (useImageForVideo || isImageAliveEnabled) && post.imageUrl;

        if (shouldAnimateImage) {
             try {
                 setAiLoading('preparing-image');
                 const { mimeType, data } = await urlToBase64(post.imageUrl!);
                 imagePayload = { mimeType, data };
             } catch (e) {
                 console.error("Failed to process start image for video", e);
                 showToast({ message: "Kunde inte använda bilden för animering.", type: 'error' });
                 setAiLoading(false);
                 return;
             }
        }

        // --- Save state for undo BEFORE generation ---
        const currentVariants = [...(post.aiImageVariants || [])];
        if (post.imageUrl) {
            currentVariants.push({
                id: `history-${Date.now()}`,
                url: post.imageUrl,
                prompt: post.aiImagePrompt || '',
                createdAt: new Date().toISOString(),
                createdByUid: currentUser.uid
            });
        }

        let finalPrompt = post.aiVideoPrompt || '';
        if (isImageAliveEnabled || useImageForVideo) {
            const technicalConstraint = "CRITICAL: The first frame MUST be identical to the source image. ABSOLUTELY NO FADE-IN FROM BLACK. START INSTANTLY.";
            const motionInstruction = isImageAliveEnabled 
                ? "Apply a continuous, very slow cinematic zoom-in. Add high-quality looping ambient motion."
                : "Apply a smooth, slow cinematic zoom-in motion.";
            
            finalPrompt = finalPrompt 
                ? `${finalPrompt}. ${technicalConstraint} ${motionInstruction}` 
                : `${technicalConstraint} ${motionInstruction}`;
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
                imageUrl: undefined,
                aiImageVariants: currentVariants
            });
            startCooldown();
        } catch (error) {
            console.error("Video generation failed:", error);
            showToast({ message: error instanceof Error ? error.message : 'Kunde inte starta videogenerering.', type: 'error' });
            startCooldown();
        } finally {
            setAiLoading(false);
            setVideoProgressText("");
        }
    };

    const handleSelectFromGallery = (item: MediaItem) => {
        const newLayout = (item.type === 'video' && post.layout === 'image-fullscreen') ? 'video-fullscreen' : (item.type === 'image' && post.layout === 'video-fullscreen') ? 'image-fullscreen' : post.layout;
        onPostChange({ ...post, layout: newLayout, imageUrl: item.type === 'image' ? item.url : undefined, videoUrl: item.type === 'video' ? item.url : undefined, isAiGeneratedImage: item.createdBy === 'ai' });
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
                aiImagePrompt: editPrompt,
                isAiGeneratedImage: true,
                aiImageVariants: newVariants
            });
    
            showToast({ message: 'Ny bildvariant skapad!', type: 'success' });
            startCooldown();
        } catch (error) {
            console.error("AI Edit failed:", error);
            showToast({ message: error instanceof Error ? error.message : 'Kunde inte redigera bilden.', type: 'error' });
            startCooldown();
        } finally {
            setAiLoading(false);
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

    const handleUndoMedia = () => {
        if (!post.aiImageVariants || post.aiImageVariants.length === 0) return;
        const variants = [...post.aiImageVariants];
        const lastVariant = variants.pop()!;
        onPostChange({
            ...post,
            imageUrl: lastVariant.url,
            videoUrl: undefined,
            isAiGeneratedVideo: false,
            aiImagePrompt: lastVariant.prompt,
            aiImageVariants: variants,
            isAiGeneratedImage: true
        });
        showToast({ message: 'Återställde till föregående vy.', type: 'info' });
    };

    const handleMicClick = () => {
        if (!browserSupportsSpeechRecognition) return;
        isListening ? stopListening() : startListening();
    };
    
    const isVideoGenerating = aiLoading === 'generate-video' || aiLoading === 'preparing-image';
    const isImageGenerating = aiLoading === 'generate-image' || aiLoading === 'edit-image';

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <h4 className="font-bold text-slate-800 dark:text-slate-200">Media</h4>
                <div className="flex flex-wrap gap-2">
                    <PrimaryButton onClick={() => document.getElementById('file-upload-step2')?.click()} disabled={!!aiLoading}>
                        <PhotoIcon className="w-5 h-5 mr-2" /> Ladda upp
                    </PrimaryButton>
                    <SecondaryButton onClick={() => setIsMediaPickerOpen(true)} disabled={!!aiLoading}>
                        Välj från galleri
                    </SecondaryButton>
                </div>
                <input id="file-upload-step2" type="file" onChange={e => e.target.files && handleFileChange(e.target.files[0])} className="hidden" accept="image/*,video/mp4,video/quicktime"/>
                
                {/* AI Image Generation */}
                <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800/50 space-y-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-purple-800 dark:text-purple-300">
                        <span className="text-lg">✨</span> Skapa bild med AI
                    </label>
                    <StructuredAiPromptBuilder 
                        prompt={post.structuredImagePrompt || { subject: post.aiImagePrompt || '' }}
                        onPromptChange={handleStructuredPromptChange}
                        disabled={!!aiLoading || cooldown > 0}
                        showSpeechButton={browserSupportsSpeechRecognition}
                        isListening={isListening}
                        onSpeechClick={handleMicClick}
                    />
                    <PrimaryButton onClick={handleGenerateImage} loading={aiLoading === 'generate-image'} disabled={!post.aiImagePrompt?.trim() || !!aiLoading || cooldown > 0} className="bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-500/20">
                        {cooldown > 0 ? `Väntar... (${cooldown}s)` : "Generera bild"}
                    </PrimaryButton>
                </div>

                {/* AI Video Generation */}
                <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800/50 space-y-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-indigo-800 dark:text-indigo-300">
                        <VideoCameraIcon className="w-5 h-5"/> Skapa video med AI
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
                                            disabled={!!aiLoading || cooldown > 0}
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
                                            disabled={!!aiLoading || cooldown > 0}
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
                                disabled={!!aiLoading || cooldown > 0}
                            />
                            <PrimaryButton 
                                onClick={handleGenerateVideo} 
                                loading={aiLoading === 'generate-video'} 
                                disabled={(!post.aiVideoPrompt?.trim() && !isImageAliveEnabled) || !!aiLoading || cooldown > 0} 
                                className="bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20"
                            >
                                {cooldown > 0 ? `Väntar... (${cooldown}s)` : (isImageAliveEnabled ? "Skapa magisk rörelse" : (useImageForVideo ? "Animera bild" : "Generera video"))}
                            </PrimaryButton>
                        </>
                    )}
                </div>

                {isImageGenerating && (
                    <div className="flex items-center gap-3 p-4 bg-purple-600 dark:bg-purple-700 rounded-lg text-white border border-purple-500 shadow-xl animate-pulse">
                        <span className="text-xl animate-spin">✨</span>
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
                            {post.imageUrl && <img src={post.imageUrl} className="w-full rounded-md shadow-md" alt="Media" />}
                            {post.videoUrl && <video src={post.videoUrl} className="w-full rounded-md shadow-md" autoPlay muted loop playsInline />}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 rounded-md">
                                <button onClick={() => onPostChange({ ...post, imageUrl: undefined, videoUrl: undefined })} disabled={!!aiLoading} className="bg-red-600 hover:bg-red-500 text-white font-bold py-1 px-3 rounded-full shadow-lg text-sm">Ta bort</button>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                            {post.imageUrl && (
                                <button type="button" onClick={() => setIsAiEditorOpen(true)} className="flex items-center gap-1 text-sm font-semibold text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-50" disabled={!!aiLoading || cooldown > 0}>
                                    <PencilIcon className="h-4 w-4"/> Redigera bild med AI
                                </button>
                            )}
                            {post.aiImageVariants && post.aiImageVariants.length > 0 && (
                                <button type="button" onClick={handleUndoMedia} className="flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:underline disabled:opacity-50" disabled={!!aiLoading}>
                                    <ArrowUturnLeftIcon className="h-4 w-4"/> Backa ett steg
                                </button>
                            )}
                            <button type="button" onClick={handleSaveToGallery} disabled={!!aiLoading || isSavingToGallery} className="flex items-center gap-1 text-sm font-bold text-teal-600 dark:text-teal-400 hover:underline disabled:opacity-50">
                                {isSavingToGallery ? <LoadingSpinnerIcon className="w-4 h-4" /> : <StarIcon className="w-4 h-4" />}
                                Spara i galleriet
                            </button>
                        </div>

                        {/* Image Controls Container */}
                        <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 space-y-4">
                            
                            {/* Position & Zoom Controls */}
                            <div>
                                <h5 className="font-semibold text-sm mb-3 text-slate-700 dark:text-slate-300">Justera bildposition & Zoom</h5>
                                <div className="space-y-4">
                                    {/* ZOOM SLIDER */}
                                    <div>
                                        <div className="flex justify-between mb-1 text-xs text-slate-500 dark:text-slate-400">
                                            <span>Zoom</span>
                                            <span className="font-mono text-[10px]">{post.mediaZoom?.toFixed(1) || '1.0'}x</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="1" max="3" step="0.1"
                                            value={post.mediaZoom ?? 1} 
                                            onChange={(e) => onPostChange({ ...post, mediaZoom: parseFloat(e.target.value) })}
                                            className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                    </div>

                                    <div>
                                        <div className="flex justify-between mb-1 text-xs text-slate-500 dark:text-slate-400">
                                            <span>Vänster</span>
                                            <span className="font-mono text-[10px]">{post.mediaPositionX ?? 50}%</span>
                                            <span>Höger</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" max="100" 
                                            value={post.mediaPositionX ?? 50} 
                                            onChange={(e) => onPostChange({ ...post, mediaPositionX: parseInt(e.target.value, 10) })}
                                            className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                    </div>
                                    <div>
                                        <div className="flex justify-between mb-1 text-xs text-slate-500 dark:text-slate-400">
                                            <span>Upp</span>
                                            <span className="font-mono text-[10px]">{post.mediaPositionY ?? 50}%</span>
                                            <span>Ner</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" max="100" 
                                            value={post.mediaPositionY ?? 50} 
                                            onChange={(e) => onPostChange({ ...post, mediaPositionY: parseInt(e.target.value, 10) })}
                                            className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Image Overlay / Opacity Controls */}
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                                <h5 className="font-semibold text-sm mb-3 text-slate-700 dark:text-slate-300">Bildtoning (Gör texten mer läsbar)</h5>
                                <ToggleSwitch label="Aktivera mörk toning" checked={post.imageOverlayEnabled ?? false} onChange={c => onPostChange({ ...post, imageOverlayEnabled: c })} />
                                {post.imageOverlayEnabled && (
                                    <ColorOpacityControl
                                        value={post.imageOverlayColor || 'rgba(0, 0, 0, 0.5)'}
                                        onChange={(c) => onPostChange({ ...post, imageOverlayColor: c })}
                                        organization={organization}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}
                
                {/* SubImage Manager (Bildkarusell) */}
                <SubImageManager post={post} onPostChange={onPostChange} />
            </div>

            <MediaPickerModal isOpen={isMediaPickerOpen} onClose={() => setIsMediaPickerOpen(false)} mediaLibrary={organization.mediaLibrary || []} onSelect={handleSelectFromGallery} postAiVariants={post.aiImageVariants} />
            <AiImageEditorModal isOpen={isAiEditorOpen} onClose={() => setIsAiEditorOpen(false)} onGenerate={handleEditImage} isLoading={aiLoading === 'edit-image'} />
        </div>
    );
};

// Collage Media Editor Component
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
    const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
    const [isAiCreationOpen, setIsAiCreationOpen] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    // Track which slot is currently being positioned
    const [positioningSlotId, setPositioningSlotId] = useState<string | null>(null);

    const { isListening, transcript, error: speechError, startListening, stopListening, browserSupportsSpeechRecognition } = useSpeechRecognition();

    useEffect(() => {
        let timer: any;
        if (cooldown > 0) timer = setInterval(() => setCooldown(prev => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    const startCooldown = () => setCooldown(10);

    const slotCount = getCollageSlotCount(post.collageLayout);
    const items = post.collageItems || [];

    const handleUpdateSlot = (index: number, newItem: Omit<CollageItem, 'id'>) => {
        const updatedItems = [...items];
        // Only keep items up to slot count, though typically the renderer handles this.
        // We'll insert at the specific index, extending array if needed.
        if (index >= updatedItems.length) {
            // Fill gaps with placeholders if necessary
            for (let i = updatedItems.length; i < index; i++) {
               // We maintain the array. If index > length, we push new item.
            }
        }
        
        const itemWithId: CollageItem = { ...newItem, id: `item-${Date.now()}` };
        
        if (index < updatedItems.length) {
            updatedItems[index] = itemWithId;
        } else {
            updatedItems.push(itemWithId);
        }
        
        onPostChange({ ...post, layout: 'collage', collageItems: updatedItems });
    };

    const handleAddFile = async (file: File, index: number) => {
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const isVideo = file.type.startsWith('video/');
                handleUpdateSlot(index, {
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
        if (activeSlotIndex === null) return;
        handleUpdateSlot(activeSlotIndex, {
            type: item.type,
            imageUrl: item.type === 'image' ? item.url : undefined,
            videoUrl: item.type === 'video' ? item.url : undefined,
            isAiGeneratedImage: item.createdBy === 'ai',
        });
        setIsMediaPickerOpen(false);
        setActiveSlotIndex(null);
    };

    const handleGenerateImage = async (prompt: Partial<StructuredImagePrompt>) => {
        if (activeSlotIndex === null) return;
        const fullPrompt = [prompt.subject, prompt.style, prompt.colorTone, prompt.perspective, prompt.composition, prompt.story].filter(Boolean).join(', ');
        if (!fullPrompt.trim()) return;
        
        setIsAiCreationOpen(false);
        setAiLoading(`generate-collage-${activeSlotIndex}`);
        
        try {
            const { imageBytes, mimeType } = await generateDisplayPostImage(fullPrompt.trim(), screen.aspectRatio);
            const dataUri = `data:${mimeType};base64,${imageBytes}`;
            handleUpdateSlot(activeSlotIndex, {
                type: 'image',
                imageUrl: dataUri,
                isAiGeneratedImage: true,
            });
            showToast({ message: 'AI-bild genererad!', type: 'success' });
            startCooldown();
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Kunde inte generera bild.', type: 'error' });
            startCooldown();
        } finally {
            setAiLoading(false);
            setActiveSlotIndex(null);
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
    
            const updatedCollageItems = (post.collageItems || []).map(item =>
                item.id === editingCollageItem.id
                    ? { ...item, imageUrl: newDataUri, isAiGeneratedImage: true }
                    : item
            );
            onPostChange({ ...post, layout: 'collage', collageItems: updatedCollageItems });
            showToast({ message: 'Collagebild uppdaterad med AI!', type: 'success' });
            startCooldown();
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Kunde inte redigera bilden.', type: 'error' });
            startCooldown();
        } finally {
            setAiLoading(false);
            setEditingCollageItem(null);
        }
    };

    const handleRemoveItem = (index: number) => {
        const updatedItems = [...items];
        updatedItems.splice(index, 1);
        onPostChange({ ...post, layout: 'collage', collageItems: updatedItems });
    };

    const handleSaveItemToGallery = async (item: CollageItem) => {
        const mediaUrl = item.imageUrl || item.videoUrl;
        if (!mediaUrl) return;
        setIsSavingToGalleryId(item.id);
        try {
            let finalUrl = mediaUrl;
            let type: 'image' | 'video' = item.type;
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

    const handleMicClick = () => {
        if (!browserSupportsSpeechRecognition) return;
        isListening ? stopListening() : startListening();
    };

    const handlePositionChange = (itemId: string, x: number, y: number) => {
        const updatedItems = (post.collageItems || []).map(item => 
            item.id === itemId 
                ? { ...item, mediaPositionX: x, mediaPositionY: y } 
                : item
        );
        onPostChange({ ...post, layout: 'collage', collageItems: updatedItems });
    };

    return (
        <div className="space-y-6">
            <h4 className="font-bold text-slate-800 dark:text-slate-200">Collage-innehåll</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: slotCount }).map((_, index) => {
                    const item = items[index];
                    const isLoading = aiLoading === `generate-collage-${index}`;
                    const isPositioning = item && positioningSlotId === item.id;
                    
                    return (
                        <div key={index} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden relative group">
                            <div className="bg-slate-100 dark:bg-slate-700/50 px-3 py-2 text-xs font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-600 flex justify-between items-center">
                                <span>Ruta {index + 1}</span>
                                {item && (
                                    <button 
                                        onClick={() => setPositioningSlotId(isPositioning ? null : item.id)}
                                        className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 ${isPositioning ? 'text-primary' : 'text-slate-400'}`}
                                        title="Justera bildposition"
                                    >
                                        <MoveIcon className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                            
                            <div className="aspect-square relative">
                                {isLoading ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800">
                                        <LoadingSpinnerIcon className="w-8 h-8 text-primary mb-2" />
                                        <span className="text-xs text-slate-500">Skapar magi...</span>
                                    </div>
                                ) : item ? (
                                    <>
                                        {item.imageUrl && (
                                            <img 
                                                src={item.imageUrl} 
                                                className="w-full h-full object-cover" 
                                                style={{ objectPosition: `${item.mediaPositionX ?? 50}% ${item.mediaPositionY ?? 50}%` }}
                                                alt="" 
                                            />
                                        )}
                                        {item.videoUrl && (
                                            <video 
                                                src={item.videoUrl} 
                                                className="w-full h-full object-cover" 
                                                style={{ objectPosition: `${item.mediaPositionX ?? 50}% ${item.mediaPositionY ?? 50}%` }}
                                                autoPlay muted loop playsInline 
                                            />
                                        )}
                                        
                                        {!isPositioning && (
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 gap-2">
                                                <div className="flex gap-2">
                                                    {item.type === 'image' && (
                                                        <button onClick={() => { setEditingCollageItem(item); setIsAiEditorOpen(true); }} className="p-2 bg-purple-600/80 hover:bg-purple-500 text-white rounded-full" title="Redigera med AI" disabled={!!aiLoading || cooldown > 0}>
                                                            <SparklesIcon className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                    <button onClick={() => handleSaveItemToGallery(item)} disabled={isSavingToGalleryId === item.id} className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-full" title="Spara till galleri">
                                                        {isSavingToGalleryId === item.id ? <LoadingSpinnerIcon className="h-4 w-4" /> : <DownloadIcon className="h-4 w-4" />}
                                                    </button>
                                                </div>
                                                <button onClick={() => handleRemoveItem(index)} className="px-3 py-1 bg-red-600/80 hover:bg-red-500 text-white rounded-full text-xs font-bold">
                                                    Ta bort
                                                </button>
                                            </div>
                                        )}

                                        {isPositioning && (
                                            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-4 gap-4 z-10 animate-fade-in">
                                                <div className="w-full">
                                                    <div className="flex justify-between mb-1 text-[10px] text-slate-300">
                                                        <span>Vänster</span><span>Höger</span>
                                                    </div>
                                                    <input 
                                                        type="range" min="0" max="100" 
                                                        value={item.mediaPositionX ?? 50} 
                                                        onChange={(e) => handlePositionChange(item.id, parseInt(e.target.value, 10), item.mediaPositionY ?? 50)}
                                                        className="w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-primary"
                                                    />
                                                </div>
                                                <div className="w-full">
                                                    <div className="flex justify-between mb-1 text-[10px] text-slate-300">
                                                        <span>Upp</span><span>Ner</span>
                                                    </div>
                                                    <input 
                                                        type="range" min="0" max="100" 
                                                        value={item.mediaPositionY ?? 50} 
                                                        onChange={(e) => handlePositionChange(item.id, item.mediaPositionX ?? 50, parseInt(e.target.value))}
                                                        className="w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-primary"
                                                    />
                                                </div>
                                                <button onClick={() => setPositioningSlotId(null)} className="px-3 py-1 bg-primary text-white text-xs rounded-full font-bold">Klar</button>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 bg-white dark:bg-slate-800/30">
                                        <button 
                                            onClick={() => { setActiveSlotIndex(index); setIsAiCreationOpen(true); }}
                                            disabled={!!aiLoading}
                                            className="w-full py-2 px-3 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-colors"
                                        >
                                            <SparklesIcon className="h-4 w-4" /> Skapa med AI
                                        </button>
                                        <button 
                                            onClick={() => { setActiveSlotIndex(index); document.getElementById(`file-upload-slot-${index}`)?.click(); }}
                                            disabled={!!aiLoading}
                                            className="w-full py-2 px-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-colors"
                                        >
                                            <PhotoIcon className="h-4 w-4" /> Ladda upp
                                        </button>
                                        <button 
                                            onClick={() => { setActiveSlotIndex(index); setIsMediaPickerOpen(true); }}
                                            disabled={!!aiLoading}
                                            className="w-full py-2 px-3 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            Välj från galleri
                                        </button>
                                        <input 
                                            id={`file-upload-slot-${index}`} 
                                            type="file" 
                                            onChange={e => e.target.files && handleAddFile(e.target.files[0], index)} 
                                            className="hidden" 
                                            accept="image/*,video/mp4,video/quicktime"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Collage Global Overlay Settings */}
            <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 mt-6 space-y-4">
                <div>
                    <h5 className="font-semibold text-sm mb-3 text-slate-700 dark:text-slate-300">Collage-toning (Gör text mer läsbar)</h5>
                    <ToggleSwitch label="Aktivera mörk toning över hela collaget" checked={post.imageOverlayEnabled ?? false} onChange={c => onPostChange({ ...post, imageOverlayEnabled: c })} />
                    {post.imageOverlayEnabled && (
                        <ColorOpacityControl
                            value={post.imageOverlayColor || 'rgba(0, 0, 0, 0.5)'}
                            onChange={(c) => onPostChange({ ...post, imageOverlayColor: c })}
                            organization={organization}
                        />
                    )}
                </div>
                
                {/* NEW: Background Color for Collage Gaps */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                    <ColorPaletteInput 
                        label="Bakgrundsfärg (Mellanrum)" 
                        value={post.backgroundColor || 'black'} 
                        onChange={(color) => onPostChange({ ...post, backgroundColor: color })} 
                        organization={organization} 
                    />
                </div>
            </div>

            <MediaPickerModal isOpen={isMediaPickerOpen} onClose={() => setIsMediaPickerOpen(false)} mediaLibrary={organization.mediaLibrary || []} onSelect={handleSelectFromGallery} filter={undefined} />
            <AiImageEditorModal isOpen={isAiEditorOpen} onClose={() => { setIsAiEditorOpen(false); setEditingCollageItem(null); }} onGenerate={handleEditCollageItem} isLoading={aiLoading === 'edit-collage-image'} />
            <CollageAiCreationModal 
                isOpen={isAiCreationOpen} 
                onClose={() => setIsAiCreationOpen(false)} 
                onGenerate={handleGenerateImage} 
                isLoading={!!aiLoading && aiLoading.startsWith('generate-collage')} 
                browserSupportsSpeechRecognition={browserSupportsSpeechRecognition}
                isListening={isListening}
                onMicClick={handleMicClick}
                transcript={transcript}
            />
        </div>
    );
};

export const Step3_Atmosphere: React.FC<{
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
            showToast({ message: 'Kunde inte ladda upp fil.', type: 'error' });
            setUploadProgress(null);
        }
    };
    
    // --- Layout: Text Only ---
    if (['text-only', 'webpage', 'instagram-latest'].includes(post.layout)) {
        return (
            <div className="space-y-4">
                <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
                    <ColorPaletteInput 
                        label="Skärmens bakgrundsfärg" 
                        value={post.backgroundColor || 'black'} 
                        onChange={(color) => onPostChange({ ...post, backgroundColor: color })} 
                        organization={organization} 
                    />
                </div>
            </div>
        );
    }

    // --- Layout: Collage ---
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
    
    // --- Layout: Single Media (Fullscreen, Split) ---
    const isSplitLayout = post.layout === 'image-left' || post.layout === 'image-right';

    return (
        <div className="space-y-6">
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

            {/* Background Color Picker for Split/Fullscreen Layouts */}
            <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
                <ColorPaletteInput 
                    label={isSplitLayout ? "Bakgrundsfärg (Textsida)" : "Bakgrundsfärg (om bild saknas/laddar)"}
                    value={post.backgroundColor || 'black'} 
                    onChange={(color) => onPostChange({ ...post, backgroundColor: color })} 
                    organization={organization} 
                />
            </div>
        </div>
    );
};
