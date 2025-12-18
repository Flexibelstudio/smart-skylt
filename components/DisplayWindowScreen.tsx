
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from '../context/StudioContext';
import { BrandingOptions, DisplayPost, Organization, Tag, DisplayScreen } from '../types';
import { DisplayPostRenderer } from './DisplayPostRenderer';
import { parseToDate } from '../utils/dateUtils';

interface DisplayWindowScreenProps {
  onBack: () => void;
  isEmbedded?: boolean;
}

const isPostActive = (post: DisplayPost, now: Date) => {
    if (post.status === 'archived') return false; 
    const start = parseToDate(post.startDate, false);
    if (start && start > now) return false;
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

export const DisplayWindowScreen: React.FC<DisplayWindowScreenProps> = ({ onBack, isEmbedded = false }) => {
  const { selectedDisplayScreen, selectedOrganization } = useLocation();

  // --- Sequential Loop Management (Sony Sandwich Model) ---
  const [currentIdx, setCurrentIdx] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);
  
  // playbackState determines which layer is active and how we bridge transitions
  // 'playing' -> Active post visible (Z-20)
  // 'bridging' -> Previous post static image visible (Z-10), active post removed to clear decoder
  // 'loading_next' -> Next post rendering hidden (Z-20, opacity-0) to prepare
  const [playbackState, setPlaybackState] = useState<'playing' | 'bridging' | 'loading_next'>('playing');
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const timerRef = useRef<number | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const lastClickTime = useRef(0);
  const wakeLockSentinel = useRef<WakeLockSentinel | null>(null);

  /* Wake Lock for TVs */
  useEffect(() => {
    if (isEmbedded) return;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try { wakeLockSentinel.current = await (navigator as any).wakeLock.request('screen'); } catch { }
      }
    };
    requestWakeLock();
    return () => { if (wakeLockSentinel.current) wakeLockSentinel.current.release(); };
  }, [isEmbedded]);

  /* Time Tick for Schedule Check */
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

  const currentPost = activePosts[currentIdx] || null;
  const nextIdx = (currentIdx + 1) % (activePosts.length || 1);
  const nextPost = activePosts[nextIdx] || null;

  /* ADVANCE LOGIC (The Sandwich Engine) */
  const advance = useCallback(() => {
    if (activePosts.length === 0) return;
    
    // Clear all active durations and watchdogs
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (watchdogRef.current) window.clearTimeout(watchdogRef.current);

    // 1. Switch to Bridging: Removes the active post (and its video decoder) 
    // but keeps a static image of it as a bridge for the viewer.
    setPlaybackState('bridging');

    // Sony Safe-Gap: Transitional pause if switching from Video to Video
    const isVideoToVideo = (currentPost?.videoUrl || currentPost?.layout?.includes('video')) && 
                           (nextPost?.videoUrl || nextPost?.layout?.includes('video'));
    const pauseTime = isVideoToVideo ? 500 : 0;

    window.setTimeout(() => {
      // 2. Load the next post hidden (opacity-0)
      setCurrentIdx(nextIdx);
      setCycleCount(c => c + 1);
      setPlaybackState('loading_next');

      // 3. Sony Watchdog: Fail-fast if the next slide takes more than 7s to signal "ready"
      watchdogRef.current = window.setTimeout(() => {
        console.warn("Display: Media took too long to load. Advancing silently.");
        advance();
      }, 7000);
    }, pauseTime);

  }, [currentIdx, activePosts, nextIdx, currentPost, nextPost]);

  /* READY HANDLER (Received from PostRenderer) */
  const handleNextReady = useCallback(() => {
    if (playbackState === 'loading_next') {
      // Clear the loading watchdog
      if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
      
      // Post is fully prepared (Image loaded or Video ready to play)
      setPlaybackState('playing');
      
      // Setup duration timer for static content (videos use onEnded)
      const isVideo = currentPost && (currentPost.videoUrl || currentPost.layout?.includes('video'));
      if (!isVideo) {
        timerRef.current = window.setTimeout(advance, (currentPost?.durationSeconds ?? 10) * 1000);
      }
    }
  }, [playbackState, currentPost, advance]);

  /* ERROR HANDLER (Fail-Fast) */
  const handleLoadError = useCallback(() => {
    console.warn("Display: Media error or stall detected. Skipping to next.");
    advance();
  }, [advance]);

  // Initial jump to first active post if current becomes invalid
  useEffect(() => {
      if (activePosts.length > 0 && !currentPost) {
          setCurrentIdx(0);
      }
  }, [activePosts, currentPost]);

  /* Double click for Admin return */
  const handleAdminClick = (e: React.MouseEvent) => {
    if (isEmbedded) return;
    const now = Date.now();
    if (now - lastClickTime.current < 500) { onBack(); }
    lastClickTime.current = now;
  };

  if (!selectedDisplayScreen || !selectedOrganization) return null;

  const logoUrl = selectedOrganization.logoUrlDark || selectedOrganization.logoUrlLight;
  const branding = selectedDisplayScreen.branding;

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden" onClick={handleAdminClick}>
      
      {/* 
          BRIDGE LAYER (Z-10): 
          Shows a static image of the PREVIOUS post while the next one is 
          removed from DOM (bridging) or loading in the background (loading_next).
      */}
      {currentPost && (playbackState === 'bridging' || playbackState === 'loading_next') && (
        <div className="absolute inset-0 z-10">
          <DisplayPostRenderer
            // Logic: we want to show the post that was just visible
            post={activePosts[currentIdx === 0 ? activePosts.length - 1 : currentIdx - 1] || currentPost}
            isBridgeOnly={true}
            organization={selectedOrganization}
            aspectRatio={selectedDisplayScreen.aspectRatio}
          />
        </div>
      )}

      {/* 
          ACTIVE LAYER (Z-20): 
          This is where the actual rendering happens.
          It's opacity-0 during 'loading_next' and fades in during 'playing'.
      */}
      {currentPost && (
        <div className={`absolute inset-0 z-20 transition-opacity duration-700 ${playbackState === 'playing' ? 'opacity-100' : 'opacity-0'}`}>
          <DisplayPostRenderer
            key={`${currentPost.id}-${cycleCount}`}
            post={currentPost}
            onVideoEnded={advance}
            onLoadReady={handleNextReady}
            onLoadError={handleLoadError}
            organization={selectedOrganization}
            aspectRatio={selectedDisplayScreen.aspectRatio}
            mode="live"
          />
        </div>
      )}

      {/* 
          OVERLAY UI (Z-30+)
      */}
      {currentPost && playbackState === 'playing' && !currentPost.videoUrl && (
        <ProgressBar duration={currentPost.durationSeconds ?? 10} isPaused={false} />
      )}

      {branding?.isEnabled && (branding.showLogo || branding.showName) && (
        <div className="absolute bottom-6 right-6 z-30 flex items-center gap-2 bg-black/50 backdrop-blur-sm p-1.5 rounded-md">
          {branding.showLogo && logoUrl && <img src={logoUrl} alt="" className="max-h-8 max-w-[100px] object-contain" />}
          {branding.showName && <p className="font-semibold text-sm text-white/90">{selectedOrganization.brandName || selectedOrganization.name}</p>}
        </div>
      )}

      {isEmbedded && (
        <a href="https://smartskylt.se" target="_blank" rel="noopener noreferrer" className="absolute bottom-4 right-4 z-40 bg-black/50 text-white/80 text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-sm no-underline">
          Powered by Smart Skylt
        </a>
      )}
    </div>
  );
};
