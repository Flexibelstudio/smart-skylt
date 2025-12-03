
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
type FirestoreTimestamp = { seconds: number; nanoseconds?: number; toDate?: () => Date };
/* ============= Gör listan stabil mellan realtidsuppdateringar ============= */
function useStablePosts(posts: DisplayPost[]): DisplayPost[] {
  const prevRef = useRef<DisplayPost[] | null>(null);
  const sigRef = useRef<string>('');
  const signature = useMemo(() => {
    return posts
      .map(p =>
        [
          p.id ?? '',
          String(p.startDate ?? ''),
          String(p.endDate ?? ''),
          String(p.durationSeconds ?? ''),
          String(p.transitionToNext ?? ''),
          String(p.layout ?? ''),
        ].join('~')
      )
      .join('|');
  }, [posts]);

  if (signature !== sigRef.current) {
    sigRef.current = signature;
    prevRef.current = posts;
  }
  return prevRef.current ?? posts;
}

/* ===================== UI: ProgressBar ===================== */
const ProgressBar: React.FC<{ duration: number; isPaused: boolean }> = ({ duration, isPaused }) => {
  const style: React.CSSProperties = {
    animationDuration: `${duration}s`,
    animationPlayState: isPaused ? 'paused' : 'running',
  };
  return (
    <div className="absolute bottom-0 left-0 h-1.5 bg-white/20 w-full">
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
  onVideoEnded: () => void;
  primaryColor?: string;
  cycleCount: number;
  organization?: Organization;
  aspectRatio: DisplayScreen['aspectRatio'];
}> = ({ post, state, transitionType, allTags, onVideoEnded, primaryColor, cycleCount, organization, aspectRatio }) => {
  const getAnimationClass = () => {
    if (state === 'exiting') {
      switch (transitionType || 'fade') {
        case 'slide': return 'animate-slide-out-post';
        case 'dissolve': return 'animate-dissolve-out-post';
        case 'fade':
        default: return 'animate-fade-out-post';
      }
    }
    return 'opacity-100';
  };
  const getZIndexClass = () => (state === 'exiting' ? 'z-20' : 'z-10');

  return (
    <div className={`absolute inset-0 ${getAnimationClass()} ${getZIndexClass()}`}>
      <DisplayPostRenderer
        post={post}
        allTags={allTags}
        onVideoEnded={onVideoEnded}
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

  const [currentIndex, setCurrentIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const timerRef = useRef<number | null>(null);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const wakeLockSentinel = useRef<WakeLockSentinel | null>(null);

  /* Wake Lock (ej inbäddat) */
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

  /* Uppdatera “nu” varje minut (för publiceringsfiltret) */
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  /* Publicerad-logik */
  const filtered = useMemo(() => {
    const posts = selectedDisplayScreen?.posts ?? [];
    if (!selectedDisplayScreen?.isEnabled || posts.length === 0) return [];

    const now = currentTime;
    // Grace period på 2 minuter för att hantera klockdiffar
    const gracePeriodMs = 2 * 60 * 1000; 
    const nowWithGrace = new Date(now.getTime() + gracePeriodMs);

    return posts.filter(p => {
      if (p.status === 'archived') return false;
      
      const start = parseToDate(p.startDate, false);
      // Om startdatum finns OCH det är mer än 2 minuter in i framtiden -> dölj.
      if (start && start > nowWithGrace) return false;
      
      const end = parseToDate(p.endDate, true);
      // Om slutdatum passerat -> dölj.
      if (end && end < now) return false;
      
      return true;
    });
  }, [selectedDisplayScreen, currentTime]);

  /* Stabil version som inte byter referens i onödan (pga realtid) */
  const activePosts = useStablePosts(filtered);

  /* Håll index giltigt och försök hitta rätt post om listan ändras */
  const currentPostIdRef = useRef<string | null>(null);

  // Spara vilket ID vi tittar på, så vi kan hitta tillbaka om listan ändras
  useEffect(() => {
      if (activePosts[currentIndex]) {
          currentPostIdRef.current = activePosts[currentIndex].id;
      }
  }, [currentIndex, activePosts]);

  useEffect(() => {
    if (activePosts.length === 0) return;

    const postAtIndex = activePosts[currentIndex];
    
    // Om index pekar fel, eller om inlägget på detta index har bytts ut mot ett annat
    if (!postAtIndex || (currentPostIdRef.current && postAtIndex.id !== currentPostIdRef.current)) {
        if (currentPostIdRef.current) {
            const foundIndex = activePosts.findIndex(p => p.id === currentPostIdRef.current);
            if (foundIndex !== -1) {
                // Vi hittade inlägget på en ny plats -> hoppa dit
                setCurrentIndex(foundIndex);
            } else {
                // Inlägget är borta (borttaget eller utgånget) -> börja om från 0
                setCurrentIndex(0);
            }
        } else {
            setCurrentIndex(0);
        }
    }
  }, [activePosts]); // Körs när activePosts (stabil) ändras

  /* Avancera */
  const advance = useCallback(() => {
    if (isTransitioning) return;
    if (activePosts.length <= 1) {
      setCycleCount(c => c + 1);
      return;
    }
    setIsTransitioning(true);
    setCurrentIndex(prev => {
      setPreviousIndex(prev);
      return (prev + 1) % activePosts.length;
    });
    setCycleCount(c => c + 1);
    window.setTimeout(() => {
      setPreviousIndex(null);
      setIsTransitioning(false);
    }, 1200); // matcha CSS-transition
  }, [isTransitioning, activePosts.length]);

  /* Timer – bero på aktuell post, inte hela arrayen */
  const currentPost = activePosts[currentIndex];
  
  useEffect(() => {
    // Rensa alltid gammal timer när vi renderar om (nytt index eller post)
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    if (isTransitioning || !currentPost) return;

    const isMediaLayout = ['image-fullscreen', 'video-fullscreen', 'image-left', 'image-right'].includes(currentPost.layout);
    // Kolla om det är en video som SKA spelas (dvs har URL och ingen täckande bild)
    const hasActiveVideo = isMediaLayout && !(currentPost as any).imageUrl && (currentPost as any).videoUrl;

    let durationMs = ((currentPost as any).durationSeconds ?? 10) * 1000;

    if (hasActiveVideo) {
      // FAILSAFE: Även om videon ska styra, sätt en timer på videolängd + 5 sekunder.
      // Om videon kraschar, eller 'ended' eventet missas, går vi vidare ändå.
      // Vi gissar på en generös max-tid om vi inte vet längden, t.ex. 60s, eller litar på durationSeconds om den är satt rimligt.
      const safeGuardDuration = Math.max(durationMs, 60000); 
      
      timerRef.current = window.setTimeout(() => {
        console.warn("Video failsafe triggered - forcing advance");
        advance();
      }, safeGuardDuration);
      
      return; // Låt onVideoEnded (i <DisplayPostRenderer>) sköta advance normalt
    }

    timerRef.current = window.setTimeout(() => {
      advance();
    }, durationMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentPost, currentIndex, isTransitioning, advance]); // Dependencies minimerade

  /* Admin dubbelklick */
  const handleAdminClick = (e: React.MouseEvent) => {
    if (isEmbedded) return;
    const now = Date.now();
    if (now - lastClickTime < 500) {
      e.stopPropagation();
      onBack();
    }
    setLastClickTime(now);
  };

  if (!selectedDisplayScreen || !selectedOrganization) {
    return <div className="bg-black text-white min-h-screen flex items-center justify-center">Laddar skärm...</div>;
  }
  if (!selectedDisplayScreen.isEnabled) {
    return <div className="bg-black text-white min-h-screen flex items-center justify-center">Denna skärm är inte aktiverad.</div>;
  }

  const branding = selectedDisplayScreen.branding;
  const logoUrl = selectedOrganization.logoUrlDark || selectedOrganization.logoUrlLight;

  const getPositionClasses = (position: BrandingOptions['position'] = 'bottom-right') => {
    switch (position) {
      case 'top-left': return 'top-6 left-6';
      case 'top-right': return 'top-6 right-6';
      case 'bottom-left': return 'bottom-6 left-6';
      case 'bottom-right':
      default: return 'bottom-6 right-6';
    }
  };

  const previousPost = previousIndex !== null ? activePosts[previousIndex] : null;
  
  // Helper to determine if we should show the progress bar (skip for videos)
  const isMediaLayout = ['image-fullscreen', 'video-fullscreen', 'image-left', 'image-right'].includes(currentPost?.layout || '');
  const hasActiveVideo = isMediaLayout && !(currentPost as any)?.imageUrl && (currentPost as any)?.videoUrl;

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden" onClick={handleAdminClick}>
      {previousPost && (
        <PostWrapper
          // Unik key för previous ser till att den inte blandas ihop med current
          key={`prev-${(previousPost as any).id}`}
          post={previousPost}
          state="exiting"
          transitionType={(previousPost as any).transitionToNext}
          allTags={selectedOrganization.tags}
          onVideoEnded={advance}
          primaryColor={selectedOrganization.primaryColor}
          cycleCount={cycleCount - 1}
          organization={selectedOrganization}
          aspectRatio={selectedDisplayScreen.aspectRatio}
        />
      )}

      {currentPost ? (
        <PostWrapper
          // FIX: Använd ett stabilt key baserat på ID. 
          // Vi använder INTE cycleCount i key, för att undvika att komponenten unmountas/remountas i onödan (vilket skapar blinkningar).
          // Istället skickar vi cycleCount som prop till DisplayPostRenderer, som lyssnar på ändringar och spolar tillbaka videon vid behov.
          key={`post-${(currentPost as any).id}`}
          post={currentPost}
          state={isTransitioning ? 'entering' : 'idle'}
          transitionType={undefined} // Current post doesn't use transitionType entering, handled by CSS
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

      {activePosts.length > 1 && currentPost && !hasActiveVideo && (
        <ProgressBar duration={(currentPost as any).durationSeconds ?? 10} isPaused={isTransitioning} />
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
