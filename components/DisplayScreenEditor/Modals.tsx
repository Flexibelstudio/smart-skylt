import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { PostTemplate, DisplayPost, Organization, DisplayScreen, CampaignIdea, MediaItem } from '../../types';
import { LightBulbIcon, SparklesIcon, FacebookIcon, VideoCameraIcon, InstagramIcon, LoadingSpinnerIcon, PhotoIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon } from '../icons';
import { PrimaryButton, SecondaryButton } from '../Buttons';
import { EmptyState } from '../EmptyState';
// FIX: Imported 'StyledInput' to resolve a 'Cannot find name' error.
import { StyledInput, StyledSelect } from '../Forms';
import { useToast } from '../../context/ToastContext';
import { generateDisplayPostCampaign, generateDisplayPostImage } from '../../services/geminiService';
import { ConfirmDialog } from '../ConfirmDialog';
import html2canvas from 'https://esm.sh/html2canvas@1.4.1';
import { DisplayPostRenderer } from '../DisplayPostRenderer';

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
    
        try {
            sessionStorage.setItem("fromAIFlow", "true");
        } catch (e) {
            console.warn("Could not set sessionStorage item:", e);
        }
    
        isGeneratingRef.current = true;
        setStep('generating');
        setGenerationStatus('Skapar inläggsutkast...');
        setGenerationError(null);
        try {
            const screen = organization.displayScreens?.find(s => s.id === selectedScreenId);
            if (!screen) throw new Error("Valt skyltfönster kunde inte hittas.");
    
            const newPost: DisplayPost = {
                id: `new-${Date.now()}`,
                internalTitle: selectedIdea.headline || 'AI-genererat inlägg',
                headline: selectedIdea.headline,
                body: selectedIdea.text,
                layout: 'image-fullscreen',
                durationSeconds: 15,
                imageUrl: undefined,
                videoUrl: undefined,
                aiImagePrompt: selectedIdea.visual.imageIdea,
                isAiGeneratedImage: false,
                isAiGeneratedVideo: false,
                backgroundColor: 'black',
                textColor: 'white',
                imageOverlayEnabled: false,
                headlineFontFamily: organization.headlineFontFamily,
                bodyFontFamily: organization.bodyFontFamily,
            };
    
            showToast({ message: `Utkast skapat! Öppnar redigeraren för "${screen.name}".`, type: 'success' });
            
            onEditGeneratedPost(newPost);
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
                   <p className="mt-4 text-slate-600 dark:text-slate-300">Genererar kreativa idéer...</p>
               </div>
           );
        }
        if (error) {
             return (
                <div className="text-center py-12">
                    <p className="text-red-400">Ett fel inträffade:</p>
                    <p className="text-slate-600 dark:text-slate-300 mt-2">{error}</p>
                </div>
            );
        }

        switch (step) {
            case 'generating':
                return (
                    <div className="text-center py-12">
                        <SparklesIcon className="h-10 w-10 text-primary animate-pulse mx-auto" />
                        <p className="mt-4 text-slate-600 dark:text-slate-300">{generationStatus || 'AI:n arbetar...'}</p>
                    </div>
                );
            case 'configure':
                return (
                    <>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold">Konfigurera Kampanj</h2>
                            <SecondaryButton onClick={handleBackToIdeas}>Tillbaka till idéer</SecondaryButton>
                        </div>
                        <div className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600 mb-6">
                            <h3 className="font-bold text-primary">{selectedIdea?.headline}</h3>
                            <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">{selectedIdea?.text}</p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Lägg till i skyltfönster (kanal)</label>
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
                            <p className="text-slate-600 dark:text-slate-300">Här är några förslag. Välj en idé för att låta AI:n bygga en kampanj.</p>
                            {ideas && ideas.map((idea, index) => (
                                <div key={index} className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div className="flex-grow">
                                        <h3 className="font-bold text-primary">{idea.headline}</h3>
                                        <p className="text-slate-600 dark:text-slate-300 text-sm mt-1 mb-3">{idea.text}</p>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 italic space-y-1">
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
                                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-600 text-center">
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
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                    {renderContent()}
                    <div className="flex justify-end gap-4 mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
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

export const StaticPostDownloaderModal: React.FC<{
    post: DisplayPost;
    screen: DisplayScreen;
    organization: Organization;
    onClose: () => void;
}> = ({ post, screen, organization, onClose }) => {
    const rendererRef = useRef<HTMLDivElement>(null);
    const { showToast } = useToast();

    const [status, setStatus] = useState('Förbereder bild...');

    useEffect(() => {
        const generateImage = async () => {
            if (!rendererRef.current) return;

            const targetElement = rendererRef.current.firstElementChild as HTMLElement;
            if (!targetElement) {
                showToast({ message: "Kunde inte hitta inlägget att ladda ner.", type: 'error' });
                onClose();
                return;
            }

            setStatus('Genererar bild...');
            
            // A short timeout can help ensure complex CSS and fonts are fully rendered before capture.
            setTimeout(async () => {
                try {
                    const canvas = await html2canvas(targetElement, {
                        useCORS: true,
                        allowTaint: true,
                        backgroundColor: post.backgroundColor || 'black', // Set background color for canvas
                        scale: 2, // Capture at 2x resolution for better quality
                    });

                    const dataUrl = canvas.toDataURL('image/png');
                    const a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = `${post.internalTitle?.replace(/\s/g, '_') || 'inlägg'}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    onClose();

                } catch (e) {
                    console.error("html2canvas error during image capture:", e);
                    showToast({ message: "Ett fel inträffade vid bildgenerering.", type: 'error' });
                    onClose();
                }
            }, 500); // 500ms delay to allow animations to reach a more complete state
        };

        generateImage();
    }, [post, screen, organization, onClose, showToast]);

    const isPortrait = screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4';
    const RENDER_WIDTH = isPortrait ? 1080 : 1920;
    const RENDER_HEIGHT = isPortrait ? 1920 : 1080;

    return (
        <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-sm text-white shadow-2xl border border-slate-700 animate-fade-in flex flex-col items-center gap-4">
                    <LoadingSpinnerIcon className="h-8 w-8 text-primary" />
                    <h2 className="text-xl font-bold">Genererar bild</h2>
                    <p className="text-slate-300 text-center">{status}</p>
                </div>
            </div>
            {/* Off-screen renderer */}
            <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: RENDER_WIDTH, height: RENDER_HEIGHT }}>
                 <div ref={rendererRef} style={{ width: '100%', height: '100%' }}>
                     <DisplayPostRenderer 
                        post={post}
                        organization={organization}
                        mode="live"
                        isForDownload={true}
                        aspectRatio={screen.aspectRatio}
                     />
                 </div>
            </div>
        </>
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
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-4xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-2">Skapa nytt inlägg</h2>
                <p className="text-slate-600 dark:text-slate-300 mb-6">Välj en startpunkt för ditt nya inlägg.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto pr-2">
                    <button onClick={() => onCreate()} className="h-48 p-6 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-500 hover:border-primary text-left transition-all flex flex-col justify-center items-center group">
                        <span className="text-5xl text-slate-400 group-hover:text-primary transition-colors">+</span>
                        <span className="font-bold text-lg mt-2 text-slate-800 dark:text-slate-200">Tomt inlägg</span>
                        <p className="text-sm text-slate-500 dark:text-slate-400/80 text-center mt-1">Börja från noll med full kreativ frihet.</p>
                    </button>
                    {templates.map(template => (
                        <button key={template.id} onClick={() => onCreate(template)} className={`h-48 p-4 bg-slate-100 dark:bg-slate-700 rounded-lg text-left transition-colors flex flex-col relative group hover:bg-slate-200 dark:hover:bg-slate-600 hover:ring-2 hover:ring-primary`}>
                            <h3 className="font-bold text-lg text-primary">{template.templateName}</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 flex-grow">{template.postData.headline}</p>
                            <span className="text-xs bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-full self-start">{template.postData.layout}</span>
                        </button>
                    ))}
                </div>
                <div className="flex justify-end mt-8 border-t border-slate-200 dark:border-slate-700 pt-4">
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
      <form onSubmit={(e) => { e.preventDefault(); if(value.trim()) onSave(value.trim()); }} className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-md text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-4">{title}</h2>
        <div>
          <label className="block text-sm font-medium text-slate-500 dark:text-slate-400">{labelText}</label>
          <StyledInput type="text" value={value} onChange={(e) => setValue(e.target.value)} className="mt-1" autoFocus />
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
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-4xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in flex flex-col h-[90vh]" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-4 flex-shrink-0">Välj från galleri</h2>
        
        <div className="flex-grow overflow-y-auto -mx-2 pr-2">
          {filteredMedia.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 p-2">
              {filteredMedia.map(item => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className="aspect-square bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden group relative focus:outline-none focus:ring-2 focus:ring-primary ring-offset-2 ring-offset-slate-800"
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
        
        <div className="flex justify-end mt-6 border-t border-slate-200 dark:border-slate-700 pt-4 flex-shrink-0">
          <SecondaryButton onClick={onClose}>Avbryt</SecondaryButton>
        </div>
      </div>
    </div>,
    portalRoot
  );
};

export const SharePostModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onShare: (targetScreenIds: string[]) => void;
    organization: Organization;
    currentScreenId: string;
    postToShare: DisplayPost | null;
    isSharing: boolean;
}> = ({ isOpen, onClose, onShare, organization, currentScreenId, postToShare, isSharing }) => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            setSelectedIds([]); // Reset on open
        }
    }, [isOpen]);

    if (!isOpen || !postToShare) return null;
    let portalRoot = document.getElementById('modal-root');
    if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = 'modal-root';
        document.body.appendChild(portalRoot);
    }

    const otherScreens = (organization.displayScreens || []).filter(s => s.id !== currentScreenId);

    const handleToggle = (screenId: string) => {
        setSelectedIds(prev =>
            prev.includes(screenId) ? prev.filter(id => id !== screenId) : [...prev, screenId]
        );
    };

    const handleSubmit = () => {
        onShare(selectedIds);
    };

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-2">Dela inlägg till andra kanaler</h2>
                <p className="text-slate-600 dark:text-slate-300 mb-6">
                    En kopia av inlägget <span className="font-semibold text-slate-800 dark:text-slate-100">"{postToShare.internalTitle}"</span> kommer att skapas i de valda kanalerna.
                </p>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                    {otherScreens.length > 0 ? (
                        otherScreens.map(screen => (
                            <label key={screen.id} className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(screen.id)}
                                    onChange={() => handleToggle(screen.id)}
                                    className="h-5 w-5 rounded text-primary focus:ring-primary"
                                />
                                <span className="font-medium text-slate-800 dark:text-slate-200">{screen.name}</span>
                            </label>
                        ))
                    ) : (
                        <p className="text-slate-500 dark:text-slate-400 text-center py-4">Det finns inga andra kanaler att dela till.</p>
                    )}
                </div>

                <div className="flex justify-end gap-4 mt-8 border-t border-slate-200 dark:border-slate-700 pt-4">
                    <SecondaryButton onClick={onClose} disabled={isSharing}>Avbryt</SecondaryButton>
                    <PrimaryButton onClick={handleSubmit} disabled={selectedIds.length === 0 || isSharing} loading={isSharing}>
                        Dela inlägg
                    </PrimaryButton>
                </div>
            </div>
        </div>,
        portalRoot
    );
};