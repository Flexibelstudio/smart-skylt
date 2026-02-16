
import React, { useState } from 'react';
import { DisplayPost, Organization, DisplayScreen } from '../../../types';
import { StyledSelect, FontSelector, StyledInput } from '../../Forms';
import { ToggleSwitch, TextAlignLeftIcon, TextAlignCenterIcon, TextAlignRightIcon } from '../../icons';
import { ColorPaletteInput, ColorOpacityControl, resolveColor } from '../../SharedComponents';

// --- NEW: Text Effects Control ---
const TextEffectsControl: React.FC<{
    prefix: 'headline' | 'body';
    post: DisplayPost;
    organization: Organization;
    onFieldChange: (field: keyof DisplayPost, value: any) => void;
}> = ({ prefix, post, organization, onFieldChange }) => {
    
    const shadowType = post[`${prefix}ShadowType`] || 'none';
    const shadowColor = post[`${prefix}ShadowColor`] || '#000000';
    const outlineWidth = post[`${prefix}OutlineWidth`] || 0;
    const outlineColor = post[`${prefix}OutlineColor`] || '#000000';

    return (
        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <h4 className="font-semibold text-slate-900 dark:text-white">Texteffekter</h4>
            
            {/* Shadow Section */}
            <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Skugga</label>
                <div className="flex flex-wrap gap-2 mb-3">
                    {[
                        { id: 'none', label: 'Ingen' },
                        { id: 'soft', label: '☁️ Mjuk' },
                        { id: 'hard', label: '🧱 Hård' },
                        { id: 'glow', label: '✨ Glöd' }
                    ].map(opt => (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => onFieldChange(`${prefix}ShadowType` as any, opt.id)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${shadowType === opt.id ? 'bg-white dark:bg-slate-700 border-primary text-primary shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                {shadowType !== 'none' && (
                    <div className="animate-fade-in">
                        <ColorPaletteInput 
                            label="Skuggfärg" 
                            value={shadowColor} 
                            onChange={(color) => onFieldChange(`${prefix}ShadowColor` as any, color)} 
                            organization={organization} 
                        />
                    </div>
                )}
            </div>

            {/* Outline Section */}
            <div>
                <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Kantlinje</label>
                    <span className="text-xs font-mono text-slate-400">{outlineWidth}px</span>
                </div>
                <input 
                    type="range" 
                    min="0" max="10" step="1" 
                    value={outlineWidth} 
                    onChange={e => onFieldChange(`${prefix}OutlineWidth` as any, parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-primary mb-3"
                />
                
                {outlineWidth > 0 && (
                    <div className="animate-fade-in">
                        <ColorPaletteInput 
                            label="Färg på kantlinje" 
                            value={outlineColor} 
                            onChange={(color) => onFieldChange(`${prefix}OutlineColor` as any, color)} 
                            organization={organization} 
                        />
                    </div>
                )}
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
    // Prefer fontScale if available, otherwise fallback to fontSize default mapping
    const fontScale = post[`${prefix}FontScale`];
    // Default scale: 8.0 for headline, 4.8 for body (matching renderer defaults)
    const fontSizeVal = fontScale ?? (isHeadline ? 8.0 : 4.8);
    
    const fontFamily = post[`${prefix}FontFamily`] || organization[`${prefix}FontFamily`] || (isHeadline ? 'display' : 'sans');
    const textAlign = post[`${prefix}TextAlign`] || post.textAlign || 'center';
    const bgEnabled = post[`${prefix}BackgroundEnabled`] ?? post.textBackgroundEnabled ?? false;
    const bgColor = post[`${prefix}BackgroundColor`] || post.textBackgroundColor || 'rgba(0,0,0,0.5)';
    const textColor = post[`${prefix}TextColor`] || post.textColor || 'white';

    const handleSizeChange = (val: number) => {
        onFieldChange(`${prefix}FontScale` as any, val);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-gray-400 mb-1">Typsnitt</label>
                    <FontSelector value={fontFamily} onChange={font => onFieldChange(`${prefix}FontFamily` as any, font)} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-gray-400 mb-1">Storlek</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="range"
                            min="1.0"
                            max="40.0"
                            step="0.5"
                            value={fontSizeVal}
                            onChange={(e) => handleSizeChange(parseFloat(e.target.value))}
                            className="flex-grow h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <input
                            type="number"
                            min="1.0"
                            max="40.0"
                            step="0.1"
                            value={fontSizeVal}
                            onChange={(e) => handleSizeChange(parseFloat(e.target.value))}
                            className="w-16 p-2 text-center text-sm font-mono bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-primary focus:border-primary"
                        />
                    </div>
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

            <TextEffectsControl 
                prefix={prefix} 
                post={post} 
                organization={organization} 
                onFieldChange={onFieldChange} 
            />
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
