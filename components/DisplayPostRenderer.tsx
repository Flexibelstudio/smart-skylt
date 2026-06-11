
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DisplayPost, Tag, Organization, DisplayScreen, TagPositionOverride, CollageItem, SubImage, SubImageConfig, AdditionalTextElement } from '../types';
import QRCode from 'qrcode';
import { MoveIcon } from './icons';

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

const getAlpha = (colorString: string): number => {
    if (!colorString) return 1;
    if (colorString.startsWith('#')) {
        if (colorString.length === 9) {
             return parseInt(colorString.slice(7,9), 16) / 255;
        }
        return 1;
    }
    if (colorString.startsWith('rgba')) {
        const match = colorString.match(/rgba?\(.*,\s*([\d.]+)\s*\)/);
        if (match && match[1]) return parseFloat(match[1]);
        return 1; 
    }
    if (colorString === 'transparent') return 0;
    return 1;
};

const ensureAbsoluteUrl = (url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) return url;
    return `https://${url}`;
};

const mapLegacySize = (size?: string): number => {
    switch(size) {
        case 'sm': return 10;
        case 'md': return 15;
        case 'lg': return 20;
        case 'xl': return 25;
        default: return 15;
    }
};

const mapLegacyPosition = (position?: string) => ({ x: 90, y: 90 });

// --- STYLE GENERATORS ---

const isPreviewMode = (mode?: 'preview' | 'live') => mode === 'preview';

const hexToRgba = (hex: string, alpha: number = 1): string => {
    if (!hex) return 'rgba(0,0,0,0)';
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
        return hex; // return original if invalid hex
    }
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
};

const getTagFontSizeClass = (size?: Tag['fontSize'], mode?: 'preview' | 'live') => {
    // Tags still use fixed sizes for now as they are stamps, but could be upgraded later.
    const isPreview = isPreviewMode(mode);
    switch (size) {
        case 'sm': return isPreview ? 'text-[8px]' : 'text-sm';
        case 'md': return isPreview ? 'text-[10px]' : 'text-base';
        case 'lg': return isPreview ? 'text-xs' : 'text-lg';
        case 'xl': return isPreview ? 'text-sm' : 'text-xl';
        case '2xl': return isPreview ? 'text-base' : 'text-2xl';
        case '3xl': return isPreview ? 'text-lg' : 'text-3xl';
        case '4xl': return isPreview ? 'text-2xl' : 'text-3xl';
        case '5xl': return isPreview ? 'text-3xl' : 'text-4xl';
        default: return isPreview ? 'text-[10px]' : 'text-base';
    }
};

// Robust helper to resolve font family classes, handling aliases like 'script' -> 'font-logo'
const getFontFamilyClass = (family?: string) => {
    switch (family) {
        case 'display': return 'font-display';
        case 'script': return 'font-logo'; // Maps 'script' selection to 'Satisfy' (configured as 'logo' in Tailwind)
        case 'adscript': return 'font-adscript';
        case 'sans': return 'font-sans';
        // Fallback for direct matches (e.g. 'merriweather' -> 'font-merriweather')
        default: return family ? `font-${family}` : 'font-sans';
    }
};

const getTagFontWeightClass = (weight?: Tag['fontWeight']) => {
    switch (weight) {
        case 'black': return 'font-black';
        case 'bold':
        default: return 'font-bold';
    }
};

const getTagAnimationClass = (animation?: Tag['animation'], displayType?: Tag['displayType']) => {
    switch(animation) {
        case 'pulse':
            if (displayType === 'stamp') {
                return 'animate-pulse-stamp';
            }
            return 'animate-pulse-tag';
        case 'glow':
            return 'animate-glow-tag';
        default:
            return '';
    }
};

// --- NEW: Fluid Typography Logic (Container Queries) ---
// Returns a style object with fontSize in 'cqw' units.
// This guarantees that text scales perfectly with the container width.
const getFluidFontSizeStyle = (type: 'headline' | 'body', sizeStr?: string, scaleNum?: number) => {
    // If we have a direct numeric scale, use it (highest priority)
    if (scaleNum !== undefined && scaleNum !== null) {
        const lineHeight = type === 'headline' ? 1.1 : 1.3;
        return { fontSize: `${scaleNum}cqw`, lineHeight };
    }

    // Fallback to legacy string sizes
    if (type === 'headline') {
        switch (sizeStr) {
            case 'sm': return { fontSize: '4cqw', lineHeight: '1.2' };
            case 'md': return { fontSize: '5cqw', lineHeight: '1.2' };
            case 'lg': return { fontSize: '6cqw', lineHeight: '1.1' };
            case 'xl': return { fontSize: '8cqw', lineHeight: '1.1' };   // Default normal
            case '2xl': return { fontSize: '10cqw', lineHeight: '1.1' };
            case '3xl': return { fontSize: '12cqw', lineHeight: '1.05' };
            case '4xl': return { fontSize: '15cqw', lineHeight: '1' }; // Huge
            case '5xl': return { fontSize: '18cqw', lineHeight: '1' };
            case '6xl': return { fontSize: '22cqw', lineHeight: '0.9' }; // Massive
            case '7xl': return { fontSize: '26cqw', lineHeight: '0.9' };
            case '8xl': return { fontSize: '30cqw', lineHeight: '0.9' };
            case '9xl': return { fontSize: '35cqw', lineHeight: '0.9' };
            default: return { fontSize: '10cqw', lineHeight: '1.1' };
        }
    } else {
        // Body text
        switch (sizeStr) {
            case 'xs': return { fontSize: '2.5cqw', lineHeight: '1.4' };
            case 'sm': return { fontSize: '3cqw', lineHeight: '1.4' };
            case 'md': return { fontSize: '3.8cqw', lineHeight: '1.3' };
            case 'lg': return { fontSize: '4.8cqw', lineHeight: '1.3' }; // Default normal
            case 'xl': return { fontSize: '6cqw', lineHeight: '1.2' };
            case '2xl': return { fontSize: '8cqw', lineHeight: '1.2' };
            case '3xl': return { fontSize: '10cqw', lineHeight: '1.2' };
            default: return { fontSize: '4.8cqw', lineHeight: '1.3' };
        }
    }
};

const getCollageGridClass = (layout?: string) => {
    switch (layout) {
        case 'landscape-1-2': return 'grid grid-cols-2 grid-rows-2 gap-2';
        case 'landscape-3-horiz': return 'grid grid-cols-3 gap-2';
        case 'landscape-4-grid': return 'grid grid-cols-2 grid-rows-2 gap-2';
        case 'landscape-2-horiz': return 'grid grid-cols-2 gap-2';
        case 'landscape-2-vert': return 'grid grid-rows-2 gap-2';
        case 'landscape-1-top-2-bottom': return 'grid grid-cols-2 grid-rows-2 gap-2';
        case 'landscape-1-top-3-bottom': return 'grid grid-cols-3 grid-rows-2 gap-2';
        case 'landscape-6-grid': return 'grid grid-cols-3 grid-rows-2 gap-2';
        case 'landscape-3-vert': return 'grid grid-rows-3 gap-2';
        case 'portrait-1-2': return 'grid grid-cols-2 grid-rows-2 gap-2';
        case 'portrait-3-vert': return 'grid grid-rows-3 gap-2';
        case 'portrait-4-grid': return 'grid grid-cols-2 grid-rows-2 gap-2';
        case 'portrait-2-horiz': return 'grid grid-cols-2 gap-2';
        case 'portrait-2-vert': return 'grid grid-rows-2 gap-2';
        case 'portrait-1-top-2-bottom': return 'grid grid-cols-2 grid-rows-3 gap-2';
        case 'portrait-1-top-3-bottom': return 'grid grid-cols-3 grid-rows-3 gap-2';
        case 'portrait-6-grid': return 'grid grid-cols-2 grid-rows-3 gap-2';
        case 'portrait-3-horiz': return 'grid grid-cols-3 gap-2';
        default: return 'grid grid-cols-2 grid-rows-2 gap-2';
    }
};

const getItemSpanClass = (layout: string | undefined, index: number) => {
    if (layout === 'landscape-1-2' && index === 0) return 'row-span-2';
    if (layout === 'landscape-1-top-2-bottom' && index === 0) return 'col-span-2';
    if (layout === 'landscape-1-top-3-bottom' && index === 0) return 'col-span-3';
    if (layout === 'portrait-1-2' && index === 0) return 'col-span-2';
    if (layout === 'portrait-1-top-2-bottom' && index === 0) return 'col-span-2 row-span-2';
    if (layout === 'portrait-1-top-3-bottom' && index === 0) return 'col-span-3 row-span-2';
    return '';
};

// --- NEW HELPER: Get Shadow Style ---
const getShadowStyle = (type: string | undefined, color: string | undefined, organization?: Organization, mode?: string) => {
    if (!type || type === 'none') return undefined;
    const resolvedColor = resolveColor(color, 'rgba(0,0,0,0.5)', organization);
    
    // Scale shadow relative to container width using cqw for consistency too
    switch (type) {
        case 'soft': return `0 0.5cqw 1.5cqw ${resolvedColor}`;
        case 'hard': return `0.4cqw 0.4cqw 0px ${resolvedColor}`;
        case 'glow': return `0 0 1cqw ${resolvedColor}, 0 0 2cqw ${resolvedColor}`;
        default: return undefined;
    }
};

// --- COMPONENTS ---

const QrCodeComponent: React.FC<{ url: string; className?: string }> = ({ url, className }) => {
    const [dataUrl, setDataUrl] = useState('');
    useEffect(() => {
        if (url) {
            QRCode.toDataURL(url, { width: 512, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
                  .then(setDataUrl).catch(() => {});
        }
    }, [url]);
    if (!dataUrl) return null;
    return <img src={dataUrl} alt="QR" className={className} style={{ width: '100%', height: '100%', display: 'block' }} />;
};

const DraggableQrCode: React.FC<any> = ({ url, x, y, width, isDraggable, onUpdatePosition, onUpdateWidth }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDraggable || !onUpdatePosition || !containerRef.current) return;
        e.preventDefault(); e.stopPropagation();
        setIsDragging(true);
        const parent = containerRef.current.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        const initialX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const initialY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const initialOverride = { x: x ?? 90, y: y ?? 90 }; 

        const onDragMove = (moveEvent: MouseEvent | TouchEvent) => {
            const moveClientX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
            const moveClientY = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientY : (moveEvent as MouseEvent).clientY;
            const dx = moveClientX - initialX;
            const dy = moveClientY - initialY;
            const dxPercent = (dx / parentRect.width) * 100;
            const dyPercent = (dy / parentRect.height) * 100;
            onUpdatePosition({
                x: Math.max(0, Math.min(100, initialOverride.x + dxPercent)),
                y: Math.max(0, Math.min(100, initialOverride.y + dyPercent))
            });
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

    const handleResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDraggable || !onUpdateWidth || !containerRef.current) return;
        e.preventDefault(); e.stopPropagation();
        const parent = containerRef.current.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        const initialX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        // Fix: Use getBoundingClientRect for correct scaled width
        const initialWidth = containerRef.current.getBoundingClientRect().width;
        
        const onResizeMove = (moveEvent: MouseEvent | TouchEvent) => {
            const moveClientX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
            const dx = moveClientX - initialX;
            const newWidthPx = initialWidth + dx;
            const newWidthPercent = (newWidthPx / parentRect.width) * 100;
            onUpdateWidth(Math.max(5, Math.min(50, newWidthPercent)));
        };
        const onResizeEnd = () => {
            window.removeEventListener('mousemove', onResizeMove as any);
            window.removeEventListener('mouseup', onResizeEnd);
            window.removeEventListener('touchmove', onResizeMove as any);
            window.removeEventListener('touchend', onResizeEnd);
        };
        if ('touches' in e) {
            window.addEventListener('touchmove', onResizeMove as any);
            window.addEventListener('touchend', onResizeEnd, { once: true });
        } else {
            window.addEventListener('mousemove', onResizeMove as any);
            window.addEventListener('mouseup', onResizeEnd, { once: true });
        }
    };

    return (
        <div ref={containerRef} onMouseDown={isDraggable ? handleDragStart : undefined} onTouchStart={isDraggable ? handleDragStart : undefined}
             style={{
                position: 'absolute', left: `${x ?? 90}%`, top: `${y ?? 90}%`, width: `${width ?? 15}%`,
                transform: 'translate(-50%, -50%)', zIndex: 50, aspectRatio: '1/1',
                cursor: isDraggable ? 'move' : 'default',
                opacity: isDragging ? 0.7 : 1
             }}>
            <div className="bg-white p-1.5 rounded-lg shadow-lg w-full h-full flex items-center justify-center relative group">
                <QrCodeComponent url={url} className="w-full h-full" />
                {isDraggable && (
                     <div onMouseDown={handleResizeStart} onTouchStart={handleResizeStart}
                        className="absolute -bottom-2 -right-2 w-6 h-6 bg-white border-2 border-teal-500 rounded-full cursor-se-resize flex items-center justify-center shadow-md z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-2 h-2 bg-teal-500 rounded-full" />
                     </div>
                )}
            </div>
        </div>
    );
};

const SubImageCarousel: React.FC<{
    images: SubImage[];
    config?: SubImageConfig;
}> = ({ images, config }) => {
    if (!images || images.length === 0) return null;

    const size = config?.size || 'md';
    // 'position' maps to CSS layout. 'top-center' = top: 10%, 'bottom-center' = bottom: 10%.
    const position = config?.position || 'bottom-center';
    const interval = config?.intervalSeconds || 30; // Speed of animation cycle in seconds

    // Size Mapping
    const heightClass = size === 'sm' ? 'h-[15%]' : size === 'md' ? 'h-[25%]' : size === 'lg' ? 'h-[35%]' : 'h-[45%]';
    const gapClass = 'gap-4';

    // Position Mapping
    const positionStyle: React.CSSProperties = {
        position: 'absolute',
        zIndex: 30,
        width: '100%',
        left: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
    };

    if (position.includes('top')) {
        positionStyle.top = '5%';
    } else if (position.includes('middle')) {
        positionStyle.top = '50%';
        positionStyle.transform = 'translateY(-50%)';
    } else {
        positionStyle.bottom = '5%';
    }

    return (
        <div style={positionStyle} className={heightClass}>
            <div 
                className="flex items-center w-full h-full" 
                style={{ 
                    maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
                    WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' 
                }}
            >
                <div 
                    className={`flex ${gapClass} h-full animate-marquee`} 
                    style={{ 
                        animationDuration: `${Math.max(10, interval)}s`,
                        width: 'max-content'
                    }}
                >
                    {/* Render double sets of images for seamless looping */}
                    {[...images, ...images].map((img, i) => (
                        <div key={`${img.id}-${i}`} className="h-full aspect-[4/3] relative flex-shrink-0 bg-black/20 rounded-lg overflow-hidden shadow-xl border-2 border-white/50">
                            <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                        </div>
                    ))}
                </div>
            </div>
            <style>{`
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-marquee {
                    animation: marquee linear infinite;
                }
            `}</style>
        </div>
    );
};

const PostMarkdownRenderer: React.FC<{ content: string; className?: string; style?: React.CSSProperties }> = ({ content, className, style }) => {
    const renderMarkdown = useMemo(() => {
        if (!content) return { __html: '' };
        const lines = content.split('\n');
        const htmlLines: string[] = [];
        let inList: 'ul' | 'ol' | false = false;
        const closeListIfNeeded = () => { if (inList) { htmlLines.push(`</${inList}>`); inList = false; } };

        for (const line of lines) {
            let safeLine = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                               .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                               .replace(/_(.*?)_/g, '<em>$1</em>');
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
    return <div className={className} style={style} dangerouslySetInnerHTML={renderMarkdown} />;
};

const DraggableTextElement: React.FC<any> = ({ 
    type, text, x, y, width, textAlign, fontSize, fontScale, fontFamily, color, 
    bgEnabled, bgColor, mode, organization, isDraggable, 
    shadowType, shadowColor, outlineWidth, outlineColor,
    onUpdatePosition, onUpdateWidth, onUpdateFontScale, onUpdateText
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [tempText, setTempText] = useState(text);

    // Update temp text when prop changes
    useEffect(() => {
        setTempText(text);
    }, [text]);

    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDraggable || !onUpdatePosition || !containerRef.current || isEditing) return;
        e.preventDefault(); e.stopPropagation();
        setIsDragging(true);
        const parent = containerRef.current.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        const initialX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const initialY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const initialOverride = { x: x ?? 50, y: y ?? 50 };

        const onDragMove = (moveEvent: MouseEvent | TouchEvent) => {
            const moveClientX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
            const moveClientY = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientY : (moveEvent as MouseEvent).clientY;
            const dx = moveClientX - initialX;
            const dy = moveClientY - initialY;
            const dxPercent = (dx / parentRect.width) * 100;
            const dyPercent = (dy / parentRect.height) * 100;
            onUpdatePosition({
                x: Math.max(0, Math.min(100, initialOverride.x + dxPercent)),
                y: Math.max(0, Math.min(100, initialOverride.y + dyPercent))
            });
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

    const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, direction: 'left' | 'right') => {
        if (!isDraggable || !onUpdateWidth || !containerRef.current || isEditing) return;
        e.preventDefault(); e.stopPropagation();
        const parent = containerRef.current.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        const initialX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        
        // FIX: Use getBoundingClientRect for correct scaled width
        const initialWidth = containerRef.current.getBoundingClientRect().width;
        
        const onResizeMove = (moveEvent: MouseEvent | TouchEvent) => {
            const moveClientX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
            const dx = moveClientX - initialX;
            const newWidthPx = direction === 'right' ? initialWidth + dx : initialWidth - dx;
            const newWidthPercent = (newWidthPx / parentRect.width) * 100;
            onUpdateWidth(Math.max(10, Math.min(100, newWidthPercent)));
        };
        const onResizeEnd = () => {
            window.removeEventListener('mousemove', onResizeMove as any);
            window.removeEventListener('mouseup', onResizeEnd);
            window.removeEventListener('touchmove', onResizeMove as any);
            window.removeEventListener('touchend', onResizeEnd);
        };
        if ('touches' in e) {
            window.addEventListener('touchmove', onResizeMove as any);
            window.addEventListener('touchend', onResizeEnd, { once: true });
        } else {
            window.addEventListener('mousemove', onResizeMove as any);
            window.addEventListener('mouseup', onResizeEnd, { once: true });
        }
    };

    const handleScaleStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDraggable || !onUpdateFontScale || !containerRef.current || isEditing) return;
        e.preventDefault(); e.stopPropagation();
        
        const parent = containerRef.current.parentElement;
        if (!parent) return;
        
        // Calculate center of the element to scale relative to it
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const initialClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const initialClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
        const initialDistance = Math.hypot(initialClientX - centerX, initialClientY - centerY);
        // Default to a sane value if fontScale is missing, e.g. 5.0
        const initialScale = fontScale || (type === 'headline' ? 8.0 : 4.8);

        const onScaleMove = (moveEvent: MouseEvent | TouchEvent) => {
            const moveClientX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
            const moveClientY = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientY : (moveEvent as MouseEvent).clientY;
            
            const currentDistance = Math.hypot(moveClientX - centerX, moveClientY - centerY);
            
            // Calculate new font scale based on drag distance ratio
            let newScale = initialScale * (currentDistance / initialDistance);
            newScale = Math.max(1, Math.min(40, newScale)); // Limits: 1.0 to 40.0 cqw

            onUpdateFontScale(parseFloat(newScale.toFixed(1)));
        };

        const onScaleEnd = () => {
            window.removeEventListener('mousemove', onScaleMove as any);
            window.removeEventListener('mouseup', onScaleEnd);
            window.removeEventListener('touchmove', onScaleMove as any);
            window.removeEventListener('touchend', onScaleEnd);
        };

        if ('touches' in e) {
            window.addEventListener('touchmove', onScaleMove as any);
            window.addEventListener('touchend', onScaleEnd, { once: true });
        } else {
            window.addEventListener('mousemove', onScaleMove as any);
            window.addEventListener('mouseup', onScaleEnd, { once: true });
        }
    };
    
    // --- Inline Editing Handlers ---
    const handleDoubleClick = (e: React.MouseEvent) => {
        if (!isDraggable || !onUpdateText) return;
        e.stopPropagation();
        setIsEditing(true);
    };

    const handleBlur = () => {
        setIsEditing(false);
        if (onUpdateText && tempText !== text) {
            onUpdateText(tempText);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { // Prevent save on simple enter if we want multi-line
             // Optional: Allow multiline body, single line headline? 
             // For now, let's treat Enter as Save for headline, Shift+Enter for newline in body
             if (type === 'headline') {
                 e.preventDefault();
                 e.currentTarget.blur();
             }
        }
        if (e.key === 'Escape') {
            setIsEditing(false);
            setTempText(text); // Revert
        }
    };

    const style: React.CSSProperties = {
        position: 'absolute',
        top: `${y ?? 50}%`,
        left: `${x ?? 50}%`,
        transform: 'translate(-50%, -50%)',
        width: `${width ?? 80}%`,
        textAlign: textAlign || 'center',
        zIndex: isEditing ? 100 : 40,
        color: resolveColor(color, '#ffffff', organization),
        cursor: isDraggable ? (isEditing ? 'text' : 'move') : 'default',
        opacity: isDragging ? 0.7 : 1
    };
    
    // Compute Effects Styles
    // We use the new fluid logic for font sizing, supporting precise numerical scale
    const fluidStyle = getFluidFontSizeStyle(type, fontSize, fontScale);
    
    const textEffectStyle: React.CSSProperties = {
        ...fluidStyle, // Applies fontSize (cqw) and lineHeight
        textShadow: getShadowStyle(shadowType, shadowColor, organization, mode),
        WebkitTextStroke: outlineWidth && outlineWidth > 0 
            ? `${outlineWidth * 0.15}cqw ${resolveColor(outlineColor, '#000000', organization)}` // Use cqw for stroke too
            : undefined,
    };
    
    // Use the robust helper function for font family
    const fontClass = type === 'headline' 
        ? `font-bold break-words ${getFontFamilyClass(fontFamily || (organization?.headlineFontFamily ?? 'display'))}`
        : `mt-[1.5cqw] break-words ${getFontFamilyClass(fontFamily || (organization?.bodyFontFamily ?? 'sans'))}`;

    const paddingClass = isPreviewMode(mode) ? 'p-1 rounded-md' : 'p-[2cqw] rounded-xl';
    
    // Resolve background color and check alpha
    const resolvedBgColor = bgEnabled ? resolveColor(bgColor, 'rgba(0,0,0,0.5)', organization) : 'transparent';
    const bgAlpha = getAlpha(resolvedBgColor);
    const showBackdrop = bgEnabled && bgAlpha > 0.01;

    return (
        <div 
            ref={containerRef} 
            style={style} 
            onMouseDown={!isEditing && isDraggable ? handleDragStart : undefined} 
            onTouchStart={!isEditing && isDraggable ? handleDragStart : undefined} 
            onDoubleClick={handleDoubleClick}
            className="group"
        >
            {isDraggable && !isEditing && (
                <>
                     {/* Move Handle (Top-Right) */}
                     <div className="absolute -top-3 -right-3 p-1.5 bg-teal-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50">
                        <MoveIcon className="w-4 h-4" />
                     </div>
                     
                     {/* Width Handles (Sides) */}
                     <div onMouseDown={(e) => handleResizeStart(e, 'left')} onTouchStart={(e) => handleResizeStart(e, 'left')}
                          className="absolute -left-2 top-0 bottom-0 w-4 cursor-col-resize flex items-center justify-start opacity-0 group-hover:opacity-100 z-50">
                        <div className="w-1 h-6 bg-teal-500 rounded-full shadow-lg"/>
                     </div>
                     <div onMouseDown={(e) => handleResizeStart(e, 'right')} onTouchStart={(e) => handleResizeStart(e, 'right')}
                          className="absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize flex items-center justify-end opacity-0 group-hover:opacity-100 z-50">
                        <div className="w-1 h-6 bg-teal-500 rounded-full shadow-lg"/>
                     </div>

                     {/* Scale Handles (Corners) - Only if onUpdateFontScale provided */}
                     {onUpdateFontScale && (
                        <>
                            <div onMouseDown={handleScaleStart} onTouchStart={handleScaleStart} className="absolute -top-2 -left-2 w-4 h-4 bg-white border border-blue-500 rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 z-50" />
                            <div onMouseDown={handleScaleStart} onTouchStart={handleScaleStart} className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border border-blue-500 rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 z-50" />
                            <div onMouseDown={handleScaleStart} onTouchStart={handleScaleStart} className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border border-blue-500 rounded-full cursor-nesw-resize opacity-0 group-hover:opacity-100 z-50" />
                            <div onMouseDown={handleScaleStart} onTouchStart={handleScaleStart} className="absolute -top-2 -right-2 w-4 h-4 bg-white border border-blue-500 rounded-full cursor-nesw-resize opacity-0 group-hover:opacity-100 z-50" />
                        </>
                     )}
                </>
            )}
            <div 
                className={`${paddingClass} ${showBackdrop ? 'backdrop-blur-md' : ''}`}
                style={bgEnabled ? { backgroundColor: resolvedBgColor } : {}}
            >
                <div className="grid w-full h-full">
                    {/* Ghost Element: Controls the height. Hidden when editing but present in DOM. */}
                    <div className={`${isEditing ? 'invisible' : ''} col-start-1 row-start-1 min-h-[1.2em]`}>
                        {type === 'headline' ? (
                            <h1 className={fontClass} style={textEffectStyle}>
                                {isEditing ? (tempText || ' ') : (text || ' ')}
                            </h1>
                        ) : (
                            <PostMarkdownRenderer 
                                content={isEditing ? (tempText || ' ') : (text || ' ')} 
                                className={fontClass} 
                                style={textEffectStyle} 
                            />
                        )}
                    </div>
                    
                    {/* Textarea Overlay: Used for editing, positioned on top */}
                    {isEditing && (
                         <textarea
                            value={tempText}
                            onChange={(e) => setTempText(e.target.value)}
                            onBlur={handleBlur}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            className={`${fontClass} w-full h-full bg-transparent outline-none resize-none overflow-hidden text-inherit p-0 m-0 col-start-1 row-start-1`}
                            style={{
                                ...textEffectStyle,
                                textAlign: textAlign || 'center',
                            }}
                         />
                    )}
                </div>
            </div>
        </div>
    );
};

const DraggableTag: React.FC<any> = ({ tag, override, mode, onUpdatePosition }) => {
     const containerRef = useRef<HTMLDivElement>(null);
     const isDraggable = !!onUpdatePosition;
     const [isDragging, setIsDragging] = useState(false);

     const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDraggable || !onUpdatePosition || !containerRef.current) return;
        e.preventDefault(); e.stopPropagation();
        setIsDragging(true);
        const parent = containerRef.current.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        
        const initialX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const initialY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const initialOverride = override || { x: 50, y: 50, rotation: 0, scale: 1, width: null }; 

        const onDragMove = (moveEvent: MouseEvent | TouchEvent) => {
            const moveClientX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
            const moveClientY = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientY : (moveEvent as MouseEvent).clientY;
            const dx = moveClientX - initialX;
            const dy = moveClientY - initialY;
            const dxPercent = (dx / parentRect.width) * 100;
            const dyPercent = (dy / parentRect.height) * 100;
            onUpdatePosition(tag.id, {
                ...initialOverride,
                x: Math.max(0, Math.min(100, initialOverride.x + dxPercent)),
                y: Math.max(0, Math.min(100, initialOverride.y + dyPercent)),
            });
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

    const handleScaleStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDraggable || !onUpdatePosition || !containerRef.current) return;
        e.preventDefault(); e.stopPropagation();
        
        const parent = containerRef.current.parentElement;
        if (!parent) return;
        
        // Calculate center of the element to scale relative to it
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const initialClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const initialClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
        const initialDistance = Math.hypot(initialClientX - centerX, initialClientY - centerY);
        const initialScale = override?.scale || 1;
        const initialOverride = override || { x: 50, y: 50, rotation: 0, scale: 1, width: null };

        const onScaleMove = (moveEvent: MouseEvent | TouchEvent) => {
            const moveClientX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
            const moveClientY = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientY : (moveEvent as MouseEvent).clientY;
            
            const currentDistance = Math.hypot(moveClientX - centerX, moveClientY - centerY);
            
            // Simple ratio scaling
            let newScale = initialScale * (currentDistance / initialDistance);
            newScale = Math.max(0.1, Math.min(5, newScale)); // Limits

            onUpdatePosition(tag.id, {
                ...initialOverride,
                scale: newScale
            });
        };

        const onScaleEnd = () => {
            window.removeEventListener('mousemove', onScaleMove as any);
            window.removeEventListener('mouseup', onScaleEnd);
            window.removeEventListener('touchmove', onScaleMove as any);
            window.removeEventListener('touchend', onScaleEnd);
        };

        if ('touches' in e) {
            window.addEventListener('touchmove', onScaleMove as any);
            window.addEventListener('touchend', onScaleEnd, { once: true });
        } else {
            window.addEventListener('mousemove', onScaleMove as any);
            window.addEventListener('mouseup', onScaleEnd, { once: true });
        }
    };

     const handleWidthResizeStart = (e: React.MouseEvent | React.TouchEvent, direction: 'left' | 'right') => {
        if (!isDraggable || !onUpdatePosition || !containerRef.current) return;
        e.preventDefault(); e.stopPropagation();
        
        const parent = containerRef.current.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        
        const initialClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        
        // FIX: Use getBoundingClientRect for correct scaled width
        const initialPixelWidth = containerRef.current.getBoundingClientRect().width;
        const initialWidthPercent = override?.width || (initialPixelWidth / parentRect.width * 100);
        const initialOverride = override || { x: 50, y: 50, rotation: 0, scale: 1, width: initialWidthPercent };

        const onResizeMove = (moveEvent: MouseEvent | TouchEvent) => {
            const moveClientX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX;
            const dxPixels = moveClientX - initialClientX;
            
            // Convert dx to percentage
            const dxPercent = (dxPixels / parentRect.width) * 100;
            
            // If dragging right side, adding dx increases width. Left side, subtracting dx increases width.
            const newWidth = direction === 'right' 
                ? initialWidthPercent + dxPercent 
                : initialWidthPercent - dxPercent;

            onUpdatePosition(tag.id, {
                ...initialOverride,
                width: Math.max(5, Math.min(100, newWidth)) // Min 5%, Max 100%
            });
        };

        const onResizeEnd = () => {
            window.removeEventListener('mousemove', onResizeMove as any);
            window.removeEventListener('mouseup', onResizeEnd);
            window.removeEventListener('touchmove', onResizeMove as any);
            window.removeEventListener('touchend', onResizeEnd);
        };

        if ('touches' in e) {
            window.addEventListener('touchmove', onResizeMove as any);
            window.addEventListener('touchend', onResizeEnd, { once: true });
        } else {
            window.addEventListener('mousemove', onResizeMove as any);
            window.addEventListener('mouseup', onResizeEnd, { once: true });
        }
    };

    const isStamp = tag.displayType === 'stamp';
    let stampClasses = '';
    let stampStyles: React.CSSProperties = {};
    const shape = (isStamp && tag.shape) ? tag.shape : 'circle';

     if (isStamp) {
        stampClasses += ' justify-center text-center uppercase tracking-[2px] font-bold ';
        stampStyles.boxShadow = 'inset 0 0 6px rgba(0, 0, 0, 0.15), 0 0 2px rgba(0, 0, 0, 0.1)';

        if (shape === 'circle') {
            stampClasses += ' rounded-full aspect-square ';
        } else if (shape === 'square') {
            stampClasses += ' rounded-lg aspect-square ';
        } else { // rectangle
            stampClasses += ' rounded-lg ';
        }
        
        if (tag.border === 'solid') {
            stampClasses += ' border-2 ';
            stampStyles.borderColor = 'currentColor';
        } else if (tag.border === 'dashed') {
            stampClasses += ' border-2 border-dashed ';
            stampStyles.borderColor = 'currentColor';
        }
    } else {
        stampClasses += ' rounded-full '; // Tags are pill-shaped
    }
    
    let paddingClass = '';
    const isShapeVertical = isStamp && (shape === 'circle' || shape === 'square');
    if (tag.url) {
        paddingClass = isPreviewMode(mode) ? 'p-0.5' : 'p-1';
    } else if (isStamp) {
        if (shape === 'circle' || shape === 'square') {
            paddingClass = isPreviewMode(mode) ? 'p-2' : 'p-4';
        } else { // rectangle
            paddingClass = isPreviewMode(mode) ? 'px-2 py-1' : 'px-4 py-2';
        }
    } else { // it's a tag
        paddingClass = isPreviewMode(mode) ? 'px-3 py-1.5' : 'px-6 py-3';
    }

     const style: React.CSSProperties = {
        position: 'absolute',
        left: `${override?.x ?? 50}%`,
        top: `${override?.y ?? 50}%`,
        // We apply transform here for position centering and rotation
        transform: `translate(-50%, -50%) rotate(${override?.rotation || 0}deg) scale(${override?.scale || 1})`,
        zIndex: 40,
        width: override?.width ? `${override.width}%` : 'auto', // Dynamic width
        maxWidth: '90%', // Safety cap
        
        background: isStamp ? hexToRgba(tag.backgroundColor, tag.opacity ?? 1) : tag.backgroundColor,
        color: tag.textColor,
        ...(tag.animation === 'glow' ? { '--glow-color': tag.backgroundColor } : {}),
        ...stampStyles,
        ...(isStamp ? {} : {
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(8px)',
        }),
        
        // Multi-line support
        whiteSpace: 'pre-wrap', 
        wordBreak: 'break-word',
        textAlign: 'center',
        
        cursor: isDraggable ? 'grab' : 'default',
        opacity: isDragging ? 0.7 : 1,
        
        // Ensure scale doesn't blur text too much in some browsers
        backfaceVisibility: 'hidden', 
     };

     return (
         <div ref={containerRef} style={style} onMouseDown={isDraggable ? handleDragStart : undefined} onTouchStart={isDraggable ? handleDragStart : undefined} 
              className={`flex flex-col items-center justify-center group ${paddingClass} ${getTagFontSizeClass(tag.fontSize, mode)} ${getFontFamilyClass(tag.fontFamily)} ${isStamp ? '' : getTagFontWeightClass(tag.fontWeight)} ${getTagAnimationClass(tag.animation, tag.displayType)} ${stampClasses}`}>
             
             {/* Content */}
             <div className={`flex items-center ${isShapeVertical ? 'flex-col gap-1' : 'gap-2'}`}>
                 <span style={{
                     textShadow: isStamp ? 'none' : '0 2px 4px rgba(0,0,0,0.2)'
                 }}>{tag.text}</span>
                 {tag.url && (
                     <div className={`bg-white rounded-sm flex-shrink-0 ${isPreviewMode(mode) ? 'p-0.5 w-[1.2em] h-[1.2em]' : 'p-0.5 w-[1.5em] h-[1.5em]'}`}>
                         <QrCodeComponent url={tag.url} className="w-full h-full" />
                     </div>
                 )}
             </div>

              {/* Handles (Only visible when draggable) */}
             {isDraggable && (
                <>
                    {/* Scale Handles (Corners) */}
                    <div onMouseDown={handleScaleStart} onTouchStart={handleScaleStart} className="absolute -top-2 -left-2 w-4 h-4 bg-white border border-blue-500 rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 z-50" />
                    <div onMouseDown={handleScaleStart} onTouchStart={handleScaleStart} className="absolute -top-2 -right-2 w-4 h-4 bg-white border border-blue-500 rounded-full cursor-nesw-resize opacity-0 group-hover:opacity-100 z-50" />
                    <div onMouseDown={handleScaleStart} onTouchStart={handleScaleStart} className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border border-blue-500 rounded-full cursor-nesw-resize opacity-0 group-hover:opacity-100 z-50" />
                    <div onMouseDown={handleScaleStart} onTouchStart={handleScaleStart} className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border border-blue-500 rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 z-50" />

                    {/* Width Handles (Sides) */}
                    <div onMouseDown={(e) => handleWidthResizeStart(e, 'left')} onTouchStart={(e) => handleWidthResizeStart(e, 'left')} className="absolute top-1/2 -left-2 w-2 h-6 -translate-y-1/2 bg-white border border-blue-500 rounded cursor-ew-resize opacity-0 group-hover:opacity-100 z-50" />
                    <div onMouseDown={(e) => handleWidthResizeStart(e, 'right')} onTouchStart={(e) => handleWidthResizeStart(e, 'right')} className="absolute top-1/2 -right-2 w-2 h-6 -translate-y-1/2 bg-white border border-blue-500 rounded cursor-ew-resize opacity-0 group-hover:opacity-100 z-50" />
                </>
             )}
         </div>
     );
};

// --- BOOKING PORTAL RENDERER ---
const BookingPortalRenderer: React.FC<{
    post: DisplayPost;
    organization?: Organization;
    isPortrait: boolean;
    backgroundColor: string;
}> = ({ post, organization, isPortrait, backgroundColor }) => {
    const isBokadirektUrl = (post.webpageUrl || '').toLowerCase().includes('bokadirekt.se');
    
    // Fallback texts
    const headline = post.headline || (isBokadirektUrl ? 'Boka din behandling enkelt' : 'Välkommen att boka tid');
    const body = post.body || (isBokadirektUrl 
        ? 'Skanna QR-koden till höger med din mobilkamera för att se lediga tider och boka på Bokadirekt.' 
        : 'Skanna QR-koden här intill med din mobilkamera för att öppna vår tidsbokning direkt.');

    // We can create a stunning modern gradient or use custom colored backgrounds
    const bgStyle: React.CSSProperties = {
        background: backgroundColor && backgroundColor !== '#000000' && backgroundColor !== '#ffffff' && backgroundColor !== 'transparent'
            ? backgroundColor 
            : 'linear-gradient(135deg, #0f172a 0%, #115e59 100%)', // Premium Deep Slate to Pine Green/Teal
        color: '#ffffff',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: isPortrait ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        padding: isPortrait ? '5cqw' : '4cqw',
        fontFamily: '"Inter", sans-serif',
    };

    return (
        <div style={bgStyle} className="select-none h-full w-full">
            {/* Ambient glows */}
            <div className="absolute top-0 right-0 w-[50cqw] h-[50cqw] bg-teal-500/10 rounded-full blur-[10cqw] pointer-events-none -mr-[10cqw] -mt-[10cqw]"></div>
            <div className="absolute bottom-0 left-0 w-[40cqw] h-[40cqw] bg-emerald-500/10 rounded-full blur-[8cqw] pointer-events-none -ml-[10cqw] -mb-[10cqw]"></div>

            {/* Left Content Area (or Top on Portrait) */}
            <div className={`flex flex-col justify-center h-full ${isPortrait ? 'w-full text-center space-y-[2.5cqw] mt-[2cqw] max-h-[55%]' : 'w-1/2 text-left space-y-[2cqw] pr-[4cqw]'}`}>
                
                {/* Brand / Partner Tag */}
                <div className={`flex ${isPortrait ? 'justify-center' : 'justify-start'}`}>
                    <span style={{ fontSize: isPortrait ? '1.5cqw' : '1.3cqi' }} className="inline-flex items-center gap-[0.8cqw] px-[1.5cqw] py-[0.5cqw] rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white font-extrabold tracking-[0.1cqw] uppercase">
                        <svg className="w-[1.6cqw] h-[1.6cqw] text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        {isBokadirektUrl ? 'Verifierad bokadirekt' : 'Säker tidsbokning'}
                    </span>
                </div>

                {/* Main Headline with fluid typography for perfect preview responsiveness */}
                <h1 className="font-sans font-extrabold leading-tight tracking-tight text-white mb-0" style={{ fontSize: isPortrait ? '4.2cqw' : '4cqi' }}>
                    {headline}
                </h1>

                {/* Sub-body text with high readability and fluid lines */}
                <p className="font-normal text-white/95 leading-relaxed max-w-prose" style={{ fontSize: isPortrait ? '2.1cqw' : '1.8cqi' }}>
                    {body}
                </p>

                {/* Checklist (Only showed when we have a bit of vertical space) */}
                <div className={`grid grid-cols-1 gap-[1cqw] pt-[1cqw] ${isPortrait ? 'hidden sm:grid text-left max-w-md mx-auto w-full' : ''}`}>
                    <div className="flex items-center gap-[1cqw]">
                        <span className="p-[0.4cqw] bg-teal-500/25 border border-teal-400/30 rounded-full flex items-center justify-center">
                            <svg className="w-[1.6cqw] h-[1.6cqw] text-teal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </span>
                        <span style={{ fontSize: isPortrait ? '1.8cqw' : '1.5cqi' }} className="font-semibold text-white/90">Se lediga tider dygnet runt</span>
                    </div>
                    <div className="flex items-center gap-[1cqw]">
                        <span className="p-[0.4cqw] bg-teal-500/25 border border-teal-400/30 rounded-full flex items-center justify-center">
                            <svg className="w-[1.6cqw] h-[1.6cqw] text-teal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </span>
                        <span style={{ fontSize: isPortrait ? '1.8cqw' : '1.5cqi' }} className="font-semibold text-white/90">Boka snabbt directly on your phone</span>
                    </div>
                    {isBokadirektUrl && (
                        <div className="flex items-center gap-[1cqw]">
                            <span className="p-[0.4cqw] bg-teal-500/25 border border-teal-400/30 rounded-full flex items-center justify-center">
                                <svg className="w-[1.6cqw] h-[1.6cqw] text-teal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </span>
                            <span style={{ fontSize: isPortrait ? '1.8cqw' : '1.5cqi' }} className="font-semibold text-white/90">Betala enkelt via Bokadirekt</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Right QR Area with premium floating glass card representing physical signage reception screen */}
            <div className={`flex flex-col items-center justify-center h-full ${isPortrait ? 'w-full max-h-[45%] mt-auto pb-[2cqw]' : 'w-1/2 ml-[2cqw]'}`}>
                <div className="relative p-[1.8cqw] sm:p-[2.2cqw] rounded-[3cqw] bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl flex flex-col items-center justify-center max-w-[360px] aspect-square w-full select-none group transform hover:scale-[1.02] transition-transform duration-300">
                    {/* Tiny blinking scanning corner lasers */}
                    <div className="absolute top-[2cqw] left-[2cqw] w-[1.5cqw] h-[1.5cqw] border-t-2 border-l-2 border-teal-400"></div>
                    <div className="absolute top-[2cqw] right-[2cqw] w-[1.5cqw] h-[1.5cqw] border-t-2 border-r-2 border-teal-400"></div>
                    <div className="absolute bottom-[2cqw] left-[2cqw] w-[1.5cqw] h-[1.5cqw] border-b-2 border-l-2 border-teal-400"></div>
                    <div className="absolute bottom-[2cqw] right-[2cqw] w-[1.5cqw] h-[1.5cqw] border-b-2 border-r-2 border-teal-400"></div>

                    {/* QR Code Graphic Container */}
                    <div className="bg-white p-[1.5cqw] rounded-[2cqw] w-full aspect-square flex items-center justify-center overflow-hidden">
                        <QrCodeComponent url={ensureAbsoluteUrl(post.webpageUrl)} className="w-[85%] h-[85%]" />
                    </div>

                    {/* Custom brand simulation for Bokadirekt Sverige */}
                    {isBokadirektUrl ? (
                        <div className="mt-[1.2cqw] flex items-center gap-[0.4cqw] text-[1.4cqw] sm:text-[1.8cqw] font-extrabold tracking-tight">
                            <span className="text-white/80">boka</span>
                            <span className="text-orange-500 font-extrabold font-sans">direkt</span>
                            <span className="w-[0.5cqw] h-[0.5cqw] bg-orange-500 rounded-full ml-[0.1cqw]"></span>
                        </div>
                    ) : (
                        <div className="mt-[1.2cqw] flex items-center gap-[0.4cqw] text-[1.2cqw] sm:text-[1.5cqw] font-bold tracking-tight text-teal-300 uppercase">
                            <span>Öppna tidsbokning</span>
                        </div>
                    )}
                    
                    {/* Action Guideline with camera icon */}
                    <div className="mt-[0.6cqw] flex items-center gap-[0.5cqw] text-white/50 text-[1.1cqw]">
                        <svg className="w-[1.2cqw] h-[1.2cqw]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>Skanna med mobilkameran</span>
                    </div>
                </div>
            </div>
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
    
    // Interactive props
    // Updated type signature for Tag Position to include scale and width
    onUpdateTagPosition?: (tagId: string, newPosition: { x: number, y: number, rotation: number, scale?: number, width?: number }) => void;
    onUpdateHeadlinePosition?: any; onUpdateHeadlineWidth?: any;
    onUpdateBodyPosition?: any; onUpdateBodyWidth?: any;
    onUpdateQrPosition?: any; onUpdateQrWidth?: any; 
    
    // NEW: Font Scale Updates
    onUpdateHeadlineFontScale?: (scale: number) => void;
    onUpdateBodyFontScale?: (scale: number) => void;
    
    // NEW: Text Updates
    onUpdateHeadlineText?: (text: string) => void;
    onUpdateBodyText?: (text: string) => void;

    // NEW: Additional Text Handler
    onUpdateAdditionalElement?: (id: string, updates: Partial<AdditionalTextElement>) => void;

    isTextDraggable?: any; isForDownload?: any;

    // Legacy support
    onUpdateTextPosition?: any; onUpdateTextWidth?: any;
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
    onLoadError,
    // Interactive props
    onUpdateTagPosition, 
    onUpdateHeadlinePosition, onUpdateHeadlineWidth,
    onUpdateBodyPosition, onUpdateBodyWidth,
    onUpdateQrPosition, onUpdateQrWidth, 
    // NEW Props
    onUpdateHeadlineFontScale,
    onUpdateBodyFontScale,
    onUpdateHeadlineText,
    onUpdateBodyText,
    onUpdateAdditionalElement, // Handler for extra text
    isTextDraggable,
    // Legacy support
    onUpdateTextPosition, onUpdateTextWidth
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const allTags = useMemo(() => organization?.tags || allTagsFromProp || [], [organization, allTagsFromProp]);
    const primaryColor = useMemo(() => organization?.primaryColor || primaryColorFromProp, [organization, primaryColorFromProp]);
    
    const hasSignaled = useRef(false);
    const signalReady = useCallback(() => {
        if (!hasSignaled.current && onLoadReady) {
            hasSignaled.current = true;
            onLoadReady();
        }
    }, [onLoadReady]);

    useEffect(() => {
        const isCollage = post.layout === 'collage';
        const hasMainMedia = !!(post.videoUrl || post.imageUrl);
        const hasCollageMedia = isCollage && (post.collageItems?.length || 0) > 0;

        if (!hasMainMedia && !hasCollageMedia) {
            signalReady();
        }

        const t = setTimeout(() => { if (!hasSignaled.current) signalReady(); }, 3000); // 3s fallback för säkerhets skull
        return () => clearTimeout(t);
    }, [post, signalReady]);

    useEffect(() => {
        const video = videoRef.current;
        if (video) {
            video.currentTime = 0;
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => { if (onLoadError) onLoadError(); });
            }
        }
        return () => {
            if (video) {
                video.pause();
                video.removeAttribute('src');
                video.load();
            }
        };
    }, [post.videoUrl, cycleCount]); 

    const backgroundColor = resolveColor(post.backgroundColor, '#000000', organization, primaryColor);
    const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
    const splitRatio = post.splitRatio ?? 50;
    const bgImages = [post.imageUrl, ...(post.subImages || []).map(si => si.imageUrl)].filter(Boolean) as string[];
    const firstTag = (post.tagIds && post.tagIds.length > 0)
        ? (organization?.tags || allTagsFromProp)?.find(t => t.id === post.tagIds[0])
        : null;

    const mediaStyle: React.CSSProperties = {
        position: 'absolute', 
        objectFit: 'cover', 
        zIndex: 1,
        // Apply object position from post settings, robustly handling undefined/null/0 values
        objectPosition: `${(post.mediaPositionX !== undefined && post.mediaPositionX !== null) ? post.mediaPositionX : 50}% ${(post.mediaPositionY !== undefined && post.mediaPositionY !== null) ? post.mediaPositionY : 50}%`,
        ...((post.layout === 'image-fullscreen' || post.layout === 'video-fullscreen' || post.layout === 'real-estate') ? { inset: 0, width: '100%', height: '100%' } :
           (post.layout === 'image-left') ? { top: 0, left: 0, width: isPortrait ? '100%' : `${splitRatio}%`, height: isPortrait ? `${splitRatio}%` : '100%' } :
           (post.layout === 'image-right') ? { bottom: 0, right: 0, width: isPortrait ? '100%' : `${100-splitRatio}%`, height: isPortrait ? `${100-splitRatio}%` : '100%' } : {})
    };

    // Apply Zoom if set
    if (post.mediaZoom && post.mediaZoom > 1) {
        mediaStyle.transform = `scale(${post.mediaZoom})`;
        // When zoomed in, changing transformOrigin allows "panning".
        // Using the same position values for transformOrigin makes the zooming center follow the user's focus point.
        mediaStyle.transformOrigin = `${(post.mediaPositionX !== undefined && post.mediaPositionX !== null) ? post.mediaPositionX : 50}% ${(post.mediaPositionY !== undefined && post.mediaPositionY !== null) ? post.mediaPositionY : 50}%`;
    }

    if (isBridgeOnly && post.layout === 'webpage') {
        return <div className="w-full h-full" style={{ backgroundColor }} />;
    }
    
    if (post.layout === 'webpage' && post.webpageUrl) {
        const isBokadirektUrl = (post.webpageUrl || '').toLowerCase().includes('bokadirekt.se');
        const useSmartPortal = post.webpageUseSmartPortal !== undefined 
            ? post.webpageUseSmartPortal 
            : (isBokadirektUrl ? true : false);

        if (useSmartPortal) {
            return (
                <BookingPortalRenderer 
                    post={post} 
                    organization={organization}
                    isPortrait={isPortrait}
                    backgroundColor={backgroundColor}
                />
            );
        }
        return <iframe src={ensureAbsoluteUrl(post.webpageUrl)} className="w-full h-full border-0" />;
    }

    const isMediaLayout = ['image-fullscreen', 'video-fullscreen', 'image-left', 'image-right', 'collage', 'real-estate', 'ai-ad'].includes(post.layout);
    
    // QR Calc
    const qrX = post.qrPositionX ?? (post.qrCodePosition ? mapLegacyPosition(post.qrCodePosition).x : 90);
    const qrY = post.qrPositionY ?? (post.qrCodePosition ? mapLegacyPosition(post.qrCodePosition).y : 90);
    const qrW = post.qrWidth ?? (post.qrCodeSize ? mapLegacySize(post.qrCodeSize) : 15);

    // Headline & Body Defaults
    const hX = post.headlinePositionX ?? post.textPositionX ?? 50;
    const hY = post.headlinePositionY ?? post.textPositionY ?? 40;
    const hW = post.headlineWidth ?? post.textWidth ?? 80;
    const hAlign = post.headlineTextAlign ?? post.textAlign ?? 'center';
    
    // Body fallbacks
    const bX = post.bodyPositionX ?? post.textPositionX ?? 50;
    const bY = post.bodyPositionY ?? (post.textPositionY ? post.textPositionY + 15 : 60);
    const bW = post.bodyWidth ?? post.textWidth ?? 80;
    const bAlign = post.bodyTextAlign ?? post.textAlign ?? 'center';

    return (
        // IMPORTANT: containerType: 'size' is critical for fluid typography (cqw units) to work correctly.
        <div className="w-full h-full relative overflow-hidden" style={{ backgroundColor, containerType: 'size' }}>
            {isMediaLayout && post.layout !== 'collage' && post.layout !== 'real-estate' && (
                <>
                    {(post.imageUrl || isBridgeOnly) && (
                        <img 
                            src={post.imageUrl || undefined} 
                            alt="" 
                            className="absolute z-1 w-full h-full" 
                            style={mediaStyle}
                            onLoad={signalReady}
                            onError={() => !post.videoUrl && onLoadError && onLoadError()} 
                        />
                    )}

                    {!isBridgeOnly && !post.imageUrl && post.videoUrl && (
                        <video 
                            ref={videoRef}
                            src={post.videoUrl}
                            className="absolute z-1 w-full h-full"
                            style={mediaStyle}
                            muted 
                            playsInline 
                            onEnded={onVideoEnded}
                            onLoadedData={signalReady}
                            onError={() => onLoadError && onLoadError()}
                        />
                    )}
                </>
            )}

            {post.layout === 'real-estate' && (
                <div className="absolute inset-0 z-1 w-full h-full overflow-hidden">
                    {bgImages.length <= 1 ? (
                        <img 
                            src={bgImages[0] || undefined} 
                            alt="" 
                            className="w-full h-full object-cover" 
                            style={mediaStyle}
                            onLoad={signalReady}
                        />
                    ) : bgImages.length === 2 ? (
                        <div className="w-full h-full grid grid-cols-2 gap-[0.5cqw] bg-slate-950">
                            {bgImages.map((img, index) => (
                                <img key={index} src={img} alt="" className="w-full h-full object-cover animate-fade-in" onLoad={index === 0 ? signalReady : undefined} />
                            ))}
                        </div>
                    ) : bgImages.length === 3 ? (
                        <div className="w-full h-full grid grid-cols-2 gap-[0.5cqw] bg-slate-950">
                            <img src={bgImages[0]} alt="" className="w-full h-full object-cover animate-fade-in" onLoad={signalReady} />
                            <div className="grid grid-rows-2 gap-[0.5cqw] overflow-hidden">
                                <img src={bgImages[1]} alt="" className="w-full h-full object-cover animate-fade-in" />
                                <img src={bgImages[2]} alt="" className="w-full h-full object-cover animate-fade-in" />
                            </div>
                        </div>
                    ) : (
                        <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-[0.5cqw] bg-slate-950">
                            {bgImages.slice(0, 4).map((img, index) => (
                                <img key={index} src={img} alt="" className="w-full h-full object-cover animate-fade-in" onLoad={index === 0 ? signalReady : undefined} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {post.layout === 'collage' && (
                <div className={`absolute inset-0 z-1 ${getCollageGridClass(post.collageLayout)}`}>
                    {(post.collageItems || []).map((item, idx) => (
                        <div key={item.id || idx} className={`relative overflow-hidden ${getItemSpanClass(post.collageLayout, idx)}`} style={{ backgroundColor: item.type === 'text' ? resolveColor(item.backgroundColor, '#ffffff', organization) : undefined }}>
                            {item.type === 'text' ? (
                                <div className="absolute inset-0 flex p-4" style={{
                                    alignItems: item.verticalAlign === 'top' ? 'flex-start' : item.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                                    justifyContent: item.textAlign === 'left' ? 'flex-start' : item.textAlign === 'right' ? 'flex-end' : 'center',
                                    textAlign: item.textAlign || 'center',
                                    color: resolveColor(item.textColor, '#000000', organization),
                                }}>
                                    <div className={`whitespace-pre-wrap ${getFontFamilyClass(item.fontFamily)}`} style={getFluidFontSizeStyle('headline', item.fontSize, undefined)}>
                                        {item.text}
                                    </div>
                                </div>
                            ) : item.imageUrl ? (
                                <img 
                                    src={item.imageUrl} 
                                    className="w-full h-full object-cover" 
                                    style={{
                                        objectPosition: `${item.mediaPositionX ?? 50}% ${item.mediaPositionY ?? 50}%`,
                                        transform: item.mediaZoom && item.mediaZoom > 1 ? `scale(${item.mediaZoom})` : undefined,
                                        transformOrigin: item.mediaZoom && item.mediaZoom > 1 ? `${item.mediaPositionX ?? 50}% ${item.mediaPositionY ?? 50}%` : undefined
                                    }}
                                    alt="" 
                                    onLoad={idx === 0 ? signalReady : undefined}
                                />
                            ) : item.videoUrl ? (
                                <video 
                                    src={item.videoUrl} 
                                    className="w-full h-full object-cover" 
                                    style={{
                                        objectPosition: `${item.mediaPositionX ?? 50}% ${item.mediaPositionY ?? 50}%`,
                                        transform: item.mediaZoom && item.mediaZoom > 1 ? `scale(${item.mediaZoom})` : undefined,
                                        transformOrigin: item.mediaZoom && item.mediaZoom > 1 ? `${item.mediaPositionX ?? 50}% ${item.mediaPositionY ?? 50}%` : undefined
                                    }}
                                    muted 
                                    playsInline 
                                    autoPlay 
                                    loop 
                                    onLoadedData={idx === 0 ? signalReady : undefined}
                                />
                            ) : (
                                <div className="w-full h-full bg-slate-800" />
                            )}
                        </div>
                    ))}
                </div>
            )}

            {post.imageOverlayEnabled && <div className="absolute inset-0 z-10" style={{ backgroundColor: resolveColor(post.imageOverlayColor, 'rgba(0,0,0,0.45)', organization) }} />}
            
            {/* Real Estate / Centered Skyltfönster Overlay Card */}
            {post.layout === 'real-estate' && (
                <div 
                    className="absolute z-10 flex flex-col justify-between border border-white/20 bg-slate-950/85 backdrop-blur-xl rounded-[4cqw] text-white p-[5cqw] text-center"
                    style={{
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: isPortrait ? '70%' : '46%',
                        minHeight: isPortrait ? '48%' : '56%',
                        maxHeight: isPortrait ? '82%' : '88%',
                        boxShadow: '0 4cqw 18cqw rgba(0, 0, 0, 0.9)',
                    }}
                >
                    {/* Elegant corners for a premium feel (the layout dividers high-tech details) */}
                    <div className="absolute top-[2cqw] left-[2cqw] w-[2.5cqw] h-[2.5cqw] border-t-2 border-l-2 border-teal-400 opacity-90 rounded-tl-[1cqw]"></div>
                    <div className="absolute top-[2cqw] right-[2cqw] w-[2.5cqw] h-[2.5cqw] border-t-2 border-r-2 border-teal-400 opacity-90 rounded-tr-[1cqw]"></div>
                    <div className="absolute bottom-[2cqw] left-[2cqw] w-[2.5cqw] h-[2.5cqw] border-b-2 border-l-2 border-teal-400 opacity-90 rounded-bl-[1cqw]"></div>
                    <div className="absolute bottom-[2cqw] right-[2cqw] w-[2.5cqw] h-[2.5cqw] border-b-2 border-r-2 border-teal-400 opacity-90 rounded-br-[1cqw]"></div>

                    {/* Header line & Category */}
                    <div className="flex flex-col items-center justify-center pt-[1cqw]">
                        <span className="text-[2.8cqw] font-sans font-bold tracking-[0.25em] text-teal-400 uppercase drop-shadow-sm">
                            {firstTag ? firstTag.name : (organization?.name || 'ANNONS')}
                        </span>
                        {/* Title */}
                        <h2 className="text-[5.5cqw] font-extrabold font-sans uppercase tracking-[0.06em] leading-tight text-white mt-2 drop-shadow-md">
                            {post.headline}
                        </h2>
                    </div>

                    {/* Divider line 1 */}
                    <div className="w-[20cqw] h-[2px] bg-gradient-to-r from-transparent via-white/40 to-transparent my-2 mx-auto" />

                    {/* Body description */}
                    <div className="flex-1 flex items-center justify-center py-[2cqw] overflow-hidden">
                        <p className="text-[3.6cqw] leading-relaxed text-slate-50 max-w-xl mx-auto whitespace-pre-wrap font-sans font-medium drop-shadow-sm select-text line-clamp-6">
                            {post.body}
                        </p>
                    </div>

                    {/* Divider line 2 / Specs if present */}
                    {(post.realEstateRooms || post.realEstateArea || post.realEstatePrice) ? (
                        <div className="w-full flex-shrink-0 flex justify-center items-center gap-[2.5cqw] py-[1.8cqw] my-2 border-t border-b border-white/15 text-[2.4cqw] font-mono tracking-wider text-teal-300 font-bold uppercase">
                            {post.realEstateRooms && <span>{post.realEstateRooms}</span>}
                            {post.realEstateRooms && (post.realEstateArea || post.realEstatePrice) && <span className="text-white/30">|</span>}
                            {post.realEstateArea && <span>{post.realEstateArea}</span>}
                            {post.realEstateArea && post.realEstatePrice && <span className="text-white/30">|</span>}
                            {post.realEstatePrice && <span>{post.realEstatePrice}</span>}
                        </div>
                    ) : (
                        <div className="w-[22cqw] h-[1.5px] bg-gradient-to-r from-transparent via-white/20 to-transparent my-2 mx-auto" />
                    )}

                    {/* Footer part with QR or Brand Title */}
                    <div className="flex flex-col items-center gap-1.5 mt-1 pb-[1cqw]">
                        {post.qrCodeUrl ? (
                            <div className="flex flex-col items-center gap-1.5">
                                <div className="p-2 bg-white rounded-[2cqw] shadow-2xl inline-block w-[18cqw] h-[18cqw] md:w-[12cqw] md:h-[12cqw] min-w-[65px] min-h-[65px] max-w-[130px] max-h-[130px] transition-transform duration-300 hover:scale-105">
                                    <QrCodeComponent url={post.qrCodeUrl} className="w-full h-full" />
                                </div>
                                <span className="text-[1.8cqw] text-teal-400 font-mono tracking-wider max-w-[28cqw] truncate font-semibold mt-1">
                                    {post.qrCodeUrl.replace('https://', '').replace('http://', '').replace('www.', '')}
                                </span>
                            </div>
                        ) : (
                            <span className="text-[2.6cqw] font-serif tracking-[0.18em] text-teal-300 uppercase font-black">
                                {organization?.name || 'SkandiaMäklarna'}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Rubrik-låda */}
            {post.headline && post.layout !== 'ai-ad' && post.layout !== 'real-estate' && (
                <DraggableTextElement
                    type="headline"
                    text={post.headline}
                    x={hX} y={hY} width={hW}
                    textAlign={hAlign}
                    fontSize={post.headlineFontSize}
                    fontScale={post.headlineFontScale} // Pass the numeric scale
                    fontFamily={post.headlineFontFamily}
                    color={post.headlineTextColor || post.textColor}
                    bgEnabled={post.headlineBackgroundEnabled ?? post.textBackgroundEnabled}
                    bgColor={post.headlineBackgroundColor || post.textBackgroundColor}
                    // NEW: Effects props
                    shadowType={post.headlineShadowType}
                    shadowColor={post.headlineShadowColor}
                    outlineWidth={post.headlineOutlineWidth}
                    outlineColor={post.headlineOutlineColor}
                    // ---
                    mode={mode}
                    organization={organization}
                    isDraggable={isTextDraggable}
                    onUpdatePosition={onUpdateHeadlinePosition || onUpdateTextPosition}
                    onUpdateWidth={onUpdateHeadlineWidth || onUpdateTextWidth}
                    onUpdateFontScale={onUpdateHeadlineFontScale} // Handler for scaling
                    onUpdateText={onUpdateHeadlineText} // Handler for inline editing
                />
            )}

            {/* Brödtext-låda */}
            {post.body && post.layout !== 'ai-ad' && post.layout !== 'real-estate' && (
                <DraggableTextElement
                    type="body"
                    text={post.body}
                    x={bX} y={bY} width={bW}
                    textAlign={bAlign}
                    fontSize={post.bodyFontSize}
                    fontScale={post.bodyFontScale} // Pass the numeric scale
                    fontFamily={post.bodyFontFamily}
                    color={post.bodyTextColor || post.textColor}
                    bgEnabled={post.bodyBackgroundEnabled ?? post.textBackgroundEnabled}
                    bgColor={post.bodyBackgroundColor || post.textBackgroundColor}
                    // NEW: Effects props
                    shadowType={post.bodyShadowType}
                    shadowColor={post.bodyShadowColor}
                    outlineWidth={post.bodyOutlineWidth}
                    outlineColor={post.bodyOutlineColor}
                    // ---
                    mode={mode}
                    organization={organization}
                    isDraggable={isTextDraggable}
                    onUpdatePosition={onUpdateBodyPosition}
                    onUpdateWidth={onUpdateBodyWidth}
                    onUpdateFontScale={onUpdateBodyFontScale} // Handler for scaling
                    onUpdateText={onUpdateBodyText} // Handler for inline editing
                />
            )}

            {/* Additional Text Elements */}
            {post.layout !== 'ai-ad' && post.layout !== 'real-estate' && (post.additionalTextElements || []).map((element) => (
                <DraggableTextElement
                    key={element.id}
                    type="body" // Treat as body for scaling logic, or make distinct if needed
                    text={element.text}
                    x={element.x} y={element.y} width={element.width}
                    textAlign={element.textAlign}
                    fontScale={element.fontScale}
                    fontFamily={element.fontFamily}
                    color={element.color}
                    bgEnabled={element.backgroundEnabled}
                    bgColor={element.backgroundColor}
                    shadowType={element.shadowType}
                    shadowColor={element.shadowColor}
                    outlineWidth={element.outlineWidth}
                    outlineColor={element.outlineColor}
                    // ---
                    mode={mode}
                    organization={organization}
                    isDraggable={isTextDraggable}
                    // Create specific handlers for this element using the ID
                    onUpdatePosition={(pos: {x: number, y: number}) => onUpdateAdditionalElement?.(element.id, { x: pos.x, y: pos.y })}
                    onUpdateWidth={(w: number) => onUpdateAdditionalElement?.(element.id, { width: w })}
                    onUpdateFontScale={(s: number) => onUpdateAdditionalElement?.(element.id, { fontScale: s })}
                    onUpdateText={(t: string) => onUpdateAdditionalElement?.(element.id, { text: t })}
                />
            ))}
            
            {showTags && post.layout !== 'real-estate' && post.tagIds?.map(tagId => {
                const tag = (organization?.tags || allTagsFromProp)?.find(t => t.id === tagId);
                if (!tag) return null;
                const override = post.tagPositionOverrides?.find(o => o.tagId === tagId);
                return <DraggableTag key={tagId} tag={tag} override={override} mode={mode} onUpdatePosition={onUpdateTagPosition} />;
            })}

            {post.qrCodeUrl && post.layout !== 'real-estate' && (
                <DraggableQrCode 
                    url={post.qrCodeUrl} 
                    x={qrX} y={qrY} width={qrW}
                    isDraggable={isTextDraggable}
                    onUpdatePosition={onUpdateQrPosition}
                    onUpdateWidth={onUpdateQrWidth}
                />
            )}

            {/* SubImage Carousel (Bildkarusell) */}
            {post.subImages && post.subImages.length > 0 && !post.isExpressPost && post.layout !== 'real-estate' && (
                <SubImageCarousel images={post.subImages} config={post.subImageConfig} />
            )}

            {/* SÅLD Stamp overlay for express speed posts */}
            {post.isExpressSold && (
                <div 
                    className="absolute z-50 pointer-events-none select-none flex items-center justify-center animate-pulse-stamp"
                    style={{
                        top: '40%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotate(-12deg) scale(1)',
                        zIndex: 99
                    }}
                >
                    <div className="border-[6px] md:border-[10px] border-double border-red-600 rounded-3xl px-6 py-3 md:px-10 md:py-5 flex flex-col items-center justify-center bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                        <span className="text-3xl md:text-6xl font-black uppercase tracking-[0.2em] text-red-600 font-sans select-none pointer-events-none drop-shadow-md">
                            SÅLD!
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};
