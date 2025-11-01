import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DisplayPost, Tag, SubImage, SubImageConfig, ContentPosition, TagPositionOverride, CollageItem, Organization, TagColorOverride, DisplayScreen } from '../types';
import QRCode from 'https://esm.sh/qrcode@1.5.3';
import { InstagramStoryPost } from './InstagramStoryPost';

// --- HELPER COMPONENTS & FUNCTIONS ---

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#E2E8F0"/><text x="50" y="50" font-family="sans-serif" font-size="10" fill="#94A3B8" text-anchor="middle" dominant-baseline="middle">Media saknas</text></svg>`;
const PLACEHOLDER_URL = `data:image/svg+xml;base64,${btoa(PLACEHOLDER_SVG)}`;

const ImageWithFallback: React.FC<{ src?: string; alt: string; className: string; style: React.CSSProperties; }> = ({ src, alt, className, style }) => {
    const [imgSrc, setImgSrc] = useState(src || PLACEHOLDER_URL);
    useEffect(() => { setImgSrc(src || PLACEHOLDER_URL); }, [src]);
    const handleError = () => setImgSrc(PLACEHOLDER_URL);
    return <img src={imgSrc} onError={handleError} alt={alt} className={`${className} ${imgSrc === PLACEHOLDER_URL ? 'object-contain p-4 bg-slate-200 dark:bg-slate-700' : ''}`} style={style} />;
};

const VideoWithFallback: React.FC<React.ComponentProps<'video'> & { src?: string }> = ({ src, ...props }) => {
    const [videoSrc, setVideoSrc] = useState(src);
    useEffect(() => { setVideoSrc(src); }, [src]);
    const handleError = () => setVideoSrc(undefined);
    
    if (!videoSrc) {
        return <img src={PLACEHOLDER_URL} alt="Missing video" className={props.className + ' object-contain p-4 bg-slate-200 dark:bg-slate-700'} style={props.style} />;
    }

    return <video src={videoSrc} onError={handleError} {...props} />;
};


declare global {
    interface Window {
        instgrm?: { Embeds: { process: () => void; }; };
    }
}

const InstagramEmbed: React.FC<{ embedCode: string }> = ({ embedCode }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const processInstagramEmbeds = () => {
            if (window.instgrm) {
                window.instgrm.Embeds.process();
            }
        };

        const existingScript = document.querySelector('script[src="//www.instagram.com/embed.js"]');

        if (existingScript) {
            processInstagramEmbeds();
        } else {
            const script = document.createElement('script');
            script.src = "//www.instagram.com/embed.js";
            script.async = true;
            script.onload = processInstagramEmbeds;
            document.body.appendChild(script);
        }
    }, [embedCode]);

    return (
        <div 
            ref={containerRef} 
            dangerouslySetInnerHTML={{ __html: embedCode }} 
            className="w-full h-full flex justify-center items-center bg-white [&>blockquote]:!my-0" 
        />
    );
};


const ensureAbsoluteUrl = (url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
        return url;
    }
    return `https://${url}`;
};

const resolveColor = (
    colorKey: string | undefined, 
    fallback: string, 
    organization?: Organization, 
    primaryColorFromProp?: string
): string => {
    if (!colorKey) return fallback;
    if (colorKey.startsWith('#')) return colorKey;
    switch (colorKey) {
        case 'white': return '#ffffff';
        case 'black': return '#000000';
        case 'primary': return organization?.primaryColor || primaryColorFromProp || '#14b8a6';
        case 'secondary': return organization?.secondaryColor || '#f97316';
        case 'tertiary': return organization?.tertiaryColor || '#3b82f6';
        case 'accent': return organization?.accentColor || '#ec4899';
        default: return fallback;
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

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-5">
            {pieces.map(p => <div key={p.id} className="confetti-piece" style={p.style} />)}
        </div>
    );
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

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-5">
            {pieces.map(p => <div key={p.id} className="heart-piece" style={p.style}>❤️</div>)}
        </div>
    );
};

const BackgroundEffects: React.FC<{ effect: DisplayPost['backgroundEffect'] }> = ({ effect }) => {
    if (effect === 'confetti') {
        return <ConfettiEffect />;
    }
    if (effect === 'hearts') {
        return <HeartsEffect />;
    }
    return null;
};

const QrCodeComponent: React.FC<{ url: string; size: number; color?: { dark: string; light: string } }> = ({ url, size, color = { dark: '#000000', light: '#FFFFFF' } }) => {
    const [dataUrl, setDataUrl] = useState('');

    useEffect(() => {
        if (url) {
            QRCode.toDataURL(url, { width: size, margin: 1, color })
                .then(setDataUrl)
                .catch(err => {
                    console.error("QR Code generation failed:", err);
                });
        } else {
            setDataUrl('');
        }
    }, [url, size, color]);

    if (!dataUrl) return null;

    return <img src={dataUrl} alt="QR Code" width={size} height={size} />;
};

const PostMarkdownRenderer: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
    const renderMarkdown = useMemo(() => {
        if (!content) {
            return { __html: '' };
        }

        const lines = content.split('\n');
        const htmlLines: string[] = [];
        let inList: 'ul' | 'ol' | false = false;

        const closeListIfNeeded = () => {
            if (inList) {
                htmlLines.push(`</${inList}>`);
                inList = false;
            }
        };

        for (const line of lines) {
            let safeLine = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            safeLine = safeLine
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/_(.*?)_/g, '<em>$1</em>');

            if (line.match(/^\d+\.\s/)) { // Numbered list
                if (inList !== 'ol') {
                    closeListIfNeeded();
                    htmlLines.push('<ol class="list-decimal list-inside space-y-1 my-2">');
                    inList = 'ol';
                }
                htmlLines.push(`<li>${safeLine.replace(/^\d+\.\s/, '')}</li>`);
            } else if (line.startsWith('* ') || line.startsWith('- ')) {
                if (inList !== 'ul') {
                    closeListIfNeeded();
                    htmlLines.push('<ul class="list-disc list-inside space-y-1 my-2">');
                    inList = 'ul';
                }
                htmlLines.push(`<li>${safeLine.substring(2)}</li>`);
            } else {
                closeListIfNeeded();
                if (line.trim() !== '') {
                    htmlLines.push(`<p class="my-2">${safeLine}</p>`);
                }
            }
        }

        closeListIfNeeded();
        return { __html: htmlLines.join('\n') };
    }, [content]);

    return (
        <div 
            className={className}
            dangerouslySetInnerHTML={renderMarkdown}
        />
    );
};


// Helper function to determine if we are in a preview/thumbnail mode
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
        case undefined: return 'font-sans';
        default: return `font-${family}`;
    }
};
const getTagFontWeightClass = (weight?: Tag['fontWeight']) => (weight === 'black' ? 'font-black' : 'font-bold');
const getTagAnimationClass = (animation?: Tag['animation'], displayType?: Tag['displayType'], hasOverride?: boolean) => {
    switch(animation) {
        case 'pulse':
            if (displayType === 'stamp') {
                return hasOverride ? 'animate-pulse-stamp-override' : 'animate-pulse-stamp';
            }
            return 'animate-pulse-tag';
        case 'glow': return 'animate-glow-tag';
        default: return '';
    }
};
const getHeadlineFontSizeClass = (size?: DisplayPost['headlineFontSize'], mode?: 'preview' | 'live') => {
    const isPreview = isPreviewMode(mode);
    // Drastically reduce font sizes for preview
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
    // Original sizes for live mode
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
const getQrCodeSize = (size?: DisplayPost['qrCodeSize']) => {
    switch (size) {
        case 'sm': return 60; case 'md': return 90; case 'lg': return 120; case 'xl': return 150; default: return 90;
    }
};

const SubImageCarousel: React.FC<{ images: SubImage[], config: SubImageConfig, cycleCount: number }> = ({ images, config, cycleCount }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    // This key ensures that when the parent post changes (indicated by cycleCount), the carousel resets its state.
    useEffect(() => {
        setCurrentIndex(0);
    }, [cycleCount]);

    useEffect(() => {
        if (config.animation !== 'fade' || images.length <= 1) return;

        const interval = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % images.length);
        }, (config.intervalSeconds || 5) * 1000);

        return () => clearInterval(interval);
    }, [images, config, cycleCount]);

    const getContainerStyle = (): React.CSSProperties => {
        if (config.animation === 'scroll') {
            return { '--scroll-duration': `${config.intervalSeconds || 30}s` } as React.CSSProperties;
        }
        return {};
    };

    const getContainerClasses = () => {
        const classes = ['absolute', 'z-20'];
        if (config.animation === 'fade') {
            classes.push('p-2', 'bg-black/30', 'backdrop-blur-sm', 'rounded-lg', 'shadow-lg');
            // position
            switch (config.position) {
                case 'top-left': classes.push('top-4 left-4'); break;
                case 'top-right': classes.push('top-4 right-4'); break;
                case 'bottom-left': classes.push('bottom-4 left-4'); break;
                case 'bottom-right': classes.push('bottom-4 right-4'); break;
                case 'center': classes.push('top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'); break;
                // FIX: Added handlers for new grid positions to support the updated SubImageConfig.position type.
                case 'top-center': classes.push('top-4 left-1/2 -translate-x-1/2'); break;
                case 'center-left': classes.push('top-1/2 left-4 -translate-y-1/2'); break;
                case 'center-right': classes.push('top-1/2 right-4 -translate-y-1/2'); break;
                case 'bottom-center': classes.push('bottom-4 left-1/2 -translate-x-1/2'); break;
                default: classes.push('bottom-4 right-4'); break;
            }
            // size
            switch (config.size) {
                case 'sm': classes.push('w-24 h-24'); break;
                case 'md': classes.push('w-32 h-32'); break;
                case 'lg': classes.push('w-48 h-48'); break;
                case 'xl': classes.push('w-64 h-64'); break;
                case '2xl': classes.push('w-80 h-80'); break;
                default: classes.push('w-32 h-32'); break;
            }
        } else { // scroll
            classes.push('left-0 right-0', 'overflow-hidden', 'p-2', 'bg-black/30', 'backdrop-blur-sm');
            // position
            switch (config.position) {
                case 'top': classes.push('top-0'); break;
                case 'middle': classes.push('top-1/2 -translate-y-1/2'); break;
                case 'bottom': classes.push('bottom-0'); break;
                default: classes.push('bottom-0'); break;
            }
             // size
            switch (config.size) {
                case 'sm': classes.push('h-20'); break;
                case 'md': classes.push('h-28'); break;
                case 'lg': classes.push('h-36'); break;
                case 'xl': classes.push('h-48'); break;
                case '2xl': classes.push('h-64'); break;
                default: classes.push('h-28'); break;
            }
        }
        return classes.join(' ');
    };

    if (!images || images.length === 0) {
        return null;
    }

    if (config.animation === 'scroll') {
        return (
            <div className={getContainerClasses()} style={getContainerStyle()}>
                <div className="flex h-full animate-marquee">
                    {[...images, ...images].map((image, index) => (
                        <div key={`${image.id}-${index}`} className="h-full flex-shrink-0 mr-4">
                             <ImageWithFallback
                                src={image.imageUrl}
                                alt={`Carousel image ${index + 1}`}
                                className="h-full w-auto object-cover rounded"
                                style={{}}
                            />
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    
    // Fade animation
    return (
        <div className={getContainerClasses()}>
            {images.map((image, index) => (
                 <ImageWithFallback
                    key={image.id}
                    src={image.imageUrl}
                    alt={`Carousel image ${index + 1}`}
                    className={`absolute inset-2 w-[calc(100%-1rem)] h-[calc(100%-1rem)] object-contain rounded transition-opacity duration-1000 ${index === currentIndex ? 'opacity-100' : 'opacity-0'}`}
                    style={{}}
                />
            ))}
        </div>
    );
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
}

const AnimatedLine: React.FC<{
    line: string;
    animation: DisplayPost['textAnimation'];
    cycleCount: number;
    delay: number;
    baseAnimationDuration: number;
}> = ({ line, animation, cycleCount, delay, baseAnimationDuration }) => {
    const parseInline = (text: string) => text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/_(.*?)_/g, '<em>$1</em>');

    if (animation === 'typewriter') {
        const style = {
            '--char-count': line.length,
            '--type-duration': `${baseAnimationDuration}s`,
            animationDelay: `${delay}s`,
        } as React.CSSProperties;
        // NOTE: Typewriter does not support Markdown rendering due to character counting for animation.
        return (
            <span className="block">
                <span key={`${cycleCount}`} className="animate-typewriter" style={style}>
                    {line}
                </span>
            </span>
        );
    }
    
    if (animation === 'fade-up-word') {
        return (
            <span className="block">
                {line.split(/\s+/).map((word, i) => (
                    <span 
                        key={`${cycleCount}-${i}`} 
                        className="animate-fade-up-word" 
                        style={{ animationDelay: `${delay + i * 0.1}s` }}
                        dangerouslySetInnerHTML={{ __html: parseInline(word) + '&nbsp;' }}
                    />
                ))}
            </span>
        );
    }

    // Default for 'blur-in', 'none', and any other case
    const animationClass = animation === 'blur-in' ? 'animate-blur-in' : '';
    const animationStyle = animation === 'blur-in' ? { animationDelay: `${delay}s` } : {};

    return (
        <span 
            className={`block ${animationClass}`} 
            key={cycleCount}
            style={animationStyle}
            dangerouslySetInnerHTML={{ __html: parseInline(line) }}
        />
    );
};

const TextContent: React.FC<TextContentProps> = ({ post, mode, onUpdateTextPosition, isTextDraggable, cycleCount = 0, organization, aspectRatio, isForDownload, onUpdateTextWidth }) => {
    const textContainerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    
    // Headline rotation logic
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
            style.maxWidth = '1200px';
            style.display = 'flex';
            style.justifyContent = post.textAlign === 'left' ? 'flex-start' : post.textAlign === 'right' ? 'flex-end' : 'center';
            return style;
        }
    
        const isSplitLayout = post.layout === 'image-left' || post.layout === 'image-right';
    
        if (isSplitLayout) {
            const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
            const splitPercent = post.splitRatio || 50;
            const textPercent = 100 - splitPercent;
            
            const imageCenter = splitPercent / 2;
            const textCenter = splitPercent + (textPercent / 2);

            let x = 50, y = 50, width = '90%';

            if (isPortrait) {
                y = post.layout === 'image-left' ? textCenter : imageCenter;
                width = post.textWidth ? `${post.textWidth}%` : '90%';
            } else { // Landscape
                x = post.layout === 'image-left' ? textCenter : imageCenter;
                width = post.textWidth ? `${post.textWidth}%` : `${textPercent - 10}%`;
            }
            
            style.position = 'absolute';
            style.left = `${x}%`;
            style.top = `${y}%`;
            style.transform = 'translate(-50%, -50%)';
            style.width = width;
            style.display = 'flex';
            style.justifyContent = post.textAlign === 'left' ? 'flex-start' : post.textAlign === 'right' ? 'flex-end' : 'center';
            return style;
        }
    
        const pos = post.textPosition || 'middle-center';
        let yPos = 50; if (pos.includes('top')) yPos = 15; if (pos.includes('bottom')) yPos = 85;
        let xPos = 50; if (pos.includes('left')) xPos = 25; if (pos.includes('right')) xPos = 75;
    
        style.position = 'absolute';
        style.left = `${xPos}%`;
        style.top = `${yPos}%`;
        style.transform = `translate(-50%, -50%)`;
        style.width = post.textWidth ? `${post.textWidth}%` : '80%';
        style.maxWidth = '1200px';
        style.display = 'flex';
        style.justifyContent = post.textAlign === 'left' ? 'flex-start' : post.textAlign === 'right' ? 'flex-end' : 'center';

        return style;
    }, [post, aspectRatio]);


    const contentBoxStyle: React.CSSProperties = {
        textAlign: post.textAlign || 'center',
        color: resolveColor(post.textColor, '#ffffff', organization),
        padding: isPreviewMode(mode) ? '0.5rem' : '1.5rem',
        ...(post.textBackgroundEnabled && {
            backgroundColor: resolveColor(post.textBackgroundColor, '#00000080', organization),
            borderRadius: isPreviewMode(mode) ? '0.25rem' : '0.75rem',
            backdropFilter: 'blur(4px)',
        })
    };
    
    // Special, simplified render path for html2canvas to ensure text wrapping works correctly.
    if (isForDownload) {
        return (
            <div ref={textContainerRef} className={`z-10`} style={containerStyle} >
                <div style={contentBoxStyle} className={post.textBackgroundEnabled ? '' : 'w-full'}>
                    {headlineToShow && (
                        <h1 className={`font-bold leading-tight drop-shadow-lg break-words whitespace-pre-wrap ${getHeadlineFontSizeClass(post.headlineFontSize, mode)} ${getTagFontFamilyClass(post.headlineFontFamily || organization?.headlineFontFamily || 'display')}`}>
                            {headlineToShow}
                        </h1>
                    )}
                    {post.body && (
                        <div className={`mt-4 whitespace-pre-wrap break-words ${getBodyFontSizeClass(post.bodyFontSize, mode)} ${getTagFontFamilyClass(post.bodyFontFamily || organization?.bodyFontFamily || 'sans')}`}>
                            {post.body}
                        </div>
                    )}
                </div>
            </div>
        );
    }
    
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isTextDraggable || !onUpdateTextPosition || !textContainerRef.current) return;
        e.preventDefault();
        e.stopPropagation(); // Stop event bubbling
        setIsDragging(true);
        
        const parent = textContainerRef.current.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        
        const textRect = textContainerRef.current.getBoundingClientRect();
        const offsetX = e.clientX - textRect.left;
        const offsetY = e.clientY - textRect.top;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const newLeft = moveEvent.clientX - offsetX;
            const newTop = moveEvent.clientY - offsetY;
            
            const newCenterX = newLeft + textRect.width / 2;
            const newCenterY = newTop + textRect.height / 2;

            const xPercent = ((newCenterX - parentRect.left) / parentRect.width) * 100;
            const yPercent = ((newCenterY - parentRect.top) / parentRect.height) * 100;

            onUpdateTextPosition({ 
                x: Math.max(0, Math.min(100, xPercent)), 
                y: Math.max(0, Math.min(100, yPercent)) 
            });
        };

        const onMouseUp = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp, { once: true });
    };

    const handleResizeMouseDown = (e: React.MouseEvent, handle: 'left' | 'right') => {
        if (!isTextDraggable || !onUpdateTextWidth || !textContainerRef.current) return;
        e.preventDefault();
        e.stopPropagation();

        const parent = textContainerRef.current.parentElement;
        if (!parent) return;

        const parentRect = parent.getBoundingClientRect();
        const initialX = e.clientX;
        const initialWidth = textContainerRef.current.offsetWidth;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const dx = moveEvent.clientX - initialX;
            let newWidth;

            if (handle === 'right') {
                newWidth = initialWidth + dx;
            } else { // left
                newWidth = initialWidth - dx;
            }

            const newWidthPercent = (newWidth / parentRect.width) * 100;
            const clampedWidth = Math.max(10, Math.min(100, newWidthPercent));

            onUpdateTextWidth(clampedWidth);
        };

        const onMouseUp = () => { window.removeEventListener('mousemove', onMouseMove); };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp, { once: true });
    };

    const headlineLines = headlineToShow.split('\n');
    
    let cumulativeDelay = 0;

    const calculateDuration = (line: string, animation: DisplayPost['textAnimation']) => {
        if (!animation || animation === 'none') return 0;
        if (animation === 'typewriter') return Math.max(0.5, line.length * 0.08);
        if (animation === 'fade-up-word') return (line.split(/\s+/).length * 0.1) + 0.5;
        if (animation === 'blur-in') return 0.8;
        return 0;
    };
    
    return (
        <div 
            ref={textContainerRef}
            className={`group z-10 ${isTextDraggable ? 'cursor-move' : ''} ${isDragging ? 'opacity-70' : ''}`}
            style={containerStyle}
            onMouseDown={handleMouseDown}
        >
            {isTextDraggable && (
                <>
                    <div 
                        onMouseDown={e => handleResizeMouseDown(e, 'left')}
                        className="absolute -left-2 top-0 bottom-0 w-4 cursor-col-resize flex items-center justify-start opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <div className="w-1 h-8 bg-primary rounded-full shadow-lg"></div>
                    </div>
                    <div 
                        onMouseDown={e => handleResizeMouseDown(e, 'right')}
                        className="absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <div className="w-1 h-8 bg-primary rounded-full shadow-lg"></div>
                    </div>
                </>
            )}
            <div style={contentBoxStyle} className={post.textBackgroundEnabled ? '' : 'w-full'}>
                { headlineToShow && (
                    <h1 
                        className={`font-bold leading-tight drop-shadow-lg break-words ${getHeadlineFontSizeClass(post.headlineFontSize, mode)} ${getTagFontFamilyClass(post.headlineFontFamily || organization?.headlineFontFamily || 'display')}`}
                    >
                        {headlineLines.map((line, i) => {
                            const duration = calculateDuration(line, post.textAnimation);
                            const currentDelay = cumulativeDelay;
                            if (post.textAnimation === 'typewriter') {
                                cumulativeDelay += duration;
                            }
                            return <AnimatedLine key={`${cycleCount}-h-${i}`} line={line} animation={post.textAnimation} cycleCount={cycleCount} delay={currentDelay} baseAnimationDuration={duration} />;
                        })}
                    </h1>
                )}
                { post.body && (
                    <PostMarkdownRenderer 
                        content={post.body}
                        className={`mt-4 break-words ${getBodyFontSizeClass(post.bodyFontSize, mode)} ${getTagFontFamilyClass(post.bodyFontFamily || organization?.bodyFontFamily || 'sans')}`}
                    />
                )}
            </div>
        </div>
    );
};

interface DraggableTagProps {
    tag: Tag;
    override: TagPositionOverride | undefined;
    mode: 'preview' | 'live';
    onUpdatePosition?: (tagId: string, newPosition: { x: number; y: number; rotation: number }) => void;
}

const hexToRgba = (hex: string, alpha: number = 1): string => {
    if (!hex) return 'rgba(0,0,0,0)';
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
        return hex; // return original if invalid hex
    }
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const DraggableTag: React.FC<DraggableTagProps> = ({ tag, override, mode, onUpdatePosition }) => {
    const tagRef = useRef<HTMLDivElement>(null);
    const isDraggable = !!onUpdatePosition;

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isDraggable || !tagRef.current) return;
        e.preventDefault();
        e.stopPropagation();

        const parent = tagRef.current.closest('.w-full.h-full.relative.overflow-hidden');
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        
        const initialX = e.clientX;
        const initialY = e.clientY;
        
        let initialOverride: TagPositionOverride;
        if (override) {
            initialOverride = override;
        } else {
            const tagRect = tagRef.current.getBoundingClientRect();
            initialOverride = {
                tagId: tag.id,
                x: ((tagRect.left + tagRect.width / 2) - parentRect.left) / parentRect.width * 100,
                y: ((tagRect.top + tagRect.height / 2) - parentRect.top) / parentRect.height * 100,
                rotation: 0,
            };
        }

        const onMouseMove = (moveEvent: MouseEvent) => {
            const dx = moveEvent.clientX - initialX;
            const dy = moveEvent.clientY - initialY;
            
            const elementStartX = (initialOverride.x / 100) * parentRect.width;
            const elementStartY = (initialOverride.y / 100) * parentRect.height;
            
            const newX = elementStartX + dx;
            const newY = elementStartY + dy;
            
            const newXPercent = (newX / parentRect.width) * 100;
            const newYPercent = (newY / parentRect.height) * 100;

            onUpdatePosition(tag.id, {
                x: Math.max(0, Math.min(100, newXPercent)),
                y: Math.max(0, Math.min(100, newYPercent)),
                rotation: initialOverride.rotation,
            });
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
        };
        
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp, { once: true });
    };

    const isStamp = tag.displayType === 'stamp';
    const isPreview = isPreviewMode(mode);
    const shape = (isStamp && tag.shape) ? tag.shape : 'circle';
    const useScaleVar = isStamp && tag.animation === 'pulse' && override;
    
    const positionStyle: React.CSSProperties = override
        ? {
              position: 'absolute',
              left: `${override.x}%`,
              top: `${override.y}%`,
              transform: `translate(-50%, -50%) rotate(${override.rotation}deg)${useScaleVar ? ' scale(var(--scale, 1))' : ''}`,
              cursor: isDraggable ? 'grab' : 'default',
          }
        : {};

    const tagStyle: React.CSSProperties = {
        color: tag.textColor,
        ...(tag.animation === 'glow' ? { '--glow-color': tag.backgroundColor } : {}),
        ...positionStyle
    };

    let tagClassName = `inline-flex items-center z-20 ${getTagFontSizeClass(tag.fontSize, mode)} ${getTagFontFamilyClass(tag.fontFamily)} ${getTagAnimationClass(tag.animation, tag.displayType, !!override)} ${override ? '' : 'relative'}`;

    if (isStamp) {
        tagClassName += ' justify-center text-center uppercase tracking-[2px] font-bold ';
        tagStyle.background = `radial-gradient(circle at center, ${hexToRgba(tag.backgroundColor, tag.opacity ?? 1)} 0%, transparent 70%) no-repeat`;
        tagStyle.filter = 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1)) contrast(1.1) saturate(0.9)';

        if (shape === 'circle') {
            tagClassName += ' rounded-full aspect-square ';
        } else if (shape === 'square') {
            tagClassName += ' rounded-lg aspect-square ';
        } else { // rectangle
            tagClassName += ' rounded-lg ';
        }
        
        if (tag.border === 'solid') {
            tagClassName += ' border-2 ';
            tagStyle.borderColor = 'currentColor';
        } else if (tag.border === 'dashed') {
            tagClassName += ' border-2 border-dashed ';
            tagStyle.borderColor = 'currentColor';
        }
    } else {
        tagClassName += ` rounded-lg uppercase tracking-wider ${getTagFontWeightClass(tag.fontWeight)} `;
        tagStyle.backgroundColor = tag.backgroundColor;
    }

    let paddingClass = '';
    const isShapeVertical = isStamp && (shape === 'circle' || shape === 'square');
    if (tag.url) {
        paddingClass = isPreview ? 'p-0.5' : 'p-1';
    } else if (isStamp) {
        if (shape === 'circle' || shape === 'square') {
            paddingClass = isPreview ? 'p-2' : 'p-4';
        } else { // rectangle
            paddingClass = isPreview ? 'px-2 py-1' : 'px-4 py-2';
        }
    } else { // tag
        paddingClass = isPreview ? 'px-2 py-1' : 'px-4 py-2';
    }
    tagClassName += ` ${paddingClass}`;


    const tagContent = (
        <div
            ref={tagRef}
            style={tagStyle}
            onMouseDown={isDraggable ? handleMouseDown : undefined}
            className={tagClassName.replace(/\s\s+/g, ' ')}
        >
            {tag.url ? (
                <div className={`flex items-center ${isShapeVertical ? 'flex-col gap-1' : 'gap-2'}`}>
                    <span>{tag.text || "Taggtext"}</span>
                    <div className="bg-white p-0.5 rounded-sm">
                        <QrCodeComponent url={tag.url} size={isPreview ? 16 : 24} color={{ dark: '#000', light: '#fff' }} />
                    </div>
                </div>
            ) : (
                tag.text || "Taggtext"
            )}
        </div>
    );
    
    if (override || isDraggable) {
        return tagContent;
    }

    return (
        <div className={`absolute inset-0 flex p-4 pointer-events-none z-20 justify-center items-center`}>
            <div className="pointer-events-auto">
                 {tagContent}
            </div>
        </div>
    );
};

const CollageItemRenderer: React.FC<{ item: CollageItem }> = ({ item }) => {
    const [hasError, setHasError] = useState(false);
    useEffect(() => { setHasError(false); }, [item.imageUrl, item.videoUrl]);

    if (hasError) {
        return <img src={PLACEHOLDER_URL} alt="Media saknas" className="w-full h-full object-contain p-2 bg-slate-200 dark:bg-slate-700" />;
    }
    if (item.type === 'video' && item.videoUrl) {
        return <video src={item.videoUrl} onError={() => setHasError(true)} autoPlay muted loop playsInline className="w-full h-full object-cover" />;
    }
    if (item.type === 'image' && item.imageUrl) {
        return <img src={item.imageUrl} onError={() => setHasError(true)} alt="Collage item" className="w-full h-full object-cover" />;
    }
    // Render a placeholder if item is malformed or missing URL
    return <div className="w-full h-full bg-slate-800" />;
};


export interface DisplayPostRendererProps {
    post: DisplayPost;
    allTags?: Tag[];
    onVideoEnded?: () => void;
    primaryColor?: string;
    cycleCount?: number;
    mode?: 'preview' | 'live';
    showTags?: boolean;
    onUpdateTagPosition?: (tagId: string, newPosition: { x: number, y: number, rotation: number }) => void;
    onUpdateTextPosition?: (pos: { x: number, y: number }) => void;
    onUpdateTextWidth?: (width: number) => void;
    isTextDraggable?: boolean;
    // FIX: Added optional 'organization' prop to resolve TypeScript errors where it was being passed without being defined.
    organization?: Organization;
    isForDownload?: boolean;
    aspectRatio?: DisplayScreen['aspectRatio'];
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
    isTextDraggable,
    isForDownload = false,
    organization,
    aspectRatio = '16:9',
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    // FIX: This logic makes the component more robust. It can derive data from the 'organization' object if provided,
    // or fall back to the individual direct props for backward compatibility with existing calls.
    const allTags = useMemo(() => organization?.tags || allTagsFromProp || [], [organization, allTagsFromProp]);
    const primaryColor = useMemo(() => organization?.primaryColor || primaryColorFromProp, [organization, primaryColorFromProp]);


    useEffect(() => {
        const videoElement = videoRef.current;
        if (videoElement) {
            const handleEnd = () => {
                if(onVideoEnded) onVideoEnded();
            };
            videoElement.addEventListener('ended', handleEnd);
            return () => videoElement.removeEventListener('ended', handleEnd);
        }
    }, [onVideoEnded]);
    
    const backgroundColor = resolveColor(post.backgroundColor, '#000000', organization, primaryColor);
    const pulseColor = resolveColor(post.pulseColor, primaryColor || '#14b8a6', organization, primaryColor);

    const colorEffectAnimationClass = useMemo(() => {
        switch (post.backgroundEffect) {
            case 'pulse-light': return 'animate-pulse-bg-light';
            case 'pulse-medium': return 'animate-pulse-bg-medium';
            case 'pulse-intense': return 'animate-pulse-bg-intense';
            case 'glow-pulse': return 'animate-glow-pulse';
            case 'wave-bg': return 'animate-wave-bg';
            case 'gradient-pulse': return 'animate-gradient-pulse';
            default: return '';
        }
    }, [post.backgroundEffect]);

    const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';

    const mediaAnimationClasses = `${post.imageEffect === 'ken-burns-slow' ? 'animate-ken-burns-slow' : ''} ${post.imageEffect === 'ken-burns-fast' ? 'animate-ken-burns-fast' : ''}`;
    const mediaBaseClasses = 'absolute object-cover z-1';

    const mediaStyle = useMemo((): React.CSSProperties => {
        const style: React.CSSProperties = {};
        const splitPercent = post.splitRatio || 50;

        switch (post.layout) {
            case 'image-fullscreen':
            case 'video-fullscreen':
                style.inset = 0;
                style.width = '100%';
                style.height = '100%';
                break;
            case 'image-left': // This is "Image Top" in portrait
                style.top = 0;
                style.left = 0;
                if (isPortrait) {
                    style.width = '100%';
                    style.height = `${splitPercent}%`;
                } else {
                    style.height = '100%';
                    style.width = `${splitPercent}%`;
                }
                break;
            case 'image-right': // This is "Image Bottom" in portrait
                if (isPortrait) {
                    style.bottom = 0;
                    style.left = 0;
                    style.width = '100%';
                    style.height = `${splitPercent}%`;
                } else {
                    style.top = 0;
                    style.right = 0;
                    style.height = '100%';
                    style.width = `${splitPercent}%`;
                }
                break;
        }
        return style;
    }, [post.layout, post.splitRatio, isPortrait]);
    
    const renderCollage = () => {
        const items = post.collageItems || [];

        const renderSlot = (item: CollageItem | undefined | null) => {
            return item ? <CollageItemRenderer item={item} /> : <div className="w-full h-full bg-slate-800" />;
        };

        switch (post.collageLayout) {
            case 'landscape-1-2':
                return (
                    <div className="grid grid-cols-2 grid-rows-2 gap-1 h-full p-1" style={{ backgroundColor }}>
                        <div className="row-span-2">{renderSlot(items[0])}</div>
                        <div className="col-start-2 row-start-1">{renderSlot(items[1])}</div>
                        <div className="col-start-2 row-start-2">{renderSlot(items[2])}</div>
                    </div>
                );
            case 'landscape-2-horiz':
            case 'portrait-2-horiz':
                return (
                    <div className="grid grid-cols-2 gap-1 h-full p-1" style={{ backgroundColor }}>
                        <div>{renderSlot(items[0])}</div>
                        <div>{renderSlot(items[1])}</div>
                    </div>
                );
            case 'landscape-2-vert':
            case 'portrait-2-vert':
                return (
                    <div className="grid grid-rows-2 gap-1 h-full p-1" style={{ backgroundColor }}>
                        <div>{renderSlot(items[0])}</div>
                        <div>{renderSlot(items[1])}</div>
                    </div>
                );
            case 'landscape-3-horiz':
                return (
                    <div className="grid grid-cols-3 gap-1 h-full p-1" style={{ backgroundColor }}>
                        <div>{renderSlot(items[0])}</div>
                        <div>{renderSlot(items[1])}</div>
                        <div>{renderSlot(items[2])}</div>
                    </div>
                );
            case 'landscape-4-grid':
                return (
                    <div className="grid grid-cols-2 grid-rows-2 gap-1 h-full p-1" style={{ backgroundColor }}>
                        <div>{renderSlot(items[0])}</div>
                        <div>{renderSlot(items[1])}</div>
                        <div>{renderSlot(items[2])}</div>
                        <div>{renderSlot(items[3])}</div>
                    </div>
                );
            case 'portrait-1-2':
                 return (
                    <div className="grid grid-cols-2 grid-rows-2 gap-1 h-full p-1" style={{ backgroundColor }}>
                        <div className="col-span-2">{renderSlot(items[0])}</div>
                        <div className="col-start-1 row-start-2">{renderSlot(items[1])}</div>
                        <div className="col-start-2 row-start-2">{renderSlot(items[2])}</div>
                    </div>
                );
            case 'portrait-3-vert':
                return (
                    <div className="grid grid-rows-3 gap-1 h-full p-1" style={{ backgroundColor }}>
                        <div>{renderSlot(items[0])}</div>
                        <div>{renderSlot(items[1])}</div>
                        <div>{renderSlot(items[2])}</div>
                    </div>
                );
            case 'portrait-4-grid':
                 return (
                    <div className="grid grid-cols-2 grid-rows-2 gap-1 h-full p-1" style={{ backgroundColor }}>
                        <div>{renderSlot(items[0])}</div>
                        <div>{renderSlot(items[1])}</div>
                        <div>{renderSlot(items[2])}</div>
                        <div>{renderSlot(items[3])}</div>
                    </div>
                );
            default:
                // Default to first layout if none is selected
                return (
                    <div className="grid grid-cols-2 grid-rows-2 gap-1 h-full p-1" style={{ backgroundColor }}>
                        <div className="row-span-2">{renderSlot(items[0])}</div>
                        <div className="col-start-2 row-start-1">{renderSlot(items[1])}</div>
                        <div className="col-start-2 row-start-2">{renderSlot(items[2])}</div>
                    </div>
                );
        }
    };

    const renderInstagramPost = () => {
        const url = organization?.latestInstagramPostUrl;

        if (!url) {
            const message = "Ingen länk till senaste Instagram-inlägg har angetts under Varumärke > Sociala Medier.";
            return <div className="w-full h-full flex items-center justify-center text-slate-400 p-4 text-center">{message}</div>;
        }
        
        const match = url.match(/\/p\/([a-zA-Z0-9_-]+)/) || url.match(/\/reel\/([a-zA-Z0-9_-]+)/);
        const shortcode = match ? match[1] : null;

        if (shortcode) {
            const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/?cr=1&v=14&wp=540&rd=http%3A%2F%2Flocalhost%3A3000&rp=%2F#%7B%22ci%22%3A0%2C%22os%22%3A123%7D`;

            return (
                <div className="w-full h-full flex items-center justify-center bg-black p-1">
                     <iframe
                        src={embedUrl}
                        className="w-full h-full border-0 max-w-[540px]"
                        allowTransparency={true}
                        scrolling="no"
                    />
                </div>
            );
        }

        return <div className="w-full h-full flex items-center justify-center text-slate-400 p-4 text-center">Ogiltig Instagram-URL. Länken ska se ut ungefär så här: <br/> https://www.instagram.com/p/C_abc123/</div>;
    };

    if (post.layout === 'instagram-latest') {
        return renderInstagramPost();
    }
    
    if (post.layout === 'instagram-stories') {
        if (!organization?.id) {
            return <div className="w-full h-full flex items-center justify-center text-slate-400 p-4 text-center">Organisationen kunde inte identifieras.</div>
        }
        return <InstagramStoryPost organizationId={organization.id} />;
    }

    const isMediaLayout = useMemo(() => {
        return ['image-fullscreen', 'video-fullscreen', 'image-left', 'image-right'].includes(post.layout);
    }, [post.layout]);

    return (
        <div className="w-full h-full relative overflow-hidden" style={{ backgroundColor }}>
            {isMediaLayout && (
                <>
                    {post.imageUrl && (
                        <ImageWithFallback src={post.imageUrl} alt={post.headline || 'Post image'} className={`${mediaBaseClasses} ${mediaAnimationClasses}`} style={mediaStyle} />
                    )}
                    {!post.imageUrl && post.videoUrl && (
                        <VideoWithFallback ref={videoRef} src={post.videoUrl} autoPlay muted playsInline onEnded={onVideoEnded} className={mediaBaseClasses} style={mediaStyle} />
                    )}
                </>
            )}
             {post.layout === 'collage' && <div className="absolute inset-0 z-1">{renderCollage()}</div>}
             {post.layout === 'webpage' && post.webpageUrl && (
                <iframe
                    src={ensureAbsoluteUrl(post.webpageUrl)}
                    className="absolute inset-0 w-full h-full border-none z-1"
                    title={post.internalTitle || 'Webpage Content'}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                />
             )}

            {colorEffectAnimationClass && (
                <div 
                    className={`absolute inset-0 z-2 mix-blend-overlay opacity-50 ${colorEffectAnimationClass}`} 
                    style={{ '--pulse-color-rgb': pulseColor.match(/\w\w/g)?.map(x => parseInt(x, 16)).join(' ') } as React.CSSProperties} 
                />
            )}

            {post.imageOverlayEnabled && (post.layout.includes('image') || post.layout.includes('video') || post.layout === 'collage' || post.layout === 'webpage') && (
                <div 
                    className="absolute inset-0 z-3"
                    style={{ backgroundColor: post.imageOverlayColor || 'rgba(0, 0, 0, 0.45)' }}
                ></div>
            )}
            
            {(post.headline || post.body) && <TextContent post={post} mode={mode} onUpdateTextPosition={onUpdateTextPosition} onUpdateTextWidth={onUpdateTextWidth} isTextDraggable={isTextDraggable} cycleCount={cycleCount} organization={organization} aspectRatio={aspectRatio} isForDownload={isForDownload} />}

            {showTags && post.tagIds && post.tagIds.map(tagId => {
                 const tag = allTags.find(t => t.id === tagId);
                 if (!tag) return null;
                 
                 const colorOverride = (post.tagColorOverrides || []).find(o => o.tagId === tagId);
                 const positionOverride = (post.tagPositionOverrides || []).find(o => o.tagId === tagId);

                 const finalTag = {
                     ...tag,
                     ...(colorOverride || {}),
                 };
                 
                 // FIX: Corrected a typo in the onUpdatePosition prop name, changing it to onUpdateTagPosition to match the defined prop and resolve the 'Cannot find name' error.
                 return <DraggableTag key={tagId} tag={finalTag} override={positionOverride} mode={mode} onUpdatePosition={onUpdateTagPosition} />;
            })}

             {post.qrCodeUrl && (
                <div className={`absolute z-20 p-1.5 bg-white rounded-lg shadow-lg ${post.qrCodePosition === 'top-left' ? 'top-4 left-4' : ''} ${post.qrCodePosition === 'top-right' ? 'top-4 right-4' : ''} ${post.qrCodePosition === 'bottom-left' ? 'bottom-4 left-4' : ''} ${post.qrCodePosition === 'bottom-right' || !post.qrCodePosition ? 'bottom-4 right-4' : ''}`}>
                    <QrCodeComponent url={post.qrCodeUrl} size={getQrCodeSize(post.qrCodeSize)} />
                </div>
            )}

            {post.layout === 'image-fullscreen' && post.subImages && post.subImages.length > 0 && post.subImageConfig && (
                <SubImageCarousel images={post.subImages} config={post.subImageConfig} cycleCount={cycleCount} />
            )}

            <BackgroundEffects effect={post.backgroundEffect} />
        </div>
    );
};