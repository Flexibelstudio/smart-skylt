import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DisplayPost, DisplayScreen, Organization, BrandingOptions, Tag, TagPositionOverride } from '../../types';
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

const SinglePostPreview: React.FC<{ 
    post: DisplayPost, 
    screen: DisplayScreen, 
    organization: Organization,
    onUpdateTagPosition: (tagId: string, newPosition: { x: number, y: number, rotation: number }) => void,
    onUpdateTextPosition: (pos: { x: number, y: number }) => void,
    onUpdateTextWidth: (width: number) => void,
}> = ({ post, screen, organization, onUpdateTagPosition, onUpdateTextPosition, onUpdateTextWidth }) => {
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
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Förhandsgranskning (enskilt inlägg)</h3>
            <div className={`${getAspectRatioClass(screen.aspectRatio)} ${isPortrait ? 'max-h-[75vh] mx-auto' : 'w-full'} bg-slate-300 dark:bg-slate-900 rounded-lg overflow-hidden relative border-2 border-slate-300 dark:border-gray-600 shadow-lg`}>
                <DisplayPostRenderer 
                    post={post} 
                    allTags={organization.tags} 
                    primaryColor={organization.primaryColor}
                    onUpdateTagPosition={onUpdateTagPosition}
                    onUpdateTextPosition={onUpdateTextPosition}
                    onUpdateTextWidth={onUpdateTextWidth}
                    isTextDraggable={true}
                    organization={organization}
                    aspectRatio={screen.aspectRatio}
                />
                {branding?.isEnabled && organization && (branding.showLogo || branding.showName) && (
                    <div className={`absolute ${getPositionClasses(branding.position)} z-10`}>
                        <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm p-1.5 rounded-md">
                            {branding.showLogo && logoUrl && <img src={logoUrl} alt={`${organization.name} logo`} className="max-h-6 max-w-[75px] object-contain" />}
                            {branding.showName && <p className="font-semibold text-xs text-white/90">{organization.name}</p>}
                        </div>
                    </div>
                )}
            </div>
            <p className="text-xs text-slate-500 dark:text-gray-500 mt-2">Dra i text och taggar för att placera dem fritt. Dra i handtagen på textrutan för att ändra dess bredd.</p>
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
    
    return (
        <div className="space-y-4">
             <h3 className="text-xl font-bold text-slate-900 dark:text-white">Live-förhandsgranskning</h3>
             <div className="space-y-4">
                 <div className={`${getAspectRatioClass(screen.aspectRatio)} ${screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4' ? 'max-h-[75vh] mx-auto' : 'w-full'} bg-slate-300 dark:bg-slate-900 rounded-lg overflow-hidden relative border-2 border-slate-300 dark:border-gray-600 shadow-lg`}>
                    {currentPost ? (
                        <DisplayPostRenderer 
                            post={currentPost} 
                            allTags={organization.tags} 
                            primaryColor={organization.primaryColor}
                            onVideoEnded={() => advance('next')}
                            organization={organization}
                            aspectRatio={screen.aspectRatio}
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
                                {branding.showName && <p className="font-semibold text-xs text-white/90">{organization.name}</p>}
                            </div>
                        </div>
                    )}
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
    onUpdateTagPosition: (tagId: string, pos: {x: number, y: number, rotation: number}) => void;
    onUpdateTextPosition: (pos: {x: number, y: number}) => void;
    onUpdateTextWidth: (width: number) => void;
}
export const PreviewPane: React.FC<PreviewPaneProps> = ({ editingPost, screen, organization, onUpdateTagPosition, onUpdateTextPosition, onUpdateTextWidth }) => {
    if (editingPost) {
        return (
            <SinglePostPreview
                post={editingPost}
                screen={screen}
                organization={organization}
                onUpdateTagPosition={onUpdateTagPosition}
                onUpdateTextPosition={onUpdateTextPosition}
                onUpdateTextWidth={onUpdateTextWidth}
            />
        );
    }
    return <LivePreviewPane screen={screen} organization={organization} />;
};