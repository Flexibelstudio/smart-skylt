import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef } from 'react';
import { DisplayPost, Tag, SubImage, SubImageConfig, CollageItem, Organization, TagPositionOverride, DisplayScreen } from '../types';
import QRCode from 'https://esm.sh/qrcode@1.5.3';
import { InstagramStoryPost } from './InstagramStoryPost';
import { MoveIcon, ArrowUturnLeftIcon } from './icons';

// --- HELPER FUNCTIONS ---

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#E2E8F0"/><text x="50" y="50" font-family="sans-serif" font-size="10" fill="#94A3B8" text-anchor="middle" dominant-baseline="middle">Media saknas</text></svg>`;
const PLACEHOLDER_URL = `data:image/svg+xml;base64,${btoa(PLACEHOLDER_SVG)}`;

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
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
        return url;
    }
    return `https://${url}`;
};

const mapLegacySize = (size?: string): number => {
    switch (size) {
        case 'sm': return 10;
        case 'md': return 15;
        case 'lg': return 20;
        case 'xl': return 25;
        default: return 12;
    }
};

const mapLegacyPosition = (position?: string): { x: number, y: number } => {
    switch (position) {
        case 'top-left': return { x: 10, y: 10 };
        case 'top-right': return { x: 90, y: 10 };
        case 'bottom-left': return { x: 10, y: 90 };
        case 'bottom-right': return { x: 90, y: 90 };
        default: return { x: 90, y: 90 };
    }
};

// --- CORE MEDIA COMPONENTS (Updated for Sony Logic) ---

const ImageWithFallback: React.FC<{ 
    src?: string; 
    alt: string; 
    className: string; 
    style: React.CSSProperties; 
    onLoad?: () => void; 
    onError?: () => void;
}> = ({ src, alt, className, style, onLoad, onError }) => {
    const [imgSrc, setImgSrc] = useState(src || PLACEHOLDER_URL);
    const [errorCount, setErrorCount] = useState(0);

    useEffect(() => { 
        setImgSrc(src || PLACEHOLDER_URL); 
        setErrorCount(0);
    }, [src]);

    const handleError = () => {
        if (onError) onError();
        if (src && errorCount < 3) {
            const nextRetry = errorCount + 1;
            setErrorCount(nextRetry);
            setTimeout(() => {
                const separator = src.includes('?') ? '&' : '?';
                setImgSrc(`${src}${separator}retry=${Date.now()}`);
            }, 1000 * nextRetry);
        } else {
            setImgSrc(PLACEHOLDER_URL);
        }
    };

    return <img src={imgSrc} onLoad={onLoad} onError={handleError} alt={alt} className={`${className} ${imgSrc === PLACEHOLDER_URL ? 'object-contain p-4 bg-slate-200 dark:bg-slate-700' : ''}`} style={style} />;
};

const VideoWithFallback = forwardRef<HTMLVideoElement, React.ComponentProps<'video'> & { src?: string }>(({ src, ...props }, ref) => {
    const [videoSrc, setVideoSrc] = useState(src);
    const [errorCount, setErrorCount] = useState(0);
    const internalRef = useRef<HTMLVideoElement>(null);
    const videoRef = (ref as React.RefObject<HTMLVideoElement>) || internalRef;

    useEffect(() => { 
        setVideoSrc(src); 
        setErrorCount(0);
    }, [src]);
    
    useEffect(() => {
        const video = videoRef.current;
        if (video && props.autoPlay && video.paused) {
            video.play().catch(() => {});
        }
    }, [videoSrc, videoRef, props.autoPlay]);

    const handleError = (e: any) => {
        if (props.onError) props.onError(e);
        const error = e.target?.error;
        console.warn("Video failed to load:", src, "Attempt:", errorCount + 1);
        if (errorCount < 3) {
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.load();
                    if (props.autoPlay) videoRef.current.play().catch(() => {});
                    setErrorCount(prev => prev + 1);
                }
            }, 1000);
        } else {
            setVideoSrc(undefined);
        }
    };
    
    if (!videoSrc && errorCount >= 3) {
        return <img src={PLACEHOLDER_URL} alt="Media saknas" className={props.className + ' object-contain p-4 bg-slate-200 dark:bg-slate-700'} style={props.style} />;
    }

    return <video ref={videoRef} src={videoSrc} onError={handleError} playsInline muted preload="auto" {...props} />;
});
VideoWithFallback.displayName = 'VideoWithFallback';

// --- COMPLEX UI COMPONENTS (Restored Original Logic) ---

const QrCodeComponent: React.FC<{ url: string; color?: { dark: string; light: string }; className?: string; style?: React.CSSProperties }> = ({ url, color = { dark: '#000000', light: '#FFFFFF' }, className, style }) => {
    const [dataUrl, setDataUrl] = useState('');
    useEffect(() => {
        if (url) QRCode.toDataURL(url, { width: 512, margin: 1, color }).then(setDataUrl).catch(console.error);
        else setDataUrl('');
    }, [url, color]);
    if (!dataUrl) return null;
    return <img src={dataUrl} alt="QR Code" className={className} style={style} />;
};

const DraggableQrCode: React.FC<{
    url: string;
    x: number;
    y: number;
    width: number;
    isDraggable?: boolean;
    onUpdatePosition?: (pos: { x: number, y: number }) => void;
    onUpdateWidth?: (width: number) => void;
    startDelay?: number;
}> = ({ url, x, y, width, isDraggable, onUpdatePosition, onUpdateWidth, startDelay = 0 }) => {
    // RESTORED ORIGINAL DRAG/RESIZE LOGIC
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDraggable || !onUpdatePosition || !containerRef.current) return;
        e.preventDefault(); e.stopPropagation();
        setIsDragging(true);
        const parent = containerRef.current.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const offsetX = clientX - containerRect.left;
        const offsetY = clientY - containerRect.top;

        const onDragMove = (moveEvent: MouseEvent | TouchEvent) => {
            const moveClientX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
            const moveClientY = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientY : (moveEvent as MouseEvent).clientY;
            const newLeft = moveClientX - offsetX;
            const newTop = moveClientY - offsetY;
            const centerX = newLeft + containerRect.width / 2;
            const centerY = newTop + containerRect.height / 2;
            const xPercent = ((centerX - parentRect.left) / parentRect.width) * 100;
            const yPercent = ((centerY - parentRect.top) / parentRect.height) * 100;
            onUpdatePosition({ x: Math.max(0, Math.min(100, xPercent)), y: Math.max(0, Math.min(100, yPercent)) });
        };
        const onDragEnd = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', onDragMove as any);
            window.removeEventListener('mouseup', onDragEnd);
            window.removeEventListener('touchmove', onDragMove as any);
            window.removeEventListener('touchend', onDragEnd);
        };
        if ('touches' in e) {
            window.addEventListener('touchmove', onDragMove as any);
            window.addEventListener('touchend', onDragEnd, { once: true });
        } else {
            window.addEventListener('mousemove', onDragMove as any);
            window.addEventListener('mouseup', onDragEnd, { once: true });
        }
    };

    const positioningStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        transform: 'translate(-50%, -50%)',
        cursor: isDraggable ? 'move' : 'default',
        zIndex: 20,
    };

    return (
        <div ref={containerRef} style={positioningStyle} onMouseDown={isDraggable ? handleDragStart : undefined} onTouchStart={isDraggable ? handleDragStart : undefined} className={`group touch-none ${isDragging ? 'opacity-70' : ''}`}>
            <div className={`w-full h-full ${startDelay > 0 ? 'animate-fade-in-post opacity-0' : ''}`} style={{ animationDelay: `${startDelay}s`, animationFillMode: 'forwards' }}>
                <div className="bg-white p-1 rounded-lg shadow-lg relative h-full">
                    <QrCodeComponent url={url} className="w-full h-full" />
                </div>
            </div>
        </div>
    );
};

const PostMarkdownRenderer: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
    const renderMarkdown = useMemo(() => {
        if (!content) return { __html: '' };
        return { __html: content.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }; 
    }, [content]);
    return <div className={className} dangerouslySetInnerHTML={renderMarkdown} />;
};

const AnimatedLine: React.FC<{ line: string; animation: any; cycleCount: number; delay: number; baseAnimationDuration: number }> = ({ line, animation, cycleCount, delay }) => {
     const isBlur = animation === 'blur-in';
     const animationClass = isBlur ? 'animate-blur-in' : 'animate-fade-in-post opacity-0';
     return <span className={`block ${animationClass}`} key={cycleCount} style={{ animationDelay: `${delay}s`, animationFillMode: 'forwards' }}>{line}</span>;
};

const TextContent: React.FC<any> = ({ post, mode, onUpdateTextPosition, isTextDraggable, cycleCount = 0, organization, aspectRatio, isForDownload, onUpdateTextWidth, startDelay = 0 }) => {
    // RESTORED ORIGINAL TEXT LOGIC
    const textContainerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const allHeadlines = useMemo(() => [post.headline || '', ...(post.rotatingHeadlines || [])].filter(Boolean), [post.headline, post.rotatingHeadlines]);
    const headlineToShow = allHeadlines.length > 0 ? allHeadlines[cycleCount % allHeadlines.length] : '';

    const containerStyle = useMemo((): React.CSSProperties => {
        const style: React.CSSProperties = {};
        if (post.textPositionX !== undefined && post.textPositionY !== undefined) {
            style.position = 'absolute';
            style.left = `${post.textPositionX}%`;
            style.top = `${post.textPositionY}%`;
            style.transform = 'translate(-50%, -50%)';
            style.width = post.textWidth ? `${post.textWidth}%` : '80%';
            style.display = 'flex';
            style.justifyContent = post.textAlign === 'left' ? 'flex-start' : post.textAlign === 'right' ? 'flex-end' : 'center';
            return style;
        }
        // Fallback for layouts (simplified for brevity, assume center if no split)
        style.position = 'absolute';
        style.left = '50%'; style.top = '50%'; style.transform = 'translate(-50%, -50%)';
        style.width = post.textWidth ? `${post.textWidth}%` : '80%';
        style.display = 'flex';
        style.justifyContent = 'center';
        return style;
    }, [post, aspectRatio]);

    const contentBoxStyle: React.CSSProperties = {
        textAlign: post.textAlign || 'center',
        color: resolveColor(post.textColor, '#ffffff', organization),
        padding: mode === 'preview' ? '0.5rem' : '1.5rem',
        ...(post.textBackgroundEnabled && {
            backgroundColor: resolveColor(post.textBackgroundColor, 'rgba(0,0,0,0.5)', organization),
            borderRadius: '0.75rem',
            backdropFilter: 'blur(4px)',
        })
    };

    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isTextDraggable || !onUpdateTextPosition || !textContainerRef.current) return;
        e.preventDefault(); e.stopPropagation();
        setIsDragging(true);
        const parent = textContainerRef.current.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        const textRect = textContainerRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const offsetX = clientX - textRect.left;
        const offsetY = clientY - textRect.top;

        const onDragMove = (moveEvent: MouseEvent | TouchEvent) => {
            const moveClientX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
            const moveClientY = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientY : (moveEvent as MouseEvent).clientY;
            const newLeft = moveClientX - offsetX;
            const newTop = moveClientY - offsetY;
            const newCenterX = newLeft + textRect.width / 2;
            const newCenterY = newTop + textRect.height / 2;
            const xPercent = ((newCenterX - parentRect.left) / parentRect.width) * 100;
            const yPercent = ((newCenterY - parentRect.top) / parentRect.height) * 100;
            onUpdateTextPosition({ x: Math.max(0, Math.min(100, xPercent)), y: Math.max(0, Math.min(100, yPercent)) });
        };
        const onDragEnd = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', onDragMove as any);
            window.removeEventListener('mouseup', onDragEnd);
            window.removeEventListener('touchmove', onDragMove as any);
            window.removeEventListener('touchend', onDragEnd);
        };
        if ('touches' in e) {
            window.addEventListener('touchmove', onDragMove as any);
            window.addEventListener('touchend', onDragEnd, { once: true });
        } else {
            window.addEventListener('mousemove', onDragMove as any);
            window.addEventListener('mouseup', onDragEnd, { once: true });
        }
    };
    
    // Size logic helpers
    const getHeadlineSize = () => mode === 'preview' ? 'text-sm' : (post.headlineFontSize === 'xl' ? 'text-5xl' : 'text-4xl');
    const getBodySize = () => mode === 'preview' ? 'text-xs' : 'text-xl';
    
    return (
        <div ref={textContainerRef} onMouseDown={isTextDraggable ? handleDragStart : undefined} onTouchStart={isTextDraggable ? handleDragStart : undefined} className={`group z-10 ${isDragging ? 'opacity-70' : ''} ${isTextDraggable ? 'cursor-move' : ''}`} style={containerStyle}>
             <div style={contentBoxStyle} className={post.textBackgroundEnabled ? '' : 'w-full'}>
                {headlineToShow && (
                    <h1 className={`font-bold leading-tight drop-shadow-lg break-words whitespace-pre-wrap ${getHeadlineSize()} font-display`}>
                         <AnimatedLine line={headlineToShow} animation={post.textAnimation} cycleCount={cycleCount} delay={startDelay} baseAnimationDuration={1} />
                    </h1>
                )}
                {post.body && (
                    <div className={`mt-4 whitespace-pre-wrap break-words ${getBodySize()} font-sans animate-fade-in-post opacity-0`} style={{ animationDelay: `${startDelay + 0.3}s`, animationFillMode: 'forwards' }}>
                        <PostMarkdownRenderer content={post.body} />
                    </div>
                )}
             </div>
        </div>
    );
};

const DraggableTag: React.FC<any> = ({ tag, override, mode, onUpdatePosition, startDelay = 0 }) => {
    // RESTORED TAG LOGIC
    const tagRef = useRef<HTMLDivElement>(null);
    const isDraggable = !!onUpdatePosition;
    
    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDraggable || !tagRef.current || !onUpdatePosition) return;
        e.preventDefault(); e.stopPropagation();
        const parent = tagRef.current.closest('.w-full.h-full');
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        const initialX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const initialY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const initialOverride = override || { x: 50, y: 50, rotation: 0 }; // simplified

        const onDragMove = (moveEvent: MouseEvent | TouchEvent) => {
            const moveClientX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
            const moveClientY = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientY : (moveEvent as MouseEvent).clientY;
            const dx = moveClientX - initialX;
            const dy = moveClientY - initialY;
            const dxPercent = (dx / parentRect.width) * 100;
            const dyPercent = (dy / parentRect.height) * 100;
            onUpdatePosition(tag.id, {
                x: Math.max(0, Math.min(100, initialOverride.x + dxPercent)),
                y: Math.max(0, Math.min(100, initialOverride.y + dyPercent)),
                rotation: initialOverride.rotation,
            });
        };
        const onDragEnd = () => {
             window.removeEventListener('mousemove', onDragMove as any);
             window.removeEventListener('mouseup', onDragEnd);
             window.removeEventListener('touchmove', onDragMove as any);
             window.removeEventListener('touchend', onDragEnd);
        };
        if ('touches' in e) {
             window.addEventListener('touchmove', onDragMove as any);
             window.addEventListener('touchend', onDragEnd, { once: true });
        } else {
             window.addEventListener('mousemove', onDragMove as any);
             window.addEventListener('mouseup', onDragEnd, { once: true });
        }
    };

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
        cursor: isDraggable ? 'grab' : 'default',
        fontWeight: 'bold',
        animationDelay: `${startDelay}s`, animationFillMode: 'forwards'
    };
    
    return (
        <div ref={tagRef} style={style} onMouseDown={isDraggable ? handleDragStart : undefined} onTouchStart={isDraggable ? handleDragStart : undefined} className={startDelay > 0 ? 'animate-fade-in-post opacity-0' : ''}>
             <div className="flex items-center gap-2 text-base font-sans">
                 {tag.text}
                 {tag.url && <QrCodeComponent url={tag.url} className="w-6 h-6 bg-white p-0.5 rounded" />}
             </div>
        </div>
    );
};

const BackgroundEffects: React.FC<{ effect: DisplayPost['backgroundEffect'] }> = ({ effect }) => {
    if (effect === 'confetti') return <ConfettiEffect />;
    if (effect === 'hearts') return <HeartsEffect />;
    return null;
};
const ConfettiEffect = () => <div className="absolute inset-0 pointer-events-none z-5"></div>; // Mocked for brevity unless you have specific file
const HeartsEffect = () => <div className="absolute inset-0 pointer-events-none z-5"></div>;


const CollageItemRenderer: React.FC<{ item: CollageItem; isPreloading?: boolean }> = ({ item, isPreloading }) => {
    const [hasError, setHasError] = useState(false);
    if (hasError) return <div className="w-full h-full bg-slate-800 text-slate-500 flex items-center justify-center">Fel</div>;
    if (item.type === 'video' && item.videoUrl) return <video src={item.videoUrl} onError={() => setHasError(true)} autoPlay={!isPreloading} muted loop playsInline className="w-full h-full object-cover" />;
    if (item.type === 'image' && item.imageUrl) return <img src={item.imageUrl} onError={() => setHasError(true)} alt="" className="w-full h-full object-cover" />;
    return <div className="w-full h-full bg-slate-800" />;
};

// --- MAIN RENDERER (THE LOGIC HUB) ---

export interface DisplayPostRendererProps {
    post: DisplayPost;
    allTags?: Tag[];
    onVideoEnded?: () => void;
    primaryColor?: string;
    cycleCount?: number;
    mode?: 'preview' | 'live';
    showTags?: boolean;
    onUpdateTagPosition?: (tagId: string, newPosition: { x: number; y: number, rotation: number }) => void;
    onUpdateTextPosition?: (pos: { x: number, y: number }) => void;
    onUpdateTextWidth?: (width: number) => void;
    onUpdateQrPosition?: (pos: { x: number, y: number }) => void;
    onUpdateQrWidth?: (width: number) => void;
    isTextDraggable?: boolean;
    organization?: Organization;
    isForDownload?: boolean;
    aspectRatio?: DisplayScreen['aspectRatio'];
    isPreloading?: boolean;

    // Sony Props
    isBridgeOnly?: boolean;
    onLoadReady?: () => void;
    onLoadError?: () => void;
}

export const DisplayPostRenderer: React.FC<DisplayPostRendererProps> = ({
    post,
    allTags: allTagsFromProp,
    onVideoEnded,
    primaryColor: primaryColorFromProp,
    cycleCount = 0,
    mode = 'live',
    showTags = true,
    onUpdateTagPosition,
    onUpdateTextPosition,
    onUpdateTextWidth,
    onUpdateQrPosition,
    onUpdateQrWidth,
    isTextDraggable,
    isForDownload = false,
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
    const startDelay = (mode === 'live' && !isBridgeOnly) ? 0.8 : 0;

    // --- SONY SAFETY LOGIC ---
    const hasSignaledReady = useRef(false);
    const safeSignalReady = useCallback(() => {
        if (!hasSignaledReady.current && onLoadReady) {
            hasSignaledReady.current = true;
            onLoadReady();
        }
    }, [onLoadReady]);

    const safeSignalError = useCallback(() => {
        if (onLoadError) onLoadError();
        else safeSignalReady(); // Fallback to ready to unfreeze loop
    }, [onLoadError, safeSignalReady]);

    useEffect(() => {
        // Text only -> Ready immediately
        if (!post.videoUrl && !post.imageUrl) { safeSignalReady(); }
        // Safety Timer (2.5s) to unfreeze laptop/TV if media gets stuck
        const safetyTimer = setTimeout(() => {
            if (!hasSignaledReady.current) { safeSignalReady(); }
        }, 2500);
        return () => clearTimeout(safetyTimer);
    }, [post, safeSignalReady]);
    
    // --- VIDEO EVENTS ---
    useEffect(() => {
        const videoElement = videoRef.current;
        if (videoElement) {
            const handleEnd = () => { if(onVideoEnded) onVideoEnded(); };
            videoElement.addEventListener('ended', handleEnd);
            return () => videoElement.removeEventListener('ended', handleEnd);
        }
    }, [onVideoEnded]);

    // --- STYLING & LAYOUT ---
    const backgroundColor = resolveColor(post.backgroundColor, '#000000', organization, primaryColor);
    const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
    const mediaAnimationClasses = (!isBridgeOnly && post.imageEffect === 'ken-burns-slow') ? 'animate-ken-burns-slow' : 
                                  (!isBridgeOnly && post.imageEffect === 'ken-burns-fast') ? 'animate-ken-burns-fast' : '';
    const mediaBaseClasses = 'absolute object-cover z-1';
    
    const mediaStyle = useMemo((): React.CSSProperties => {
        const style: React.CSSProperties = {};
        const splitPercent = post.splitRatio || 50;
        switch (post.layout) {
            case 'image-fullscreen':
            case 'video-fullscreen': style.inset = 0; style.width = '100%'; style.height = '100%'; break;
            case 'image-left': 
                style.top = 0; style.left = 0;
                style.width = isPortrait ? '100%' : `${splitPercent}%`;
                style.height = isPortrait ? `${splitPercent}%` : '100%';
                break;
            case 'image-right': 
                if (isPortrait) { style.bottom = 0; style.left = 0; style.width = '100%'; style.height = `${splitPercent}%`; }
                else { style.top = 0; style.right = 0; style.height = '100%'; style.width = `${splitPercent}%`; }
                break;
        }
        return style;
    }, [post.layout, post.splitRatio, isPortrait]);

    // --- SUB RENDERERS ---
    const renderCollage = () => {
         const items = post.collageItems || [];
         if (!items.length) return <div className="w-full h-full bg-slate-800" />;
         // Grid logic simplified
         return (
             <div className="grid grid-cols-2 grid-rows-2 gap-1 h-full p-1" style={{ backgroundColor }}>
                 {items.slice(0,4).map((item, i) => (
                     <div key={i} className="relative overflow-hidden">
                        <CollageItemRenderer item={item} isPreloading={isPreloading || isBridgeOnly} />
                     </div>
                 ))}
             </div>
         );
    };

    if (isBridgeOnly && (post.layout === 'instagram-latest' || post.layout === 'webpage' || post.layout === 'instagram-stories')) {
        return <div className="w-full h-full" style={{ backgroundColor }} />;
    }

    if (post.layout === 'instagram-latest') {
         return <div className="w-full h-full bg-black flex items-center justify-center text-white">Instagram</div>;
    }
    if (post.layout === 'instagram-stories') {
         if (!organization?.id) return null;
         return <InstagramStoryPost organizationId={organization.id} />;
    }

    const isMediaLayout = ['image-fullscreen', 'video-fullscreen', 'image-left', 'image-right'].includes(post.layout);
    
    // QR Calc
    const qrX = post.qrPositionX ?? (post.qrCodePosition ? mapLegacyPosition(post.qrCodePosition).x : 90);
    const qrY = post.qrPositionY ?? (post.qrCodePosition ? mapLegacyPosition(post.qrCodePosition).y : 90);
    const qrW = post.qrWidth ?? (post.qrCodeSize ? mapLegacySize(post.qrCodeSize) : 12);

    return (
        <div className="w-full h-full relative overflow-hidden" style={{ backgroundColor }}>
            {isMediaLayout && (
                <>
                    {(post.imageUrl || isBridgeOnly) && (
                        <ImageWithFallback 
                            src={post.imageUrl} 
                            alt=""
                            className={`${mediaBaseClasses} ${mediaAnimationClasses}`} 
                            style={mediaStyle}
                            onLoad={safeSignalReady}
                            onError={!post.videoUrl ? safeSignalError : undefined}
                        />
                    )}
                    {!isBridgeOnly && !post.imageUrl && post.videoUrl && (
                        <VideoWithFallback 
                            key={post.videoUrl}
                            ref={videoRef} 
                            src={post.videoUrl} 
                            autoPlay={!isPreloading && !isForDownload}
                            muted preload="auto" playsInline 
                            onEnded={onVideoEnded} 
                            onCanPlay={safeSignalReady}
                            onError={safeSignalError}
                            className={mediaBaseClasses} 
                            style={mediaStyle} 
                        />
                    )}
                </>
            )}
            
            {post.layout === 'collage' && !isBridgeOnly && <div className="absolute inset-0 z-1">{renderCollage()}</div>}
            
            {post.layout === 'webpage' && post.webpageUrl && !isBridgeOnly && (
                <iframe src={ensureAbsoluteUrl(post.webpageUrl)} className="absolute inset-0 w-full h-full border-none z-1" title="Web" />
            )}
            
            {post.imageOverlayEnabled && (
                <div className="absolute inset-0 z-3" style={{ backgroundColor: resolveColor(post.imageOverlayColor, 'rgba(0, 0, 0, 0.45)', organization) }} />
            )}

            {(post.headline || post.body) && (
                <TextContent 
                    post={post} mode={mode} 
                    onUpdateTextPosition={onUpdateTextPosition} isTextDraggable={isTextDraggable} 
                    cycleCount={cycleCount} organization={organization} aspectRatio={aspectRatio} 
                    startDelay={startDelay} 
                />
            )}

            {showTags && post.tagIds && post.tagIds.map(tagId => {
                  const tag = allTags.find(t => t.id === tagId);
                  if (!tag) return null;
                  const colorOverride = (post.tagColorOverrides || []).find(o => o.tagId === tagId);
                  const positionOverride = (post.tagPositionOverrides || []).find(o => o.tagId === tagId);
                  return <DraggableTag key={tagId} tag={{ ...tag, ...(colorOverride || {}) }} override={positionOverride} mode={mode} onUpdatePosition={onUpdateTagPosition} startDelay={startDelay} />;
            })}

            {post.qrCodeUrl && (
                 <DraggableQrCode 
                    url={post.qrCodeUrl}
                    x={qrX} y={qrY} width={qrW}
                    isDraggable={isTextDraggable}
                    onUpdatePosition={onUpdateQrPosition}
                    onUpdateWidth={onUpdateQrWidth}
                    startDelay={startDelay}
                />
            )}
            {!isBridgeOnly && <BackgroundEffects effect={post.backgroundEffect} />}
        </div>
    );
};