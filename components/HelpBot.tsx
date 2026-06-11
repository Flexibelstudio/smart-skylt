
import React, { useState, useEffect } from 'react';
import { LoadingSpinnerIcon, SparklesIcon } from './icons';

interface AIStatusIndicatorProps {
  isThinking: boolean;
  statusText?: string;
}

const thinkingTexts = [
  "Skylie funderar...",
  "Letar efter inspiration...",
  "Formulerar förslag...",
  "Putsar på detaljerna...",
  "Tänker så det knakar...",
  "Skapar magi...",
  "Analyserar din stil..."
];

export const ThinkingDots: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`flex items-center space-x-1.5 ${className}`}>
    <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
    <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
    <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
  </div>
);

export const AIStatusIndicator: React.FC<AIStatusIndicatorProps> = ({ isThinking, statusText }) => {
  const [displayText, setDisplayText] = useState(statusText || thinkingTexts[0]);

  useEffect(() => {
    if (isThinking && !statusText) {
      const interval = setInterval(() => {
        setDisplayText(prev => {
          const currentIndex = thinkingTexts.indexOf(prev);
          const nextIndex = (currentIndex + 1) % thinkingTexts.length;
          return thinkingTexts[nextIndex];
        });
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isThinking, statusText]);

  if (!isThinking) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-2.5 rounded-full text-white text-sm font-bold shadow-2xl bg-purple-600/90 backdrop-blur-md border border-purple-400/30 animate-fade-in ring-4 ring-purple-500/20">
      <SparklesIcon className="h-5 w-5 text-yellow-300 animate-pulse" />
      <span>{statusText || displayText}</span>
      <ThinkingDots className="text-purple-200" />
    </div>
  );
};
