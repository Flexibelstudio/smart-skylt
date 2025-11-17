import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAssistantProfile } from '../hooks/useAssistantProfile';
import { SparklesIcon } from './icons';

// Typ för positionstillstånd
type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

// Nyckel för lokal lagring
const BUTTON_CONFIG_KEY = 'skylie-button-config';

// Komponentens props
interface DraggableSkylieButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export const DraggableSkylieButton: React.FC<DraggableSkylieButtonProps> = ({ isOpen, onClick }) => {
  const assistantProfile = useAssistantProfile();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 }); // Offset inom själva knappen

  // State för knappens visuella egenskaper
  const [isMinimized, setIsMinimized] = useState(false);
  const [minimizedSide, setMinimizedSide] = useState<'left' | 'right'>('right');
  const [corner, setCorner] = useState<Corner>('bottom-right');
  const [isInteracting, setIsInteracting] = useState(false); // För att styra övergångar

  // Ladda konfiguration från lokal lagring vid montering
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem(BUTTON_CONFIG_KEY);
      if (savedConfig) {
        const { corner: savedCorner, isMinimized: savedIsMinimized, minimizedSide: savedMinimizedSide } = JSON.parse(savedConfig);
        if (savedCorner) setCorner(savedCorner);
        if (typeof savedIsMinimized === 'boolean') setIsMinimized(savedIsMinimized);
        if (savedMinimizedSide) setMinimizedSide(savedMinimizedSide);
      }
    } catch (e) {
      console.error("Failed to load Skylie button config:", e);
    }
  }, []);

  // Spara konfiguration till lokal lagring när den ändras
  const saveConfig = useCallback(() => {
    try {
      const config = { corner, isMinimized, minimizedSide };
      localStorage.setItem(BUTTON_CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
      console.error("Failed to save Skylie button config:", e);
    }
  }, [corner, isMinimized, minimizedSide]);

  const handleDragStart = useCallback((e: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    isDraggingRef.current = false; // Sätts till true vid första rörelsen
    setIsInteracting(true);
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    dragStartPosRef.current = { x: clientX, y: clientY };

    if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        dragOffsetRef.current = { x: clientX - rect.left, y: clientY - rect.top };
    }
    
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('mouseup', handleDragEnd, { once: true });
    window.addEventListener('touchend', handleDragEnd, { once: true });
  }, []);
  
  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    if (!buttonRef.current) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    if (!isDraggingRef.current) {
        const dx = clientX - dragStartPosRef.current.x;
        const dy = clientY - dragStartPosRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) < 5) return;
        isDraggingRef.current = true;
    }

    buttonRef.current.style.left = `${clientX - dragOffsetRef.current.x}px`;
    buttonRef.current.style.top = `${clientY - dragOffsetRef.current.y}px`;
    buttonRef.current.style.transform = `scale(1.1)`;
    // Ta bort hörnklasser under dragning
    buttonRef.current.classList.remove('top-6', 'bottom-6', 'left-6', 'right-6');

  }, []);

  const handleDragEnd = useCallback((e: MouseEvent | TouchEvent) => {
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('touchmove', handleDragMove);
    
    if (!isDraggingRef.current) {
        setIsInteracting(false);
        onClick();
        return;
    }
    
    if (buttonRef.current) {
        buttonRef.current.style.transform = '';
        buttonRef.current.style.left = '';
        buttonRef.current.style.top = '';
    }

    const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
    const clientY = 'changedTouches' in e ? e.changedTouches[0].clientY : e.clientY;

    const { innerWidth, innerHeight } = window;
    const minimizeZone = 50; 

    // Minimeringslogik
    const isVerticalCenter = clientY > innerHeight * 0.25 && clientY < innerHeight * 0.75;
    if (isVerticalCenter && clientX < minimizeZone) {
      setIsMinimized(true);
      setMinimizedSide('left');
    } else if (isVerticalCenter && clientX > innerWidth - minimizeZone) {
      setIsMinimized(true);
      setMinimizedSide('right');
    } else {
      // Hörn-snapping logik
      setIsMinimized(false);
      const isTop = clientY < innerHeight / 2;
      const isLeft = clientX < innerWidth / 2;
      
      if (isTop && isLeft) setCorner('top-left');
      else if (isTop && !isLeft) setCorner('top-right');
      else if (!isTop && isLeft) setCorner('bottom-left');
      else setCorner('bottom-right');
    }

    setTimeout(() => {
        setIsInteracting(false);
        isDraggingRef.current = false;
    }, 50);

  }, [handleDragMove, onClick]);

  useEffect(() => {
    saveConfig();
  }, [corner, isMinimized, minimizedSide, saveConfig]);

  const handleUnminimize = () => {
    setIsMinimized(false);
  };

  if (isMinimized) {
    return (
      <button
        onClick={handleUnminimize}
        className={`fixed top-1/2 -translate-y-1/2 z-40 w-10 h-24 flex items-center justify-center shadow-lg transition-all duration-300 bg-blue-600 hover:bg-blue-500 text-white
        ${minimizedSide === 'right' ? 'right-0 rounded-l-full' : 'left-0 rounded-r-full'}`}
        style={{ transform: minimizedSide === 'right' ? 'translateY(-50%)' : 'translateY(-50%)' }}
        title="Visa AI-assistent"
      >
        <SparklesIcon className="w-6 h-6" />
      </button>
    );
  }

  const getCornerClasses = () => {
    switch(corner) {
      case 'top-left': return 'top-6 left-6';
      case 'top-right': return 'top-6 right-6';
      case 'bottom-left': return 'bottom-6 left-6';
      case 'bottom-right': return 'bottom-6 right-6';
    }
  };

  return (
    <button
      ref={buttonRef}
      onMouseDown={handleDragStart}
      onTouchStart={handleDragStart}
      className={`fixed w-20 h-20 rounded-full shadow-lg flex items-center justify-center z-40 overflow-hidden 
      ${getCornerClasses()} 
      ${isInteracting ? 'transition-none cursor-grabbing' : 'transition-all duration-300 ease-in-out'} 
      ${isOpen ? 'bg-slate-700 hover:bg-slate-600' : 'bg-blue-600 hover:bg-blue-500'} 
      ${!isInteracting ? 'hover:scale-105' : ''}`}
      aria-label={isOpen ? "Stäng AI-assistent" : "Öppna AI-assistent & Support"}
      title={isDraggingRef.current ? "Dra för att flytta" : (isOpen ? "Stäng AI-assistent" : "AI-assistent & Support")}
    >
      {isOpen ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-10 w-10 text-white">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <img src={assistantProfile.avatarUrl} alt={assistantProfile.name} className="w-full h-full object-cover" />
      )}
    </button>
  );
};
