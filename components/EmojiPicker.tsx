import React from 'react';

interface EmojiPickerProps {
    onSelect: (emoji: string) => void;
    onClose: () => void;
    className?: string;
}

const EMOJI_CATEGORIES = [
    {
        title: 'Uppmärksamhet',
        emojis: ['👉', '👈', '👇', '☝️', '❗', '❕', '🔥', '✨', '⭐', '💥', '🎯', '📣', '🔔']
    },
    {
        title: 'Känslor',
        emojis: ['😀', '😊', '😍', '🤩', '😎', '🥳', '👍', '💪', '🙌', '❤️', '💚', '🧡']
    },
    {
        title: 'Handel',
        emojis: ['🏷️', '💰', '💸', '🛒', '🛍️', '🎁', '🎉', '📦', '⚡', '🆕', '✅', '📈']
    },
    {
        title: 'Mat & dryck',
        emojis: ['☕', '🍰', '🥐', '🍕', '🍔', '🥗', '🍦', '🍷', '🍺', '🥂']
    },
    {
        title: 'Säsong',
        emojis: ['☀️', '🌸', '🍂', '❄️', '🎄', '🎃', '🐣', '🎓', '💝', '🇸🇪']
    },
    {
        title: 'Övrigt',
        emojis: ['🏠', '🚗', '💇', '💆', '🏋️', '🐶', '🌟', '🕐', '📍', '✂️']
    }
];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onClose, className = '' }) => {
    return (
        <>
            {/* Overlay to catch clicks outside */}
            <div 
                className="fixed inset-0 z-40" 
                onClick={onClose} 
            />
            
            {/* Emoji Picker Popover */}
            <div 
                className={`absolute z-50 w-72 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-3 animate-fade-in text-slate-800 dark:text-slate-100 ${className}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-700">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Välj emoji</span>
                    <button 
                        type="button"
                        onClick={onClose} 
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm leading-none p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        title="Stäng"
                    >
                        ✕
                    </button>
                </div>

                {EMOJI_CATEGORIES.map((category) => (
                    <div key={category.title} className="space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {category.title}
                        </div>
                        <div className="grid grid-cols-6 gap-1">
                            {category.emojis.map((emoji) => (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => onSelect(emoji)}
                                    className="text-2xl p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-transform active:scale-125 flex items-center justify-center cursor-pointer select-none"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
};
