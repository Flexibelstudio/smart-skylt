import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { PostTemplate, DisplayPost, Organization, DisplayScreen, CampaignIdea, MediaItem } from '../../types';
import { LightBulbIcon, SparklesIcon, FacebookIcon, VideoCameraIcon, InstagramIcon } from '../icons';
import { PrimaryButton, SecondaryButton } from '../Buttons';
import { EmptyState } from '../EmptyState';
import { StyledSelect } from '../Forms';
import { useToast } from '../../context/ToastContext';
import { generateDisplayPostCampaign, generateDisplayPostImage } from '../../services/geminiService';
import { ConfirmDialog } from '../ConfirmDialog';

const AiStudioModifierGroup: React.FC<{
  label: string;
  options: { label: string; value: string }[];
  selectedValue: string;
  onSelect: (value: string) => void;
}> = ({ label, options, selectedValue, onSelect }) => (
  <div>
    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{label}</label>
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(selectedValue === opt.value ? '' : opt.value)}
          className={`px-3 py-1.5 text-sm font-semibold rounded-full border-2 transition-all ${
            selectedValue === opt.value
              ? 'bg-primary border-primary text-white'
              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-primary/70'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);


export const CampaignIdeaModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    isLoading: boolean;
    ideas: CampaignIdea[] | null;
    error: string | null;
    eventName: string | undefined;
    followUpSuggestion?: { question: string; eventName: string; } | null;
    onFollowUp?: (eventName: string) => void;
    organization: Organization;
    onUpdateDisplayScreens: (organizationId: string, displayScreens: DisplayScreen[]) => Promise<void>;
    onEditGeneratedPost: (post: DisplayPost) => void;
}> = ({ isOpen, onClose, isLoading, ideas, error, eventName, followUpSuggestion, onFollowUp, organization, onUpdateDisplayScreens, onEditGeneratedPost }) => {
    
    const [step, setStep] = useState<'ideas' | 'configure' | 'generating'>('ideas');
    const [selectedIdea, setSelectedIdea] = useState<CampaignIdea | null>(null);
    const [selectedScreenId, setSelectedScreenId] = useState<string>('');
    const [generationStatus, setGenerationStatus] = useState('');
    const [generationError, setGenerationError] = useState<string | null>(null);
    const { showToast } = useToast();
    const isGeneratingRef = useRef(false);
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (isGeneratingRef.current) {
                return; // Prevent reset during generation/update cycle
            }
            // It's a fresh open, reset state.
            setStep('ideas');
            setSelectedIdea(null);
            setGenerationError(null);
            if (organization.displayScreens && organization.displayScreens.length > 0) {
                setSelectedScreenId(organization.displayScreens[0].id);
            } else {
                setSelectedScreenId('');
            }
        } else {
            // When modal closes, ensure the ref is reset for the next time.
            isGeneratingRef.current = false;
        }
    }, [isOpen, organization.displayScreens]);
    
    const handleSelectIdea = (idea: CampaignIdea) => {
        setSelectedIdea(idea);
        setStep('configure');
    };

    const handleBackToIdeas = () => {
        setSelectedIdea(null);
        setStep('ideas');
        setGenerationError(null);
    };

    const handleAttemptClose = () => {
        if (step === 'configure' || step === 'generating') {
            setIsConfirmCloseOpen(true);
        } else {
            onClose();
        }
    };

    const handleConfirmClose = () => {
        onClose();
        setIsConfirmCloseOpen(false);
    };
    
    const handleGenerateCampaign = async () => {
        if (!selectedIdea || !selectedScreenId) return;

        isGeneratingRef.current = true;
        setStep('generating');
        setGenerationStatus('Förbereder kampanj...');
        setGenerationError(null);
        try {
            const screen = organization.displayScreens?.find(s => s.id === selectedScreenId);
            if (!screen) throw new Error("Valt skyltfönster kunde inte hittas.");

            const prompt = `Skapa en kampanj baserad på följande idé: Rubrik: "${selectedIdea.headline}", Text: "${selectedIdea.text}". Visuell stil: ${selectedIdea.visual.style}, ${selectedIdea.visual.colorPalette}, ${selectedIdea.visual.mood}.`;
            const imageSettings = { style: selectedIdea.visual.style, colors: selectedIdea.visual.colorPalette, mood: selectedIdea.visual.mood, composition: selectedIdea.visual.composition, lighting: selectedIdea.visual.lighting };
            
            setGenerationStatus('AI:n skapar kampanjidé...');
            const postCount = 1;
            const generatedPosts = await generateDisplayPostCampaign(prompt, postCount, organization.name, undefined, imageSettings, organization.businessType, organization.businessDescription);
            const newPosts: DisplayPost[] = [];

            for (let i = 0; i < generatedPosts.length; i++) {
                const genPost = generatedPosts[i];
                setGenerationStatus(`Skapar inlägg ${i + 1}/${generatedPosts.length}: ${genPost.internalTitle}...`);
                let imageUrl: string | undefined;

                if (genPost.imagePrompt) {
                    setGenerationStatus(`Genererar bild för inlägg ${i + 1}...`);
                    imageUrl = await generateDisplayPostImage(genPost.imagePrompt, screen.aspectRatio);
                }

                const newPost: DisplayPost = {
                    id: `post-${Date.now()}-${i}`,
                    internalTitle: genPost.internalTitle, headline: genPost.headline, body: genPost.body,
                    layout: genPost.layout, durationSeconds: genPost.durationSeconds, imageUrl,
                    aiImagePrompt: genPost.imagePrompt,
                    isAiGeneratedImage: !!genPost.imagePrompt, backgroundColor: 'black', textColor: 'white',
                    imageOverlayEnabled: genPost.layout !== 'text-only' && !!imageUrl,
                    headlineFontFamily: organization.headlineFontFamily, bodyFontFamily: organization.bodyFontFamily,
                };
                newPosts.push(newPost);
            }
            
            const updatedScreen = { ...screen, posts: [...(screen.posts || []), ...newPosts] };
            const allScreens = (organization.displayScreens || []).map(s => s.id === selectedScreenId ? updatedScreen : s);
            
            await onUpdateDisplayScreens(organization.id, allScreens);

            showToast({ message: `${generatedPosts.length} nytt inlägg har skapats i "${screen.name}"!`, type: 'success' });

            if (newPosts.length > 0) {
                onEditGeneratedPost(newPosts[0]);
            }

            onClose();

        } catch (e) {
            setGenerationError(e instanceof Error ? e.message : "Kunde inte skapa kampanj.");
            setStep('configure');
            isGeneratingRef.current = false; // Reset on error
        } finally {
            setGenerationStatus('');
        }
    };


    if (!isOpen) return null;
    
    let portalRoot = document.getElementById('modal-root');
    if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = 'modal-root';
        document.body.appendChild(portalRoot);
    }
    
    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="text-center py-12">
                   <SparklesIcon className="h-10 w-10 text-primary animate-pulse mx-auto" />
                   <p className="mt-4 text-slate-300">Genererar kreativa idéer...</p>
               </div>
           );
        }
        if (error) {
             return (
                <div className="text-center py-12">
                    <p className="text-red-400">Ett fel inträffade:</p>
                    <p className="text-slate-300 mt-2">{error}</p>
                </div>
            );
        }

        switch (step) {
            case 'generating':
                return (
                    <div className="text-center py-12">
                        <SparklesIcon className="h-10 w-10 text-primary animate-pulse mx-auto" />
                        <p className="mt-4 text-slate-300">{generationStatus || 'AI:n arbetar...'}</p>
                    </div>
                );
            case 'configure':
                return (
                    <>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold">Konfigurera Kampanj</h2>
                            <SecondaryButton onClick={handleBackToIdeas}>Tillbaka till idéer</SecondaryButton>
                        </div>
                        <div className="bg-slate-700/50 p-4 rounded-lg border border-slate-600 mb-6">
                            <h3 className="font-bold text-primary">{selectedIdea?.headline}</h3>
                            <p className="text-slate-300 text-sm mt-1">{selectedIdea?.text}</p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Lägg till i skyltfönster (kanal)</label>
                                {organization.displayScreens && organization.displayScreens.length > 0 ? (
                                    <StyledSelect value={selectedScreenId} onChange={e => setSelectedScreenId(e.target.value)}>
                                        {organization.displayScreens.map(screen => <option key={screen.id} value={screen.id}>{screen.name}</option>)}
                                    </StyledSelect>
                                ) : (
                                    <p className="text-sm text-yellow-400 bg-yellow-900/50 p-3 rounded-lg">Du måste skapa ett skyltfönster (en kanal) först.</p>
                                )}
                            </div>
                        </div>
                        {generationError && <p className="text-red-400 mt-4">{generationError}</p>}
                    </>
                );
            case 'ideas':
            default:
                return (
                    <>
                        <h2 className="text-2xl font-bold mb-2">✨ AI-kampanjidéer för "{eventName}"</h2>
                        <div className="space-y-4 mt-6">
                            <p className="text-slate-300">Här är några förslag. Välj en idé för att låta AI:n bygga en kampanj.</p>
                            {ideas && ideas.map((idea, index) => (
                                <div key={index} className="bg-slate-700/50 p-4 rounded-lg border border-slate-600 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div className="flex-grow">
                                        <h3 className="font-bold text-primary">{idea.headline}</h3>
                                        <p className="text-slate-300 text-sm mt-1 mb-3">{idea.text}</p>
                                        <div className="text-xs text-slate-400 italic space-y-1">
                                            <p><strong>Visuell Idé:</strong> {idea.visual.imageIdea}</p>
                                            <p><strong>Stil:</strong> {idea.visual.style}, {idea.visual.mood}, {idea.visual.colorPalette}</p>
                                        </div>
                                    </div>
                                    <PrimaryButton onClick={() => handleSelectIdea(idea)} className="flex-shrink-0 self-start sm:self-center">
                                        Använd denna idé
                                    </PrimaryButton>
                                </div>
                            ))}
                            {followUpSuggestion && onFollowUp && (
                                <div className="mt-6 pt-4 border-t border-slate-600 text-center">
                                    <button
                                        onClick={() => onFollowUp(followUpSuggestion.eventName)}
                                        className="text-sm text-purple-400 italic hover:underline hover:text-purple-300 transition-colors"
                                    >
                                        {followUpSuggestion.question}
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                );
        }
    };

    return ReactDOM.createPortal(
        <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleAttemptClose}>
                <div className="bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-white shadow-2xl border border-slate-700 animate-fade-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                    {renderContent()}
                    <div className="flex justify-end gap-4 mt-6 border-t border-slate-700 pt-4">
                        {step === 'configure' && (
                            <PrimaryButton 
                                onClick={handleGenerateCampaign} 
                                disabled={!selectedScreenId || (organization.displayScreens?.length || 0) === 0}
                            >
                                Generera Inlägg
                            </PrimaryButton>
                        )}
                        <SecondaryButton onClick={handleAttemptClose}>Stäng</SecondaryButton>
                    </div>
                </div>
            </div>
            <ConfirmDialog
                isOpen={isConfirmCloseOpen}
                onClose={() => setIsConfirmCloseOpen(false)}
                onConfirm={handleConfirmClose}
                title="Avbryta kampanjskapandet?"
                confirmText="Ja, avbryt"
                variant="destructive"
            >
                <p>Är du säker på att du vill stänga? Dina val kommer inte att sparas och du får börja om från början.</p>
            </ConfirmDialog>
        </>,
        portalRoot
    );
};

export const ShareToFacebookModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    post: DisplayPost | null;
    organization: Organization;
    screen: DisplayScreen;
}> = ({ isOpen, onClose, post, organization, screen }) => {
    if (!isOpen || !post) return null;

    const embedUrl = `${window.location.origin}/embed/org/${organization.id}/screen/${screen.id}`;
    const shareText = post.headline || 'Kolla in detta!';
    const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(embedUrl)}&quote=${encodeURIComponent(shareText)}`;

    const handleShare = () => {
        window.open(facebookShareUrl, '_blank', 'noopener,noreferrer');
        onClose();
    };
    
    let portalRoot = document.getElementById('modal-root');
    if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = 'modal-root';
        document.body.appendChild(portalRoot);
    }

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-white shadow-2xl border border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-2">Dela på Facebook</h2>
                <div className="text-slate-300 mb-6">
                    <p>Du är på väg att dela en länk på Facebook med text från inlägget "{post.internalTitle}".</p>
                    {screen.name && <p className="mt-1 text-sm text-slate-400">Vald kanal: {screen.name}</p>}
                </div>
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                    <p className="text-sm text-slate-400">Förhandsgranskning av text:</p>
                    <p className="font-semibold text-lg mt-1">{shareText}</p>
                </div>
                <div className="flex justify-end items-center gap-4 mt-8">
                    <SecondaryButton onClick={onClose}>Avbryt</SecondaryButton>
                    <PrimaryButton onClick={handleShare} className="bg-blue-600 hover:bg-blue-500">
                        <FacebookIcon className="h-5 w-5" /> Dela nu
                    </PrimaryButton>
                </div>
            </div>
        </div>,
        portalRoot
    );
};

export const ShareToInstagramModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    post: DisplayPost | null;
}> = ({ isOpen, onClose, post }) => {
    const { showToast } = useToast();

    const handleExport = async () => {
        if (!post) return;

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        const textToCopy = `${post.headline || ''}\n\n${post.body || ''}`.trim();
        let imageDownloaded = false;
        let textCopied = false;

        try {
            if (textToCopy) {
                await navigator.clipboard.writeText(textToCopy);
                textCopied = true;
            }

            if (post.imageUrl) {
                const response = await fetch(post.imageUrl);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                const filename = `smart-skylt-post-${post.internalTitle?.replace(/\s+/g, '-').toLowerCase() || Date.now()}.jpg`;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                imageDownloaded = true;
            }
            
            if (!imageDownloaded && !textCopied) {
                showToast({ message: "Inget att exportera. Inlägget saknar bild och text.", type: 'info' });
                onClose();
                return;
            }

            if (isMobile) {
                showToast({
                    message: "Inlägget har laddats ner. Öppna Instagram och klistra in texten där.",
                    type: 'success',
                    duration: 7000,
                });
                // Attempt to open Instagram app. This is a "fire and forget" action.
                window.location.href = 'instagram://camera';
            } else { // Desktop
                showToast({
                    message: "Inlägget har laddats ner. Flytta bilden till din telefon för att publicera på Instagram.",
                    type: 'success',
                    duration: 7000,
                });
            }

        } catch (err) {
            console.error("Failed to export for Instagram:", err);
            showToast({ message: "Kunde inte exportera inlägget.", type: 'error' });
        } finally {
            onClose();
        }
    };


    if (!isOpen || !post) return null;

    let portalRoot = document.getElementById('modal-root');
    if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = 'modal-root';
        document.body.appendChild(portalRoot);
    }
    
    const textPreview = `${post.headline || ''}\n\n${post.body || ''}`.trim();

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-white shadow-2xl border border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-2">Dela på Instagram</h2>
                <p className="text-slate-300 mb-6">
                    Du är på väg att exportera inlägget "{post.internalTitle}" till Instagram.
                    Bild och text laddas ner så du enkelt kan publicera via din telefon.
                </p>
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                    <p className="text-sm text-slate-400">Förhandsgranskning av inläggstext:</p>
                    <p className="font-semibold text-base mt-1 whitespace-pre-wrap">{textPreview || "(Inlägget har ingen text)"}</p>
                </div>
                <div className="flex justify-end items-center gap-4 mt-8">
                    <SecondaryButton onClick={onClose}>Avbryt</SecondaryButton>
                    <PrimaryButton onClick={handleExport} className="bg-pink-600 hover:bg-pink-500">
                        <InstagramIcon className="h-5 w-5" /> Exportera till Instagram
                    </PrimaryButton>
                </div>
            </div>
        </div>,
        portalRoot
    );
};

export const CreatePostModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    templates: PostTemplate[];
    onCreate: (template?: PostTemplate) => void;
}> = ({ isOpen, onClose, templates, onCreate }) => {
    if (!isOpen) return null;
    let portalRoot = document.getElementById('modal-root');
    if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = 'modal-root';
        document.body.appendChild(portalRoot);
    }
    
    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-4xl text-white shadow-2xl border border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-2">Skapa nytt inlägg</h2>
                <p className="text-slate-300 mb-6">Välj en startpunkt för ditt nya inlägg.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto pr-2">
                    <button onClick={() => onCreate()} className="h-48 p-6 bg-slate-700 hover:bg-slate-600 rounded-lg border-2 border-dashed border-slate-500 hover:border-primary text-left transition-all flex flex-col justify-center items-center group">
                        <span className="text-5xl text-slate-400 group-hover:text-primary transition-colors">+</span>
                        <span className="font-bold text-lg mt-2 text-slate-200">Tomt inlägg</span>
                        <p className="text-sm text-slate-400/80 text-center mt-1">Börja från noll med full kreativ frihet.</p>
                    </button>
                    {templates.map(template => (
                        <button key={template.id} onClick={() => onCreate(template)} className={`h-48 p-4 bg-slate-700 rounded-lg text-left transition-colors flex flex-col relative group hover:bg-slate-600 hover:ring-2 hover:ring-primary`}>
                            <h3 className="font-bold text-lg text-primary">{template.templateName}</h3>
                            <p className="text-sm text-slate-400 mt-1 line-clamp-2 flex-grow">{template.postData.headline}</p>
                            <span className="text-xs bg-slate-600 text-slate-300 px-2 py-1 rounded-full self-start">{template.postData.layout}</span>
                        </button>
                    ))}
                </div>
                <div className="flex justify-end mt-8 border-t border-slate-700 pt-4">
                    <SecondaryButton onClick={onClose}>Avbryt</SecondaryButton>
                </div>
            </div>
        </div>,
        portalRoot
    );
};

export const InputDialog: React.FC<{
  isOpen: boolean; onClose: () => void; onSave: (value: string) => void; title: string;
  labelText: string; initialValue?: string; saveText?: string;
}> = ({ isOpen, onClose, onSave, title, labelText, initialValue = '', saveText = 'Spara' }) => {
  const [value, setValue] = useState(initialValue);
  useEffect(() => { if (isOpen) setValue(initialValue); }, [isOpen, initialValue]);
  if (!isOpen) return null;
  let portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
      portalRoot = document.createElement('div');
      portalRoot.id = 'modal-root';
      document.body.appendChild(portalRoot);
  }
  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if(value.trim()) onSave(value.trim()); }} className="bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-md text-white shadow-2xl border border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-4">{title}</h2>
        <div>
          <label className="block text-sm font-medium text-slate-400">{labelText}</label>
          <input type="text" value={value} onChange={(e) => setValue(e.target.value)} className="w-full bg-slate-900/50 p-2.5 rounded-lg border border-slate-600 focus:ring-2 focus:ring-primary mt-1" autoFocus />
        </div>
        <div className="flex justify-end gap-4 mt-6">
          <SecondaryButton type="button" onClick={onClose}>Avbryt</SecondaryButton>
          <PrimaryButton disabled={!value.trim()} type="submit">{saveText}</PrimaryButton>
        </div>
      </form>
    </div>, portalRoot
  );
};

export const MediaPickerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  mediaLibrary: MediaItem[];
  onSelect: (item: MediaItem) => void;
  filter?: 'image' | 'video';
}> = ({ isOpen, onClose, mediaLibrary, onSelect, filter }) => {
  if (!isOpen) return null;

  const filteredMedia = (mediaLibrary || []).filter(item => !filter || item.type === filter).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  let portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    portalRoot = document.createElement('div');
    portalRoot.id = 'modal-root';
    document.body.appendChild(portalRoot);
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-4xl text-white shadow-2xl border border-slate-700 animate-fade-in flex flex-col h-[90vh]" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-4 flex-shrink-0">Välj från galleri</h2>
        
        <div className="flex-grow overflow-y-auto -mx-2 pr-2">
          {filteredMedia.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 p-2">
              {filteredMedia.map(item => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className="aspect-square bg-slate-700 rounded-lg overflow-hidden group relative focus:outline-none focus:ring-2 focus:ring-primary ring-offset-2 ring-offset-slate-800"
                >
                  {item.type === 'image' ? (
                    <img src={item.url} alt={item.internalTitle} className="w-full h-full object-cover" />
                  ) : (
                    <video src={item.url} muted loop playsInline className="w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex items-end">
                    <p className="text-white text-xs font-semibold line-clamp-2">{item.internalTitle}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <EmptyState 
                icon={<VideoCameraIcon className="h-12 w-12 text-slate-400" />}
                title="Galleriet är tomt"
                message={filter ? `Det finns inga ${filter === 'image' ? 'bilder' : 'videos'} i ditt galleri.` : "Ladda upp bilder och videos för att kunna återanvända dem."}
              />
            </div>
          )}
        </div>
        
        <div className="flex justify-end mt-6 border-t border-slate-700 pt-4 flex-shrink-0">
          <SecondaryButton onClick={onClose}>Avbryt</SecondaryButton>
        </div>
      </div>
    </div>,
    portalRoot
  );
};