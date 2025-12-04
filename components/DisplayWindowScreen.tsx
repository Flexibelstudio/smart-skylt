
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from '../context/StudioContext';
import { BrandingOptions, DisplayPost, Organization, Tag, DisplayScreen } from '../types';
import { DisplayPostRenderer } from './DisplayPostRenderer';
import { parseToDate } from '../utils/dateUtils';

interface DisplayWindowScreenProps {
  onBack: () => void;
  isEmbedded?: boolean;
}

/* ===================== Datum-helpers ===================== */
// Helper function to check if a post is currently active based on dates
const isPostActive = (post: DisplayPost, now: Date) => {
    if (post.status === 'archived') return false; 
    const start = parseToDate(post.startDate, false);
    
    // Requirement: A start date must exist and have passed for the post to be shown.
    if (!start || start > now) return false;
    
    const end = parseToDate(post.endDate, true);
    if (end && end < now) return false;
    
    return true;
};

/* ===================== UI: ProgressBar ===================== */
const ProgressBar: React.FC<{ duration: number; isPaused: boolean }> = ({ duration, isPaused }) => {
  const style: React.CSSProperties = {
    animationDuration: `${duration}s`,
    animationPlayState: isPaused ? 'paused' : 'running',
  };
  return (
    <div className="absolute bottom-0 left-0 h-1.5 bg-white/20 w-full z-50">
      <div key={duration} className="h-full bg-white animate-progress-bar" style={style} />
      <style>{`
        @keyframes progress-bar-animation { from { width: 0% } to { width: 100% } }
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
  transitionType?: DisplayPost['transitionToNext'];
  allTags?: Tag[];
  onVideoEnded?: () => void;
  primaryColor?: string;
  cycleCount: number;
  organization?: Organization;
  aspectRatio: DisplayScreen['aspectRatio'];
}> = ({ post, state, transitionType, allTags, onVideoEnded, primaryColor, cycleCount, organization, aspectRatio }) => {
  
  const getAnimationClass = () => {
    if (state === 'exiting') {
      switch (transitionType || 'fade') {
        case 'slide': return 'animate-slide-out-post'; // Moves to left
        case 'dissolve': return 'animate-dissolve-out-post';
        case 'fade':
        default: return 'animate-fade-out-post';
      }
    }
    
    if (state === 'entering') {
      switch (transitionType || 'fade') {
        case 'slide': return 'animate-slide-in-right'; // Enters from right
        case 'dissolve': return 'animate-dissolve-in-post';
        // For standard fade, we can use a subtle zoom or just standard fade in to make it feel fresh
        case 'fade':
        default: return 'animate-fade-in-post';
      }
    }
    return 'opacity-100';
  };

  // Improved Z-Index logic:
  // - If sliding, 'entering' should be on top (z-20) to slide OVER, or 'exiting' on top to slide AWAY.
  //   With Slide-Out-Left and Slide-In-Right, they don't overlap, so equal Z is fine, but let's put entering on top.
  // - If fading/dissolving, usually Exiting is on top (z-20) fading out to reveal Entering (z-10) underneath.
  const getZIndexClass = () => {
      if (transitionType === 'slide') return state === 'entering' ? 'z-20' : 'z-10';
      return state === 'exiting' ? 'z-20' : 'z-10';
  };

  // If exiting, we disconnect the video ended handler to prevent double-firing
  const handleVideoEnded = state === 'exiting' ? undefined : onVideoEnded;

  return (
    <div className={`absolute inset-0 ${getAnimationClass()} ${getZIndexClass()}`}>
      <DisplayPostRenderer
        post={post}
        allTags={allTags}
        onVideoEnded={handleVideoEnded}
        primaryColor={primaryColor}
        cycleCount={cycleCount}
        organization={organization}
        aspectRatio={aspectRatio}
      />
    </div>
  );
};

export const DisplayWindowScreen: React.FC<DisplayWindowScreenProps> = ({ onBack, isEmbedded = false }) => {
  const { selectedDisplayScreen, selectedOrganization } = useLocation();

  // State
  const [currentPostId, setCurrentPostId] = useState<string | null>(null);
  const [exitingPost, setExitingPost] = useState<DisplayPost | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  
  // Refs & Timers
  const timerRef = useRef<number | null>(null);
  const failsafeTimerRef = useRef<number | null>(null);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const wakeLockSentinel = useRef<WakeLockSentinel | null>(null);
  
  /* Wake Lock */
  useEffect(() => {
    if (isEmbedded) return;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          wakeLockSentinel.current = await (navigator as any).wakeLock.request('screen');
          wakeLockSentinel.current?.addEventListener('release', () => (wakeLockSentinel.current = null));
        } catch { /* noop */ }
      }
    };
    requestWakeLock();
    const vis = () => {
      if (wakeLockSentinel.current === null && document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      if (wakeLockSentinel.current) wakeLockSentinel.current.release().then(() => (wakeLockSentinel.current = null));
      document.removeEventListener('visibilitychange', vis);
    };
  }, [isEmbedded]);

  /* Time Tick */
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  /* Filter Active Posts */
  const activePosts = useMemo(() => {
    const posts = selectedDisplayScreen?.posts ?? [];
    if (!selectedDisplayScreen?.isEnabled || posts.length === 0) return [];
    return posts.filter(p => isPostActive(p, currentTime));
  }, [selectedDisplayScreen, currentTime]);

  /* Determine Current Post Object */
  const currentPost = useMemo(() => {
      if (activePosts.length === 0) return null;
      if (!currentPostId) return activePosts[0];
      return activePosts.find(p => p.id === currentPostId) || activePosts[0];
  }, [activePosts, currentPostId]);

  /* Ensure we have a valid ID if posts are loaded but no ID selected */
  useEffect(() => {
      if (!currentPostId && activePosts.length > 0) {
          setCurrentPostId(activePosts[0].id);
      }
  }, [activePosts, currentPostId]);

  /* Advance Logic */
  const advance = useCallback(() => {
    if (isTransitioning || activePosts.length === 0) return;
    
    const currentIndex = activePosts.findIndex(p => p.id === (currentPostId || activePosts[0].id));
    if (currentIndex === -1) {
        // Current post disappeared, reset to start
        setCurrentPostId(activePosts[0].id);
        setCycleCount(c => c + 1);
        return;
    }

    const nextIndex = (currentIndex + 1) % activePosts.length;
    const nextPost = activePosts[nextIndex];
    const prevPost = activePosts[currentIndex];

    // Start transition
    setIsTransitioning(true);
    setExitingPost(prevPost);
    setCurrentPostId(nextPost.id);
    setCycleCount(c => c + 1);
    
    // End transition after animation. 
    // Increased slightly to ensure animations complete before unmounting.
    window.setTimeout(() => {
      setExitingPost(null);
      setIsTransitioning(false);
    }, 1300);
  }, [isTransitioning, activePosts, currentPostId]);

  /* Timer Logic */
  useEffect(() => {
    // Clear existing timers
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (failsafeTimerRef.current) {
        clearTimeout(failsafeTimerRef.current);
        failsafeTimerRef.current = null;
    }

    if (isTransitioning || !currentPost) return;

    const isMediaLayout = ['image-fullscreen', 'video-fullscreen', 'image-left', 'image-right'].includes(currentPost.layout);
    // Check if it's a video that should control the timing
    const hasActiveVideo = isMediaLayout && !currentPost.imageUrl && currentPost.videoUrl;

    const durationMs = (currentPost.durationSeconds ?? 10) * 1000;

    if (hasActiveVideo) {
        // For video, we wait for onEnded (handled in PostWrapper -> DisplayPostRenderer)
        // But we add a failsafe in case video stalls
        failsafeTimerRef.current = window.setTimeout(() => {
            console.log("Video failsafe triggered - forcing advance");
            advance();
        }, durationMs + 8000); // 8s grace period for buffering
        return;
    }

    // For images/text, use simple timer
    timerRef.current = window.setTimeout(() => {
      advance();
    }, durationMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (failsafeTimerRef.current) clearTimeout(failsafeTimerRef.current);
    };
  }, [currentPost, isTransitioning, advance]);

  /* Admin Double Click */
  const handleAdminClick = (e: React.MouseEvent) => {
    if (isEmbedded) return;
    const now = Date.now();
    if (now - lastClickTime < 500) {
      e.stopPropagation();
      onBack();
    }
    setLastClickTime(now);
  };

  // Loading / Error States
  if (!selectedDisplayScreen || !selectedOrganization) {
    return <div className="bg-black text-white min-h-screen flex items-center justify-center">Laddar skärm...</div>;
  }
  if (!selectedDisplayScreen.isEnabled) {
    return <div className="bg-black text-white min-h-screen flex items-center justify-center">Denna skärm är inte aktiverad.</div>;
  }

  // Branding
  const branding = selectedDisplayScreen.branding;
  const logoUrl = selectedOrganization.logoUrlDark || selectedOrganization.logoUrlLight;
  const getPositionClasses = (position: BrandingOptions['position'] = 'bottom-right') => {
    switch (position) {
      case 'top-left': return 'top-6 left-6';
      case 'top-right': return 'top-6 right-6';
      case 'bottom-left': return 'bottom-6 left-6';
      case 'bottom-right': return 'bottom-6 right-6';
      default: return 'bottom-6 right-6';
    }
  };

  // Determine transition type from the exiting post to allow per-post transition settings
  const transitionType = exitingPost?.transitionToNext || 'fade';
  
  // Helper to determine progress bar visibility
  const hasActiveVideo = currentPost && ['image-fullscreen', 'video-fullscreen', 'image-left', 'image-right'].includes(currentPost.layout) && !currentPost.imageUrl && currentPost.videoUrl;

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden" onClick={handleAdminClick}>
      {exitingPost && (
        <PostWrapper
          key={`${exitingPost.id}-${cycleCount - 1}`}
          post={exitingPost}
          state="exiting"
          transitionType={exitingPost.transitionToNext}
          allTags={selectedOrganization.tags}
          primaryColor={selectedOrganization.primaryColor}
          cycleCount={cycleCount - 1}
          organization={selectedOrganization}
          aspectRatio={selectedDisplayScreen.aspectRatio}
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
          aspectRatio={selectedDisplayScreen.aspectRatio}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-500">Inga aktiva inlägg att visa.</div>
      )}

      {/* Show progress bar unless it's a video that controls its own timing */}
      {currentPost && !hasActiveVideo && (
        <ProgressBar duration={currentPost.durationSeconds ?? 10} isPaused={isTransitioning} />
      )}

      {branding?.isEnabled && selectedOrganization && (branding.showLogo || branding.showName) && (
        <div className={`absolute ${getPositionClasses(branding.position)} z-30`}>
            <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm p-1.5 rounded-md">
                {branding.showLogo && logoUrl && <img src={logoUrl} alt={`${selectedOrganization.name} logo`} className="max-h-8 max-w-[100px] object-contain" />}
                {branding.showName && <p className="font-semibold text-sm text-white/90">{selectedOrganization.brandName || selectedOrganization.name}</p>}
            </div>
        </div>
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
