
import React, { useState, useEffect, useMemo } from "react";
import { Organization, SkyltIdeSuggestion } from '../types';
import { generateSkyltIdeas } from '../services/geminiService';
import { useToast } from '../context/ToastContext';
import { PrimaryButton } from './Buttons';
import { StyledInput } from './Forms';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { MicrophoneIcon, SparklesIcon } from './icons';
import { ThinkingDots } from './HelpBot';

interface AIIdeaGeneratorProps {
  onIdeaSelect: (idea: SkyltIdeSuggestion) => void;
  isLoading: boolean;
  organization: Organization;
}

const businessTypeExamples: { [key: string]: string } = {
  "Café": "Ex: Nybakat till helgen",
  "Restaurang": "Ex: Dagens luncherbjudande",
  "Gym/Hälsa": "Ex: Fredagspass med energi",
  "Butik": "Ex: Nyheter i höstkollektionen",
  "Skönhet": "Ex: Höstens hudvårdstips",
  "Spa": "Ex: Helgens relaxerbjudande",
  "Event": "Ex: Inbjudan till vår After Work",
  "Företag/Kontor": "Ex: Vi söker nya kollegor",
  "Skola": "Ex: Öppet hus på måndag",
  "Förening": "Ex: Stöd vår nästa matchdag",
  "Standard": "Ex: Erbjudande på kanelbullar eller Ny yogaklass på onsdagar"
};

const SkeletonCard = () => (
  <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-slate-800/50 animate-pulse space-y-3">
    <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
    <div className="space-y-2">
      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded" />
      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-5/6" />
    </div>
    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded w-1/2" />
      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded w-1/3" />
    </div>
  </div>
);

const AIIdeaGenerator: React.FC<AIIdeaGeneratorProps> = ({ onIdeaSelect, isLoading, organization }) => {
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<SkyltIdeSuggestion[]>([]);
  const [cooldown, setCooldown] = useState(0);
  const { showToast } = useToast();
  const { isListening, transcript, error: speechError, startListening, stopListening, browserSupportsSpeechRecognition } = useSpeechRecognition();

  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    if (speechError) {
      showToast({ message: `Röstigenkänning misslyckades: ${speechError}`, type: 'error' });
    }
  }, [speechError, showToast]);

  // Handle cooldown countdown
  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
        timer = setInterval(() => {
            setCooldown(prev => prev - 1);
        }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const placeholderText = useMemo(() => {
    const businessTypes = organization?.businessType;
    if (businessTypes && businessTypes.length > 0) {
      for (const type of businessTypes) {
        const cleanType = type.startsWith('Annat: ') ? 'Annat' : type;
        if (businessTypeExamples[cleanType]) {
          return businessTypeExamples[cleanType];
        }
      }
    }
    return businessTypeExamples.Standard;
  }, [organization]);

  const generateIdeas = async () => {
    const textToGenerate = input.trim();
    if (!textToGenerate) {
        showToast({ message: "Skriv ett nyckelord för att få idéer.", type: 'info'});
        return;
    };
    
    setIsGenerating(true);
    setSuggestions([]);

    try {
      const ideas = await generateSkyltIdeas(textToGenerate, organization);
      setSuggestions(ideas);
      setCooldown(10); // Start 10s cooldown
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Något gick fel – kunde inte hämta idéer just nu.";
      showToast({ message, type: 'error' });
      setCooldown(5); // Shorter cooldown on error
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isGenerating && !isLoading && cooldown === 0) {
        e.preventDefault();
        generateIdeas();
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
  
  const handleSelectSuggestion = (suggestion: SkyltIdeSuggestion) => {
      onIdeaSelect(suggestion);
  };

  return (
    <div className="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
            Har du idétorka? Skriv ett nyckelord så hjälper AI:n dig med förslag.
        </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-grow">
          <StyledInput
            type="text"
            placeholder={placeholderText}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating || isLoading || cooldown > 0}
            className="pr-12"
          />
          <button
              type="button"
              onClick={handleMicClick}
              disabled={isGenerating || isLoading || cooldown > 0}
              className={`absolute inset-y-0 right-0 flex items-center px-3 transition-colors rounded-r-lg ${
                  isListening
                  ? 'bg-red-500/20 text-red-500 animate-pulse'
                  : 'text-slate-400 hover:text-primary'
              }`}
              title="Använd röstinmatning"
              >
              <MicrophoneIcon className="h-6 w-6" />
          </button>
        </div>
        <PrimaryButton
            onClick={generateIdeas}
            loading={isGenerating}
            disabled={isLoading || cooldown > 0}
            className="bg-purple-600 hover:bg-purple-500 flex-grow shadow-lg shadow-purple-500/20"
        >
            {isGenerating ? "Skapar..." : (
              <span className="flex items-center gap-2">
                <SparklesIcon className="w-5 h-5" />
                {cooldown > 0 ? `Väntar... (${cooldown}s)` : "Hitta på idéer"}
              </span>
            )}
        </PrimaryButton>
      </div>

      {isGenerating && (
        <div className="mt-4 space-y-3 animate-fade-in">
          <div className="flex items-center gap-2 text-sm font-semibold text-purple-600 dark:text-purple-400">
            <ThinkingDots />
            <span>Skylie letar efter kreativa idéer...</span>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
          <div className="mt-4 space-y-3 animate-fade-in">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Välj en idé för att fylla i texten nedan:</h4>
               <div className="grid md:grid-cols-3 gap-3">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-left shadow-sm hover:shadow-md transition cursor-pointer bg-white dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-primary group"
                    onClick={() => handleSelectSuggestion(s)}
                  >
                    <h5 className="font-semibold text-base mb-1 text-primary group-hover:text-purple-500 transition-colors">{s.headline}</h5>
                    <p className="text-xs mb-2 text-slate-600 dark:text-slate-300">{s.text}</p>
                    <div className="text-xs text-slate-500 dark:text-slate-400 italic mt-2 pt-2 border-t border-slate-200 dark:border-slate-700/50 space-y-1">
                        <p><strong>Visuell Idé:</strong> {s.visual.imageIdea}</p>
                        <p><strong>Stil:</strong> {s.visual.style}, {s.visual.mood}, {s.visual.colorPalette}</p>
                    </div>
                  </button>
                ))}
              </div>
          </div>
      )}
    </div>
  );
};

export default AIIdeaGenerator;
