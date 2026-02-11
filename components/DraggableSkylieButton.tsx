
import React from 'react';
import { useAssistantProfile } from '../hooks/useAssistantProfile';

// Komponentens props
interface DraggableSkylieButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export const DraggableSkylieButton: React.FC<DraggableSkylieButtonProps> = ({ isOpen, onClick }) => {
  const assistantProfile = useAssistantProfile();

  return (
    <button
      onClick={onClick}
      className={`fixed bottom-6 right-6 w-20 h-20 rounded-full shadow-lg flex items-center justify-center z-40 overflow-hidden 
      transition-transform duration-200 ease-in-out cursor-pointer hover:scale-105 active:scale-95
      ${isOpen ? 'bg-slate-700 hover:bg-slate-600' : 'bg-blue-600 hover:bg-blue-500'}`}
      aria-label={isOpen ? "Stäng AI-assistent" : "Öppna AI-assistent & Support"}
      title="Klicka för att chatta med Skylie"
    >
      {isOpen ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-10 w-10 text-white">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <img src={assistantProfile.avatarUrl} alt={assistantProfile.name} className="w-full h-full object-cover pointer-events-none" />
      )}
    </button>
  );
};
