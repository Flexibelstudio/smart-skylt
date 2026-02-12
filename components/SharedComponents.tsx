
import React, { useMemo } from 'react';
import { Organization } from '../types';

export const resolveColor = (
    colorKey: string | undefined, 
    fallback: string, 
    organization?: Organization
): string => {
    if (!colorKey) return fallback;
    if (colorKey.startsWith('#') || colorKey.startsWith('rgba')) return colorKey;
    switch (colorKey) {
        case 'white': return '#ffffff';
        case 'black': return '#000000';
        case 'primary': return organization?.primaryColor || '#14b8a6';
        case 'secondary': return organization?.secondaryColor || '#f97316';
        case 'tertiary': return organization?.tertiaryColor || '#3b82f6';
        case 'accent': return organization?.accentColor || '#ec4899';
        default: return colorKey; 
    }
};

export const ColorPaletteInput: React.FC<{
    label: string;
    value: string;
    onChange: (color: string) => void;
    organization: Organization;
}> = ({ label, value, onChange, organization }) => {
    const colorOptions = useMemo(() => [
        { name: 'Primär', keyword: 'primary', hex: organization.primaryColor || '#14b8a6' },
        { name: 'Sekundär', keyword: 'secondary', hex: organization.secondaryColor || '#f97316' },
        { name: 'Tertiär', keyword: 'tertiary', hex: organization.tertiaryColor || '#3b82f6' },
        { name: 'Accent', keyword: 'accent', hex: organization.accentColor || '#ec4899' },
        { name: 'Svart', keyword: 'black', hex: '#000000' },
        { name: 'Vit', keyword: 'white', hex: '#ffffff' },
    ], [organization]);

    const hexValueForInput = resolveColor(value, '#000000', organization);

    return (
        <div>
            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
            <div className="flex items-center gap-2">
                <input 
                    type="color" 
                    value={hexValueForInput} 
                    onChange={e => onChange(e.target.value)} 
                    className="w-12 h-12 p-1 bg-white dark:bg-black rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                />
                <div className="flex-grow grid grid-cols-3 gap-1">
                    {colorOptions.map(opt => (
                        <button 
                            key={opt.keyword} 
                            type="button" 
                            onClick={() => onChange(opt.keyword)} 
                            className={`h-6 rounded transition-all ${value === opt.keyword ? 'ring-2 ring-offset-2 ring-offset-slate-800 ring-primary' : ''}`} 
                            style={{ backgroundColor: opt.hex }} 
                            title={opt.name} 
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export const ColorOpacityControl: React.FC<{
    value: string;
    onChange: (color: string) => void;
    organization: Organization;
}> = ({ value, onChange, organization }) => {
    const { color, opacity } = useMemo(() => {
        const s_value = (value || '').trim();
        let match = s_value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
            return {
                color: `#${toHex(parseInt(match[1]))}${toHex(parseInt(match[2]))}${toHex(parseInt(match[3]))}`,
                opacity: match[4] !== undefined ? parseFloat(match[4]) : 1,
            };
        }
        if (s_value.startsWith('#')) {
            return { color: s_value.slice(0, 7), opacity: 1 };
        }
        return { color: resolveColor(s_value, '#000000', organization), opacity: 0.5 };
    }, [value, organization]);

    const handleColorChange = (newColor: string) => {
        const r = parseInt(newColor.slice(1, 3), 16);
        const g = parseInt(newColor.slice(3, 5), 16);
        const b = parseInt(newColor.slice(5, 7), 16);
        onChange(`rgba(${r}, ${g}, ${b}, ${opacity})`);
    };

    const handleOpacityChange = (newOpacity: number) => {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        if (!isNaN(r)) onChange(`rgba(${r}, ${g}, ${b}, ${newOpacity})`);
    };
    
    return (
         <div className="space-y-2 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-600 mt-2">
            <div className="flex items-center gap-3">
                <input type="color" value={color} onChange={e => handleColorChange(e.target.value)} className="w-8 h-8 p-0.5 bg-white dark:bg-black rounded border border-slate-300 dark:border-slate-600 cursor-pointer"/>
                <div className="flex-grow">
                    <label className="block text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mb-0.5">Opacitet (Toning)</label>
                    <input type="range" min="0" max="1" step="0.05" value={opacity} onChange={e => handleOpacityChange(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer" />
                </div>
                <div className="w-10 text-center text-xs font-mono text-slate-500">{Math.round(opacity * 100)}%</div>
            </div>
        </div>
    );
};
