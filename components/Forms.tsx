import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Tag } from '../types';
import { ChevronDownIcon } from './icons';

export const StyledInput: React.FC<{value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; className?: string; [x:string]: any;}> = 
    ({value, onChange, className, ...props}) => (
    <input value={value} onChange={onChange} {...props} className={`w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors ${className || ''}`}/>
);

export const StyledSelect: React.FC<{value: any; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode; [x:string]: any;}> = 
    ({value, onChange, children, ...props}) => (
    <select value={value} onChange={onChange} {...props} className="w-full bg-slate-100 dark:bg-slate-200 text-black p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors h-[2.875rem]">
        {children}
    </select>
);

const fontGroups = [
  {
    label: "Rekommenderade",
    options: [
      { value: 'sans', label: 'Inter (Standard)', family: 'Inter, sans-serif' },
      { value: 'display', label: 'Poppins (Display)', family: 'Poppins, sans-serif' },
      { value: 'adscript', label: 'Lobster (Reklam)', family: 'Lobster, cursive' },
      { value: 'script', label: 'Satisfy (Script)', family: 'Satisfy, cursive' },
    ],
  },
  {
    label: "Sans Serif",
    options: [
      { value: 'roboto', label: 'Roboto', family: 'Roboto, sans-serif' },
      { value: 'open-sans', label: 'Open Sans', family: '"Open Sans", sans-serif' },
      { value: 'lato', label: 'Lato', family: 'Lato, sans-serif' },
      { value: 'montserrat', label: 'Montserrat', family: 'Montserrat, sans-serif' },
      { value: 'source-sans-pro', label: 'Source Sans Pro', family: '"Source Sans Pro", sans-serif' },
      { value: 'nunito', label: 'Nunito', family: 'Nunito, sans-serif' },
      { value: 'raleway', label: 'Raleway', family: 'Raleway, sans-serif' },
      { value: 'oswald', label: 'Oswald', family: 'Oswald, sans-serif' },
      { value: 'ubuntu', label: 'Ubuntu', family: 'Ubuntu, sans-serif' },
      { value: 'manrope', label: 'Manrope', family: 'Manrope, sans-serif' },
      { value: 'fira-sans', label: 'Fira Sans', family: '"Fira Sans", sans-serif' },
      { value: 'dm-sans', label: 'DM Sans', family: '"DM Sans", sans-serif' },
      { value: 'work-sans', label: 'Work Sans', family: '"Work Sans", sans-serif' },
      { value: 'quicksand', label: 'Quicksand', family: 'Quicksand, sans-serif' },
      { value: 'josefin-sans', label: 'Josefin Sans', family: '"Josefin Sans", sans-serif' },
      { value: 'exo-2', label: 'Exo 2', family: '"Exo 2", sans-serif' },
      { value: 'cabin', label: 'Cabin', family: 'Cabin, sans-serif' },
    ],
  },
  {
    label: "Serif",
    options: [
      { value: 'merriweather', label: 'Merriweather', family: 'Merriweather, serif' },
      { value: 'playfair-display', label: 'Playfair Display', family: '"Playfair Display", serif' },
      { value: 'lora', label: 'Lora', family: 'Lora, serif' },
      { value: 'libre-baskerville', label: 'Libre Baskerville', family: '"Libre Baskerville", serif' },
      { value: 'eb-garamond', label: 'EB Garamond', family: '"EB Garamond", serif' },
      { value: 'cormorant-garamond', label: 'Cormorant Garamond', family: '"Cormorant Garamond", serif' },
      { value: 'pt-serif', label: 'PT Serif', family: '"PT Serif", serif' },
    ],
  },
  {
    label: "System",
    options: [
      { value: 'helvetica-neue', label: 'Helvetica Neue', family: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
      { value: 'arial', label: 'Arial', family: 'Arial, sans-serif' },
      { value: 'georgia', label: 'Georgia', family: 'Georgia, serif' },
      { value: 'times-new-roman', label: 'Times New Roman', family: '"Times New Roman", Times, serif' },
    ],
  },
];

export const FontSelector: React.FC<{
  value: Tag['fontFamily'];
  onChange: (value: Tag['fontFamily']) => void;
}> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allOptions = useMemo(() => fontGroups.flatMap(g => g.options), []);
  const selectedOption = useMemo(() => allOptions.find(o => o.value === value) || allOptions[0], [value, allOptions]);

  const handleToggle = () => setIsOpen(prev => !prev);

  const handleSelect = (newValue: Tag['fontFamily']) => {
    onChange(newValue);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors h-[2.875rem] flex justify-between items-center text-left"
      >
        <span style={{ fontFamily: selectedOption.family }} className="text-base text-slate-900 dark:text-white">
          {selectedOption.label}
        </span>
        <ChevronDownIcon className={`h-5 w-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
          {fontGroups.map(group => (
            <div key={group.label} className="py-1">
              {group.label && (
                <h3 className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {group.label}
                </h3>
              )}
              {group.options.map(option => (
                <button
                  key={option.value}
                  onClick={() => handleSelect(option.value as Tag['fontFamily'])}
                  className={`w-full text-left px-4 py-2 text-base transition-colors text-slate-900 dark:text-white ${value === option.value ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <span style={{ fontFamily: option.family }}>{option.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};