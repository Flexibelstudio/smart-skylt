
import React from 'react';
import { DisplayPost, DisplayScreen, CollageItem } from '../../../types';
import { LayoutTextOnlyIcon, LayoutImageFullscreenIcon, VideoCameraIcon, LayoutImageLeftIcon, LayoutImageRightIcon, LayoutCollageIcon, LayoutWebpageIcon, InstagramIcon, LayoutImageTopIcon, LayoutImageBottomIcon } from '../../icons';

// --- Layout Selectors ---
const LayoutButton: React.FC<{
    label: string;
    icon: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
}> = ({ label, icon, isActive, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border-2 text-center transition-all h-28 ${isActive ? 'bg-primary/10 border-primary text-primary shadow-sm' : 'bg-slate-50 dark:bg-slate-700/50 border-transparent hover:border-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
    >
        <div className="h-10 w-10">{icon}</div>
        <span className="text-xs font-semibold">{label}</span>
    </button>
);

const LayoutSelector: React.FC<{
    currentLayout: DisplayPost['layout'];
    onChange: (layout: DisplayPost['layout']) => void;
    screen: DisplayScreen;
}> = ({ currentLayout, onChange, screen }) => {
    const isPortrait = screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4';

    const layouts: { id: DisplayPost['layout']; label: string; icon: React.ReactNode; }[] = [
        { id: 'text-only', label: 'Endast text', icon: <LayoutTextOnlyIcon className="w-full h-full" /> },
        { id: 'image-fullscreen', label: 'Helskärmsbild', icon: <LayoutImageFullscreenIcon className="w-full h-full" /> },
        { id: 'video-fullscreen', label: 'Helskärmsvideo', icon: <VideoCameraIcon className="w-full h-full" /> },
        { 
            id: 'image-left', 
            label: isPortrait ? 'Bild Över' : 'Bild Vänster', 
            icon: isPortrait ? <LayoutImageTopIcon className="w-full h-full" /> : <LayoutImageLeftIcon className="w-full h-full" /> 
        },
        { 
            id: 'image-right', 
            label: isPortrait ? 'Bild Under' : 'Bild Höger', 
            icon: isPortrait ? <LayoutImageBottomIcon className="w-full h-full" /> : <LayoutImageRightIcon className="w-full h-full" /> 
        },
        { id: 'collage', label: 'Collage', icon: <LayoutCollageIcon className="w-full h-full" /> },
        { id: 'webpage', label: 'Webbsida', icon: <LayoutWebpageIcon className="w-full h-full" /> },
        { id: 'instagram-latest', label: 'Instagram (Inlägg)', icon: <InstagramIcon className="w-full h-full" /> },
    ];

    return (
        <div>
            <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Välj grundlayout</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Detta bestämmer hur mycket utrymme du har för text och bild.</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {layouts.map(l => (
                    <LayoutButton key={l.id} label={l.label} icon={l.icon} isActive={currentLayout === l.id} onClick={() => onChange(l.id)} />
                ))}
            </div>
        </div>
    );
};

const collageLayouts = {
    landscape: ['landscape-1-2', 'landscape-3-horiz', 'landscape-4-grid', 'landscape-2-horiz', 'landscape-2-vert'],
    portrait: ['portrait-1-2', 'portrait-3-vert', 'portrait-4-grid', 'portrait-2-horiz', 'portrait-2-vert'],
};

const CollageLayoutSelector: React.FC<{
    currentLayout: DisplayPost['collageLayout'];
    onChange: (layout: DisplayPost['collageLayout']) => void;
    aspectRatio: DisplayScreen['aspectRatio'];
}> = ({ currentLayout, onChange, aspectRatio }) => {
    const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
    const availableLayouts = isPortrait ? collageLayouts.portrait : collageLayouts.landscape;
    
    const getLayoutVisual = (layout: string) => {
        const gap = 'gap-px'; // 1px gap for thin lines
        const Block = () => <div className="bg-slate-300 dark:bg-slate-600 w-full h-full" />;

        // Landscape layouts
        if (layout === 'landscape-1-2') return <div className={`grid grid-cols-2 grid-rows-2 h-full ${gap}`}><div className="row-span-2 bg-slate-400 dark:bg-slate-500" /><Block /><Block /></div>;
        if (layout === 'landscape-3-horiz') return <div className={`grid grid-cols-3 h-full ${gap}`}><Block /><Block /><Block /></div>;
        if (layout === 'landscape-4-grid') return <div className={`grid grid-cols-2 grid-rows-2 h-full ${gap}`}><Block /><Block /><Block /><Block /></div>;
        if (layout === 'landscape-2-horiz') return <div className={`grid grid-cols-2 h-full ${gap}`}><Block /><Block /></div>;
        if (layout === 'landscape-2-vert') return <div className={`grid grid-rows-2 h-full ${gap}`}><Block /><Block /></div>;
        
        // Portrait layouts
        if (layout === 'portrait-1-2') return <div className={`grid grid-cols-2 grid-rows-2 h-full ${gap}`}><div className="col-span-2 bg-slate-400 dark:bg-slate-500" /><Block /><Block /></div>;
        if (layout === 'portrait-3-vert') return <div className={`grid grid-rows-3 h-full ${gap}`}><Block /><Block /><Block /></div>;
        if (layout === 'portrait-4-grid') return <div className={`grid grid-cols-2 grid-rows-2 h-full ${gap}`}><Block /><Block /><Block /><Block /></div>;
        if (layout === 'portrait-2-horiz') return <div className={`grid grid-cols-2 h-full ${gap}`}><Block /><Block /></div>;
        if (layout === 'portrait-2-vert') return <div className={`grid grid-rows-2 h-full ${gap}`}><Block /><Block /></div>;
        
        return <div className="w-full h-full bg-black" />;
    };

    return (
        <div className="p-4 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 animate-fade-in">
            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Välj collage-stil</label>
            <div className="grid grid-cols-5 gap-3">
                {availableLayouts.map(layout => (
                    <button
                        key={layout}
                        type="button"
                        onClick={() => onChange(layout as any)}
                        className={`aspect-video p-1 rounded-md border-2 bg-white dark:bg-slate-800 transition-all ${currentLayout === layout ? 'border-primary shadow-sm' : 'border-slate-200 dark:border-slate-600 hover:border-slate-400'}`}
                        title={layout}
                    >
                       {getLayoutVisual(layout)}
                    </button>
                ))}
            </div>
        </div>
    );
};


export const Step1_Layout: React.FC<{
    post: DisplayPost;
    onPostChange: (updatedPost: DisplayPost) => void;
    screen: DisplayScreen;
}> = ({ post, onPostChange, screen }) => {

    const handleLayoutChange = (newLayout: DisplayPost['layout']) => {
        const updates: Partial<DisplayPost> = { layout: newLayout };
        const currentCollageItems = post.collageItems || [];

        // 1. Logic for switching TO Collage
        // We want to map the single main image/video into the first slot of the collage
        // to preserve what the user was just looking at.
        if (newLayout === 'collage' && post.layout !== 'collage') {
            if (post.imageUrl || post.videoUrl) {
                const firstItem: CollageItem = {
                    id: currentCollageItems[0]?.id || `item-${Date.now()}`,
                    type: post.videoUrl ? 'video' : 'image',
                    imageUrl: post.imageUrl,
                    videoUrl: post.videoUrl,
                    isAiGeneratedImage: post.isAiGeneratedImage,
                    isAiGeneratedVideo: post.isAiGeneratedVideo,
                    mediaPositionX: post.mediaPositionX,
                    mediaPositionY: post.mediaPositionY
                };
                
                // Preserve existing items in slots 2+, overwrite slot 1 with current main media
                const newItems = [firstItem, ...currentCollageItems.slice(1)];
                updates.collageItems = newItems;
            }
        }

        // 2. Logic for switching FROM Collage TO Single Media (Image/Video layouts)
        const isSingleMediaTarget = ['image-fullscreen', 'video-fullscreen', 'image-left', 'image-right'].includes(newLayout);
        if (post.layout === 'collage' && isSingleMediaTarget) {
            // Take the first item from collage and promote it to main media
            if (currentCollageItems.length > 0) {
                const firstItem = currentCollageItems[0];
                updates.imageUrl = firstItem.imageUrl;
                updates.videoUrl = firstItem.videoUrl;
                updates.isAiGeneratedImage = firstItem.isAiGeneratedImage;
                updates.isAiGeneratedVideo = firstItem.isAiGeneratedVideo;
                updates.mediaPositionX = firstItem.mediaPositionX;
                updates.mediaPositionY = firstItem.mediaPositionY;
            }
        }

        // NOTE: We deliberately DO NOT clear media fields when switching to 'text-only' etc.
        // This allows the user to switch layout back and forth (previewing) without losing their uploaded images.
        // The data will persist in the background unless explicitly removed.

        onPostChange({ ...post, ...updates });
    };

    return (
        <div className="space-y-6">
            <LayoutSelector currentLayout={post.layout} onChange={handleLayoutChange} screen={screen} />
            
            {post.layout === 'collage' && (
                <CollageLayoutSelector currentLayout={post.collageLayout} onChange={(layout) => onPostChange({ ...post, collageLayout: layout })} aspectRatio={screen.aspectRatio} />
            )}

            {(post.layout === 'image-left' || post.layout === 'image-right') && (
                <div className="p-4 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 animate-fade-in">
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Justera bildstorlek ({post.splitRatio || 50}%)
                    </label>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-400">Mindre bild</span>
                        <input
                            type="range"
                            min="25"
                            max="75"
                            step="5"
                            value={post.splitRatio || 50}
                            onChange={e => onPostChange({ ...post, splitRatio: parseInt(e.target.value, 10) })}
                            className="flex-grow h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <span className="text-xs text-slate-400">Större bild</span>
                    </div>
                </div>
            )}
        </div>
    );
};
