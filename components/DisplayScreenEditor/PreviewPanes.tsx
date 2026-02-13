
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DisplayPost, DisplayScreen, Organization, BrandingOptions } from '../../types';
import { DisplayPostRenderer } from '../DisplayPostRenderer';
import { ChevronDownIcon, PlayIcon, PauseIcon } from '../icons';

export const getAspectRatioClass = (ratio?: DisplayScreen['aspectRatio']): string => {
    switch (ratio) {
        case '9:16': return 'aspect-[9/16]';
        case '4:3': return 'aspect-[4/3]';
        case '3:4': return 'aspect-[3/4]';
        case '16:9': default: return 'aspect-[16/9]';
    }
};

/**
 * En container som renderar barnen i en fast "virtuell" upplösning
 * men skalar ner hela resultatet med CSS transform för att passa i föräldern.
 * 
 * Vi använder 640x1138 som logisk upplösning. Detta är ett "gyllene medelväg"
 * mellan 540p (mobilt) och 720p (HD), vilket ofta matchar hur text flödar på TV-skärmar.
 */
const ScaledPreviewWrapper: React.FC<{ 
    aspectRatio: DisplayScreen['aspectRatio']; 
    children: React.ReactNode;
    className?: string;
}> = ({ aspectRatio, children, className }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    // Definiera basupplösning (640p - Mellanting)
    const { width: baseWidth, height: baseHeight } = useMemo(() => {
        switch (aspectRatio) {
            case '9:16': return { width: 640, height: 1138 }; // Stående (Mellan 540 och 720)
            case '3:4': return { width: 768, height: 1024 };  // Stående Tablet
            case '4:3': return { width: 1024, height: 768 };  // Liggande Tablet
            case '16:9': default: return { width: 1138, height: 640 }; // Liggande
        }
    }, [aspectRatio]);

    useEffect(() => {
        const updateScale = () => {
            if (containerRef.current) {
                const parentWidth = containerRef.current.clientWidth;
                // Räkna ut skalan: Tillgänglig bredd / Virtuell bredd
                if (parentWidth > 0) {
                    setScale(parentWidth / baseWidth);
                }
            }
        };

        // Kör vid start och när fönstret ändras
        updateScale();
        const observer = new ResizeObserver(updateScale);
        if (containerRef.current) observer.observe(containerRef.current);
        
        return () => observer.disconnect();
    }, [baseWidth]);

    return (
        <div 
            ref={containerRef} 
            className={`relative w-full overflow-hidden ${className || ''}`}
            style={{ 
                // Containern behåller rätt proportioner så att den tar upp rätt plats i UI:t
                aspectRatio: `${baseWidth}/${baseHeight}` 
            }}
        >
            <div 
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${baseWidth}px`,
                    height: `${baseHeight}px`,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    pointerEvents: 'auto' // Tillåt interaktion (dra/släpp)
                }}
            >
                {children}
            </div>
        </div>
    );
};

const SinglePostPreview: React.FC<{ 
    post: DisplayPost, 
    screen: DisplayScreen, 
    organization: Organization,
    onUpdateTagPosition: (tagId: string, newPosition: { x: number, y: number, rotation: number, scale?: number, width?: number }) => void,
    onUpdateHeadlinePosition: (pos: { x: number, y: number }) => void,
    onUpdateHeadlineWidth: (width: number) => void,
    onUpdateBodyPosition: (pos: { x: number, y: number }) => void,
    onUpdateBodyWidth: (width: number) => void,
    onUpdateQrPosition?: (pos: { x: number, y: number }) => void,
    onUpdateQrWidth?: (width: number) => void,
    isTextDraggable?: boolean,
}> = ({ 
    post, screen, organization, onUpdateTagPosition, 
    onUpdateHeadlinePosition, onUpdateHeadlineWidth,
    onUpdateBodyPosition, onUpdateBodyWidth,
    onUpdateQrPosition, onUpdateQrWidth, isTextDraggable 
}) => {
    
    // För stående skärmar vill vi begränsa höjden så den inte tar upp hela webbläsarfönstret
    const isPortrait = screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4';
    
    const branding = screen.branding;
    const logoUrl = organization?.logoUrlDark || organization?.logoUrlLight;
    const getPositionClasses = (position: BrandingOptions['position'] = 'bottom-right') => {
        switch (position) {
            case 'top-left': return 'top-2 left-2';
            case 'top-right': return 'top-2 right-2';
            case 'bottom-left': return 'bottom-2 left-2';
            case 'bottom-right': return 'bottom-2 right-2';
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Förhandsgranskning</h3>
                <div className="flex items-center gap-2">
                    {isTextDraggable && (
                        <span className="bg-teal-500/10 text-teal-600 dark:text-teal-400 text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                            Interaktivt läge
                        </span>
                    )}
                </div>
            </div>
            
            <div className={`bg-slate-200 dark:bg-black/20 p-4 rounded-xl border border-slate-300 dark:border-slate-700/50 flex justify-center`}>
                <ScaledPreviewWrapper 
                    aspectRatio={screen.aspectRatio}
                    // Ramen borttagen, behåller skugga och rundning
                    className={`bg-slate-300 dark:bg-slate-900 rounded-lg shadow-xl overflow-hidden ${isPortrait ? 'h-[60vh] w-auto' : 'w-full'}`}
                >
                    <DisplayPostRenderer 
                        post={post} 
                        allTags={organization.tags} 
                        primaryColor={organization.primaryColor}
                        onUpdateTagPosition={onUpdateTagPosition}
                        onUpdateHeadlinePosition={onUpdateHeadlinePosition}
                        onUpdateHeadlineWidth={onUpdateHeadlineWidth}
                        onUpdateBodyPosition={onUpdateBodyPosition}
                        onUpdateBodyWidth={onUpdateBodyWidth}
                        onUpdateQrPosition={onUpdateQrPosition}
                        onUpdateQrWidth={onUpdateQrWidth}
                        isTextDraggable={isTextDraggable}
                        organization={organization}
                        aspectRatio={screen.aspectRatio}
                        // Vi använder 'live'-läge internt för att matcha den virtuella upplösningen
                        mode="live" 
                    />
                    {branding?.isEnabled && organization && (branding.showLogo || branding.showName) && (
                        <div className={`absolute ${getPositionClasses(branding.position)} z-10`}>
                            <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm p-1.5 rounded-md">
                                {branding.showLogo && logoUrl && <img src={logoUrl} alt={`${organization.name} logo`} className="max-h-6 max-w-[75px] object-contain" />}
                                {branding.showName && <p className="font-semibold text-xs text-white/90">{organization.brandName || organization.name}</p>}
                            </div>
                        </div>
                    )}
                </ScaledPreviewWrapper>
            </div>
            
            <p className="text-xs text-slate-500 dark:text-gray-500 mt-2 text-center">
                Dra i text och objekt för att flytta dem.
            </p>
        </div>
    );
};

const LivePreviewPane: React.FC<{ screen: DisplayScreen, organization: Organization }> = ({ screen, organization }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const timerRef = useRef<number | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    const activePosts = useMemo(() => {
        if (!screen.isEnabled || !screen.posts) return [];
        const now = currentTime;
        return screen.posts.filter(post => {
            const hasStartDate = post.startDate && post.startDate.length > 0;
            const hasEndDate = post.endDate && post.endDate.length > 0;
            if (hasStartDate && new Date(post.startDate!) > now) return false;
            if (hasEndDate && new Date(post.endDate!) < now) return false;
            if (!hasStartDate && !hasEndDate) return false;
            return true;
        });
    }, [screen, currentTime]);

    useEffect(() => {
        if (currentIndex >= activePosts.length) setCurrentIndex(0);
    }, [activePosts, currentIndex]);
    
    const advance = useCallback((direction: 'next' | 'prev') => {
        if (activePosts.length <= 1) return;
        const newIndex = direction === 'next' 
            ? (currentIndex + 1) % activePosts.length
            : (currentIndex - 1 + activePosts.length) % activePosts.length;
        setCurrentIndex(newIndex);
    }, [activePosts.length, currentIndex]);
    
    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (isPaused || activePosts.length <= 1) return;

        const currentPost = activePosts[currentIndex];
        if (!currentPost || (currentPost.layout === 'video-fullscreen' && currentPost.videoUrl)) return;

        const duration = (currentPost.durationSeconds || 15) * 1000;
        timerRef.current = window.setTimeout(() => advance('next'), duration);

        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [currentIndex, activePosts, isPaused, advance]);

    const currentPost = activePosts[currentIndex];

    const branding = screen.branding;
    const logoUrl = organization?.logoUrlDark || organization?.logoUrlLight;
    const getPositionClasses = (position: BrandingOptions['position'] = 'bottom-right') => {
        switch (position) {
            case 'top-left': return 'top-2 left-2';
            case 'top-right': return 'top-2 right-2';
            case 'bottom-left': return 'bottom-2 left-2';
            case 'bottom-right': return 'bottom-2 right-2';
        }
    };
    
    const isPortrait = screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4';

    return (
        <div className="space-y-4">
             <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Live-förhandsgranskning</h3>
             </div>
             <div className="space-y-4">
                 <div className="flex justify-center bg-slate-200 dark:bg-black/20 p-4 rounded-xl border border-slate-300 dark:border-slate-700/50">
                     <ScaledPreviewWrapper 
                        aspectRatio={screen.aspectRatio}
                        // Ramen borttagen
                        className={`bg-slate-300 dark:bg-slate-900 rounded-lg shadow-lg overflow-hidden ${isPortrait ? 'h-[60vh] w-auto' : 'w-full'}`}
                     >
                        {currentPost ? (
                            <DisplayPostRenderer 
                                post={currentPost} 
                                allTags={organization.tags} 
                                primaryColor={organization.primaryColor}
                                onVideoEnded={() => advance('next')}
                                organization={organization}
                                aspectRatio={screen.aspectRatio}
                                mode="live"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
                               {screen.posts?.length > 0 ? 'Inga aktiva inlägg.' : 'Lägg till inlägg.'}
                            </div>
                        )}
                        {branding?.isEnabled && organization && (branding.showLogo || branding.showName) && (
                            <div className={`absolute ${getPositionClasses(branding.position)} z-10`}>
                                <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm p-1.5 rounded-md">
                                    {branding.showLogo && logoUrl && <img src={logoUrl} alt={`${organization.name} logo`} className="max-h-6 max-w-[75px] object-contain" />}
                                    {branding.showName && <p className="font-semibold text-xs text-white/90">{organization.brandName || organization.name}</p>}
                                </div>
                            </div>
                        )}
                     </ScaledPreviewWrapper>
                 </div>

                 {activePosts.length > 1 && (
                     <div className="p-2 bg-slate-100 dark:bg-gray-800 rounded-lg flex justify-between items-center border border-slate-200 dark:border-gray-700">
                        <div className="text-sm text-slate-500 dark:text-slate-400 font-mono w-28">Inlägg {currentIndex + 1} / {activePosts.length}</div>
                        <div className="flex items-center gap-4">
                            <button onClick={() => advance('prev')} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><ChevronDownIcon className="h-6 w-6 rotate-90" /></button>
                            <button onClick={() => setIsPaused(!isPaused)} className="p-3 rounded-full bg-primary text-white hover:brightness-110">
                                {isPaused ? <PlayIcon className="h-6 w-6" /> : <PauseIcon className="h-6 w-6" />}
                            </button>
                            <button onClick={() => advance('next')} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><ChevronDownIcon className="h-6 w-6 -rotate-90" /></button>
                        </div>
                        <div className="w-28 text-right"/>
                    </div>
                 )}
             </div>
        </div>
    );
};

interface PreviewPaneProps {
    editingPost: DisplayPost | null;
    screen: DisplayScreen;
    organization: Organization;
    onUpdateTagPosition: (tagId: string, pos: {x: number, y: number, rotation: number, scale?: number, width?: number}) => void;
    onUpdateHeadlinePosition: (pos: {x: number, y: number}) => void;
    onUpdateHeadlineWidth: (width: number) => void;
    onUpdateBodyPosition: (pos: {x: number, y: number}) => void;
    onUpdateBodyWidth: (width: number) => void;
    onUpdateQrPosition?: (pos: {x: number, y: number}) => void;
    onUpdateQrWidth?: (width: number) => void;
    isTextDraggable?: boolean;
}
export const PreviewPane: React.FC<PreviewPaneProps> = ({ 
    editingPost, screen, organization, onUpdateTagPosition, 
    onUpdateHeadlinePosition, onUpdateHeadlineWidth,
    onUpdateBodyPosition, onUpdateBodyWidth,
    onUpdateQrPosition, onUpdateQrWidth, isTextDraggable 
}) => {
    if (editingPost) {
        return (
            <SinglePostPreview
                post={editingPost}
                screen={screen}
                organization={organization}
                onUpdateTagPosition={onUpdateTagPosition}
                onUpdateHeadlinePosition={onUpdateHeadlinePosition}
                onUpdateHeadlineWidth={onUpdateHeadlineWidth}
                onUpdateBodyPosition={onUpdateBodyPosition}
                onUpdateBodyWidth={onUpdateBodyWidth}
                onUpdateQrPosition={onUpdateQrPosition}
                onUpdateQrWidth={onUpdateQrWidth}
                isTextDraggable={isTextDraggable}
            />
        );
    }
    return <LivePreviewPane screen={screen} organization={organization} />;
};
