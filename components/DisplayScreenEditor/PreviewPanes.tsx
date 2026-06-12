
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DisplayPost, DisplayScreen, Organization, BrandingOptions, AdditionalTextElement } from '../../types';
import { DisplayPostRenderer } from '../DisplayPostRenderer';
import { SplitScreenLayout } from '../SplitScreenLayout';
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
 * Vi använder 640px bredd som bas för stående/liggande (nHD).
 * Detta är "Gyllene medelvägen":
 * - Bredare än 540px/600px (löser radbrytningsproblemen/gröten).
 * - Smalare än 720px (gör att texten inte blir pytteliten på laptop).
 */
export const ScaledPreviewWrapper: React.FC<{ 
    aspectRatio: DisplayScreen['aspectRatio']; 
    children: React.ReactNode;
    className?: string;
}> = ({ aspectRatio, children, className }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    // Definiera basupplösning (640p bas)
    const { width: baseWidth, height: baseHeight } = useMemo(() => {
        switch (aspectRatio) {
            case '9:16': return { width: 640, height: 1138 }; // Stående (16:9 ratio på 640 bredd)
            case '3:4': return { width: 768, height: 1024 };  // Stående Tablet (Standard iPad)
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
    // NEW: Font Scale Handlers
    onUpdateHeadlineFontScale?: (scale: number) => void,
    onUpdateBodyFontScale?: (scale: number) => void,
    // NEW: Text Content Handlers
    onUpdateHeadlineText?: (text: string) => void,
    onUpdateBodyText?: (text: string) => void,
    // NEW: Additional Elements Handler
    onUpdateAdditionalElement?: (id: string, updates: Partial<AdditionalTextElement>) => void,
    
    isTextDraggable?: boolean,
}> = ({ 
    post, screen, organization, onUpdateTagPosition, 
    onUpdateHeadlinePosition, onUpdateHeadlineWidth,
    onUpdateBodyPosition, onUpdateBodyWidth,
    onUpdateQrPosition, onUpdateQrWidth, 
    onUpdateHeadlineFontScale, onUpdateBodyFontScale,
    onUpdateHeadlineText, onUpdateBodyText,
    onUpdateAdditionalElement,
    isTextDraggable 
}) => {
    
    // För stående skärmar vill vi begränsa höjden så den inte tar upp hela webbläsarfönstret
    const isPortrait = screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4';
    
    // Miljö- & avstånds simulator stater
    const [simDistance, setSimDistance] = useState(2); 
    const [simReflectiveGlass, setSimReflectiveGlass] = useState(false);
    const [simSunlight, setSimSunlight] = useState(false);
    const [simNightTime, setSimNightTime] = useState(false);
    const [simMotionBlur, setSimMotionBlur] = useState(false); 
    const [showSimulator, setShowSimulator] = useState(false);

    const distances = [2, 5, 10, 15, 20, 25, 30];

    // Beräkna simulatorns CSS-klasser/styles kontinuerligt för 2, 5, 10, 15, 20, 25, 30m
    const getSimScaleValue = (distance: number): number => {
        switch (distance) {
            case 2: return 1.0;
            case 5: return 0.75;
            case 10: return 0.55;
            case 15: return 0.38;
            case 20: return 0.25;
            case 25: return 0.16;
            case 30: return 0.10;
            default: return 1.0;
        }
    };

    const getSimBlurValue = (distance: number): number => {
        switch (distance) {
            case 2: return 0;
            case 5: return 0.3;
            case 10: return 0.8;
            case 15: return 1.5;
            case 20: return 2.2;
            case 25: return 3.5;
            case 30: return 4.5;
            default: return 0;
        }
    };

    const simScaleClass = !showSimulator ? 'scale-100' : ''; // Hålls för bakåtkompatibilitet men använder getSimScaleValue inline style
    const simBlurClass = ''; 

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
                            Interaktivt läge: Dubbelklicka för att redigera text
                        </span>
                    )}
                </div>
            </div>

            {/* --- AVSTÅNDS- & MILJÖSIMULATOR --- */}
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 p-3 rounded-xl shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xl shrink-0">🕶️</span>
                        <div>
                            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Avstånds- & Miljösimulator</h4>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">Verifiera kontrast, storlekar och läsbarhet innan du skickar till skärmen.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setShowSimulator(!showSimulator);
                            if (showSimulator) {
                                setSimDistance(2);
                                setSimReflectiveGlass(false);
                                setSimSunlight(false);
                                setSimNightTime(false);
                                setSimMotionBlur(false);
                            }
                        }}
                        className={`text-[11px] px-3 py-1.5 rounded-lg border font-bold transition-all shrink-0 uppercase tracking-widest ${
                            showSimulator 
                                ? 'bg-red-50 dark:bg-red-950/20 text-red-600 border-red-200 dark:border-red-900/50' 
                                : 'bg-teal-600 hover:bg-teal-500 text-white border-transparent'
                        }`}
                    >
                        {showSimulator ? 'Stäng test' : 'Starta simulator test'}
                    </button>
                </div>

                {showSimulator && (
                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in text-xs">
                        {/* Panel 1: Sikt & Distans */}
                        <div className="space-y-3 bg-slate-100 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] tracking-wider">Simulerat avstånd</span>
                                <span className="font-mono font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400 px-2.5 py-0.5 rounded text-[11px]">{simDistance} meter</span>
                            </div>
                            
                            <div className="flex items-center gap-4 py-1">
                                <span className="text-[10px] text-slate-400 font-bold">2m (Nära)</span>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="6" 
                                    step="1"
                                    value={distances.indexOf(simDistance)}
                                    onChange={(e) => {
                                        const idx = Number(e.target.value);
                                        setSimDistance(distances[idx]);
                                    }}
                                    className="flex-1 accent-teal-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none"
                                />
                                <span className="text-[10px] text-slate-400 font-bold">30m (Långt)</span>
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-mono min-h-[40px]">
                                {simDistance === 2 && "👉 [FOKUS 2M]: Optimal vy intill skylten. Perfekt läsbarhet för all text, detaljerad info och QR-skanning på nära håll."}
                                {simDistance === 5 && "👉 [FOKUS 5M]: Nära trottoaravstånd. Bra för medelstora texter, logotyper och viktiga huvudbudskap."}
                                {simDistance === 10 && "👉 [FOKUS 10M]: På avstånd längs trottoaren. Endast större texter och tydliga taggar läses snabbt."}
                                {simDistance === 15 && "👉 [FOKUS 15M]: Tvärsöver gatan. Endast mycket stora och tydliga rubriker samt logotyper har bra läsbarhet."}
                                {simDistance === 20 && "👉 [FOKUS 20M]: Längre håll. Kräver minimalistisk layout och stark kontrast för att uppfattas."}
                                {simDistance === 25 && "👉 [FOKUS 25M]: Bilistavstånd på håll. Trafikanter uppfattar endast enkla färgblock och logotypkonturer."}
                                {simDistance === 30 && "👉 [FOKUS 30M]: Extremt avstånd. Endast övergripande varumärkesfärger och stora bildsilhuetter syns."}
                            </p>
                        </div>

                        {/* Panel 2: Ljus & Butiksmiljö */}
                        <div className="space-y-3 bg-slate-100 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                            <span className="font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] tracking-wider">Butiksmiljö & Ljusförhållanden</span>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={simReflectiveGlass}
                                        onChange={(e) => {
                                            setSimReflectiveGlass(e.target.checked);
                                            if (e.target.checked) setSimSunlight(false);
                                        }}
                                        className="rounded text-teal-600 border-slate-300 dark:border-slate-700 accent-teal-600"
                                    />
                                    <span className="font-medium text-slate-700 dark:text-slate-300">Fönsterglas-reflex 🪟</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={simSunlight}
                                        onChange={(e) => {
                                            setSimSunlight(e.target.checked);
                                            if (e.target.checked) setSimReflectiveGlass(false);
                                        }}
                                        className="rounded text-teal-600 border-slate-300 dark:border-slate-700 accent-teal-600"
                                    />
                                    <span className="font-medium text-slate-700 dark:text-slate-300">Solglare / Solljus ☀️</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={simNightTime}
                                        onChange={(e) => setSimNightTime(e.target.checked)}
                                        className="rounded text-teal-600 border-slate-300 dark:border-slate-700 accent-teal-600"
                                    />
                                    <span className="font-medium text-slate-700 dark:text-slate-300">Kväll / Skymning 🌙</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={simMotionBlur}
                                        onChange={(e) => setSimMotionBlur(e.target.checked)}
                                        className="rounded text-teal-600 border-slate-300 dark:border-slate-700 accent-teal-600"
                                    />
                                    <span className="font-medium text-slate-700 dark:text-slate-300">Fart-svep (Bilist) 🚗</span>
                                </label>
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                                Aktivera filter för att se om dina nyckeltexter överlever hård reflektion i butiksfönstret!
                            </p>
                        </div>
                    </div>
                )}
            </div>
            
            <div className={`p-4 rounded-xl border flex justify-center overflow-hidden transition-all duration-[750ms] ${
                showSimulator && simNightTime 
                    ? 'bg-slate-950 border-slate-900 shadow-[inset_0_0_60px_rgba(0,0,0,0.95)]' 
                    : 'bg-slate-200 dark:bg-black/20 border-slate-300 dark:border-slate-700/50 shadow-inner'
            }`}>
                <div 
                    className="transition-all duration-300 transform origin-center w-full flex justify-center"
                    style={showSimulator ? {
                        transform: `scale(${getSimScaleValue(simDistance)})`,
                        filter: `blur(${getSimBlurValue(simDistance)}px)`
                    } : undefined}
                >
                    <div className={`w-full flex justify-center transition-all duration-300 ${showSimulator && simMotionBlur ? 'sim-motion-blur-effect' : ''}`}>
                        <ScaledPreviewWrapper 
                            aspectRatio={screen.aspectRatio}
                            className={`bg-slate-300 dark:bg-slate-900 rounded-lg overflow-hidden relative transition-all duration-[750ms] ${
                                isPortrait ? 'h-[60vh] w-auto' : 'w-full'
                            } ${
                                showSimulator && simNightTime 
                                    ? 'shadow-[0_0_60px_rgba(255,255,255,0.22),0_0_20px_rgba(20,184,166,0.25)] border-t border-white/10' 
                                    : 'shadow-2xl'
                            }`}
                        >
                        <SplitScreenLayout screen={screen} organization={organization}>
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
                                // Connect new handlers
                                onUpdateHeadlineFontScale={onUpdateHeadlineFontScale}
                                onUpdateBodyFontScale={onUpdateBodyFontScale}
                                onUpdateHeadlineText={onUpdateHeadlineText}
                                onUpdateBodyText={onUpdateBodyText}
                                onUpdateAdditionalElement={onUpdateAdditionalElement}
                                
                                isTextDraggable={isTextDraggable}
                                organization={organization}
                                aspectRatio={screen.aspectRatio}
                                // Vi använder 'live'-läge internt för att matcha den virtuella upplösningen
                                mode="live" 
                            />
                        </SplitScreenLayout>
                        
                        {/* SIMULATOR REFLECTION OVERLAYS */}
                        {showSimulator && simReflectiveGlass && (
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-white/25 to-transparent pointer-events-none z-[110] mix-blend-overlay">
                                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/20 via-transparent to-black/30 opacity-75" />
                                <div className="absolute -inset-x-12 top-0 h-44 bg-white/15 -rotate-12 transform" />
                                <div className="absolute -inset-x-12 top-24 h-16 bg-white/10 -rotate-12 transform" />
                                <p className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/75 text-[9px] font-bold text-white/80 px-2.5 py-0.5 rounded backdrop-blur">Simulerat fönsterglas-reflexer 🪟</p>
                            </div>
                        )}

                        {showSimulator && simSunlight && (
                            <div className="absolute inset-0 bg-gradient-to-br from-yellow-100/10 via-transparent to-black/10 pointer-events-none z-[110]">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/20 rounded-full blur-3xl pointer-events-none mix-blend-color-dodge" />
                                <div className="absolute top-12 right-12 w-32 h-32 bg-white/25 rounded-full blur-2xl pointer-events-none" />
                                <p className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-yellow-950/90 text-[9px] font-bold text-yellow-100 px-2.5 py-0.5 rounded backdrop-blur border border-yellow-700/50">Starkt solljus-insläpp ☀️</p>
                            </div>
                        )}

                        {showSimulator && simNightTime && (
                            <div className="absolute inset-0 pointer-events-none z-[110]">
                                {/* Radial vignette around screen edges to make center pop out bright with rich contrast */}
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_65%,_rgba(3,7,18,0.5))] pointer-events-none" />
                                <p className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/95 text-[9px] font-bold text-teal-300 px-2.5 py-0.5 rounded backdrop-blur border border-teal-500/30 tracking-wider uppercase font-mono shadow-lg">Natt / Skymning 🌙</p>
                            </div>
                        )}

                        {branding?.isEnabled && organization && (branding.showLogo || branding.showName) && !(screen.zones?.isEnabled && screen.zones?.layoutType !== 'none') && (
                            <div className={`absolute ${getPositionClasses(branding.position)} z-10`}>
                                <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm p-1.5 rounded-md">
                                    {branding.showLogo && logoUrl && <img src={logoUrl} alt={`${organization.name} logo`} className="max-h-6 max-w-[75px] object-contain" />}
                                    {branding.showName && <p className="font-semibold text-xs text-white/90">{organization.brandName || organization.name}</p>}
                                </div>
                            </div>
                        )}
                    </ScaledPreviewWrapper>
                    </div>
                </div>
            </div>
            
            <p className="text-xs text-slate-500 dark:text-gray-500 mt-2 text-center">
                Dra för att flytta. Dubbelklicka för att ändra text. Dra hörn för att ändra storlek.
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
            if (post.status === 'archived') return false;
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
                        // Ramen borttagen, ökad höjd till 70vh
                        className={`bg-slate-300 dark:bg-slate-900 rounded-lg shadow-xl overflow-hidden ${isPortrait ? 'h-[70vh] w-auto' : 'w-full'}`}
                     >
                        {currentPost ? (
                            <SplitScreenLayout screen={screen} organization={organization}>
                                <DisplayPostRenderer 
                                    post={currentPost} 
                                    allTags={organization.tags} 
                                    primaryColor={organization.primaryColor}
                                    onVideoEnded={() => advance('next')}
                                    organization={organization}
                                    aspectRatio={screen.aspectRatio}
                                    mode="live"
                                />
                            </SplitScreenLayout>
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
                               {screen.posts?.length > 0 ? 'Inga aktiva inlägg.' : 'Lägg till inlägg.'}
                            </div>
                        )}
                        {branding?.isEnabled && organization && (branding.showLogo || branding.showName) && !(screen.zones?.isEnabled && screen.zones?.layoutType !== 'none') && (
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
    // NEW Props
    onUpdateHeadlineFontScale?: (scale: number) => void;
    onUpdateBodyFontScale?: (scale: number) => void;
    // NEW Text Props
    onUpdateHeadlineText?: (text: string) => void;
    onUpdateBodyText?: (text: string) => void;
    // NEW Handler for additional elements
    onUpdateAdditionalElement?: (id: string, updates: Partial<AdditionalTextElement>) => void;
    isTextDraggable?: boolean;
}
export const PreviewPane: React.FC<PreviewPaneProps> = ({ 
    editingPost, screen, organization, onUpdateTagPosition, 
    onUpdateHeadlinePosition, onUpdateHeadlineWidth,
    onUpdateBodyPosition, onUpdateBodyWidth,
    onUpdateQrPosition, onUpdateQrWidth, 
    onUpdateHeadlineFontScale, onUpdateBodyFontScale,
    onUpdateHeadlineText, onUpdateBodyText,
    onUpdateAdditionalElement,
    isTextDraggable 
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
                // Connect handlers
                onUpdateHeadlineFontScale={onUpdateHeadlineFontScale}
                onUpdateBodyFontScale={onUpdateBodyFontScale}
                onUpdateHeadlineText={onUpdateHeadlineText}
                onUpdateBodyText={onUpdateBodyText}
                onUpdateAdditionalElement={onUpdateAdditionalElement}
                isTextDraggable={isTextDraggable}
            />
        );
    }
    return <LivePreviewPane screen={screen} organization={organization} />;
};
