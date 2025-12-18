import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from '../context/StudioContext';
import { DisplayPost } from '../types';
import { DisplayPostRenderer } from './DisplayPostRenderer';
import { parseToDate } from '../utils/dateUtils';

interface DisplayWindowScreenProps {
  onBack: () => void;
  isEmbedded?: boolean;
}

/* ===================== Datum-helpers (Behålls orörda) ===================== */
const isPostActive = (post: DisplayPost, now: Date) => {
    if (post.status === 'archived') return false; 
    const start = parseToDate(post.startDate, false);
    if (!start || start > now) return false;
    const end = parseToDate(post.endDate, true);
    if (end && end < now) return false;
    return true;
};

/* ===================== UI: ProgressBar ===================== */
const ProgressBar: React.FC<{ duration: number; isPaused: boolean }> = ({ duration, isPaused }) => {
  return (
    <div className="absolute bottom-0 left-0 h-1.5 bg-white/20 w-full z-50">
      <div 
        key={duration} // Reset animation on new duration
        className="h-full bg-white origin-left animate-progress-linear" 
        style={{ animationDuration: `${duration}s` }} 
      />
       <style>{`
        @keyframes progress-linear { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .animate-progress-linear { animation: progress-linear linear forwards; }
      `}</style>
    </div>
  );
};

export const DisplayWindowScreen: React.FC<DisplayWindowScreenProps> = ({ onBack, isEmbedded = false }) => {
  const { selectedDisplayScreen, selectedOrganization } = useLocation();

  // --- STATE ---
  const [currentPostId, setCurrentPostId] = useState<string | null>(null);
  const [isClearingDecoder, setIsClearingDecoder] = useState(false); // NYTT: För Sony-säkerhet
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Refs
  const wakeLockSentinel = useRef<WakeLockSentinel | null>(null);
  const [lastClickTime, setLastClickTime] = useState(0);

  /* --- WAKE LOCK (Håll skärmen vaken) --- */
  useEffect(() => {
    if (isEmbedded) return;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          // @ts-ignore
          wakeLockSentinel.current = await navigator.wakeLock.request('screen');
        } catch { /* noop */ }
      }
    };
    requestWakeLock();
    const handleVisChange = () => { if (document.visibilityState === 'visible') requestWakeLock(); };
    document.addEventListener('visibilitychange', handleVisChange);
    return () => {
       // @ts-ignore
      if (wakeLockSentinel.current) wakeLockSentinel.current.release();
      document.removeEventListener('visibilitychange', handleVisChange);
    };
  }, [isEmbedded]);

  /* --- TIME TICK --- */
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  /* --- FILTER ACTIVE POSTS --- */
  const activePosts = useMemo(() => {
    const posts = selectedDisplayScreen?.posts ?? [];
    if (!selectedDisplayScreen?.isEnabled || posts.length === 0) return [];
    return posts.filter(p => isPostActive(p, currentTime));
  }, [selectedDisplayScreen, currentTime]);

  /* --- DETERMINE CURRENT POST --- */
  const currentPost = useMemo(() => {
      if (activePosts.length === 0) return null;
      if (!currentPostId) return activePosts[0];
      return activePosts.find(p => p.id === currentPostId) || activePosts[0];
  }, [activePosts, currentPostId]);

  /* --- SÄKER NAVIGATION (THE SONY MODEL) --- */
  const advance = useCallback(() => {
    if (activePosts.length === 0) return;

    const currentIndex = activePosts.findIndex(p => p.id === (currentPostId || activePosts[0].id));
    // Om posten försvunnit (t.ex. datum gick ut), börja om
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    
    const nextIndex = (safeIndex + 1) % activePosts.length;
    const nextPost = activePosts[nextIndex];
    const prevPost = activePosts[safeIndex];

    // Detektera om vi går Video -> Video (Risk för krasch)
    const isPrevVideo = prevPost?.type === 'video' || (prevPost?.layout.includes('video') && !!prevPost?.videoUrl);
    const isNextVideo = nextPost?.type === 'video' || (nextPost?.layout.includes('video') && !!nextPost?.videoUrl);
    
    const needsDecoderReset = isPrevVideo && isNextVideo;

    if (needsDecoderReset) {
      // 1. Tvinga bort allt från DOM (svart skärm)
      setIsClearingDecoder(true);
      
      // 2. Vänta en halv sekund så hårdvaran töms
      setTimeout(() => {
        setCurrentPostId(nextPost.id);
        // 3. Återställ rendering
        setTimeout(() => setIsClearingDecoder(false), 50);
      }, 500);
    } else {
      // Bild -> Video eller Video -> Bild är säkert att byta direkt
      setCurrentPostId(nextPost.id);
    }
  }, [activePosts, currentPostId]);


  /* --- ADMIN CLICK --- */
  const handleAdminClick = (e: React.MouseEvent) => {
    if (isEmbedded) return;
    const now = Date.now();
    if (now - lastClickTime < 500) { e.stopPropagation(); onBack(); }
    setLastClickTime(now);
  };

  /* --- LOADING / ERROR STATES --- */
  if (!selectedDisplayScreen || !selectedOrganization) {
    return <div className="bg-black text-white min-h-screen flex items-center justify-center">Laddar...</div>;
  }
  if (!selectedDisplayScreen.isEnabled) {
    return <div className="bg-black text-white min-h-screen flex items-center justify-center">Skärm ej aktiv</div>;
  }

  // Branding config
  const branding = selectedDisplayScreen.branding;
  const logoUrl = selectedOrganization.logoUrlDark || selectedOrganization.logoUrlLight;
  const getPositionClasses = (position = 'bottom-right') => {
    switch (position) {
      case 'top-left': return 'top-6 left-6';
      case 'top-right': return 'top-6 right-6';
      case 'bottom-left': return 'bottom-6 left-6';
      default: return 'bottom-6 right-6';
    }
  };

  const isVideoPost = currentPost && (currentPost.type === 'video' || currentPost.layout.includes('video')) && !!currentPost.videoUrl;

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden" onClick={handleAdminClick}>
      
      {/* HÄR ÄR NYCKELN TILL STABILITETEN:
          Antingen visar vi en svart "Clearing"-div, eller så renderar vi EN ENDA renderer.
          Inga komplexa Wrappers som ligger ovanpå varandra.
      */}
      
      {isClearingDecoder ? (
        <div className="absolute inset-0 bg-black z-50" />
      ) : (
        currentPost ? (
            // Key=currentPost.id tvingar React att montera om komponenten helt.
            // Det rensar minnet effektivare än att bara uppdatera props.
            <div className="absolute inset-0 animate-fade-in-gentle">
                 <DisplayPostRenderer 
                    key={currentPost.id} 
                    post={currentPost}
                    onFinished={advance} // Kallas när tiden är ute eller videon slut
                    organization={selectedOrganization}
                    allTags={selectedOrganization.tags}
                    primaryColor={selectedOrganization.primaryColor}
                    aspectRatio={selectedDisplayScreen.aspectRatio}
                    mode="live"
                 />
            </div>
        ) : (
            <div className="flex items-center justify-center h-full text-gray-500">Inga aktiva inlägg</div>
        )
      )}

      {/* Progressbar (visas ej för video då video styr sin egen tid) */}
      {currentPost && !isVideoPost && !isClearingDecoder && (
         <ProgressBar duration={currentPost.durationSeconds || 10} isPaused={false} />
      )}

      {/* BRANDING */}
      {branding?.isEnabled && (branding.showLogo || branding.showName) && !isClearingDecoder && (
        <div className={`absolute ${getPositionClasses(branding.position)} z-30`}>
            <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm p-1.5 rounded-md">
                {branding.showLogo && logoUrl && <img src={logoUrl} alt="Logo" className="max-h-8 max-w-[100px] object-contain" />}
                {branding.showName && <p className="font-semibold text-sm text-white/90">{selectedOrganization.brandName || selectedOrganization.name}</p>}
            </div>
        </div>
      )}

      {/* EMBEDDED FOOTER */}
      {isEmbedded && (
        <div className="absolute bottom-4 right-4 z-40 bg-black/50 text-white/80 text-xs px-3 py-1 rounded-full">
          Powered by Smart Skylt
        </div>
      )}

      <style>{`
        .animate-fade-in-gentle { animation: fadeIn 0.5s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
};