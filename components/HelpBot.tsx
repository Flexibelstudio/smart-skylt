import React from 'react';
import { LoadingSpinnerIcon } from './icons';

interface AIStatusIndicatorProps {
  isThinking: boolean;
  statusText?: string;
}

export const AIStatusIndicator: React.FC<AIStatusIndicatorProps> = ({ isThinking, statusText }) => {
  if (!isThinking) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-semibold shadow-lg bg-purple-600/90 backdrop-blur-sm animate-fade-in">
      <LoadingSpinnerIcon className="h-5 w-5" />
      {statusText || 'AI arbetar...'}
    </div>
  );
};
