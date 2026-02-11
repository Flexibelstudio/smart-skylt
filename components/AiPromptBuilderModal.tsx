import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { PrimaryButton, SecondaryButton } from './Buttons';
import { StyledInput } from './Forms';
import { useToast } from '../context/ToastContext';
import { generateAutomationPrompt } from '../services/geminiService';
import { LoadingSpinnerIcon, SparklesIcon } from './icons';

interface AiPromptBuilderModalProps {
  onClose: () => void;
  onGenerate: (prompt: string) => void;
}

export const AiPromptBuilderModal: React.FC<AiPromptBuilderModalProps> = ({ onClose, onGenerate }) => {
  const [step, setStep] = useState<'form' | 'generating' | 'result'>('form');
  const [formState, setFormState] = useState({
    goal: '',
    tone: '',
    mentions: '',
    avoids: '',
  });
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [error, setError] = useState('');
  const { showToast } = useToast();

  const handleInputChange = (field: keyof typeof formState, value: string) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerate = async () => {
    if (!formState.goal.trim()) {
      showToast({ message: "Du måste ange ett mål.", type: 'info' });
      return;
    }
    setStep('generating');
    setError('');
    try {
      const prompt = await generateAutomationPrompt(formState);
      setGeneratedPrompt(prompt);
      setStep('result');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Kunde inte generera prompt.";
      setError(errorMessage);
      setStep('form'); // Go back to form on error
    }
  };
  
  const handleUsePrompt = () => {
    onGenerate(generatedPrompt);
  };

  const portalRoot = document.getElementById('modal-root') || document.body;

  const renderContent = () => {
    switch (step) {
      case 'generating':
        return (
          <div className="text-center py-12">
            <LoadingSpinnerIcon className="h-10 w-10 text-primary mx-auto" />
            <p className="mt-4 text-slate-600 dark:text-slate-300">AI:n bygger ett proffsigt kommando...</p>
          </div>
        );
      case 'result':
        return (
          <div>
            <h3 className="font-bold text-lg mb-2">Här är ditt AI-förbättrade kommando:</h3>
            <textarea
              readOnly
              value={generatedPrompt}
              rows={6}
              className="w-full bg-slate-100 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-300 dark:border-slate-600"
            />
            <div className="flex justify-end gap-4 mt-4">
                <SecondaryButton onClick={() => setStep('form')}>Justera</SecondaryButton>
                <PrimaryButton onClick={handleUsePrompt}>Använd detta kommando</PrimaryButton>
            </div>
          </div>
        );
      case 'form':
      default:
        return (
          <form onSubmit={e => { e.preventDefault(); handleGenerate(); }}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">1. Vad är huvudsyftet eller målet? (Viktigast)</label>
                <StyledInput type="text" value={formState.goal} onChange={e => handleInputChange('goal', e.target.value)} placeholder="T.ex. Få fler att köpa vår nya islatte" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">2. Vilken känsla eller ton ska innehållet ha?</label>
                <StyledInput type="text" value={formState.tone} onChange={e => handleInputChange('tone', e.target.value)} placeholder="T.ex. Somrig, uppfriskande och energisk" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">3. Finns det något specifikt som måste nämnas?</label>
                <StyledInput type="text" value={formState.mentions} onChange={e => handleInputChange('mentions', e.target.value)} placeholder="T.ex. Gjord på ekologiska bönor, finns med havremjölk" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">4. Finns det något som absolut inte ska nämnas?</label>
                <StyledInput type="text" value={formState.avoids} onChange={e => handleInputChange('avoids', e.target.value)} placeholder="T.ex. Pris, kalorier" />
              </div>
            </div>
            {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
            <div className="flex justify-end gap-4 mt-6">
                <SecondaryButton type="button" onClick={onClose}>Avbryt</SecondaryButton>
                <PrimaryButton type="submit" disabled={!formState.goal.trim()}>
                    <SparklesIcon className="h-5 w-5 mr-2" />
                    Skapa kommando
                </PrimaryButton>
            </div>
          </form>
        );
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[51] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-2">AI Prompt-hjälp</h2>
        <p className="text-slate-600 dark:text-slate-300 mb-6">Svara på frågorna nedan så hjälper AI:n dig att skriva ett tydligt och effektivt kommando (prompt).</p>
        {renderContent()}
      </div>
    </div>,
    portalRoot
  );
};
