
import React from 'react';
import { DisplayPost, DisplayScreen, CollageItem } from '../../../types';
import { LayoutTextOnlyIcon, LayoutImageFullscreenIcon, VideoCameraIcon, LayoutImageLeftIcon, LayoutImageRightIcon, LayoutCollageIcon, LayoutWebpageIcon, InstagramIcon, LayoutImageTopIcon, LayoutImageBottomIcon, HomeIcon, SparklesIcon } from '../../icons';

// --- Layout Selectors ---
const LayoutButton: React.FC<{
    label: string;
    icon: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
    badge?: string;
}> = ({ label, icon, isActive, onClick, badge }) => (
    <button
        type="button"
        onClick={onClick}
        className={`relative flex flex-col items-center justify-center gap-2.5 p-3 rounded-2xl border-2 text-center transition-all h-28 cursor-pointer ${
            isActive 
                ? 'bg-primary/[0.04] border-primary text-primary shadow-sm scale-[1.02]' 
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50/50 dark:hover:bg-slate-800/80'
        }`}
    >
        {badge && (
            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[8px] font-extrabold uppercase rounded bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 border border-purple-200/50 dark:border-purple-800/30">
                {badge}
            </span>
        )}
        <div className={`h-9 w-9 transition-transform duration-200 ${isActive ? 'scale-110 text-primary' : 'text-slate-500 dark:text-slate-400'}`}>{icon}</div>
        <span className="text-xs font-bold leading-tight tracking-tight line-clamp-2">{label}</span>
    </button>
);

const LayoutSelector: React.FC<{
    currentLayout: DisplayPost['layout'];
    onChange: (layout: DisplayPost['layout']) => void;
    screen: DisplayScreen;
}> = ({ currentLayout, onChange, screen }) => {
    const isPortrait = screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4';

    const mediaLayouts: { id: DisplayPost['layout']; label: string; icon: React.ReactNode; badge?: string; }[] = [
        { id: 'image-fullscreen', label: 'Helskärmsbild', icon: <LayoutImageFullscreenIcon className="w-full h-full" /> },
        { id: 'video-fullscreen', label: 'Helskärmsvideo', icon: <VideoCameraIcon className="w-full h-full" /> },
        { 
            id: 'image-left', 
            label: isPortrait ? 'Bild Överst' : 'Bild till vänster', 
            icon: isPortrait ? <LayoutImageTopIcon className="w-full h-full" /> : <LayoutImageLeftIcon className="w-full h-full" /> 
        },
        { 
            id: 'image-right', 
            label: isPortrait ? 'Bild Nederst' : 'Bild till höger', 
            icon: isPortrait ? <LayoutImageBottomIcon className="w-full h-full" /> : <LayoutImageRightIcon className="w-full h-full" /> 
        },
        { id: 'collage', label: 'Bildercollage', icon: <LayoutCollageIcon className="w-full h-full" />, badge: 'Flera' },
    ];

    const standardLayouts: { id: DisplayPost['layout']; label: string; icon: React.ReactNode; badge?: string; }[] = [
        { id: 'text-only', label: 'Endast text', icon: <LayoutTextOnlyIcon className="w-full h-full" /> },
        { id: 'webpage', label: 'Bokning / Webb', icon: <LayoutWebpageIcon className="w-full h-full" />, badge: 'Extern' },
    ];

    const aiLayouts: { id: DisplayPost['layout']; label: string; icon: React.ReactNode; badge?: string; }[] = [
        { id: 'ai-ad', label: 'Generativ AI-Annons', icon: <SparklesIcon className="w-full h-full text-purple-500" />, badge: 'Magi' },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mb-1 tracking-tight flex items-center gap-2">
                    Skapa nytt inlägg
                </h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">Detta bestämmer hur mycket utrymme du vill ge till text kontra bild eller externa källor.</p>
            </div>

            {/* AI Magic Group */}
            <div className="bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-transparent p-4 rounded-2xl border border-purple-200/50 dark:border-purple-800/30">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400 block mb-2">Automatisera med AI (Snabbast)</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {aiLayouts.map(l => (
                        <LayoutButton key={l.id} label={l.label} icon={l.icon} isActive={currentLayout === l.id} onClick={() => onChange(l.id)} badge={l.badge} />
                    ))}
                </div>
            </div>

            {/* Media/Visuals Group */}
            <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-2">Bilder & Video</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {mediaLayouts.map(l => (
                        <LayoutButton key={l.id} label={l.label} icon={l.icon} isActive={currentLayout === l.id} onClick={() => onChange(l.id)} badge={l.badge} />
                    ))}
                </div>
            </div>

            {/* Standard/Text Group */}
            <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-2">Text & Kopplingar</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3">
                    {standardLayouts.map(l => (
                        <LayoutButton key={l.id} label={l.label} icon={l.icon} isActive={currentLayout === l.id} onClick={() => onChange(l.id)} badge={l.badge} />
                    ))}
                </div>
            </div>
        </div>
    );
};

const collageLayouts = {
    landscape: ['landscape-1-2', 'landscape-3-horiz', 'landscape-4-grid', 'landscape-2-horiz', 'landscape-2-vert', 'landscape-1-top-2-bottom', 'landscape-1-top-3-bottom', 'landscape-6-grid', 'landscape-3-vert'],
    portrait: ['portrait-1-2', 'portrait-3-vert', 'portrait-4-grid', 'portrait-2-horiz', 'portrait-2-vert', 'portrait-1-top-2-bottom', 'portrait-1-top-3-bottom', 'portrait-6-grid', 'portrait-3-horiz'],
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
        if (layout === 'landscape-1-top-2-bottom') return <div className={`grid grid-cols-2 grid-rows-2 h-full ${gap}`}><div className="col-span-2 bg-slate-400 dark:bg-slate-500" /><Block /><Block /></div>;
        if (layout === 'landscape-1-top-3-bottom') return <div className={`grid grid-cols-3 grid-rows-2 h-full ${gap}`}><div className="col-span-3 bg-slate-400 dark:bg-slate-500" /><Block /><Block /><Block /></div>;
        if (layout === 'landscape-6-grid') return <div className={`grid grid-cols-3 grid-rows-2 h-full ${gap}`}><Block /><Block /><Block /><Block /><Block /><Block /></div>;
        if (layout === 'landscape-3-vert') return <div className={`grid grid-rows-3 h-full ${gap}`}><Block /><Block /><Block /></div>;
        
        // Portrait layouts
        if (layout === 'portrait-1-2') return <div className={`grid grid-cols-2 grid-rows-2 h-full ${gap}`}><div className="col-span-2 bg-slate-400 dark:bg-slate-500" /><Block /><Block /></div>;
        if (layout === 'portrait-3-vert') return <div className={`grid grid-rows-3 h-full ${gap}`}><Block /><Block /><Block /></div>;
        if (layout === 'portrait-4-grid') return <div className={`grid grid-cols-2 grid-rows-2 h-full ${gap}`}><Block /><Block /><Block /><Block /></div>;
        if (layout === 'portrait-2-horiz') return <div className={`grid grid-cols-2 h-full ${gap}`}><Block /><Block /></div>;
        if (layout === 'portrait-2-vert') return <div className={`grid grid-rows-2 h-full ${gap}`}><Block /><Block /></div>;
        if (layout === 'portrait-1-top-2-bottom') return <div className={`grid grid-cols-2 grid-rows-3 h-full ${gap}`}><div className="col-span-2 row-span-2 bg-slate-400 dark:bg-slate-500" /><Block /><Block /></div>;
        if (layout === 'portrait-1-top-3-bottom') return <div className={`grid grid-cols-3 grid-rows-3 h-full ${gap}`}><div className="col-span-3 row-span-2 bg-slate-400 dark:bg-slate-500" /><Block /><Block /><Block /></div>;
        if (layout === 'portrait-6-grid') return <div className={`grid grid-cols-2 grid-rows-3 h-full ${gap}`}><Block /><Block /><Block /><Block /><Block /><Block /></div>;
        if (layout === 'portrait-3-horiz') return <div className={`grid grid-cols-3 h-full ${gap}`}><Block /><Block /><Block /></div>;
        
        return <div className="w-full h-full bg-black" />;
    };

    return (
        <div className="p-4 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 animate-fade-in">
            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Välj collage-stil</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
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
