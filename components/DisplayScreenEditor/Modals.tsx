
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  PostTemplate,
  DisplayPost,
  Organization,
  DisplayScreen,
  CampaignIdea,
  MediaItem,
  AiImageVariant,
} from '../../types';
import {
  SparklesIcon,
  VideoCameraIcon,
  PhotoIcon,
  DownloadIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  HandThumbUpIcon,
  HandThumbDownIcon
} from '../icons';
import { PrimaryButton, SecondaryButton } from '../Buttons';
import { EmptyState } from '../EmptyState';
import { StyledInput, StyledSelect } from '../Forms';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../ConfirmDialog';
import html2canvas from 'https://esm.sh/html2canvas@1.4.1';
import { DisplayPostRenderer } from '../DisplayPostRenderer';
import { generateRemixVariants, generateDisplayPostImage } from '../../services/geminiService';

// ------------------------------------------------------------
// AI Studio Modifier Group
// ------------------------------------------------------------
export const AiStudioModifierGroup: React.FC<{
  label: string;
  options: { label: string; value: string }[];
  selectedValue: string;
  onSelect: (value: string) => void;
}> = ({ label, options, selectedValue, onSelect }) => (
  <div>
    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
      {label}
    </label>
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
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

// ------------------------------------------------------------
// CampaignIdeaModal
// ------------------------------------------------------------
export const CampaignIdeaModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  ideas: CampaignIdea[] | null;
  error: string | null;
  eventName: string | undefined;
  followUpSuggestion?: { question: string; eventName: string } | null;
  onFollowUp?: (eventName: string) => void;
  organization: Organization;
  onEditGeneratedPost: (post: DisplayPost) => void;
}> = ({
  isOpen,
  onClose,
  isLoading,
  ideas,
  error,
  eventName,
  followUpSuggestion,
  onFollowUp,
  organization,
  onEditGeneratedPost,
}) => {
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
        return;
      }
      setStep('ideas');
      setSelectedIdea(null);
      setGenerationError(null);
      if (organization.displayScreens && organization.displayScreens.length > 0) {
        setSelectedScreenId(organization.displayScreens[0].id);
      } else {
        setSelectedScreenId('');
      }
    } else {
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
      sessionStorage.setItem('fromAIFlow', 'true');
    } catch (e) {
      console.warn('Could not set sessionStorage item:', e);
    }

    isGeneratingRef.current = true;
    setStep('generating');
    setGenerationStatus('Skapar inläggsutkast...');
    setGenerationError(null);

    try {
      const screen = organization.displayScreens?.find((s) => s.id === selectedScreenId);
      if (!screen) throw new Error('Valt skyltfönster kunde inte hittas.');

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
        structuredImagePrompt: {
            subject: selectedIdea.visual.imageIdea,
            style: selectedIdea.visual.style,
            colorTone: selectedIdea.visual.colorPalette,
            mood: selectedIdea.visual.mood,
            composition: selectedIdea.visual.composition,
            lighting: selectedIdea.visual.lighting,
        },
        isAiGeneratedImage: false,
        isAiGeneratedVideo: false,
        backgroundColor: 'black',
        textColor: 'white',
        imageOverlayEnabled: false,
        headlineFontFamily: organization.headlineFontFamily,
        bodyFontFamily: organization.bodyFontFamily,
      };

      showToast({
        message: `Utkast skapat! Öppnar redigeraren för "${screen.name}".`,
        type: 'success',
      });

      onEditGeneratedPost(newPost);
      onClose();
    } catch (e) {
      setGenerationError(
        e instanceof Error ? e.message : 'Kunde inte skapa kampanj.'
      );
      setStep('configure');
      isGeneratingRef.current = false;
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
          <p className="mt-4 text-slate-600 dark:text-slate-300">
            Genererar kreativa idéer...
          </p>
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
            <p className="mt-4 text-slate-600 dark:text-slate-300">
              {generationStatus || 'AI:n arbetar...'}
            </p>
          </div>
        );
      case 'configure':
        return (
          <>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Konfigurera Kampanj</h2>
              <SecondaryButton onClick={handleBackToIdeas}>
                Tillbaka till idéer
              </SecondaryButton>
            </div>
            <div className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600 mb-6">
              <h3 className="font-bold text-primary">{selectedIdea?.headline}</h3>
              <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">
                {selectedIdea?.text}
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Lägg till i skyltfönster (kanal)
                </label>
                {organization.displayScreens && organization.displayScreens.length > 0 ? (
                  <StyledSelect
                    value={selectedScreenId}
                    onChange={(e) => setSelectedScreenId(e.target.value)}
                  >
                    {organization.displayScreens.map((screen) => (
                      <option key={screen.id} value={screen.id}>
                        {screen.name}
                      </option>
                    ))}
                  </StyledSelect>
                ) : (
                  <p className="text-sm text-yellow-400 bg-yellow-900/50 p-3 rounded-lg">
                    Du måste skapa ett skyltfönster (en kanal) först.
                  </p>
                )}
              </div>
            </div>
            {generationError && (
              <p className="text-red-400 mt-4">{generationError}</p>
            )}
          </>
        );
      case 'ideas':
      default:
        return (
          <>
            <h2 className="text-2xl font-bold mb-2">
              ✨ AI-kampanjidéer för "{eventName}"
            </h2>
            <div className="space-y-4 mt-6">
              <p className="text-slate-600 dark:text-slate-300">
                Här är några förslag. Välj en idé för att låta AI:n bygga en
                kampanj.
              </p>
              {ideas &&
                ideas.map((idea, index) => (
                  <div
                    key={index}
                    className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                  >
                    <div className="flex-grow">
                      <h3 className="font-bold text-primary">{idea.headline}</h3>
                      <p className="text-slate-600 dark:text-slate-300 text-sm mt-1 mb-3">
                        {idea.text}
                      </p>
                      <div className="text-xs text-slate-500 dark:text-slate-400 italic space-y-1">
                        <p>
                          <strong>Visuell Idé:</strong> {idea.visual.imageIdea}
                        </p>
                        <p>
                          <strong>Stil:</strong> {idea.visual.style},{' '}
                          {idea.visual.mood}, {idea.visual.colorPalette}
                        </p>
                      </div>
                    </div>
                    <PrimaryButton
                      onClick={() => handleSelectIdea(idea)}
                      className="flex-shrink-0 self-start sm:self-center"
                    >
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
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={handleAttemptClose}
      >
        <div
          className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {renderContent()}
          <div className="flex justify-end gap-4 mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
            {step === 'configure' && (
              <PrimaryButton
                onClick={handleGenerateCampaign}
                disabled={
                  !selectedScreenId ||
                  (organization.displayScreens?.length || 0) === 0
                }
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
        <p>
          Är du säker på att du vill stänga? Dina val kommer inte att sparas och du
          får börja om från början.
        </p>
      </ConfirmDialog>
    </>,
    portalRoot
  );
};

// ------------------------------------------------------------
// RemixModal
// ------------------------------------------------------------
export const RemixModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  post: DisplayPost;
  organization: Organization;
  onSelectVariant: (variant: DisplayPost) => void;
}> = ({ isOpen, onClose, post, organization, onSelectVariant }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [variants, setVariants] = useState<DisplayPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState('');
  
  // Track image generation status separately for each variant
  const [imagesGenerating, setImagesGenerating] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      setVariants([]);
      setError(null);
      handleGenerateVariants();
    }
  }, [isOpen, post]);

  const handleGenerateVariants = async () => {
    setIsLoading(true);
    setGenerationStatus('Analyserar ditt inlägg och skapar variationer...');
    try {
      const generatedVariants = await generateRemixVariants(post, organization);
      
      const fullVariants: DisplayPost[] = generatedVariants.map((v, i) => ({
        ...JSON.parse(JSON.stringify(post)), // Base on original
        ...v,
        id: `remix-${Date.now()}-${i}`,
        internalTitle: `Remix: ${post.internalTitle} (Var ${i + 1})`,
        imageUrl: undefined, // Reset media, will generate new
        videoUrl: undefined,
        isAiGeneratedImage: true,
        startDate: undefined, // Reset dates so it's fresh
        endDate: undefined
      }));

      setVariants(fullVariants);
      
      // Kick off image generation for each variant in background
      fullVariants.forEach((v, i) => {
        if (v.aiImagePrompt) {
          generateImageForVariant(v, i);
        }
      });

    } catch (e) {
      setError("Kunde inte generera varianter. Försök igen.");
    } finally {
      setIsLoading(false);
    }
  };

  const generateImageForVariant = async (variant: DisplayPost, index: number) => {
    if (!variant.aiImagePrompt) return;
    setImagesGenerating(prev => ({ ...prev, [index]: true }));
    try {
      const { imageBytes, mimeType } = await generateDisplayPostImage(variant.aiImagePrompt, '16:9'); // Defaulting aspect ratio for preview context, or could pass screen prop
      const dataUri = `data:${mimeType};base64,${imageBytes}`;
      
      setVariants(prev => {
        const newArr = [...prev];
        newArr[index] = { ...newArr[index], imageUrl: dataUri };
        return newArr;
      });
    } catch (e) {
      console.error("Failed to generate image for remix variant", index, e);
    } finally {
      setImagesGenerating(prev => ({ ...prev, [index]: false }));
    }
  };

  if (!isOpen) return null;

  let portalRoot = document.getElementById('modal-root') || document.body;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <SparklesIcon className="text-purple-500 w-6 h-6" />
              Remixa Inlägg
            </h2>
            <p className="text-slate-500 dark:text-slate-400">Välj en ny variant av ditt budskap.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">&times;</button>
        </div>

        <div className="flex-grow overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900/50">
          {isLoading && variants.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <SparklesIcon className="w-12 h-12 text-purple-500 animate-pulse mb-4" />
              <p className="text-lg font-medium text-slate-600 dark:text-slate-300">{generationStatus}</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-500 mb-4">{error}</p>
              <SecondaryButton onClick={handleGenerateVariants}>Försök igen</SecondaryButton>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
              {variants.map((variant, index) => (
                <div key={index} className="flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-lg hover:ring-2 hover:ring-purple-500 transition-all">
                  <div className="aspect-video bg-black relative">
                    <DisplayPostRenderer post={variant} organization={organization} />
                    {imagesGenerating[index] && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-2">
                          <SparklesIcon className="w-6 h-6 animate-spin" />
                          <span className="text-xs font-bold">Genererar bild...</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex-grow flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-1">{variant.headline}</h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3 mb-4">{variant.body}</p>
                    </div>
                    <PrimaryButton 
                      onClick={() => onSelectVariant(variant)}
                      disabled={imagesGenerating[index]}
                      className="w-full bg-purple-600 hover:bg-purple-500"
                    >
                      Välj denna variant
                    </PrimaryButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    portalRoot
  );
};

// ------------------------------------------------------------
// DownloadAssetsModal
// ------------------------------------------------------------
export const DownloadAssetsModal: React.FC<{
  post: DisplayPost;
  screen: DisplayScreen;
  organization: Organization;
  onClose: () => void;
}> = ({ post, screen, organization, onClose }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const rendererRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const handleDownloadAsImage = async () => {
    if (!rendererRef.current) return;

    const targetElement = rendererRef.current.firstElementChild as HTMLElement;
    if (!targetElement) {
      showToast({
        message: 'Kunde inte hitta inlägget att ladda ner.',
        type: 'error',
      });
      return;
    }

    setIsGenerating(true);

    setTimeout(async () => {
      try {
        const canvas = await html2canvas(targetElement, {
          useCORS: true,
          allowTaint: true,
          backgroundColor: post.backgroundColor || 'black',
          scale: 2,
        });

        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${
          post.internalTitle?.replace(/\s/g, '_') || 'inlägg'
        }.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (e) {
        console.error('html2canvas error during image capture:', e);
        showToast({
          message: 'Ett fel inträffade vid bildgenerering.',
          type: 'error',
        });
      } finally {
        setIsGenerating(false);
      }
    }, 500);
  };

  const handleDownloadMedia = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Fetch failed with status ${response.status}`);
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error('Download failed', e);
      window.open(url, '_blank');
      showToast({
        message: 'Nedladdning misslyckades. Försöker öppna i ny flik.',
        type: 'info',
      });
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast({ message: 'Text kopierad!', type: 'success' });
    });
  };

  const mediaAssets = useMemo(() => {
    const assets: {
      url: string;
      type: 'image' | 'video';
      filename: string;
      title: string;
    }[] = [];
    const safeTitle =
      post.internalTitle?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'media';

    if (post.imageUrl)
      assets.push({
        url: post.imageUrl,
        type: 'image',
        filename: `bild_${safeTitle}.png`,
        title: 'Huvudbild',
      });
    if (post.videoUrl)
      assets.push({
        url: post.videoUrl,
        type: 'video',
        filename: `video_${safeTitle}.mp4`,
        title: 'Huvudvideo',
      });

    (post.subImages || []).forEach((img, i) => {
      if (img.imageUrl)
        assets.push({
          url: img.imageUrl,
          type: 'image',
          filename: `subbild_${i + 1}_${safeTitle}.png`,
          title: `Karusellbild ${i + 1}`,
        });
    });

    (post.collageItems || []).forEach((item, i) => {
      if (item?.imageUrl)
        assets.push({
          url: item.imageUrl,
          type: 'image',
          filename: `collagebild_${i + 1}_${safeTitle}.png`,
          title: `Collagebild ${i + 1}`,
        });
      if (item?.videoUrl)
        assets.push({
          url: item.videoUrl,
          type: 'video',
          filename: `collagevideo_${i + 1}_${safeTitle}.mp4`,
          title: `Collagevideo ${i + 1}`,
        });
    });

    return assets.filter((a) => a.url);
  }, [post]);

  const hasText = post.headline || post.body;

  const isPortrait = screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4';
  const RENDER_WIDTH = isPortrait ? 1080 : 1920;
  const RENDER_HEIGHT = isPortrait ? 1920 : 1080;

  let portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    portalRoot = document.createElement('div');
    portalRoot.id = 'modal-root';
    document.body.appendChild(portalRoot);
  }

  return ReactDOM.createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-2xl font-bold mb-4 flex-shrink-0">
            Ladda ner material från "{post.internalTitle}"
          </h2>

          <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-6">
            <div className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg">
              <h3 className="font-bold text-lg mb-2">Ladda ner som bild</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Ladda ner en komplett bild av inlägget, precis som det ser ut på
                skärmen. Perfekt för delning på sociala medier.
              </p>
              <PrimaryButton onClick={handleDownloadAsImage} loading={isGenerating}>
                {isGenerating ? 'Genererar...' : 'Ladda ner bild'}
              </PrimaryButton>
            </div>

            {hasText && (
              <div>
                <h3 className="font-bold text-lg mb-2">Textinnehåll</h3>
                <div className="space-y-3">
                  {post.headline && (
                    <div>
                      <label className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        Rubrik
                      </label>
                      <div className="flex gap-2">
                        <textarea
                          readOnly
                          value={post.headline}
                          rows={2}
                          className="w-full bg-slate-100 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-300 dark:border-slate-600 font-semibold"
                        />
                        <SecondaryButton
                          onClick={() => handleCopyText(post.headline!)}
                        >
                          Kopiera
                        </SecondaryButton>
                      </div>
                    </div>
                  )}
                  {post.body && (
                    <div>
                      <label className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        Brödtext
                      </label>
                      <div className="flex gap-2">
                        <textarea
                          readOnly
                          value={post.body}
                          rows={4}
                          className="w-full bg-slate-100 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-300 dark:border-slate-600"
                        />
                        <SecondaryButton
                          onClick={() => handleCopyText(post.body!)}
                        >
                          Kopiera
                        </SecondaryButton>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {mediaAssets.length > 0 && (
              <div>
                <h3 className="font-bold text-lg mb-2">Mediainnehåll</h3>
                <div className="space-y-2">
                  {mediaAssets.map((asset, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-slate-100 dark:bg-slate-900/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {asset.type === 'image' ? (
                          <PhotoIcon className="h-6 w-6 text-slate-500" />
                        ) : (
                          <VideoCameraIcon className="h-6 w-6 text-slate-500" />
                        )}
                        <span className="font-semibold text-sm">
                          {asset.title}
                        </span>
                      </div>
                      <PrimaryButton
                        onClick={() =>
                          handleDownloadMedia(asset.url, asset.filename)
                        }
                      >
                        <DownloadIcon className="h-5 w-5 mr-2" /> Ladda ner
                      </PrimaryButton>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end mt-6 border-t border-slate-200 dark:border-slate-700 pt-4 flex-shrink-0">
            <SecondaryButton onClick={onClose}>Stäng</SecondaryButton>
          </div>
        </div>
      </div>
      {/* Off-screen renderer for html2canvas */}
      <div
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '-9999px',
          width: RENDER_WIDTH,
          height: RENDER_HEIGHT,
        }}
      >
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
    </>,
    portalRoot
  );
};

// ------------------------------------------------------------
// CreatePostModal
// ------------------------------------------------------------
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
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-4xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-2">Skapa nytt inlägg</h2>
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          Välj en startpunkt för ditt nya inlägg.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto pr-2">
          <button
            onClick={() => onCreate()}
            className="h-48 p-6 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-500 hover:border-primary text-left transition-all flex flex-col justify-center items-center group"
          >
            <span className="text-5xl text-slate-400 group-hover:text-primary transition-colors">
              +
            </span>
            <span className="font-bold text-lg mt-2 text-slate-800 dark:text-slate-200">
              Tomt inlägg
            </span>
            <p className="text-sm text-slate-500 dark:text-slate-400/80 text-center mt-1">
              Börja från noll med full kreativ frihet.
            </p>
          </button>
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => onCreate(template)}
              className="h-48 p-4 bg-slate-100 dark:bg-slate-700 rounded-lg text-left transition-colors flex flex-col relative group hover:bg-slate-200 dark:hover:bg-slate-600 hover:ring-2 hover:ring-primary"
            >
              <h3 className="font-bold text-lg text-primary">
                {template.templateName}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 flex-grow">
                {template.postData.headline}
              </p>
              <span className="text-xs bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-full self-start">
                {template.postData.layout}
              </span>
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

// ------------------------------------------------------------
// InputDialog
// ------------------------------------------------------------
export const InputDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
  title: string;
  labelText: string;
  initialValue?: string;
  saveText?: string;
}> = ({
  isOpen,
  onClose,
  onSave,
  title,
  labelText,
  initialValue = '',
  saveText = 'Spara',
}) => {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (isOpen) setValue(initialValue);
  }, [isOpen, initialValue]);
  if (!isOpen) return null;

  let portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    portalRoot = document.createElement('div');
    portalRoot.id = 'modal-root';
    document.body.appendChild(portalRoot);
  }

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSave(value.trim());
        }}
        className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-md text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-4">{title}</h2>
        <div>
          <label className="block text-sm font-medium text-slate-500 dark:text-slate-400">
            {labelText}
          </label>
          <StyledInput
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-4 mt-6">
          <SecondaryButton type="button" onClick={onClose}>
            Avbryt
          </SecondaryButton>
          <PrimaryButton disabled={!value.trim()} type="submit">
            {saveText}
          </PrimaryButton>
        </div>
      </form>
    </div>,
    portalRoot
  );
};

// ------------------------------------------------------------
// Helper TabButton
// ------------------------------------------------------------
const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ active, onClick, icon, children }) => (
  <button
    onClick={onClick}
    className={`flex-1 flex items-center justify-center gap-2 p-3 font-semibold border-b-2 transition-colors ${
      active
        ? 'border-primary text-primary'
        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-primary/70'
    }`}
  >
    {icon}
    {children}
  </button>
);

// ------------------------------------------------------------
// MediaPickerModal
// ------------------------------------------------------------
export const MediaPickerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  mediaLibrary: MediaItem[];
  onSelect: (item: MediaItem) => void;
  filter?: 'image' | 'video';
  postAiVariants?: AiImageVariant[];
}> = ({
  isOpen,
  onClose,
  mediaLibrary,
  onSelect,
  filter,
  postAiVariants,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'gallery' | 'ai' | 'post-variants'>(
    'all'
  );
  const [brokenMediaIds, setBrokenMediaIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) setActiveTab('all');
  }, [isOpen]);

  const mediaToDisplay = useMemo(() => {
    let media = [...(mediaLibrary || [])];

    if (activeTab === 'post-variants') {
      return (postAiVariants || []).map(
        (variant) =>
          ({
            id: variant.id,
            url: variant.url,
            type: 'image',
            createdAt: variant.createdAt,
            createdBy: 'ai',
            internalTitle: `AI Variant: ${variant.prompt.slice(0, 20)}...`,
          }) as MediaItem
      );
    }

    // Apply strict type filter if provided
    if (filter === 'video') {
        media = media.filter((item) => item.type === 'video');
    } else if (filter === 'image') {
        media = media.filter((item) => item.type === 'image');
    }
    // If filter is undefined, we show everything (both images and videos)

    // Then filter by Source (Tab)
    switch (activeTab) {
      case 'gallery':
        media = media.filter((item) => item.createdBy !== 'ai');
        break;
      case 'ai':
        media = media.filter((item) => item.createdBy === 'ai');
        break;
      case 'all':
      default:
        break;
    }

    return media.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [mediaLibrary, filter, activeTab, postAiVariants]);

  const handleMediaError = (id: string) => {
      setBrokenMediaIds(prev => new Set(prev).add(id));
  };

  if (!isOpen) return null;

  let portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    portalRoot = document.createElement('div');
    portalRoot.id = 'modal-root';
    document.body.appendChild(portalRoot);
  }

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-4xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in flex flex-col h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-4 flex-shrink-0">
          Välj från galleri
        </h2>

        {filter !== 'video' && (
          <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4 flex-shrink-0">
            <TabButton
              active={activeTab === 'all'}
              onClick={() => setActiveTab('all')}
              icon={<PhotoIcon className="w-5 h-5" />}
            >
              {filter === 'image' ? 'Alla bilder' : 'Alla filer'}
            </TabButton>
            <TabButton
              active={activeTab === 'gallery'}
              onClick={() => setActiveTab('gallery')}
              icon={<MagnifyingGlassIcon className="w-5 h-5" />}
            >
              Galleri
            </TabButton>
            <TabButton
              active={activeTab === 'ai'}
              onClick={() => setActiveTab('ai')}
              icon={<SparklesIcon className="w-5 h-5" />}
            >
              AI-bilder (Galleri)
            </TabButton>
            {postAiVariants && postAiVariants.length > 0 && (
              <TabButton
                active={activeTab === 'post-variants'}
                onClick={() => setActiveTab('post-variants')}
                icon={<SparklesIcon className="w-5 h-5 text-purple-400" />}
              >
                Detta inläggs AI-bilder
              </TabButton>
            )}
          </div>
        )}

        <div className="flex-grow overflow-y-auto -mx-2 pr-2">
          {mediaToDisplay.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 p-2">
              {mediaToDisplay.map((item) => {
                const isBroken = brokenMediaIds.has(item.id);
                return (
                <button
                  key={item.id}
                  onClick={() => !isBroken && onSelect(item)}
                  disabled={isBroken}
                  className={`aspect-square bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden group relative focus:outline-none focus:ring-2 focus:ring-primary ring-offset-2 ring-offset-slate-800 ${isBroken ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  {isBroken ? (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-2">
                          <ExclamationTriangleIcon className="w-8 h-8 mb-1" />
                          <span className="text-[10px] text-center">Trasig fil</span>
                      </div>
                  ) : (
                      item.type === 'image' ? (
                        <img
                          src={item.url}
                          alt={item.internalTitle}
                          className="w-full h-full object-cover"
                          onError={() => handleMediaError(item.id)}
                        />
                      ) : (
                        <video
                          src={item.url}
                          muted
                          loop
                          playsInline
                          className="w-full h-full object-cover"
                          onError={() => handleMediaError(item.id)}
                        />
                      )
                  )}
                  {/* Type Badge if mixed content */}
                  {!filter && !isBroken && (
                      <div className="absolute top-1 right-1 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded backdrop-blur-sm">
                          {item.type === 'video' ? 'VIDEO' : 'BILD'}
                      </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex items-end">
                    <p className="text-white text-xs font-semibold line-clamp-2">
                      {item.internalTitle}
                    </p>
                  </div>
                </button>
              )})}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <EmptyState
                icon={
                  filter === 'video' ? (
                    <VideoCameraIcon className="h-12 w-12 text-slate-400" />
                  ) : (
                    <PhotoIcon className="h-12 w-12 text-slate-400" />
                  )
                }
                title="Galleriet är tomt"
                message={
                  filter
                    ? `Det finns inga ${
                        filter === 'image' ? 'bilder' : 'videos'
                      } i ditt galleri.`
                    : 'Ladda upp bilder och videos för att komma igång.'
                }
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

// ------------------------------------------------------------
// SharePostModal
// ------------------------------------------------------------
export const SharePostModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onShare: (targetScreenIds: string[]) => void;
  organization: Organization;
  currentScreenId: string;
  postToShare: DisplayPost | null;
  isSharing: boolean;
}> = ({
  isOpen,
  onClose,
  onShare,
  organization,
  currentScreenId,
  postToShare,
  isSharing,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds([]);
    }
  }, [isOpen]);

  if (!isOpen || !postToShare) return null;

  let portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    portalRoot = document.createElement('div');
    portalRoot.id = 'modal-root';
    document.body.appendChild(portalRoot);
  }

  const otherScreens = (organization.displayScreens || []).filter(
    (s) => s.id !== currentScreenId
  );

  const handleToggle = (screenId: string) => {
    setSelectedIds((prev) =>
      prev.includes(screenId)
        ? prev.filter((id) => id !== screenId)
        : [...prev, screenId]
    );
  };

  const handleSubmit = () => {
    onShare(selectedIds);
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-2">
          Dela inlägg till andra kanaler
        </h2>
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          En kopia av inlägget{' '}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            "{postToShare.internalTitle}"
          </span>{' '}
          kommer att skapas i de valda kanalerna.
        </p>

        <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
          {otherScreens.length > 0 ? (
            otherScreens.map((screen) => (
              <label
                key={screen.id}
                className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(screen.id)}
                  onChange={() => handleToggle(screen.id)}
                  className="h-5 w-5 rounded text-primary focus:ring-primary"
                />
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {screen.name}
                </span>
              </label>
            ))
          ) : (
            <p className="text-slate-500 dark:text-slate-400 text-center py-4">
              Det finns inga andra kanaler att dela till.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-4 mt-8 border-t border-slate-200 dark:border-slate-700 pt-4">
          <SecondaryButton onClick={onClose} disabled={isSharing}>
            Avbryt
          </SecondaryButton>
          <PrimaryButton
            onClick={handleSubmit}
            disabled={selectedIds.length === 0 || isSharing}
            loading={isSharing}
          >
            Dela inlägg
          </PrimaryButton>
        </div>
      </div>
    </div>,
    portalRoot
  );
};

// ------------------------------------------------------------
// AiImageEditorModal
// ------------------------------------------------------------
export const AiImageEditorModal: React.FC<{
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

  let portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    portalRoot = document.createElement('div');
    portalRoot.id = 'modal-root';
    document.body.appendChild(portalRoot);
  }

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[52] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-2">Redigera bild med AI</h2>
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          Beskriv ändringen du vill göra, t.ex. "lägg till en solnedgång i
          bakgrunden" eller "gör färgerna mer levande".
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Beskriv ändringen (t.ex. 'gör himlen lila', 'lägg till en hund')"
          rows={3}
          className="w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
          disabled={isLoading}
        />
        <div className="flex justify-end gap-4 mt-6">
          <SecondaryButton onClick={onClose} disabled={isLoading}>
            Avbryt
          </SecondaryButton>
          <PrimaryButton
            onClick={handleGenerate}
            loading={isLoading}
            disabled={!prompt.trim()}
          >
            <SparklesIcon className="h-5 w-5 mr-2" />
            Generera ny variant
          </PrimaryButton>
        </div>
      </div>
    </div>,
    portalRoot
  );
};

// ------------------------------------------------------------
// PostAnalysisModal
// ------------------------------------------------------------
export const PostAnalysisModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  result: { score: number; critique: string; improvements: string[]; positive: string } | null;
  isLoading: boolean;
}> = ({ isOpen, onClose, result, isLoading }) => {
  if (!isOpen) return null;

  let portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    portalRoot = document.createElement('div');
    portalRoot.id = 'modal-root';
    document.body.appendChild(portalRoot);
  }

  const scoreColor = (score: number) => {
    if (score >= 8) return 'text-green-500 bg-green-100 dark:bg-green-900/50';
    if (score >= 5) return 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/50';
    return 'text-red-500 bg-red-100 dark:bg-red-900/50';
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[55] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            &times;
        </button>

        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <SparklesIcon className="w-6 h-6 text-purple-500" />
          Skylies Analys
        </h2>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <SparklesIcon className="w-12 h-12 text-primary animate-pulse mb-4" />
            <p className="text-slate-500 dark:text-slate-400">Analyserar ditt inlägg...</p>
          </div>
        ) : result ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className={`flex flex-col items-center justify-center w-20 h-20 rounded-full ${scoreColor(result.score)}`}>
                <span className="text-2xl font-bold">{result.score}/10</span>
                <span className="text-xs uppercase font-semibold">Score</span>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-lg mb-1">Skylies kommentar</h4>
                <p className="text-sm text-slate-600 dark:text-slate-300">{result.critique}</p>
              </div>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-100 dark:border-green-800/30">
               <h4 className="font-bold text-green-700 dark:text-green-300 mb-2 flex items-center gap-2">
                   <HandThumbUpIcon className="w-4 h-4"/> Vad som är bra
               </h4>
               <p className="text-sm text-green-800 dark:text-green-200">{result.positive}</p>
            </div>

            {result.improvements.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800/30">
                <h4 className="font-bold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-2">
                    <SparklesIcon className="w-4 h-4"/> Tips
                </h4>
                <ul className="space-y-2">
                    {result.improvements.map((imp, i) => (
                        <li key={i} className="text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2">
                            <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-500 flex-shrink-0" />
                            {imp}
                        </li>
                    ))}
                </ul>
                </div>
            )}
          </div>
        ) : null}
      </div>
    </div>,
    portalRoot
  );
};
