import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { DisplayPost, Organization, DisplayScreen, MediaItem, CollageItem, AiImageVariant, StructuredImagePrompt } from '../../../types';
import { PrimaryButton, SecondaryButton } from '../../Buttons';
import { SparklesIcon, TrashIcon, PhotoIcon, VideoCameraIcon, MicrophoneIcon, PencilIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon } from '../../icons';
import { useToast } from '../../../context/ToastContext';
import { uploadPostAsset } from '../../../services/firebaseService';
import { generateDisplayPostImage, generateVideoFromPrompt, fileToBase64, urlToBase64, editDisplayPostImage } from '../../../services/geminiService';
import { useAuth } from '../../../context/AuthContext';
import { MediaPickerModal, AiStudioModifierGroup } from '../Modals';
import { useSpeechRecognition } from '../../../hooks/useSpeechRecognition';

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
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    
    // Structured Prompt State
    const [subject, setSubject] = useState('');
    const [style, setStyle] = useState('');
    const [mood, setMood] = useState('');
    const [lighting, setLighting] = useState('');

    const { isListening, transcript, error: speechError, startListening, stopListening, browserSupportsSpeechRecognition } = useSpeechRecognition();

    useEffect(() => {
        if (transcript) {
          setSubject(transcript);
        }
    }, [transcript]);

    useEffect(() => {
        if (speechError) {
          showToast({ message: `Röstigenkänning misslyckades: ${speechError}`, type: 'error' });
        }
    }, [speechError, showToast]);

    // Sync from post prop to local state when post changes
    useEffect(() => {
        const sp = post.structuredImagePrompt;
        setSubject(sp?.subject || post.aiImagePrompt || '');
        setStyle(sp?.style || '');
        setMood(sp?.mood || '');
        setLighting(sp?.lighting || '');
    }, [post.id]); // Only on post change

    // Sync from local state back to post prop
    useEffect(() => {
        const structuredPrompt: StructuredImagePrompt = { subject, style, mood, lighting };
        const fullPrompt = [subject, style, mood, lighting].filter(Boolean).join(', ');

        if (fullPrompt !== post.aiImagePrompt || JSON.stringify(structuredPrompt) !== JSON.stringify(post.structuredImagePrompt)) {
            onPostChange({
                ...post,
                aiImagePrompt: fullPrompt,
                // FIX: The variable is named `structuredPrompt`, not `structuredImagePrompt`.
                structuredImagePrompt: structuredPrompt,
            });
        }
    }, [subject, style, mood, lighting, post.aiImagePrompt, post.structuredImagePrompt, onPostChange]);
    
    const handleGenerateImage = async () => {
        const promptToGenerate = post.aiImagePrompt;
        if (!promptToGenerate || !promptToGenerate.trim()) return;

        const aspectRatio = screen.aspectRatio;

        setAiLoading('generate-image');
        try {
            const { imageBytes, mimeType } = await generateDisplayPostImage(promptToGenerate, aspectRatio);
            const dataUri = `data:${mimeType};base64,${imageBytes}`;
    
            const newMediaItem: MediaItem = {
                id: `media-ai-${Date.now()}`,
                type: 'image',
                url: dataUri,
                internalTitle: `AI: ${promptToGenerate.slice(0, 30)}...`,
                createdAt: new Date().toISOString(),
                createdBy: 'ai',
                aiPrompt: promptToGenerate,
            };
    
            const updatedLibrary = [...(organization.mediaLibrary || []), newMediaItem];
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
            
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

    const handleSelectFromGallery = (item: MediaItem) => {
        onPostChange({
            ...post,
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
            const { imageBytes: newImageBytes, mimeType: newMimeType } = await editDisplayPostImage(data, mimeType, editPrompt);
            const newDataUri = `data:${newMimeType};base64,${newImageBytes}`;

            const newVariant: AiImageVariant = {
                id: `variant-${Date.now()}`,
                url: newDataUri,
                prompt: editPrompt,
                createdAt: new Date().toISOString(),
                createdByUid: currentUser.uid,
            };
            
            const newMediaItem: MediaItem = {
                id: newVariant.id,
                type: 'image',
                url: newDataUri,
                internalTitle: `AI Variant: ${editPrompt.slice(0, 30)}...`,
                createdAt: newVariant.createdAt,
                createdBy: 'ai',
                aiPrompt: editPrompt,
            };
    
            const newVariants = [...(post.aiImageVariants || []), newVariant];
            onPostChange({ ...post, imageUrl: newDataUri, aiImageVariants: newVariants, aiImagePrompt: editPrompt });
            
            const updatedLibrary = [...(organization.mediaLibrary || []), newMediaItem];
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
    
            showToast({ message: 'Ny bildvariant skapad!', type: 'success' });
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Kunde inte redigera bilden.', type: 'error' });
        } finally {
            setAiLoading(false);
        }
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

    const styleOptions = [
        { label: 'Fotorealistisk', value: 'photorealistic' },
        { label: 'Tecknad', value: 'cartoon style' },
        { label: '3D Render', value: '3d render' },
        { label: 'Akvarell', value: 'watercolor' },
        { label: 'Minimalistisk', value: 'minimalist' },
    ];
    const moodOptions = [
        { label: 'Glad', value: 'happy mood' },
        { label: 'Dramatisk', value: 'dramatic mood' },
        { label: 'Lugn', value: 'serene mood' },
        { label: 'Energisk', value: 'energetic' },
        { label: 'Mystisk', value: 'mysterious mood' },
    ];
    const lightingOptions = [
        { label: 'Studioljus', value: 'studio lighting' },
        { label: 'Golden Hour', value: 'golden hour lighting' },
        { label: 'Neon', value: 'neon lighting' },
        { label: 'Mörkt', value: 'dark, cinematic lighting' },
        { label: 'Ljust & Luftigt', value: 'bright and airy' },
    ];
    
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
                    <textarea
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        placeholder="Beskriv motivet för bilden du vill skapa..."
                        rows={3}
                        className="w-full bg-white dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                        disabled={!!aiLoading}
                    />
                    <div className="space-y-3">
                        <AiStudioModifierGroup label="Stil" options={styleOptions} selectedValue={style} onSelect={(v) => setStyle(style === v ? '' : v)} />
                        <AiStudioModifierGroup label="Känsla" options={moodOptions} selectedValue={mood} onSelect={(v) => setMood(mood === v ? '' : v)} />
                        <AiStudioModifierGroup label="Ljus" options={lightingOptions} selectedValue={lighting} onSelect={(v) => setLighting(lighting === v ? '' : v)} />
                    </div>
                    <div className="flex gap-2 pt-2">
                        <PrimaryButton onClick={handleGenerateImage} loading={aiLoading === 'generate-image'} disabled={!subject.trim()} className="bg-purple-600 hover:bg-purple-500">
                            Generera bild
                        </PrimaryButton>
                        <button
                            type="button"
                            onClick={handleMicClick}
                            disabled={!!aiLoading}
                            className={`p-2.5 rounded-lg transition-colors ${
                                isListening
                                ? 'bg-red-500 text-white animate-pulse'
                                : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'
                            }`}
                            title="Använd röstinmatning"
                            >
                            <MicrophoneIcon className="h-6 w-6" />
                        </button>
                    </div>
                </div>

                {uploadProgress !== null && (
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mt-2">
                        <div className="bg-primary h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                )}

                {(post.imageUrl || post.videoUrl) && (
                    <div className="mt-4 space-y-4">
                        <div className="relative w-48 group">
                            {post.imageUrl && <img src={post.imageUrl} className="w-full rounded-md" />}
                            {post.videoUrl && <video src={post.videoUrl} className="w-full rounded-md" autoPlay muted loop playsInline />}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md">
                                <button onClick={() => onPostChange({ ...post, imageUrl: undefined, videoUrl: undefined })} disabled={!!aiLoading} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-full shadow-lg">
                                    Ta bort
                                </button>
                            </div>
                        </div>
                        {post.imageUrl && (
                             <button type="button" onClick={() => setIsAiEditorOpen(true)} className="flex items-center gap-1 text-sm font-semibold text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-50" disabled={!!aiLoading}>
                                <PencilIcon className="h-4 w-4"/> Redigera bild med AI
                            </button>
                        )}
                    </div>
                )}
            </div>
            
            <MediaPickerModal
                isOpen={isMediaPickerOpen}
                onClose={() => setIsMediaPickerOpen(false)}
                mediaLibrary={organization.mediaLibrary || []}
                onSelect={handleSelectFromGallery}
                filter={post.layout === 'video-fullscreen' ? 'video' : 'image'}
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
        setUploadProgress(0); // Show progress bar
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
                setUploadProgress(null); // Hide progress bar on completion
            };
            reader.readAsDataURL(file);
        } catch (error) {
            showToast({ message: `Kunde inte ladda upp fil: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
            setUploadProgress(null);
        }
    };
    
    // Check if the current layout needs media
    if (['text-only', 'webpage', 'instagram-latest', 'instagram-stories'].includes(post.layout)) {
        return <NoMediaNeeded />;
    }
    
    // For single media layouts
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
    
    // TODO: Add Collage editor here if needed
    if (post.layout === 'collage') {
        return <p>Collage editor not implemented yet.</p>;
    }

    return null;
};