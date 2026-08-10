import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from '../context/StudioContext';
import { DisplayPost } from '../types';
import { DisplayPostRenderer } from './DisplayPostRenderer';
import { SplitScreenLayout } from './SplitScreenLayout';
import { parseToDate } from '../utils/dateUtils';
import { getFirebaseProjectId } from '../services/firebaseInit';

/* ===================== Config & Helpers ===================== */
const USE_DOUBLE_BUFFER = true; // false = gamla brygg-logiken (fallback)

type BufferLayer = { post: DisplayPost | null; cycle: number };

const isPostActive = (post: DisplayPost, now: Date) => {
    if (post.status === 'archived' || post.status === 'draft') return false; 
    const start = parseToDate(post.startDate, false);
    if (!start || start > now) return false;
    const end = parseToDate(post.endDate, true);
    if (end && end < now) return false;

    // Veckodagarsschemaläggning (0 = Söndag, 1 = Måndag, etc.)
    if (post.scheduleDays && post.scheduleDays.length > 0) {
        const currentDay = now.getDay();
        if (!post.scheduleDays.includes(currentDay)) {
            return false;
        }
    }

    // Tidsspannsschemaläggning under dagen (t.ex. 08:30 - 17:00, eller 22:00 - 02:00 över midnatt)
    if (post.scheduleTimeRanges && post.scheduleTimeRanges.length > 0) {
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const hasMatchingTime = post.scheduleTimeRanges.some(range => {
            if (!range.startTime || !range.endTime) return false;
            const [sh, sm] = range.startTime.split(':').map(Number);
            const [eh, em] = range.endTime.split(':').map(Number);
            const startMin = (sh || 0) * 60 + (sm || 0);
            const endMin = (eh || 0) * 60 + (em || 0);
            return startMin <= endMin
                ? currentMinutes >= startMin && currentMinutes <= endMin
                : currentMinutes >= startMin || currentMinutes <= endMin; // spann över midnatt
        });
        if (!hasMatchingTime) {
            return false;
        }
    }

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

interface DisplayWindowScreenProps {
  onBack: () => void;
  isEmbedded?: boolean;
}

export const DisplayWindowScreen: React.FC<DisplayWindowScreenProps> = ({ onBack, isEmbedded = false }) => {
  const { selectedDisplayScreen, selectedOrganization } = useLocation();

  // --- STATE ---
  const [currentIdx, setCurrentIdx] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);
  
  // Gamla brygg-logiken state (fallback när USE_DOUBLE_BUFFER = false)
  const [isBridging, setIsBridging] = useState(false); 
  const [prevPost, setPrevPost] = useState<DisplayPost | null>(null);

  // Dubbelbuffrad state (när USE_DOUBLE_BUFFER = true)
  const [layers, setLayers] = useState<[BufferLayer, BufferLayer]>([
    { post: null, cycle: 0 },
    { post: null, cycle: 0 },
  ]);
  const [activeLayerIdx, setActiveLayerIdx] = useState<0 | 1>(0);
  const pendingLayerRef = useRef<0 | 1 | null>(null);
  const [isFadingOutVideo, setIsFadingOutVideo] = useState(false);
  
  const [currentTime, setCurrentTime] = useState(new Date());

  // Refs för timers så vi kan döda dem
  const activeTimerRef = useRef<number | null>(null); // Den vanliga visningstiden
  const panicTimerRef = useRef<number | null>(null);  // Vakthunden som räddar frysningar
  const bridgeTimerRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);

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
    const t = setInterval(() => setCurrentTime(new Date()), 10000);
    return () => clearInterval(t);
  }, []);

  // Städa alla timers när visningsvyn lämnas
  useEffect(() => {
    return () => {
      if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
      if (panicTimerRef.current) clearTimeout(panicTimerRef.current);
      if (bridgeTimerRef.current) clearTimeout(bridgeTimerRef.current);
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  /* --- FILTER ACTIVE POSTS --- */
  // QR-spårningslänkar: mappas ENDAST när skärmdatat ändras (inte varje tidstick)
  const trackedPosts = useMemo(() => {
      const posts = selectedDisplayScreen?.posts ?? [];
      const orgId = selectedOrganization?.id;
      const screenId = selectedDisplayScreen?.id;
      const projectId = getFirebaseProjectId();
      if (!orgId || !screenId || !projectId || posts.length === 0) return posts;
      const base = `https://us-central1-${projectId}.cloudfunctions.net/qrRedirect`;
      return posts.map(p => p.qrCodeUrl
          ? { ...p, qrCodeUrl: `${base}/${orgId}/${screenId}/${p.id}`, qrCodeDisplayUrl: p.qrCodeUrl }
          : p);
  }, [selectedDisplayScreen, selectedOrganization]);

  // Tidsfiltret skapar INGA nya objekt — samma referenser mellan tickarna
  const activePosts = useMemo(() => {
      if (!selectedDisplayScreen?.isEnabled || trackedPosts.length === 0) return [];
      return trackedPosts.filter(p => isPostActive(p, currentTime));
  }, [trackedPosts, selectedDisplayScreen?.isEnabled, currentTime]);

  const currentPost = USE_DOUBLE_BUFFER 
    ? layers[activeLayerIdx].post 
    : (activePosts[currentIdx] || null);

  const nextIdx = (currentIdx + 1) % (activePosts.length || 1);
  const nextPost = activePosts[nextIdx] || null;

  // Föravkoda nästa inläggs bilder så bytet inte hackar (decode körs off-thread)
  useEffect(() => {
      if (!nextPost) return;
      const urls = [
          nextPost.imageUrl,
          ...(nextPost.subImages || []).map(s => s.imageUrl),
          ...(nextPost.collageItems || []).map(c => c.imageUrl),
      ].filter(Boolean) as string[];
      urls.forEach(url => {
          const img = new Image();
          img.src = url;
          img.decode().catch(() => {}); // best effort — får aldrig kasta
      });
  }, [nextPost]);

  /* --- ADVANCE LOGIC --- */
  const advance = useCallback(() => {
    if (activePosts.length === 0) return;

    // 1. Rensa alla gamla timers så vi inte får dubbla hopp
    if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
    if (panicTimerRef.current) clearTimeout(panicTimerRef.current);
    if (bridgeTimerRef.current) clearTimeout(bridgeTimerRef.current);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);

    if (!USE_DOUBLE_BUFFER) {
      // --- GAMLA BRYGG-LOGIKEN (FALLBACK) ---
      setPrevPost(currentPost);
      setIsBridging(true);

      const isCurrentVideo = !!(currentPost?.videoUrl || currentPost?.layout.includes('video'));
      const isNextVideo = !!(activePosts[nextIdx]?.videoUrl || activePosts[nextIdx]?.layout.includes('video'));
      
      const safetyGap = (isCurrentVideo && isNextVideo) ? 500 : 50;

      bridgeTimerRef.current = window.setTimeout(() => {
          setCurrentIdx(nextIdx);
          setCycleCount(c => c + 1);
          
          panicTimerRef.current = window.setTimeout(() => {
              console.warn("⚠️ Vakthund: Inlägget laddade aldrig (Media saknas?). Hoppar vidare.");
              advance();
          }, 7000);
      }, safetyGap);
      return;
    }

    // --- DUBBELBUFFRAD LOGIK (USE_DOUBLE_BUFFER = true) ---
    const targetIdx = nextIdx;
    const incomingPost = activePosts[targetIdx] || null;
    if (!incomingPost) return;

    const currentLayerPost = layers[activeLayerIdx].post;
    const isCurrentVideo = !!(currentLayerPost?.videoUrl || currentLayerPost?.layout?.includes('video'));
    const isNextVideo = !!(incomingPost?.videoUrl || incomingPost?.layout?.includes('video'));

    const inactiveLayerIdx = (1 - activeLayerIdx) as 0 | 1;

    const setupPendingLayer = () => {
      setCurrentIdx(targetIdx);
      setLayers(prev => {
        const next = [...prev] as [BufferLayer, BufferLayer];
        next[inactiveLayerIdx] = { post: incomingPost, cycle: next[inactiveLayerIdx].cycle + 1 };
        return next;
      });
      pendingLayerRef.current = inactiveLayerIdx;

      // Starta panik-timern (7 s)
      panicTimerRef.current = window.setTimeout(() => {
        console.warn("⚠️ Vakthund: Inlägget laddade aldrig (Media saknas?). Hoppar vidare.");
        advance();
      }, 7000);
    };

    // 4. VIDEO→VIDEO-UNDANTAG (Sony-minnesskydd): BÅDE utgående och inkommande inlägg är video.
    // Korsfada INTE. Kör sekventiellt: fada ut gamla lagret till svart (500 ms),
    // töm det, vänta 300 ms, växla sedan in nya lagret när dess ready kommit.
    if (isCurrentVideo && isNextVideo) {
      setIsFadingOutVideo(true);
      bridgeTimerRef.current = window.setTimeout(() => {
        setLayers(prev => {
          const next = [...prev] as [BufferLayer, BufferLayer];
          next[activeLayerIdx] = { post: null, cycle: next[activeLayerIdx].cycle };
          return next;
        });
        setIsFadingOutVideo(false);

        bridgeTimerRef.current = window.setTimeout(() => {
          setupPendingLayer();
        }, 300);
      }, 500);
    } else {
      setupPendingLayer();
    }

  }, [activePosts, currentPost, nextIdx, activeLayerIdx, layers]);


  /* --- READY HANDLER --- */
  const handlePostReady = useCallback((layerIdx?: number) => {
    if (!USE_DOUBLE_BUFFER) {
      if (panicTimerRef.current) clearTimeout(panicTimerRef.current);
      setIsBridging(false);
      setTimeout(() => {
        setPrevPost(null);
      }, 450);

      const isVideo = currentPost && (currentPost.videoUrl || currentPost.layout?.includes('video'));
      const duration = (currentPost?.durationSeconds || 10) * 1000;

      if (!isVideo) {
          activeTimerRef.current = window.setTimeout(advance, duration);
      } else {
          activeTimerRef.current = window.setTimeout(() => {
               console.warn("⚠️ Video Failsafe: Videon tog för lång tid. Tvingar byte.");
               advance();
          }, duration + 5000); 
      }
      return;
    }

    // --- DUBBELBUFFRAD LOGIK ---
    if (layerIdx !== undefined && pendingLayerRef.current !== layerIdx) {
      return;
    }

    if (panicTimerRef.current) clearTimeout(panicTimerRef.current);

    const targetLayer = layerIdx !== undefined ? layerIdx : (pendingLayerRef.current ?? activeLayerIdx);
    pendingLayerRef.current = null;

    const oldLayerIdx = activeLayerIdx;
    setActiveLayerIdx(targetLayer as 0 | 1);

    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);

    const targetPost = layers[targetLayer].post;

    transitionTimerRef.current = window.setTimeout(() => {
      if (oldLayerIdx !== targetLayer) {
        setLayers(prev => {
          const next = [...prev] as [BufferLayer, BufferLayer];
          next[oldLayerIdx] = { post: null, cycle: next[oldLayerIdx].cycle };
          return next;
        });
      }

      const activePost = targetPost;
      const isVideo = activePost && (activePost.videoUrl || activePost.layout?.includes('video'));
      const duration = (activePost?.durationSeconds || 10) * 1000;

      if (!isVideo) {
        activeTimerRef.current = window.setTimeout(advance, duration);
      } else {
        activeTimerRef.current = window.setTimeout(() => {
          console.warn("⚠️ Video Failsafe: Videon tog för lång tid. Tvingar byte.");
          advance();
        }, duration + 5000);
      }
    }, 600);

  }, [USE_DOUBLE_BUFFER, currentPost, advance, activeLayerIdx, layers]);


  /* --- ERROR HANDLER --- */
  const handlePostError = useCallback((layerIdx?: number) => {
      console.warn("❌ Media Error mottaget. Visar ändå inlägget utan tidsglapp eller hopp.");
      handlePostReady(layerIdx);
  }, [handlePostReady]);


  // Init: Välj första inlägg om lager saknar post
  useEffect(() => {
      if (!USE_DOUBLE_BUFFER) {
        if (activePosts.length > 0 && !currentPost) {
            setCurrentIdx(0);
        }
        return;
      }

      if (activePosts.length === 0) {
        if (layers[0].post !== null || layers[1].post !== null) {
          setLayers([{ post: null, cycle: 0 }, { post: null, cycle: 0 }]);
          pendingLayerRef.current = null;
        }
        return;
      }

      const activeLayerPost = layers[activeLayerIdx].post;
      const isStillActive = activeLayerPost && activePosts.some(p => p.id === activeLayerPost.id);

      if (!activeLayerPost || !isStillActive) {
        const initialPost = activePosts[0];
        setCurrentIdx(0);
        setLayers(prev => {
          const next = [...prev] as [BufferLayer, BufferLayer];
          next[activeLayerIdx] = { post: initialPost, cycle: next[activeLayerIdx].cycle + 1 };
          return next;
        });
        pendingLayerRef.current = activeLayerIdx;

        if (panicTimerRef.current) clearTimeout(panicTimerRef.current);
        panicTimerRef.current = window.setTimeout(() => {
          console.warn("⚠️ Vakthund: Inlägget laddade aldrig (Media saknas?). Hoppar vidare.");
          advance();
        }, 7000);
      }
  }, [activePosts, activeLayerIdx, layers, currentPost, advance]);


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
      
      {USE_DOUBLE_BUFFER ? (
        layers.map((layer, idx) => {
          if (!layer.post) return null;
          const isActive = idx === activeLayerIdx;
          const isPending = pendingLayerRef.current === idx;

          return (
            <div
              key={`layer-${idx}`}
              className={`absolute inset-0 z-10 transition-opacity duration-500 ${
                isActive && !isFadingOutVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              style={{ willChange: 'opacity' }}
            >
              <SplitScreenLayout screen={selectedDisplayScreen} organization={selectedOrganization}>
                <DisplayPostRenderer
                  key={`${layer.post.id}-${layer.cycle}`}
                  post={layer.post}
                  organization={selectedOrganization}
                  aspectRatio={selectedDisplayScreen.aspectRatio}
                  onLoadReady={() => {
                    if (isPending || pendingLayerRef.current === null) {
                      handlePostReady(idx);
                    }
                  }}
                  onLoadError={() => {
                    if (isPending || pendingLayerRef.current === null) {
                      handlePostError(idx);
                    }
                  }}
                  onVideoEnded={() => {
                    if (isActive) advance();
                  }}
                  isBridgeOnly={false}
                />
              </SplitScreenLayout>
            </div>
          );
        })
      ) : (
        <>
          {/* 1. SEAMLESS BRYGGA (Stillbild av föregående inlägg medan det nya laddar bakom kulisserna) */}
          {prevPost && (
            <div className="absolute inset-0 z-0 select-none pointer-events-none" style={{ willChange: 'opacity' }}>
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
            <div className={`absolute inset-0 z-10 transition-opacity duration-300 ${isBridging ? 'opacity-0' : 'opacity-100'}`} style={{ willChange: 'opacity' }}>
               <SplitScreenLayout screen={selectedDisplayScreen} organization={selectedOrganization}>
               <DisplayPostRenderer 
                  key={`${currentPost.id}-${cycleCount}`} // Tvingar omstart vid varje varv
                  post={currentPost}
                  organization={selectedOrganization}
                  aspectRatio={selectedDisplayScreen.aspectRatio}
                  
                  // Callbacks
                  onLoadReady={() => handlePostReady()}  // "Jag har laddat bilden/buffrat videon!"
                  onLoadError={() => handlePostError()}  // "Filen finns inte!"
                  onVideoEnded={advance}         // "Filmen är slut!"
                  
                  // Sony Props
                  isBridgeOnly={false} 
               />
              </SplitScreenLayout>
            </div>
          )}
        </>
      )}
      
      {/* 3. PROAKTIV PRELOADER (Laddar tyst nästa inläggs bilder/videor i bakgrunden så de öppnas direkt) */}
      {nextPost && (
        <div className="hidden width-0 height-0 overflow-hidden opacity-0 pointer-events-none absolute" aria-hidden="true">
          {nextPost.imageUrl && (
            <img src={nextPost.imageUrl} alt="" decoding="async" />
          )}
          {nextPost.videoUrl && (
            <video src={nextPost.videoUrl} preload="auto" muted playsInline />
          )}
          {nextPost.layout === 'collage' && (nextPost.collageItems || []).map((item, idx) => (
            <React.Fragment key={item.id || idx}>
              {item.imageUrl && <img src={item.imageUrl} alt="" decoding="async" />}
              {item.videoUrl && <video src={item.videoUrl} preload="auto" muted playsInline />}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* PROGRESS BAR (Bara för bilder) */}
      {!isBridging && currentPost && !isVideo && (
         <ProgressBar
            key={USE_DOUBLE_BUFFER
                ? `${currentPost.id}-${layers[activeLayerIdx].cycle}`
                : `${currentPost.id}-${cycleCount}`}
            duration={currentPost.durationSeconds || 10}
         />
      )}

      {/* BRANDING */}
      {branding?.isEnabled && (branding.showLogo || branding.showName) && !isBridging && !isSplitScreenActive && (
        <div className="absolute bottom-6 right-6 z-30 flex items-center gap-2 bg-black/50 backdrop-blur-sm p-1.5 rounded-md">
            {branding.showLogo && logoUrl && <img src={logoUrl} alt="" decoding="async" className="max-h-8 max-w-[100px] object-contain" />}
            {branding.showName && <p className="font-semibold text-sm text-white/90">{selectedOrganization.brandName || selectedOrganization.name}</p>}
        </div>
      )}
    </div>
  );
};

