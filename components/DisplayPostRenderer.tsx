import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DisplayPost, Tag, CollageItem, Organization, DisplayScreen } from '../types';
import QRCode from 'https://esm.sh/qrcode@1.5.3';
import { InstagramStoryPost } from './InstagramStoryPost';

// --- HELPER FUNCTIONS ---
const resolveColor = (colorKey: string | undefined, fallback: string, organization?: Organization, primaryColorFromProp?: string): string => {
    if (!colorKey) return fallback;
    if (colorKey.startsWith('#') || colorKey.startsWith('rgba')) return colorKey;
    switch (colorKey) {
        case 'white': return '#ffffff';
        case 'black': return '#000000';
        case 'primary': return organization?.primaryColor || primaryColorFromProp || '#14b8a6';
        case 'secondary': return organization?.secondaryColor || '#f97316';
        case 'tertiary': return organization?.tertiaryColor || '#3b82f6';
        case 'accent': return organization?.accentColor || '#ec4899';
        default: return colorKey;
    }
};

const ensureAbsoluteUrl = (url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) return url;
    return `https://${url}`;
};

const mapLegacySize = (size?: string): number => size === 'lg' ? 20 : 12;
const mapLegacyPosition = (position?: string) => ({ x: 90, y: 90 });

// --- SIMPLE COMPONENTS ---

const QrCodeComponent: React.FC<{ url: string; className?: string }> = ({ url, className }) => {
    const [dataUrl, setDataUrl] = useState('');
    useEffect(() => {
        if (url) QRCode.toDataURL(url, { width: 512, margin: 1, color: { dark: '#000', light: '#fff' } }).then(setDataUrl).catch(() => {});
    }, [url]);
    if (!dataUrl) return null;
    return <img src={dataUrl} alt="QR" className={className} />;
};

const DraggableQrCode: React.FC<any> = ({ url, x, y, width, startDelay }) => {
    return (
        <div style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: `${width}%`, transform: 'translate(-50%, -50%)', zIndex: 20 }} 
             className={startDelay > 0 ? 'animate-fade-in-post opacity-0' : ''}
             {...(startDelay > 0 ? { style: { animationDelay: `${startDelay}s`, animationFillMode: 'forwards' } } : {})}>
            <div className="bg-white p-1 rounded-lg shadow-lg relative h-full">
                <QrCodeComponent url={url} className="w-full h-full" />
            </div>
        </div>
    );
};

const PostMarkdownRenderer: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
    const html = useMemo(() => ({ __html: content.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }), [content]);
    return <div className={className} dangerouslySetInnerHTML={html} />;
};

const TextContent: React.FC<any> = ({ post, mode, organization, startDelay }) => {
    const style: React.CSSProperties = {
        position: 'absolute',
        top: post.textPositionY ? `${post.textPositionY}%` : '50%',
        left: post.textPositionX ? `${post.textPositionX}%` : '50%',
        transform: 'translate(-50%, -50%)',
        width: post.textWidth ? `${post.textWidth}%` : '80%',
        textAlign: post.textAlign || 'center',
        zIndex: 10,
        color: resolveColor(post.textColor, '#ffffff', organization)
    };
    const animClass = startDelay > 0 ? 'animate-fade-in-post opacity-0' : '';
    const animStyle = startDelay > 0 ? { animationDelay: `${startDelay}s`, animationFillMode: 'forwards' } : {};

    return (
        <div style={style}>
            <div className={post.textBackgroundEnabled ? "bg-black/50 p-6 rounded-xl backdrop-blur-sm" : ""}>
                {post.headline && <h1 className={`font-bold mb-4 text-4xl font-display ${animClass}`} style={animStyle}>{post.headline}</h1>}
                {post.body && (
                    <div className={`text-xl font-sans ${animClass}`} style={{ ...animStyle, animationDelay: `${startDelay + 0.2}s` }}>
                        <PostMarkdownRenderer content={post.body} />
                    </div>
                )}
            </div>
        </div>
    );
};

const DraggableTag: React.FC<any> = ({ tag, override, startDelay }) => {
     const style: React.CSSProperties = {
        position: 'absolute',
        left: `${override?.x || 50}%`,
        top: `${override?.y || 50}%`,
        transform: `translate(-50%, -50%) rotate(${override?.rotation || 0}deg)`,
        zIndex: 20,
        backgroundColor: tag.backgroundColor,
        color: tag.textColor,
        padding: '0.5rem 1rem',
        borderRadius: '999px',
        fontWeight: 'bold'
     };
     const animClass = startDelay > 0 ? 'animate-fade-in-post opacity-0' : '';
     const animStyle = startDelay > 0 ? { animationDelay: `${startDelay}s`, animationFillMode: 'forwards' } : {};

     return (
         <div style={style} className={`shadow-lg flex items-center gap-2 text-base font-sans ${animClass}`} style={animStyle}>
             {tag.text}
             {tag.url && <QrCodeComponent url={tag.url} className="w-6 h-6 bg-white p-0.5 rounded" />}
         </div>
     );
};

// --- MAIN RENDERER ---

export interface DisplayPostRendererProps {
    post: DisplayPost;
    allTags?: Tag[];
    onVideoEnded?: () => void;
    primaryColor?: string;
    cycleCount?: number;
    mode?: 'preview' | 'live';
    showTags?: boolean;
    organization?: Organization;
    aspectRatio?: DisplayScreen['aspectRatio'];
    isPreloading?: boolean;

    // Sony Props
    isBridgeOnly?: boolean;
    onLoadReady?: () => void;
    onLoadError?: () => void;
    
    // Legacy props (ignored but kept for TS compatibility)
    onUpdateTagPosition?: any; onUpdateTextPosition?: any; onUpdateTextWidth?: any;
    onUpdateQrPosition?: any; onUpdateQrWidth?: any; isTextDraggable?: any; isForDownload?: any;
}

export const DisplayPostRenderer: React.FC<DisplayPostRendererProps> = ({
    post,
    allTags: allTagsFromProp,
    onVideoEnded,
    primaryColor: primaryColorFromProp,
    cycleCount = 0,
    mode = 'live',
    showTags = true,
    organization,
    aspectRatio = '16:9',
    isPreloading = false,
    isBridgeOnly = false,
    onLoadReady,
    onLoadError
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const allTags = useMemo(() => organization?.tags || allTagsFromProp || [], [organization, allTagsFromProp]);
    const primaryColor = useMemo(() => organization?.primaryColor || primaryColorFromProp, [organization, primaryColorFromProp]);
    
    // Enkel delay för texten
    const startDelay = (mode === 'live' && !isBridgeOnly) ? 0.5 : 0;

    // --- SONY SIGNALING ---
    // Vi skickar "Ready" så fort vi vet att något finns att visa
    const hasSignaled = useRef(false);
    const signalReady = useCallback(() => {
        if (!hasSignaled.current && onLoadReady) {
            hasSignaled.current = true;
            onLoadReady();
        }
    }, [onLoadReady]);

    // Säkerhetstimer: Om inget media laddas inom 1s, signalera ändå för att undvika frysning
    useEffect(() => {
        // Om bara text -> Ready direkt
        if (!post.videoUrl && !post.imageUrl) signalReady();
        
        const t = setTimeout(() => {
            if (!hasSignaled.current) signalReady();
        }, 1000);
        return () => clearTimeout(t);
    }, [post, signalReady]);

    // --- VIDEO SETUP ---
    useEffect(() => {
        const video = videoRef.current;
        if (video) {
            video.currentTime = 0;
            // Försök starta direkt. Om det misslyckas (autoplay policy), signalera error/nästa.
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn("Autoplay prevented:", error);
                    // Om vi inte kan spela, måste vi gå vidare för att inte frysa skärmen
                    if (onLoadError) onLoadError();
                });
            }
        }
    }, [post.videoUrl, cycleCount]); // Kör om vid ny URL eller nytt varv

    // --- RENDER HELPERS ---
    const backgroundColor = resolveColor(post.backgroundColor, '#000000', organization, primaryColor);
    const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
    const mediaStyle: React.CSSProperties = {
        position: 'absolute', 
        objectFit: 'cover', 
        zIndex: 1,
        ...((post.layout === 'image-fullscreen' || post.layout === 'video-fullscreen') ? { inset: 0, width: '100%', height: '100%' } :
           (post.layout === 'image-left') ? { top: 0, left: 0, width: isPortrait ? '100%' : '50%', height: isPortrait ? '50%' : '100%' } :
           (post.layout === 'image-right') ? { bottom: 0, right: 0, width: isPortrait ? '100%' : '50%', height: isPortrait ? '50%' : '100%' } : {})
    };

    // --- RENDER ---
    // Om Bridge: Visa BARA statisk färg eller bild. Inga tunga grejer.
    if (isBridgeOnly && (post.layout === 'instagram-latest' || post.layout === 'webpage')) {
        return <div className="w-full h-full" style={{ backgroundColor }} />;
    }
    
    // Instagram / Webpage
    if (post.layout === 'instagram-latest') return <div className="w-full h-full bg-black flex items-center justify-center text-white">Instagram (Placeholder)</div>;
    if (post.layout === 'webpage' && post.webpageUrl) return <iframe src={ensureAbsoluteUrl(post.webpageUrl)} className="w-full h-full border-0" />;

    const isMedia = ['image-fullscreen', 'video-fullscreen', 'image-left', 'image-right'].includes(post.layout);
    
    // QR
    const qrX = post.qrPositionX ?? (post.qrCodePosition ? mapLegacyPosition(post.qrCodePosition).x : 90);
    const qrY = post.qrPositionY ?? (post.qrCodePosition ? mapLegacyPosition(post.qrCodePosition).y : 90);

    return (
        <div className="w-full h-full relative overflow-hidden" style={{ backgroundColor }}>
            
            {/* MEDIA LAYER */}
            {isMedia && (
                <>
                    {/* BILD */}
                    {(post.imageUrl || isBridgeOnly) && (
                        <img 
                            src={post.imageUrl || undefined} 
                            alt="" 
                            className="absolute z-1" 
                            style={mediaStyle}
                            onLoad={signalReady}
                            onError={() => !post.videoUrl && onLoadError && onLoadError()} 
                        />
                    )}

                    {/* VIDEO - RÅ TAGG UTAN WRAPPERS */}
                    {!isBridgeOnly && !post.imageUrl && post.videoUrl && (
                        <video 
                            ref={videoRef}
                            src={post.videoUrl}
                            className="absolute z-1"
                            style={mediaStyle}
                            muted 
                            playsInline 
                            onEnded={onVideoEnded}
                            onLoadedData={signalReady} // "Jag har bild!"
                            onError={() => onLoadError && onLoadError()}
                        />
                    )}
                </>
            )}

            {/* OVERLAY & CONTENT */}
            {post.imageOverlayEnabled && <div className="absolute inset-0 z-3" style={{ backgroundColor: resolveColor(post.imageOverlayColor, 'rgba(0,0,0,0.45)', organization) }} />}
            
            {(post.headline || post.body) && <TextContent post={post} mode={mode} organization={organization} startDelay={startDelay} />}
            
            {showTags && post.tagIds?.map(tagId => {
                const tag = (organization?.tags || allTagsFromProp)?.find(t => t.id === tagId);
                if (!tag) return null;
                const override = post.tagPositionOverrides?.find(o => o.tagId === tagId);
                return <DraggableTag key={tagId} tag={tag} override={override} startDelay={startDelay} />;
            })}

            {post.qrCodeUrl && <DraggableQrCode url={post.qrCodeUrl} x={qrX} y={qrY} width={post.qrWidth || 12} startDelay={startDelay} />}
        </div>
    );
};