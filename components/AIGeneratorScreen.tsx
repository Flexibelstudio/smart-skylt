import React, { useState, useEffect, useMemo } from "react";
import { Organization, SkyltIdeSuggestion } from '../types';
import { generateSkyltIdeas } from '../services/geminiService';
import { useToast } from '../context/ToastContext';
import { PrimaryButton } from './Buttons';
import { StyledInput } from './Forms';

interface AIIdeaGeneratorProps {
  initialInput: string;
  onIdeaSelect: (ideaText: string) => void;
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


const AIIdeaGenerator: React.FC<AIIdeaGeneratorProps> = ({ initialInput, onIdeaSelect, isLoading, organization }) => {
  const [input, setInput] = useState(initialInput);
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<SkyltIdeSuggestion[]>([]);
  const { showToast } = useToast();

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

  useEffect(() => {
    setInput(initialInput);
  }, [initialInput]);

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
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Något gick fel – kunde inte hämta idéer just nu.";
      showToast({ message, type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isGenerating && !isLoading) {
        e.preventDefault();
        generateIdeas();
    }
  };
  
  const handleSelectSuggestion = (suggestion: SkyltIdeSuggestion) => {
      const combinedText = `${suggestion.headline}\n${suggestion.text}`;
      onIdeaSelect(combinedText);
  };

  return (
    <div className="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
            Har du idétorka? Skriv ett nyckelord så hjälper AI:n dig med förslag.
        </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <StyledInput
          type="text"
          placeholder={placeholderText}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating || isLoading}
        />
        <PrimaryButton
          onClick={generateIdeas}
          loading={isGenerating}
          disabled={isLoading}
          className="bg-purple-600 hover:bg-purple-500"
        >
          {isGenerating ? "Skapar..." : "Hitta på idéer"}
        </PrimaryButton>
      </div>

      {suggestions.length > 0 && (
          <div className="mt-4 space-y-3 animate-fade-in">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Välj en idé för att fylla i texten nedan:</h4>
               <div className="grid md:grid-cols-3 gap-3">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-left shadow-sm hover:shadow-md transition cursor-pointer bg-white dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-primary"
                    onClick={() => handleSelectSuggestion(s)}
                  >
                    <h5 className="font-semibold text-base mb-1 text-primary">{s.headline}</h5>
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