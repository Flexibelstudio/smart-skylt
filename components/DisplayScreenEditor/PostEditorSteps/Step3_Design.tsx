
import React, { useMemo, useState } from 'react';
import { DisplayPost, Organization, DisplayScreen } from '../../../types';
import { StyledSelect, FontSelector } from '../../Forms';
import { ToggleSwitch, TextAlignLeftIcon, TextAlignCenterIcon, TextAlignRightIcon } from '../../icons';

// --- Color Components ---

const resolveColor = (
    colorKey: string | undefined, 
    fallback: string, 
    organization?: Organization
): string => {
    if (!colorKey) return fallback;
    if (colorKey.startsWith('#')) return colorKey;
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

const ColorPaletteInput: React.FC<{
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

const ColorOpacityControl: React.FC<{
    value: string;
    onChange: (color: string) => void;
    organization: Organization;
}> = ({ value, onChange, organization }) => {
    const { color, opacity } = useMemo(() => {
        const s_value = (value || '').trim();

        let match = s_value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            return {
                color: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
                opacity: match[4] !== undefined ? parseFloat(match[4]) : 1,
            };
        }

        if (s_value.startsWith('#')) {
            const hex = s_value.slice(1);
            if (hex.length === 8) {
                const alpha = parseInt(hex.slice(6, 8), 16) / 255;
                return { color: `#${hex.slice(0, 6)}`, opacity: alpha };
            }
            if (hex.length === 6) {
                return { color: s_value, opacity: 1 };
            }
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
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            onChange(`rgba(${r}, ${g}, ${b}, ${newOpacity})`);
        }
    };
    
    return (
         <div className="space-y-2 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
            <div className="flex items-center gap-3">
                <input type="color" value={color} onChange={e => handleColorChange(e.target.value)} className="w-10 h-10 p-1 bg-white dark:bg-black rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"/>
                <div className="flex-grow">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Opacitet</label>
                    <input type="range" min="0" max="1" step="0.01" value={opacity} onChange={e => handleOpacityChange(parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer" />
                </div>
                <div className="w-16 text-center text-sm font-mono bg-white dark:bg-slate-800 p-2 rounded-md border border-slate-300 dark:border-slate-600">{Math.round(opacity * 100)}%</div>
            </div>
        </div>
    );
};

interface ElementDesignProps {
    type: 'headline' | 'body';
    post: DisplayPost;
    organization: Organization;
    onFieldChange: (field: keyof DisplayPost, value: any) => void;
}

const ElementDesignEditor: React.FC<ElementDesignProps> = ({ type, post, organization, onFieldChange }) => {
    const isHeadline = type === 'headline';
    const prefix = isHeadline ? 'headline' : 'body';
    
    // Resolve current values with fallbacks
    const fontSize = post[`${prefix}FontSize`] || (isHeadline ? '4xl' : 'lg');
    const fontFamily = post[`${prefix}FontFamily`] || organization[`${prefix}FontFamily`] || (isHeadline ? 'display' : 'sans');
    const textAlign = post[`${prefix}TextAlign`] || post.textAlign || 'center';
    const bgEnabled = post[`${prefix}BackgroundEnabled`] ?? post.textBackgroundEnabled ?? false;
    const bgColor = post[`${prefix}BackgroundColor`] || post.textBackgroundColor || 'rgba(0,0,0,0.5)';
    const textColor = post[`${prefix}TextColor`] || post.textColor || 'white';

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-gray-400 mb-1">Typsnitt</label>
                    <FontSelector value={fontFamily} onChange={font => onFieldChange(`${prefix}FontFamily` as any, font)} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-gray-400 mb-1">Storlek</label>
                    <StyledSelect value={fontSize} onChange={e => onFieldChange(`${prefix}FontSize` as any, e.target.value)}>
                        {isHeadline ? (
                            <>
                                <option value="sm">Extra Liten</option>
                                <option value="md">Liten</option>
                                <option value="lg">Mindre</option>
                                <option value="xl">Normal</option>
                                <option value="2xl">Större</option>
                                <option value="3xl">Stor</option>
                                <option value="4xl">Extra Stor</option>
                                <option value="5xl">Jättestor</option>
                                <option value="6xl">Enorm</option>
                                <option value="7xl">Gigantisk</option>
                                <option value="8xl">Massiv</option>
                                <option value="9xl">Maximal</option>
                            </>
                        ) : (
                            <>
                                <option value="xs">Extra Liten</option>
                                <option value="sm">Liten</option>
                                <option value="md">Mindre</option>
                                <option value="lg">Normal</option>
                                <option value="xl">Större</option>
                                <option value="2xl">Stor</option>
                                <option value="3xl">Extra Stor</option>
                            </>
                        )}
                    </StyledSelect>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Justering</label>
                <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900/50 rounded-lg w-fit border border-slate-200 dark:border-slate-700">
                    {[
                        { id: 'left', icon: <TextAlignLeftIcon /> },
                        { id: 'center', icon: <TextAlignCenterIcon /> },
                        { id: 'right', icon: <TextAlignRightIcon /> }
                    ].map(opt => (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => onFieldChange(`${prefix}TextAlign` as any, opt.id)}
                            className={`p-2.5 rounded-md transition-all ${textAlign === opt.id ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            {opt.icon}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ColorPaletteInput 
                    label="Textfärg" 
                    value={textColor} 
                    onChange={(color: string) => onFieldChange(`${prefix}TextColor` as any, color)} 
                    organization={organization} 
                />
                <div>
                     <ToggleSwitch label="Textbakgrund" checked={bgEnabled} onChange={c => onFieldChange(`${prefix}BackgroundEnabled` as any, c)} />
                     {bgEnabled && (
                        <div className="mt-2">
                             <ColorOpacityControl value={bgColor} onChange={(c: string) => onFieldChange(`${prefix}BackgroundColor` as any, c)} organization={organization} />
                        </div>
                     )}
                </div>
            </div>
        </div>
    );
};

export const Step3_Design: React.FC<{
    post: DisplayPost;
    onPostChange: (updatedPost: DisplayPost) => void;
    organization: Organization;
    screen: DisplayScreen;
}> = ({ post, onPostChange, organization, screen }) => {
    const [activeTab, setActiveTab] = useState<'general' | 'headline' | 'body'>('headline');

    const handleFieldChange = (field: keyof DisplayPost, value: any) => {
        onPostChange({ ...post, [field]: value });
    };

    return (
        <div className="space-y-6">
            <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide">
                <button
                    onClick={() => setActiveTab('headline')}
                    className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'headline' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    Rubrik
                </button>
                <button
                    onClick={() => setActiveTab('body')}
                    className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'body' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    Brödtext
                </button>
                <button
                    onClick={() => setActiveTab('general')}
                    className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'general' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    Bakgrund
                </button>
            </div>

            {activeTab === 'headline' && (
                <ElementDesignEditor type="headline" post={post} organization={organization} onFieldChange={handleFieldChange} />
            )}

            {activeTab === 'body' && (
                <ElementDesignEditor type="body" post={post} organization={organization} onFieldChange={handleFieldChange} />
            )}

            {activeTab === 'general' && (
                <div className="space-y-6 animate-fade-in">
                    <ColorPaletteInput label="Övergripande Bakgrundsfärg" value={post.backgroundColor || 'black'} onChange={(color: string) => handleFieldChange('backgroundColor', color)} organization={organization} />
                    
                    <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <h4 className="font-semibold text-slate-900 dark:text-white">Media-effekter</h4>
                        <ToggleSwitch label="Toning över bild/video" checked={post.imageOverlayEnabled ?? false} onChange={c => handleFieldChange('imageOverlayEnabled', c)} />
                        {post.imageOverlayEnabled && (
                            <div className="pl-4">
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Toningsfärg & opacitet</label>
                                <ColorOpacityControl value={post.imageOverlayColor || 'rgba(0, 0, 0, 0.5)'} onChange={(c: string) => handleFieldChange('imageOverlayColor', c)} organization={organization} />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
