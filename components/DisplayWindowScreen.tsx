import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from '../context/StudioContext';
// FIX: Import the 'Tag' type to resolve the 'Cannot find name' error.
import { BrandingOptions, DisplayPost, Organization, Tag } from '../types';
import { DisplayPostRenderer } from './DisplayPostRenderer';

interface DisplayWindowScreenProps {
    onBack: () => void;
    isEmbedded?: boolean;
}

const ProgressBar: React.FC<{ duration: number; isPaused: boolean }> = ({ duration, isPaused }) => {
    const animationStyle: React.CSSProperties = {
        animationDuration: `${duration}s`,
        animationPlayState: isPaused ? 'paused' : 'running',
    };

    return (
        <div className="absolute bottom-0 left-0 h-1.5 bg-white/20 w-full">
            <div
                key={duration} // Reset animation when duration changes
                className="h-full bg-white animate-progress-bar"
                style={animationStyle}
            ></div>
            <style>{`
                @keyframes progress-bar-animation {
                    from { width: 0%; }
                    to { width: 100%; }
                }
                .animate-progress-bar {
                    animation-name: progress-bar-animation;
                    animation-timing-function: linear;
                    animation-fill-mode: forwards;
                }
            `}</style>
        </div>
    );
};

const PostWrapper: React.FC<{
    post: DisplayPost;
    state: 'idle' | 'entering' | 'exiting';
    // The transition type is determined by the post that is LEAVING.
    transitionType?: DisplayPost['transitionToNext'];
    allTags?: Tag[];
    onVideoEnded: () => void;
    primaryColor?: string;
    cycleCount: number;
    organization?: Organization;
}> = ({ post, state, transitionType, allTags, onVideoEnded, primaryColor, cycleCount, organization }) => {
    
    const getAnimationClass = () => {
        // ONLY the exiting post gets an animation class. It animates out to reveal the new post.
        if (state === 'exiting') {
            const type = transitionType || 'fade';
            switch (type) {
                case 'slide':
                    return 'animate-slide-out-post';
                case 'dissolve':
                    return 'animate-dissolve-out-post';
                case 'fade':
                default:
                    return 'animate-fade-out-post';
            }
        }
        // The entering/idle post is immediately visible underneath.
        return 'opacity-100';
    };

    const getZIndexClass = () => {
        // The exiting post must be on top so its animation is visible.
        if (state === 'exiting') return 'z-20';
        // The new post (whether 'entering' or 'idle') is underneath.
        return 'z-10';
    };

    return (
        <div className={`absolute inset-0 ${getAnimationClass()} ${getZIndexClass()}`}>
            <DisplayPostRenderer 
                post={post} 
                allTags={allTags} 
                onVideoEnded={onVideoEnded}
                primaryColor={primaryColor}
                cycleCount={cycleCount}
                organization={organization}
            />
        </div>
    );
}


export const DisplayWindowScreen: React.FC<DisplayWindowScreenProps> = ({ onBack, isEmbedded = false }) => {
    const { selectedDisplayScreen, selectedOrganization } = useLocation();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [previousIndex, setPreviousIndex] = useState<number | null>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [cycleCount, setCycleCount] = useState(0);
    
    const timerRef = useRef<number | null>(null);
    
    const [lastClickTime, setLastClickTime] = useState(0);
    const [currentTime, setCurrentTime] = useState(new Date());

    const wakeLockSentinel = useRef<WakeLockSentinel | null>(null);

    useEffect(() => {
        // Wake lock is only for dedicated display screens, not embedded views.
        if (isEmbedded) {
            console.log("Wake Lock is disabled for embedded view.");
            return;
        }

        // Function to request the wake lock to prevent the screen from sleeping
        const requestWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try {
                    wakeLockSentinel.current = await navigator.wakeLock.request('screen');
                    console.log('Screen Wake Lock is active.');
                    
                    wakeLockSentinel.current.addEventListener('release', () => {
                        console.log('Screen Wake Lock was released.');
                        wakeLockSentinel.current = null; // Important for re-acquisition
                    });

                } catch (err: any) {
                    console.error(`Could not acquire wake lock: ${err.name}, ${err.message}`);
                }
            } else {
                console.warn('Screen Wake Lock API not supported.');
            }
        };

        requestWakeLock();

        // Re-acquire the lock if the page becomes visible again (e.g., user switches tabs)
        const handleVisibilityChange = () => {
            if (wakeLockSentinel.current === null && document.visibilityState === 'visible') {
                requestWakeLock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Cleanup function to release the lock when the component unmounts
        return () => {
            if (wakeLockSentinel.current) {
                wakeLockSentinel.current.release()
                    .then(() => {
                        wakeLockSentinel.current = null;
                    });
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isEmbedded]);

    useEffect(() => {
        // This interval ensures the component re-evaluates which posts are active based on the current time.
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 60000); // Update every minute
        return () => clearInterval(interval);
    }, []);

    const activePosts = useMemo(() => {
        if (!selectedDisplayScreen || !selectedDisplayScreen.isEnabled || !selectedDisplayScreen.posts) return [];
        const now = currentTime; // Use state variable for memo dependency
        return selectedDisplayScreen.posts.filter(post => {
            const hasStartDate = post.startDate && post.startDate.length > 0;
            const hasEndDate = post.endDate && post.endDate.length > 0;
            // Post should not be displayed if its start date is in the future
            if (hasStartDate && new Date(post.startDate!) > now) return false;
            // Post should not be displayed if its end date is in the past
            if (hasEndDate && new Date(post.endDate!) < now) return false;
            return true;
        });
    }, [selectedDisplayScreen, currentTime]);
    
    useEffect(() => {
        // If the content updates and the current index is now out of bounds, reset to 0.
        if (currentIndex >= activePosts.length) {
            setCurrentIndex(0);
        }
    }, [activePosts, currentIndex]);

    const advance = useCallback(() => {
        if (isTransitioning || activePosts.length <= 1) {
            // Even if there's only one post, we still want to trigger a "cycle" for headline rotation
            setCycleCount(c => c + 1);
            return;
        };

        setIsTransitioning(true);
        setPreviousIndex(currentIndex);
        setCurrentIndex(prev => (prev + 1) % activePosts.length);
        setCycleCount(c => c + 1);
        
        // Match transition duration (1200ms) from tailwind config
        setTimeout(() => {
            setPreviousIndex(null);
            setIsTransitioning(false);
        }, 1200);

    }, [activePosts.length, currentIndex, isTransitioning]);

    useEffect(() => {
        const cleanup = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };

        if (isTransitioning || activePosts.length === 0) return cleanup;
        
        const currentPost = activePosts[currentIndex];

        // The video's onEnded event will also call advance, but the `isTransitioning`
        // flag in `advance` will prevent a double transition. The timer sets the max duration.
        const duration = (currentPost.durationSeconds || 10) * 1000;
        timerRef.current = window.setTimeout(advance, duration);
        
        return cleanup;
    }, [currentIndex, activePosts, advance, isTransitioning]);
    
    const handleAdminClick = (e: React.MouseEvent) => {
        if (isEmbedded) return; // Disable admin click in embed mode
        const now = new Date().getTime();
        // Check for double click (or two quick clicks)
        if (now - lastClickTime < 500) {
            e.stopPropagation(); // Stop the event from propagating further
            onBack();
        }
        setLastClickTime(now);
    };

    if (!selectedDisplayScreen || !selectedOrganization) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center">Laddar skärm...</div>;
    }

    if (!selectedDisplayScreen.isEnabled) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center">Denna skärm är inte aktiverad.</div>
    }

    const branding = selectedDisplayScreen.branding;
    const logoUrl = selectedOrganization.logoUrlDark || selectedOrganization.logoUrlLight;

    const getPositionClasses = (position: BrandingOptions['position'] = 'bottom-right') => {
        switch (position) {
            case 'top-left': return 'top-6 left-6';
            case 'top-right': return 'top-6 right-6';
            case 'bottom-left': return 'bottom-6 left-6';
            case 'bottom-right': return 'bottom-6 right-6';
        }
    };

    // The current and previous posts to display for transitions
    const previousPost = previousIndex !== null ? activePosts[previousIndex] : null;
    const currentPost = activePosts[currentIndex];
    
    // The transition is defined by the post that is LEAVING.
    const transitionType = previousPost?.transitionToNext || 'fade';

    return (
        <div className="w-screen h-screen bg-black relative overflow-hidden" onClick={handleAdminClick}>
            {/* Main Content Area */}
            {previousPost && (
                <PostWrapper
                    key={`${previousPost.id}-${cycleCount - 1}`}
                    post={previousPost}
                    state="exiting"
                    transitionType={previousPost.transitionToNext}
                    allTags={selectedOrganization.tags}
                    onVideoEnded={advance}
                    primaryColor={selectedOrganization.primaryColor}
                    cycleCount={cycleCount - 1}
                    organization={selectedOrganization}
                />
            )}
            {currentPost ? (
                <PostWrapper
                    key={`${currentPost.id}-${cycleCount}`}
                    post={currentPost}
                    state={isTransitioning ? 'entering' : 'idle'}
                    transitionType={transitionType}
                    allTags={selectedOrganization.tags}
                    onVideoEnded={advance}
                    primaryColor={selectedOrganization.primaryColor}
                    cycleCount={cycleCount}
                    organization={selectedOrganization}
                />
            ) : (
                 <div className="w-full h-full flex items-center justify-center text-gray-500">
                    Inga aktiva inlägg att visa.
                </div>
            )}
            
            {/* Branding Overlay - needs high z-index to be on top of transitions */}
            {branding?.isEnabled && (branding.showLogo || branding.showName) && (
                <div className={`absolute ${getPositionClasses(branding.position)} z-30`}>
                    <div className="flex items-center gap-4 bg-black/50 backdrop-blur-sm p-3 rounded-lg">
                        {branding.showLogo && logoUrl && (
                            <img src={logoUrl} alt={`${selectedOrganization.name} logo`} className="max-h-12 max-w-[150px] object-contain" />
                        )}
                        {branding.showName && (
                            <p className="font-semibold text-2xl text-white/90">{selectedOrganization.name}</p>
                        )}
                    </div>
                </div>
            )}
            
            {/* Progress Bar for multiple items, but not for videos */}
            {activePosts.length > 1 && currentPost && currentPost.layout !== 'video-fullscreen' && (
                <ProgressBar duration={currentPost.durationSeconds} isPaused={isTransitioning} />
            )}

            {isEmbedded && (
                <a 
                    href="https://smartskylt.se" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="absolute bottom-4 right-4 z-40 bg-black/50 text-white/80 text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-sm no-underline hover:bg-black/70 hover:text-white transition-colors"
                    title="Powered by Smart Skylt"
                >
                    Powered by Smart Skylt
                </a>
            )}
        </div>
    );
};
