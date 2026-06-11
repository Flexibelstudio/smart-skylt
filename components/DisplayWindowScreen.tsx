import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from '../context/StudioContext';
import { DisplayPost } from '../types';
import { DisplayPostRenderer } from './DisplayPostRenderer';
import { SplitScreenLayout } from './SplitScreenLayout';
import { parseToDate } from '../utils/dateUtils';

interface DisplayWindowScreenProps {
  onBack: () => void;
  isEmbedded?: boolean;
}

/* ===================== Helpers ===================== */
const isPostActive = (post: DisplayPost, now: Date) => {
    if (post.status === 'archived') return false; 
    const start = parseToDate(post.startDate, false);
    if (!start || start > now) return false;
    const end = parseToDate(post.endDate, true);
    if (end && end < now) return false;
    return true;
};

const ProgressBar: React.FC<{ duration: number }> = ({ duration }) => {
  return (
    <div className="absolute bottom-0 left-0 h-1.5 bg-white/20 w-full z-50">
      <div 
        key={duration} 
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
  const [currentIdx, setCurrentIdx] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);
  
  // "Bridging" betyder att vi visar en stillbild av förra inlägget medan nästa laddar.
  // Detta förhindrar svart skärm och krascher.
  const [isBridging, setIsBridging] = useState(false); 
  const [prevPost, setPrevPost] = useState<DisplayPost | null>(null);
  
  const [currentTime, setCurrentTime] = useState(new Date());

  // Refs för timers så vi kan döda dem
  const activeTimerRef = useRef<number | null>(null); // Den vanliga visningstiden
  const panicTimerRef = useRef<number | null>(null);  // Vakthunden som räddar frysningar
  
  const wakeLockSentinel = useRef<WakeLockSentinel | null>(null);
  const lastClickTime = useRef(0);

  /* --- WAKE LOCK --- */
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
    return () => { 
       // @ts-ignore
       if (wakeLockSentinel.current) wakeLockSentinel.current.release(); 
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

  const currentPost = activePosts[currentIdx] || null;
  const nextIdx = (currentIdx + 1) % (activePosts.length || 1);
  const nextPost = activePosts[nextIdx] || null; // För bryggan

  /* --- ADVANCE LOGIC (Hjärnan) --- */
  const advance = useCallback(() => {
    if (activePosts.length === 0) return;

    // 1. Rensa alla gamla timers så vi inte får dubbla hopp
    if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
    if (panicTimerRef.current) clearTimeout(panicTimerRef.current);

    // 2. Aktivera brygga (Sparar föregående inlägg i state)
    setPrevPost(currentPost);
    setIsBridging(true);

    // 3. Kolla om vi går Video -> Video (Sony-krasch risk)
    // FIX: 'type' finns inte på DisplayPost. Vi kollar layout och videoUrl istället.
    const isCurrentVideo = !!(currentPost?.videoUrl || currentPost?.layout.includes('video'));
    const isNextVideo = !!(activePosts[nextIdx]?.videoUrl || activePosts[nextIdx]?.layout.includes('video'));
    
    // Om Video->Video, vänta 500ms extra med svart/brygga för att tömma minnet
    const safetyGap = (isCurrentVideo && isNextVideo) ? 500 : 50;

    setTimeout(() => {
        // 4. Byt till nästa inlägg (bakom kulisserna)
        setCurrentIdx(nextIdx);
        setCycleCount(c => c + 1);
        
        // 5. Starta PANIK-TIMERN direkt! 
        // Om det nya inlägget inte säger "Ready" inom 7 sekunder -> Hoppa vidare.
        // Detta löser "Media saknas"-frysningen.
        panicTimerRef.current = window.setTimeout(() => {
            console.warn("⚠️ Vakthund: Inlägget laddade aldrig (Media saknas?). Hoppar vidare.");
            advance();
        }, 7000);

    }, safetyGap);

  }, [activePosts, currentIdx, nextIdx, currentPost]);


  /* --- READY HANDLER (När DisplayPostRenderer ropar "Jag är klar!") --- */
  const handlePostReady = useCallback(() => {
    // 1. Media finns och är laddat! Döda panik-timern.
    if (panicTimerRef.current) clearTimeout(panicTimerRef.current);

    // 2. Ta bort bryggan (Gör inlägget synligt och startar fade-in)
    setIsBridging(false);

    // Clear the previous post after the fade-in animation has completed (transition is duration-300)
    setTimeout(() => {
      setPrevPost(null);
    }, 450);

    // 3. Sätt en ny timer för hur länge inlägget ska visas
    // Om det är video: Videon själv ropar på 'advance' via onVideoEnded.
    // Men vi sätter ändå en "Max Timer" ifall videon hänger sig.
    
    const isVideo = currentPost && (currentPost.videoUrl || currentPost.layout?.includes('video'));
    const duration = (currentPost?.durationSeconds || 10) * 1000;

    if (!isVideo) {
        // BILD: Visa i inställd tid, sen gå vidare.
        activeTimerRef.current = window.setTimeout(advance, duration);
    } else {
        // VIDEO: Vi litar på onVideoEnded, men sätter en failsafe på (Längd + 5 sekunder)
        // Detta förhindrar evig frysning om videon inte triggar 'ended'.
        activeTimerRef.current = window.setTimeout(() => {
             console.warn("⚠️ Video Failsafe: Videon tog för lång tid. Tvingar byte.");
             advance();
        }, duration + 5000); 
    }

  }, [currentPost, advance]);


  /* --- ERROR HANDLER --- */
  const handlePostError = useCallback(() => {
      console.warn("❌ Media Error mottaget. Visar ändå inlägget utan tidsglapp eller hopp.");
      // Istället för att helt hoppa över inlägget, visa det med dess text/färg så användaren
      // hinner läsa, och låt den stå sin inställda tid innan den rullar vidare!
      handlePostReady();
  }, [handlePostReady]);


  // Init: Om vi inte har en post vald, välj första
  useEffect(() => {
      if (activePosts.length > 0 && !currentPost) {
          setCurrentIdx(0);
      }
  }, [activePosts, currentPost]);


  /* --- RENDER --- */
  if (!selectedDisplayScreen || !selectedOrganization) return <div className="bg-black w-screen h-screen" />;

  const logoUrl = selectedOrganization.logoUrlDark || selectedOrganization.logoUrlLight;
  const branding = selectedDisplayScreen.branding;
  const isVideo = currentPost && (currentPost.videoUrl || currentPost.layout?.includes('video'));
  const isSplitScreenActive = selectedDisplayScreen.zones?.isEnabled && selectedDisplayScreen.zones?.layoutType !== 'none';

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden" 
         onClick={(e) => {
            // Admin escape: Dubbelklick i hörn (simulerat med tid)
            const now = Date.now();
            if (now - lastClickTime.current < 500 && !isEmbedded) onBack();
            lastClickTime.current = now;
         }}
    >
      
      {/* 1. SEAMLESS BRYGGA (Stillbild av föregående inlägg medan det nya laddar bakom kulisserna) */}
      {prevPost && (
        <div className="absolute inset-0 z-0 select-none pointer-events-none">
          <SplitScreenLayout screen={selectedDisplayScreen} organization={selectedOrganization}>
            <DisplayPostRenderer 
              key={`bridge-${prevPost.id}`}
              post={prevPost}
              organization={selectedOrganization}
              aspectRatio={selectedDisplayScreen.aspectRatio}
              isBridgeOnly={true} // Safe-mode, no sound, no video play
              onLoadReady={() => {}} 
              onLoadError={() => {}}
              onVideoEnded={() => {}}
            />
          </SplitScreenLayout>
        </div>
      )}
      
      {/* 2. AKTIVT INLÄGG (Fadas in ovanpå bryggan först när det är färdigladdat) */}
      {currentPost && (
        <div className={`absolute inset-0 z-10 transition-opacity duration-300 ${isBridging ? 'opacity-0' : 'opacity-100'}`}>
           <SplitScreenLayout screen={selectedDisplayScreen} organization={selectedOrganization}>
           <DisplayPostRenderer 
              key={`${currentPost.id}-${cycleCount}`} // Tvingar omstart vid varje varv
              post={currentPost}
              organization={selectedOrganization}
              aspectRatio={selectedDisplayScreen.aspectRatio}
              
              // Callbacks
              onLoadReady={handlePostReady}  // "Jag har laddat bilden/buffrat videon!"
              onLoadError={handlePostError}  // "Filen finns inte!"
              onVideoEnded={advance}         // "Filmen är slut!"
              
              // Sony Props
              isBridgeOnly={false} 
           />
          </SplitScreenLayout>
        </div>
      )}
      
      {/* 3. PROAKTIV PRELOADER (Laddar tyst nästa inläggs bilder/videor i bakgrunden så de öppnas direkt) */}
      {nextPost && (
        <div className="hidden width-0 height-0 overflow-hidden opacity-0 pointer-events-none absolute" aria-hidden="true">
          {nextPost.imageUrl && (
            <img src={nextPost.imageUrl} alt="" />
          )}
          {nextPost.videoUrl && (
            <video src={nextPost.videoUrl} preload="auto" muted playsInline />
          )}
          {nextPost.layout === 'collage' && (nextPost.collageItems || []).map((item, idx) => (
            <React.Fragment key={item.id || idx}>
              {item.imageUrl && <img src={item.imageUrl} alt="" />}
              {item.videoUrl && <video src={item.videoUrl} preload="auto" muted playsInline />}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* PROGRESS BAR (Bara för bilder) */}
      {!isBridging && currentPost && !isVideo && (
         <ProgressBar duration={currentPost.durationSeconds || 10} />
      )}

      {/* BRANDING */}
      {branding?.isEnabled && (branding.showLogo || branding.showName) && !isBridging && !isSplitScreenActive && (
        <div className="absolute bottom-6 right-6 z-30 flex items-center gap-2 bg-black/50 backdrop-blur-sm p-1.5 rounded-md">
            {branding.showLogo && logoUrl && <img src={logoUrl} alt="" className="max-h-8 max-w-[100px] object-contain" />}
            {branding.showName && <p className="font-semibold text-sm text-white/90">{selectedOrganization.brandName || selectedOrganization.name}</p>}
        </div>
      )}
    </div>
  );
};
