
import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef } from 'react';
import { DisplayPost, Tag, SubImage, SubImageConfig, ContentPosition, TagPositionOverride, CollageItem, Organization, TagColorOverride, DisplayScreen } from '../types';
import QRCode from 'https://esm.sh/qrcode@1.5.3';
import { InstagramStoryPost } from './InstagramStoryPost';
import { MoveIcon, ArrowUturnLeftIcon } from './icons';

// --- ROBUST MEDIA COMPONENTS (Sony Watchdogs) ---

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#000000"/></svg>`;
const PLACEHOLDER_URL = `data:image/svg+xml;base64,${btoa(PLACEHOLDER_SVG)}`;

const ImageWithFallback: React.FC<{ 
    src?: string; 
    alt: string; 
    className: string; 
    style: React.CSSProperties; 
    onLoadReady?: () => void;
    onLoadError?: () => void;
}> = ({ src, alt, className, style, onLoadReady, onLoadError }) => {
    const [imgSrc, setImgSrc] = useState(src || PLACEHOLDER_URL);

    useEffect(() => { 
        setImgSrc(src || PLACEHOLDER_URL); 
    }, [src]);

    const handleError = () => {
        console.warn("Sony Image Watchdog: Failed to load (Silent skip):", src);
        if (onLoadError) onLoadError();
    };

    return (
        <img 
            src={imgSrc} 
            onError={handleError} 
            onLoad={onLoadReady}
            alt={alt} 
            className={className} 
            style={style} 
            crossOrigin="anonymous"
        />
    );
};

const VideoWithFallback = forwardRef<HTMLVideoElement, React.ComponentProps<'video'> & { 
    src?: string;
    onLoadReady?: () => void;
    onLoadError?: () => void;
    onStall?: () => void;
}>(({ src, onLoadReady, onLoadError, onStall, ...props }, ref) => {
    const internalRef = useRef<HTMLVideoElement>(null);
    const videoRef = (ref as React.RefObject<HTMLVideoElement>) || internalRef;
    const stallTimerRef = useRef<number | null>(null);

    // Sony Watchdog: 7s initial load timeout
    useEffect(() => {
        if (!src) return;
        const timeout = window.setTimeout(() => {
            if (videoRef.current && videoRef.current.readyState < 3) {
                console.warn("Sony Video Watchdog: Load timeout (7s) - Skipping:", src);
                if (onLoadError) onLoadError();
            }
        }, 7000);
        return () => window.clearTimeout(timeout);
    }, [src, onLoadError]);

    const handleWaiting = () => {
        // Sony Watchdog: 10s stall detection
        if (stallTimerRef.current) window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = window.setTimeout(() => {
            console.warn("Sony Video Watchdog: Stalled for > 10s - Skipping:", src);
            if (onStall) onStall();
        }, 10000);
    };

    const handlePlaying = () => {
        if (stallTimerRef.current) {
            window.clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
        }
    };

    const handleError = (e: any) => {
        console.warn("Sony Video Watchdog: Error (Silent skip):", src);
        if (onLoadError) onLoadError();
    };

    return (
        <video 
            ref={videoRef} 
            src={src} 
            onError={handleError}
            onCanPlay={onLoadReady}
            onWaiting={handleWaiting}
            onPlaying={handlePlaying}
            playsInline
            muted
            crossOrigin="anonymous"
            preload="auto"
            {...props} 
        />
    );
});
VideoWithFallback.displayName = 'VideoWithFallback';

// --- ALL EXISTING HELPERS & SUB-COMPONENTS ---

declare global {
    interface Window {
        instgrm?: { Embeds: { process: () => void; }; };
    }
}

const InstagramEmbed: React.FC<{ embedCode: string }> = ({ embedCode }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const processInstagramEmbeds = () => { if (window.instgrm) window.instgrm.Embeds.process(); };
        const existingScript = document.querySelector('script[src="//www.instagram.com/embed.js"]');
        if (existingScript) { processInstagramEmbeds(); } else {
            const script = document.createElement('script');
            script.src = "//www.instagram.com/embed.js";
            script.async = true;
            script.onload = processInstagramEmbeds;
            document.body.appendChild(script);
        }
    }, [embedCode]);
    return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: embedCode }} className="w-full h-full flex justify-center items-center bg-white [&>blockquote]:!my-0" />;
};

const ensureAbsoluteUrl = (url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) return url;
    return `https://${url}`;
};

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

const ConfettiEffect: React.FC = () => {
    const pieces = useMemo(() => {
        const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800'];
        return Array.from({ length: 50 }).map((_, i) => ({
            id: i,
            style: {
                left: `${Math.random() * 100}vw`,
                backgroundColor: colors[Math.floor(Math.random() * colors.length)],
                animationDuration: `${Math.random() * 3 + 2}s`,
                animationDelay: `${Math.random() * 5}s`,
            },
        }));
    }, []);
    return <div className="absolute inset-0 overflow-hidden pointer-events-none z-5">{pieces.map(p => <div key={p.id} className="confetti-piece" style={p.style} />)}</div>;
};

const HeartsEffect: React.FC = () => {
    const pieces = useMemo(() => {
        return Array.from({ length: 30 }).map((_, i) => ({
            id: i,
            style: {
                left: `${Math.random() * 100}vw`,
                animationDuration: `${Math.random() * 4 + 3}s`,
                animationDelay: `${Math.random() * 5}s`,
                fontSize: `${Math.random() * 20 + 16}px`,
            },
        }));
    }, []);
    return <div className="absolute inset-0 overflow-hidden pointer-events-none z-5">{pieces.map(p => <div key={p.id} className="heart-piece" style={p.style}>❤️</div>)}</div>;
};

const BackgroundEffects: React.FC<{ effect: DisplayPost['backgroundEffect'] }> = ({ effect }) => {
    if (effect === 'confetti') return <ConfettiEffect />;
    if (effect === 'hearts') return <HeartsEffect />;
    return null;
};

const QrCodeComponent: React.FC<{ url: string; color?: { dark: string; light: string }; className?: string; style?: React.CSSProperties }> = ({ url, color = { dark: '#000000', light: '#FFFFFF' }, className, style }) => {
    const [dataUrl, setDataUrl] = useState('');
    useEffect(() => {
        if (url) {
            QRCode.toDataURL(url, { width: 512, margin: 1, color }).then(setDataUrl).catch(err => console.error("QR Code generation failed:", err));
        } else { setDataUrl(''); }
    }, [url, color]);
    if (!dataUrl) return null;
    return <img src={dataUrl} alt="QR Code" className={className} style={style} />;
};

const PostMarkdownRenderer: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
    const renderMarkdown = useMemo(() => {
        if (!content) return { __html: '' };
        const lines = content.split('\n');
        const htmlLines: string[] = [];
        let inList: 'ul' | 'ol' | false = false;
        const closeListIfNeeded = () => { if (inList) { htmlLines.push(`</${inList}>`); inList = false; } };
        for (const line of lines) {
            let safeLine = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/_(.*?)_/g, '<em>$1</em>');
            if (line.match(/^\d+\.\s/)) {
                if (inList !== 'ol') { closeListIfNeeded(); htmlLines.push('<ol class="list-decimal list-inside space-y-1 my-2">'); inList = 'ol'; }
                htmlLines.push(`<li>${safeLine.replace(/^\d+\.\s/, '')}</li>`);
            } else if (line.startsWith('* ') || line.startsWith('- ')) {
                if (inList !== 'ul') { closeListIfNeeded(); htmlLines.push('<ul class="list-disc list-inside space-y-1 my-2">'); inList = 'ul'; }
                htmlLines.push(`<li>${safeLine.substring(2)}</li>`);
            } else {
                closeListIfNeeded();
                if (line.trim() !== '') htmlLines.push(`<p class="my-2">${safeLine}</p>`);
            }
        }
        closeListIfNeeded();
        return { __html: htmlLines.join('\n') };
    }, [content]);
    return <div className={className} dangerouslySetInnerHTML={renderMarkdown} />;
};

const isPreviewMode = (mode?: 'preview' | 'live') => mode === 'preview';

const getTagFontSizeClass = (size?: Tag['fontSize'], mode?: 'preview' | 'live') => {
    const isPreview = isPreviewMode(mode);
    switch (size) {
        case 'sm': return isPreview ? 'text-[6px]' : 'text-sm';
        case 'md': return isPreview ? 'text-[7px]' : 'text-base';
        case 'lg': return isPreview ? 'text-[8px]' : 'text-lg';
        case 'xl': return isPreview ? 'text-[9px]' : 'text-xl';
        case '2xl': return isPreview ? 'text-[10px]' : 'text-2xl';
        case '3xl': return isPreview ? 'text-xs' : 'text-3xl';
        case '4xl': return isPreview ? 'text-sm' : 'text-4xl';
        case '5xl': return isPreview ? 'text-base' : 'text-5xl';
        default: return isPreview ? 'text-[7px]' : 'text-base';
    }
};

const getTagFontFamilyClass = (family?: Tag['fontFamily']) => {
    switch (family) {
        case 'display': return 'font-display';
        case 'script': return 'font-logo';
        case 'adscript': return 'font-adscript';
        case 'sans': return 'font-sans';
        default: return family ? `font-${family}` : 'font-sans';
    }
};

const getTagFontWeightClass = (weight?: Tag['fontWeight']) => (weight === 'black' ? 'font-black' : 'font-bold');

const getTagAnimationClass = (animation?: Tag['animation'], displayType?: Tag['displayType'], hasOverride?: boolean) => {
    switch(animation) {
        case 'pulse':
            if (displayType === 'stamp') return hasOverride ? 'animate-pulse-stamp-override' : 'animate-pulse-stamp';
            return 'animate-pulse-tag';
        case 'glow': return 'animate-glow-tag';
        default: return '';
    }
};

const getHeadlineFontSizeClass = (size?: DisplayPost['headlineFontSize'], mode?: 'preview' | 'live') => {
    const isPreview = isPreviewMode(mode);
    if (isPreview) {
        switch (size) {
            case 'sm': case 'md': return 'text-[10px]';
            case 'lg': case 'xl': return 'text-xs';
            case '2xl': case '3xl': return 'text-sm';
            case '4xl': case '5xl': return 'text-base';
            case '6xl': case '7xl': return 'text-lg';
            case '8xl': case '9xl': return 'text-xl';
            default: return 'text-sm';
        }
    }
    switch (size) {
        case 'sm': return 'text-lg';
        case 'md': return 'text-xl';
        case 'lg': return 'text-2xl';
        case 'xl': return 'text-3xl';
        case '2xl': return 'text-4xl';
        case '3xl': return 'text-5xl';
        case '4xl': return 'text-6xl';
        case '5xl': return 'text-7xl';
        case '6xl': return 'text-8xl';
        case '7xl': return 'text-9xl';
        case '8xl': return 'text-[9.5rem]';
        case '9xl': return 'text-[10rem]';
        default: return 'text-4xl';
    }
};

const getBodyFontSizeClass = (size?: DisplayPost['bodyFontSize'], mode?: 'preview' | 'live') => {
    const isPreview = isPreviewMode(mode);
    if (isPreview) {
        switch (size) {
            case 'xs': return 'text-[6px]';
            case 'sm': return 'text-[7px]';
            case 'md': return 'text-[8px]';
            case 'lg': return 'text-[9px]';
            case 'xl': return 'text-[10px]';
            case '2xl': return 'text-xs';
            case '3xl': return 'text-sm';
            default: return 'text-[8px]';
        }
    }
    switch (size) {
        case 'xs': return 'text-sm';
        case 'sm': return 'text-base';
        case 'md': return 'text-lg';
        case 'lg': return 'text-xl';
        case 'xl': return 'text-2xl';
        case '2xl': return 'text-3xl';
        case '3xl': return 'text-4xl';
        default: return 'text-lg';
    }
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
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDraggable || !onUpdatePosition || !containerRef.current) return;
        e.preventDefault(); e.stopPropagation(); setIsDragging(true);
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
            const xPercent = ((moveClientX - offsetX + containerRect.width / 2 - parentRect.left) / parentRect.width) * 100;
            const yPercent = ((moveClientY - offsetY + containerRect.height / 2 - parentRect.top) / parentRect.height) * 100;
            onUpdatePosition({ x: Math.max(0, Math.min(100, xPercent)), y: Math.max(0, Math.min(100, yPercent)) });
        };
        const onDragEnd = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', onDragMove as any); window.removeEventListener('mouseup', onDragEnd);
            window.removeEventListener('touchmove', onDragMove as any); window.removeEventListener('touchend', onDragEnd);
        };
        if ('touches' in e) { window.addEventListener('touchmove', onDragMove as any); window.addEventListener('touchend', onDragEnd, { once: true }); }
        else { window.addEventListener('mousemove', onDragMove as any); window.addEventListener('mouseup', onDragEnd, { once: true }); }
    };

    const handleResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDraggable || !onUpdateWidth || !containerRef.current) return;
        e.preventDefault(); e.stopPropagation();
        const parent = containerRef.current.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        const initialX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const initialWidth = containerRef.current.offsetWidth;
        const onResizeMove = (moveEvent: MouseEvent | TouchEvent) => {
            const moveClientX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
            const newWidthPercent = ((initialWidth + (moveClientX - initialX)) / parentRect.width) * 100;
            onUpdateWidth(Math.max(5, Math.min(50, newWidthPercent)));
        };
        const onResizeEnd = () => { window.removeEventListener('mousemove', onResizeMove as any); window.removeEventListener('mouseup', onResizeEnd); window.removeEventListener('touchmove', onResizeMove as any); window.removeEventListener('touchend', onResizeEnd); };
        if ('touches' in e) { window.addEventListener('touchmove', onResizeMove as any); window.addEventListener('touchend', onResizeEnd, { once: true }); }
        else { window.addEventListener('mousemove', onResizeMove as any); window.addEventListener('mouseup', onResizeEnd, { once: true }); }
    };

    const style: React.CSSProperties = { position: 'absolute', left: `${x}%`, top: `${y}%`, width: `${width}%`, transform: 'translate(-50%, -50%)', cursor: isDraggable ? 'move' : 'default', zIndex: 20 };
    return (
        <div ref={containerRef} style={style} onMouseDown={isDraggable ? handleDragStart : undefined} onTouchStart={isDraggable ? handleDragStart : undefined} className={`group touch-none ${isDragging ? 'opacity-70' : ''}`}>
            <div className={`w-full h-full ${startDelay > 0 ? 'animate-fade-in-post opacity-0' : ''}`} style={{ animationDelay: `${startDelay}s`, animationFillMode: 'forwards' }}>
                <div className="bg-white p-1 rounded-lg shadow-lg relative h-full">
                    <QrCodeComponent url={url} className="w-full h-full" />
                    {isDraggable && <div onMouseDown={handleResizeStart} onTouchStart={handleResizeStart} className="absolute -bottom-2 -right-2 w-6 h-6 bg-white border-2 border-primary rounded-full cursor-se-resize flex items-center justify-center shadow-md z-30"><div className="w-2 h-2 bg-primary rounded-full" /></div>}
                </div>
            </div>
        </div>
    );
};

const SubImageCarousel: React.FC<{ images: SubImage[], config: SubImageConfig, cycleCount: number }> = ({ images, config, cycleCount }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    useEffect(() => { setCurrentIndex(0); }, [cycleCount]);
    useEffect(() => {
        if (config.animation !== 'fade' || images.length <= 1) return;
        const interval = setInterval(() => { setCurrentIndex(prev => (prev + 1) % images.length); }, (config.intervalSeconds || 5) * 1000);
        return () => clearInterval(interval);
    }, [images, config, cycleCount]);

    const getContainerClasses = () => {
        const classes = ['absolute', 'z-20'];
        if (config.animation === 'fade') {
            classes.push('p-2', 'bg-black/30', 'backdrop-blur-sm', 'rounded-lg', 'shadow-lg');
            const pos = config.position;
            if (pos === 'top-left') classes.push('top-4 left-4'); else if (pos === 'top-right') classes.push('top-4 right-4'); else if (pos === 'bottom-left') classes.push('bottom-4 left-4'); else if (pos === 'bottom-right') classes.push('bottom-4 right-4'); else if (pos === 'center') classes.push('top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'); else if (pos === 'top-center') classes.push('top-4 left-1/2 -translate-x-1/2'); else if (pos === 'center-left') classes.push('top-1/2 left-4 -translate-y-1/2'); else if (pos === 'center-right') classes.push('top-1/2 right-4 -translate-y-1/2'); else if (pos === 'bottom-center') classes.push('bottom-4 left-1/2 -translate-x-1/2'); else classes.push('bottom-4 right-4');
            const s = config.size;
            if (s === 'sm') classes.push('w-24 h-24'); else if (s === 'md') classes.push('w-32 h-32'); else if (s === 'lg') classes.push('w-48 h-48'); else if (s === 'xl') classes.push('w-64 h-64'); else if (s === '2xl') classes.push('w-80 h-80'); else classes.push('w-32 h-32');
        } else {
            classes.push('left-0 right-0', 'overflow-hidden', 'p-2', 'bg-black/30', 'backdrop-blur-sm');
            if (config.position === 'top') classes.push('top-0'); else if (config.position === 'middle') classes.push('top-1/2 -translate-y-1/2'); else classes.push('bottom-0');
            const s = config.size;
            if (s === 'sm') classes.push('h-20'); else if (s === 'md') classes.push('h-28'); else if (s === 'lg') classes.push('h-36'); else if (s === 'xl') classes.push('h-48'); else if (s === '2xl') classes.push('h-64'); else classes.push('h-28');
        }
        return classes.join(' ');
    };
    if (!images || images.length === 0) return null;
    if (config.animation === 'scroll') return <div className={getContainerClasses()} style={{ '--scroll-duration': `${config.intervalSeconds || 30}s` } as any}><div className="flex h-full animate-marquee">{[...images, ...images].map((image, index) => <div key={`${image.id}-${index}`} className="h-full flex-shrink-0 mr-4"><ImageWithFallback src={image.imageUrl} alt="" className="h-full w-auto object-cover rounded" style={{}} /></div>)}</div></div>;
    return <div className={getContainerClasses()}>{images.map((image, index) => <ImageWithFallback key={image.id} src={image.imageUrl} alt="" className={`absolute inset-2 w-[calc(100%-1rem)] h-[calc(100%-1rem)] object-contain rounded transition-opacity duration-1000 ${index === currentIndex ? 'opacity-100' : 'opacity-0'}`} style={{}} />)}</div>;
};

interface TextContentProps {
    post: DisplayPost;
    mode?: 'preview' | 'live';
    onUpdateTextPosition?: (pos: { x: number, y: number }) => void;
    isTextDraggable?: boolean;
    cycleCount?: number;
    organization?: Organization;
    onUpdateTextWidth?: (width: number) => void;
    aspectRatio: DisplayScreen['aspectRatio'];
    isForDownload?: boolean;
    startDelay?: number;
}

const AnimatedLine: React.FC<{ line: string; animation: DisplayPost['textAnimation']; cycleCount: number; delay: number; baseAnimationDuration: number; }> = ({ line, animation, cycleCount, delay, baseAnimationDuration }) => {
    const parseInline = (text: string) => text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/_(.*?)_/g, '<em>$1</em>');
    if (animation === 'typewriter') return <span className="block"><span key={`${cycleCount}`} className="animate-typewriter" style={{ '--char-count': line.length, '--type-duration': `${baseAnimationDuration}s`, animationDelay: `${delay}s` } as any}>{line}</span></span>;
    if (animation === 'fade-up-word') return <span className="block">{line.split(/\s+/).map((word, i) => <React.Fragment key={i}><span className="animate-fade-up-word" style={{ animationDelay: `${delay + i * 0.1}s` }} dangerouslySetInnerHTML={{ __html: parseInline(word) }} />{' '}</React.Fragment>)}</span>;
    const animationClass = animation === 'blur-in' ? 'animate-blur-in' : 'animate-fade-in-post opacity-0';
    return <span className={`block ${animationClass}`} key={cycleCount} style={{ animationDelay: `${delay}s`, animationFillMode: 'forwards' }} dangerouslySetInnerHTML={{ __html: parseInline(line) }} />;
};

const TextContent: React.FC<TextContentProps> = ({ post, mode, onUpdateTextPosition, isTextDraggable, cycleCount = 0, organization, aspectRatio, isForDownload, onUpdateTextWidth, startDelay = 0 }) => {
    const textContainerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const allHeadlines = useMemo(() => [post.headline || '', ...(post.rotatingHeadlines || [])].filter(Boolean), [post.headline, post.rotatingHeadlines]);
    const headlineToShow = allHeadlines.length > 0 ? allHeadlines[cycleCount % allHeadlines.length] : '';

    const containerStyle = useMemo((): React.CSSProperties => {
        const style: React.CSSProperties = { position: 'absolute', transform: 'translate(-50%, -50%)', display: 'flex' };
        if (post.textPositionX !== undefined && post.textPositionY !== undefined) {
            style.left = `${post.textPositionX}%`; style.top = `${post.textPositionY}%`;
            style.width = post.textWidth ? `${post.textWidth}%` : '80%';
        } else {
            const isSplit = post.layout === 'image-left' || post.layout === 'image-right';
            if (isSplit) {
                const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
                const split = post.splitRatio || 50; const textCenter = split + (100 - split) / 2;
                if (isPortrait) { style.left = '50%'; style.top = post.layout === 'image-left' ? `${textCenter}%` : `${(100 - split) / 2}%`; style.width = post.textWidth ? `${post.textWidth}%` : '90%'; }
                else { style.left = post.layout === 'image-left' ? `${textCenter}%` : `${(100 - split) / 2}%`; style.top = '50%'; style.width = post.textWidth ? `${post.textWidth}%` : `${100 - split - 10}%`; }
            } else {
                const pos = post.textPosition || 'middle-center';
                let x = 50, y = 50; if (pos.includes('top')) y = 15; if (pos.includes('bottom')) y = 85; if (pos.includes('left')) x = 25; if (pos.includes('right')) x = 75;
                style.left = `${x}%`; style.top = `${y}%`; style.width = post.textWidth ? `${post.textWidth}%` : '80%';
            }
        }
        style.justifyContent = post.textAlign === 'left' ? 'flex-start' : post.textAlign === 'right' ? 'flex-end' : 'center';
        return style;
    }, [post, aspectRatio]);

    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isTextDraggable || !onUpdateTextPosition || !textContainerRef.current) return;
        e.preventDefault(); e.stopPropagation(); setIsDragging(true);
        const parent = textContainerRef.current.parentElement; if (!parent) return;
        const pRect = parent.getBoundingClientRect(); const tRect = textContainerRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX; const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const offX = clientX - tRect.left; const offY = clientY - tRect.top;
        const onMove = (mv: MouseEvent | TouchEvent) => {
            const mX = 'touches' in mv ? (mv as TouchEvent).touches[0].clientX : (mv as MouseEvent).clientX;
            const mY = 'touches' in mv ? (mv as TouchEvent).touches[0].clientY : (mv as MouseEvent).clientY;
            onUpdateTextPosition({ x: Math.max(0, Math.min(100, ((mX - offX + tRect.width / 2 - pRect.left) / pRect.width) * 100)), y: Math.max(0, Math.min(100, ((mY - offY + tRect.height / 2 - pRect.top) / pRect.height) * 100)) });
        };
        const onEnd = () => { setIsDragging(false); window.removeEventListener('mousemove', onMove as any); window.removeEventListener('mouseup', onEnd); window.removeEventListener('touchmove', onMove as any); window.removeEventListener('touchend', onEnd); };
        if ('touches' in e) { window.addEventListener('touchmove', onMove as any); window.addEventListener('touchend', onEnd, { once: true }); }
        else { window.addEventListener('mousemove', onMove as any); window.addEventListener('mouseup', onEnd, { once: true }); }
    };

    const handleResize = (e: React.MouseEvent | React.TouchEvent, h: 'left' | 'right') => {
        if (!isTextDraggable || !onUpdateTextWidth || !textContainerRef.current) return;
        e.preventDefault(); e.stopPropagation();
        const parent = textContainerRef.current.parentElement; if (!parent) return;
        const pRect = parent.getBoundingClientRect(); const initX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const initW = textContainerRef.current.offsetWidth;
        const onMove = (mv: MouseEvent | TouchEvent) => {
            const mX = 'touches' in mv ? (mv as TouchEvent).touches[0].clientX : (mv as MouseEvent).clientX;
            const nW = h === 'right' ? initW + (mX - initX) : initW - (mX - initX);
            onUpdateTextWidth(Math.max(10, Math.min(100, (nW / pRect.width) * 100)));
        };
        const onEnd = () => { window.removeEventListener('mousemove', onMove as any); window.removeEventListener('mouseup', onEnd); window.removeEventListener('touchmove', onMove as any); window.removeEventListener('touchend', onEnd); };
        if ('touches' in e) { window.addEventListener('touchmove', onMove as any); window.addEventListener('touchend', onEnd, { once: true }); }
        else { window.addEventListener('mousemove', onMove as any); window.addEventListener('mouseup', onEnd, { once: true }); }
    };

    const boxStyle: React.CSSProperties = { textAlign: post.textAlign || 'center', color: resolveColor(post.textColor, '#ffffff', organization), padding: isPreviewMode(mode) ? '0.5rem' : '1.5rem', ...(post.textBackgroundEnabled && { backgroundColor: resolveColor(post.textBackgroundColor, 'rgba(0,0,0,0.5)', organization), borderRadius: isPreviewMode(mode) ? '0.25rem' : '0.75rem', backdropFilter: 'blur(4px)' }) };
    let delay = startDelay;
    const getDur = (l: string, a: DisplayPost['textAnimation']) => (a === 'typewriter' ? Math.max(0.5, l.length * 0.08) : a === 'fade-up-word' ? (l.split(/\s+/).length * 0.1) + 0.5 : 0);

    return (
        <div ref={textContainerRef} onMouseDown={isTextDraggable ? handleDragStart : undefined} onTouchStart={isTextDraggable ? handleDragStart : undefined} className={`group z-10 ${isDragging ? 'opacity-70' : ''} ${isTextDraggable ? 'cursor-move' : ''}`} style={containerStyle}>
            {isTextDraggable && <><div className="absolute -top-3 -right-3 p-2 bg-primary text-white rounded-full shadow-lg z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"><MoveIcon className="w-5 h-5" /></div><div onMouseDown={e => handleResize(e, 'left')} onTouchStart={e => handleResize(e, 'left')} className="absolute -left-2 top-0 bottom-0 w-4 cursor-col-resize flex items-center justify-start z-20 opacity-0 group-hover:opacity-100 transition-opacity"><div className="w-1 h-8 bg-primary rounded-full shadow-lg" /></div><div onMouseDown={e => handleResize(e, 'right')} onTouchStart={e => handleResize(e, 'right')} className="absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize flex items-center justify-end z-20 opacity-0 group-hover:opacity-100 transition-opacity"><div className="w-1 h-8 bg-primary rounded-full shadow-lg" /></div></>}
            <div style={boxStyle} className={post.textBackgroundEnabled ? '' : 'w-full'}>
                {headlineToShow && <h1 className={`font-bold leading-tight drop-shadow-lg break-words ${getHeadlineFontSizeClass(post.headlineFontSize, mode)} ${getTagFontFamilyClass(post.headlineFontFamily || organization?.headlineFontFamily || 'display')}`}>{headlineToShow.split('\n').map((l, i) => { const d = getDur(l, post.textAnimation); const curD = delay; if (post.textAnimation === 'typewriter') delay += d; return <AnimatedLine key={`${cycleCount}-h-${i}`} line={l} animation={post.textAnimation} cycleCount={cycleCount} delay={curD} baseAnimationDuration={d} />; })}</h1>}
                {post.body && <div className="animate-fade-in-post opacity-0" style={{ animationDelay: `${delay}s`, animationFillMode: 'forwards' }}><PostMarkdownRenderer content={post.body} className={`mt-4 break-words ${getBodyFontSizeClass(post.bodyFontSize, mode)} ${getTagFontFamilyClass(post.bodyFontFamily || organization?.bodyFontFamily || 'sans')}`} /></div>}
            </div>
        </div>
    );
};

const hexToRgba = (hex: string, alpha: number = 1): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})` : hex;
};

const DraggableTag: React.FC<{ tag: Tag; override: TagPositionOverride | undefined; mode: 'preview' | 'live'; onUpdatePosition?: (tagId: string, nP: { x: number; y: number; rotation: number }) => void; startDelay?: number; }> = ({ tag, override, mode, onUpdatePosition, startDelay = 0 }) => {
    const tagRef = useRef<HTMLDivElement>(null);
    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!onUpdatePosition || !tagRef.current) return;
        e.preventDefault(); e.stopPropagation(); const p = tagRef.current.closest('.w-full.h-full.relative.overflow-hidden'); if (!p) return;
        const pRect = p.getBoundingClientRect(); const iX = 'touches' in e ? e.touches[0].clientX : e.clientX; const iY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const iP = override || { tagId: tag.id, x: 50, y: 50, rotation: 0 };
        const onMove = (mv: MouseEvent | TouchEvent) => {
            const mX = 'touches' in mv ? (mv as TouchEvent).touches[0].clientX : (mv as MouseEvent).clientX;
            const mY = 'touches' in mv ? (mv as TouchEvent).touches[0].clientY : (mv as MouseEvent).clientY;
            onUpdatePosition(tag.id, { x: Math.max(0, Math.min(100, iP.x + (mX - iX) / pRect.width * 100)), y: Math.max(0, Math.min(100, iP.y + (mY - iY) / pRect.height * 100)), rotation: iP.rotation });
        };
        const onEnd = () => { window.removeEventListener('mousemove', onMove as any); window.removeEventListener('mouseup', onEnd); window.removeEventListener('touchmove', onMove as any); window.removeEventListener('touchend', onEnd); };
        if ('touches' in e) { window.addEventListener('touchmove', onMove as any); window.addEventListener('touchend', onEnd, { once: true }); }
        else { window.addEventListener('mousemove', onMove as any); window.addEventListener('mouseup', onEnd, { once: true }); }
    };
    const isStamp = tag.displayType === 'stamp'; const shape = isStamp ? tag.shape || 'circle' : 'rectangle';
    const style: React.CSSProperties = { color: tag.textColor, backgroundColor: isStamp ? undefined : tag.backgroundColor, ...(isStamp && { background: `radial-gradient(circle at center, ${hexToRgba(tag.backgroundColor, tag.opacity ?? 1)} 0%, transparent 70%)`, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1)) contrast(1.1) saturate(0.9)' }), ...(tag.animation === 'glow' ? { '--glow-color': tag.backgroundColor } : {} as any), ...(override && { position: 'absolute', left: `${override.x}%`, top: `${override.y}%`, transform: `translate(-50%, -50%) rotate(${override.rotation}deg)`, cursor: onUpdatePosition ? 'grab' : 'default', zIndex: 20 }) };
    let cls = `inline-flex items-center touch-none ${getTagFontSizeClass(tag.fontSize, mode)} ${getTagFontFamilyClass(tag.fontFamily)} ${getTagAnimationClass(tag.animation, tag.displayType, !!override)} `;
    if (isStamp) { cls += ' justify-center text-center uppercase tracking-[2px] font-bold ' + (shape === 'circle' ? ' rounded-full aspect-square ' : ' rounded-lg aspect-square '); if (tag.border !== 'none') cls += ` border-2 ${tag.border === 'dashed' ? 'border-dashed' : ''}`; }
    else { cls += ` rounded-lg uppercase tracking-wider ${getTagFontWeightClass(tag.fontWeight)} px-4 py-2 `; }
    const V = <div ref={tagRef} style={style} onMouseDown={!!onUpdatePosition ? handleDragStart : undefined} onTouchStart={!!onUpdatePosition ? handleDragStart : undefined} className={cls}>{tag.url ? <div className={`flex items-center ${isStamp ? 'flex-col gap-1' : 'gap-2'}`}><span>{tag.text}</span><div className="bg-white p-0.5 rounded-sm"><QrCodeComponent url={tag.url} className={isPreviewMode(mode) ? 'w-4 h-4' : 'w-6 h-6'} color={{ dark: '#000', light: '#fff' }} /></div></div> : tag.text}</div>;
    return startDelay > 0 ? <div className="contents animate-fade-in-post opacity-0" style={{ animationDelay: `${startDelay}s`, animationFillMode: 'forwards' }}>{V}</div> : V;
};

const CollageItemRenderer: React.FC<{ item: CollageItem; isPreloading?: boolean }> = ({ item, isPreloading }) => {
    if (item.type === 'video' && item.videoUrl) return <video src={item.videoUrl} autoPlay={!isPreloading} muted loop playsInline crossOrigin="anonymous" className="w-full h-full object-cover" />;
    if (item.type === 'image' && item.imageUrl) return <img src={item.imageUrl} alt="" crossOrigin="anonymous" className="w-full h-full object-cover" />;
    return <div className="w-full h-full bg-slate-800" />;
};

// --- MAIN RENDERER COMPONENT ---

export interface DisplayPostRendererProps { post: DisplayPost; allTags?: Tag[]; onVideoEnded?: () => void; onLoadReady?: () => void; onLoadError?: () => void; primaryColor?: string; cycleCount?: number; mode?: 'preview' | 'live'; showTags?: boolean; onUpdateTagPosition?: (tagId: string, pos: { x: number; y: number, rotation: number }) => void; onUpdateTextPosition?: (pos: { x: number, y: number }) => void; onUpdateTextWidth?: (width: number) => void; onUpdateQrPosition?: (pos: { x: number, y: number }) => void; onUpdateQrWidth?: (width: number) => void; isTextDraggable?: boolean; organization?: Organization; isForDownload?: boolean; aspectRatio?: DisplayScreen['aspectRatio']; isPreloading?: boolean; isBridgeOnly?: boolean; }

export const DisplayPostRenderer: React.FC<DisplayPostRendererProps> = ({ post, allTags: allTagsFromProp, onVideoEnded, onLoadReady, onLoadError, primaryColor: primaryColorFromProp, cycleCount = 0, mode = 'live', showTags = true, onUpdateTagPosition, onUpdateTextPosition, onUpdateTextWidth, onUpdateQrPosition, onUpdateQrWidth, isTextDraggable, isForDownload = false, organization, aspectRatio = '16:9', isPreloading = false, isBridgeOnly = false }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const allTags = useMemo(() => organization?.tags || allTagsFromProp || [], [organization, allTagsFromProp]);
    const primaryColor = useMemo(() => organization?.primaryColor || primaryColorFromProp, [organization, primaryColorFromProp]);
    const backgroundColor = resolveColor(post.backgroundColor, '#000000', organization, primaryColor);
    const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
    
    const mediaStyle = useMemo((): React.CSSProperties => {
        const style: React.CSSProperties = { inset: 0, width: '100%', height: '100%' };
        if (post.layout === 'image-left' || post.layout === 'image-right') {
            const split = post.splitRatio || 50;
            if (isPortrait) { style.height = `${split}%`; if (post.layout === 'image-right') { style.top = 'auto'; style.bottom = 0; } }
            else { style.width = `${split}%`; if (post.layout === 'image-right') { style.left = 'auto'; style.right = 0; } }
        }
        return style;
    }, [post.layout, post.splitRatio, isPortrait]);

    const handleMediaError = useCallback(() => { if (onLoadError) onLoadError(); }, [onLoadError]);
    const handleMediaReady = useCallback(() => { if (onLoadReady) onLoadReady(); }, [onLoadReady]);

    // Lightweight Bridge Mode: Only visual background
    if (isBridgeOnly) {
        return <div className="w-full h-full relative" style={{ backgroundColor }}>{post.imageUrl && <img src={post.imageUrl} crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-cover z-1" alt="" />}</div>;
    }

    const renderCollage = () => {
        const items = post.collageItems || [];
        const Block = (i: number) => <CollageItemRenderer item={items[i] || { id: 'empty', type: 'image' }} isPreloading={isPreloading} />;
        return <div className="w-full h-full p-1 grid gap-1" style={{ backgroundColor }}>{post.collageLayout?.includes('landscape') ? <div className="grid grid-cols-2 grid-rows-2 h-full gap-1">{Block(0)}{Block(1)}{Block(2)}{Block(3)}</div> : <div className="h-full">{Block(0)}</div>}</div>;
    };

    const isMediaLayout = ['image-fullscreen', 'video-fullscreen', 'image-left', 'image-right'].includes(post.layout);
    const startDelay = mode === 'live' ? 0.8 : 0;

    return (
        <div className="w-full h-full relative overflow-hidden" style={{ backgroundColor }}>
            {isMediaLayout && (
                <>
                    {post.imageUrl && <ImageWithFallback src={post.imageUrl} className={`absolute object-cover z-1 ${post.imageEffect?.includes('ken-burns') ? 'animate-' + post.imageEffect : ''}`} style={mediaStyle} alt="" onLoadReady={post.videoUrl ? undefined : handleMediaReady} onLoadError={handleMediaError} />}
                    {!post.imageUrl && post.videoUrl && <VideoWithFallback key={post.videoUrl} ref={videoRef} src={post.videoUrl} autoPlay={!isPreloading && !isForDownload} muted preload="auto" playsInline onEnded={onVideoEnded} onLoadReady={handleMediaReady} onLoadError={handleMediaError} onStall={handleMediaError} className="absolute object-cover z-1" style={mediaStyle} />}
                    {post.imageUrl && post.videoUrl && <VideoWithFallback key={post.videoUrl} ref={videoRef} src={post.videoUrl} autoPlay={!isPreloading && !isForDownload} muted preload="auto" playsInline onEnded={onVideoEnded} onLoadReady={handleMediaReady} onLoadError={handleMediaError} onStall={handleMediaError} className="absolute object-cover z-2" style={mediaStyle} />}
                </>
            )}
            {post.layout === 'collage' && <div className="absolute inset-0 z-1">{renderCollage()}</div>}
            {post.layout === 'webpage' && post.webpageUrl && <iframe src={ensureAbsoluteUrl(post.webpageUrl)} className="absolute inset-0 w-full h-full border-none z-1" title="" sandbox="allow-scripts allow-same-origin" />}
            {post.layout === 'instagram-latest' && organization?.latestInstagramPostUrl && <iframe src={`https://www.instagram.com/p/${organization.latestInstagramPostUrl.match(/\/p\/([a-zA-Z0-9_-]+)/)?.[1]}/embed/`} className="w-full h-full border-0 z-1" scrolling="no" />}
            {post.layout === 'instagram-stories' && organization?.id && <InstagramStoryPost organizationId={organization.id} />}
            {post.imageOverlayEnabled && <div className="absolute inset-0 z-3" style={{ backgroundColor: resolveColor(post.imageOverlayColor, 'rgba(0,0,0,0.45)', organization) }}></div>}
            {(post.headline || post.body) && <TextContent post={post} mode={mode} onUpdateTextPosition={onUpdateTextPosition} onUpdateTextWidth={onUpdateTextWidth} isTextDraggable={isTextDraggable} cycleCount={cycleCount} organization={organization} aspectRatio={aspectRatio} isForDownload={isForDownload} startDelay={startDelay} />}
            {showTags && post.tagIds?.map(tagId => { const tag = allTags.find(t => t.id === tagId); return tag ? <DraggableTag key={tagId} tag={{ ...tag, ...((post.tagColorOverrides || []).find(o => o.tagId === tagId) || {}) }} override={(post.tagPositionOverrides || []).find(o => o.tagId === tagId)} mode={mode} onUpdatePosition={onUpdateTagPosition} startDelay={startDelay} /> : null; })}
            {post.qrCodeUrl && <DraggableQrCode url={post.qrCodeUrl} x={post.qrPositionX ?? 90} y={post.qrPositionY ?? 90} width={post.qrWidth ?? 12} isDraggable={isTextDraggable} onUpdatePosition={onUpdateQrPosition} onUpdateWidth={onUpdateQrWidth} startDelay={startDelay} />}
            {post.layout === 'image-fullscreen' && post.subImages?.length && post.subImageConfig && <SubImageCarousel images={post.subImages} config={post.subImageConfig} cycleCount={cycleCount} />}
            <BackgroundEffects effect={post.backgroundEffect} />
        </div>
    );
};
