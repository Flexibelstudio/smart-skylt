import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DisplayPost, Tag, Organization, DisplayScreen } from '../types';
import QRCode from 'https://esm.sh/qrcode@1.5.3';
import { InstagramStoryPost } from './InstagramStoryPost';

// --- DESIGN HELPER FUNCTIONS (Återställda) ---

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

// --- STYLE GENERATORS (Återställda för korrekt utseende) ---

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
        default: return isPreview ? 'text-[7px]' : 'text-base';
    }
};

const getTagFontFamilyClass = (family?: Tag['fontFamily']) => {
    switch (family) {
        case 'display': return 'font-display';
        case 'script': return 'font-logo';
        case 'adscript': return 'font-adscript';
        case 'sans': return 'font-sans';
        default: return `font-${family || 'sans'}`;
    }
};

const getHeadlineFontSizeClass = (size?: string, mode?: string) => {
    const isPreview = isPreviewMode(mode as any);
    if (isPreview) return 'text-sm';
    switch (size) {
        case 'sm': return 'text-xl';
        case 'md': return 'text-2xl';
        case 'lg': return 'text-3xl';
        case 'xl': return 'text-4xl';
        case '2xl': return 'text-5xl';
        case '3xl': return 'text-6xl';
        case '4xl': return 'text-7xl';
        case '5xl': return 'text-8xl';
        case '6xl': return 'text-9xl';
        default: return 'text-5xl';
    }
};

const getBodyFontSizeClass = (size?: string, mode?: string) => {
    const isPreview = isPreviewMode(mode as any);
    if (isPreview) return 'text-xs';
    switch (size) {
        case 'xs': return 'text-base';
        case 'sm': return 'text-lg';
        case 'md': return 'text-xl';
        case 'lg': return 'text-2xl';
        case 'xl': return 'text-3xl';
        case '2xl': return 'text-4xl';
        default: return 'text-xl';
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

const DraggableQrCode: React.FC<any> = ({ url, x, y, width }) => {
    return (
        <div style={{
            position: 'absolute',
            left: `${x}%`,
            top: `${y}%`,
            width: `${width}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 50,
            aspectRatio: '1/1',
        }}>
            <div className="bg-white p-2 rounded-lg shadow-lg w-full h-full flex items-center justify-center">
                <QrCodeComponent url={url} className="w-full h-full" />
            </div>
        </div>
    );
};

// Återställd Markdown-renderare för listor etc.
const PostMarkdownRenderer: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
    const renderMarkdown = useMemo(() => {
        if (!content) return { __html: '' };
        const lines = content.split('\n');
        const htmlLines: string[] = [];
        let inList: 'ul' | 'ol' | false = false;

        const closeListIfNeeded = () => {
            if (inList) { htmlLines.push(`</${inList}>`); inList = false; }
        };

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

    return <div className={className} dangerouslySetInnerHTML={renderMarkdown} />;
};

const TextContent: React.FC<any> = ({ post, mode, organization }) => {
    // Återställd logik för textplacering
    const style: React.CSSProperties = {
        position: 'absolute',
        top: post.textPositionY ? `${post.textPositionY}%` : '50%',
        left: post.textPositionX ? `${post.textPositionX}%` : '50%',
        transform: 'translate(-50%, -50%)',
        width: post.textWidth ? `${post.textWidth}%` : '80%',
        textAlign: post.textAlign || 'center',
        zIndex: 40,
        color: resolveColor(post.textColor, '#ffffff', organization),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: post.textAlign === 'left' ? 'flex-start' : post.textAlign === 'right' ? 'flex-end' : 'center'
    };

    const headlineClass = `${getHeadlineFontSizeClass(post.headlineFontSize, mode)} font-bold leading-tight drop-shadow-md break-words ${post.headlineFontFamily ? `font-${post.headlineFontFamily}` : (organization?.headlineFontFamily ? `font-${organization.headlineFontFamily}` : 'font-display')}`;
    const bodyClass = `${getBodyFontSizeClass(post.bodyFontSize, mode)} mt-4 break-words drop-shadow-md ${post.bodyFontFamily ? `font-${post.bodyFontFamily}` : (organization?.bodyFontFamily ? `font-${organization.bodyFontFamily}` : 'font-sans')}`;

    return (
        <div style={style}>
            <div className={post.textBackgroundEnabled ? "bg-black/50 p-6 rounded-xl backdrop-blur-md" : ""}>
                {post.headline && <h1 className={headlineClass}>{post.headline}</h1>}
                {post.body && <PostMarkdownRenderer content={post.body} className={bodyClass} />}
            </div>
        </div>
    );
};

const DraggableTag: React.FC<any> = ({ tag, override, mode }) => {
     const style: React.CSSProperties = {
        position: 'absolute',
        left: `${override?.x || 50}%`,
        top: `${override?.y || 50}%`,
        transform: `translate(-50%, -50%) rotate(${override?.rotation || 0}deg)`,
        zIndex: 40,
        backgroundColor: tag.backgroundColor,
        color: tag.textColor,
        padding: '0.5rem 1rem',
        borderRadius: '999px',
        fontWeight: 'bold',
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
     };

     return (
         <div style={style} className={`flex items-center gap-2 ${getTagFontSizeClass(tag.fontSize, mode)} ${getTagFontFamilyClass(tag.fontFamily)}`}>
             {tag.text}
             {tag.url && (
                 <div className="bg-white p-0.5 rounded-sm w-[1.5em] h-[1.5em] flex-shrink-0">
                     <QrCodeComponent url={tag.url} className="w-full h-full" />
                 </div>
             )}
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
    
    // Legacy props
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
    
    // --- SONY SIGNALING ---
    const hasSignaled = useRef(false);
    const signalReady = useCallback(() => {
        if (!hasSignaled.current && onLoadReady) {
            hasSignaled.current = true;
            onLoadReady();
        }
    }, [onLoadReady]);

    // Safety Timer
    useEffect(() => {
        if (!post.videoUrl && !post.imageUrl) signalReady();
        const t = setTimeout(() => { if (!hasSignaled.current) signalReady(); }, 1000);
        return () => clearTimeout(t);
    }, [post, signalReady]);

    // --- VIDEO CONTROL ---
    useEffect(() => {
        const video = videoRef.current;
        if (video) {
            video.currentTime = 0;
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => { if (onLoadError) onLoadError(); });
            }
        }
    }, [post.videoUrl, cycleCount]); 

    // --- STYLES ---
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
    if (isBridgeOnly && (post.layout === 'instagram-latest' || post.layout === 'webpage')) {
        return <div className="w-full h-full" style={{ backgroundColor }} />;
    }
    
    if (post.layout === 'instagram-latest') return <div className="w-full h-full bg-black flex items-center justify-center text-white">Instagram (Placeholder)</div>;
    if (post.layout === 'webpage' && post.webpageUrl) return <iframe src={ensureAbsoluteUrl(post.webpageUrl)} className="w-full h-full border-0" />;
    if (post.layout === 'instagram-stories' && organization?.id) return <InstagramStoryPost organizationId={organization.id} />;

    const isMedia = ['image-fullscreen', 'video-fullscreen', 'image-left', 'image-right'].includes(post.layout);
    
    // QR Calc
    const qrX = post.qrPositionX ?? (post.qrCodePosition ? mapLegacyPosition(post.qrCodePosition).x : 90);
    const qrY = post.qrPositionY ?? (post.qrCodePosition ? mapLegacyPosition(post.qrCodePosition).y : 90);
    const qrW = post.qrWidth ?? (post.qrCodeSize ? mapLegacySize(post.qrCodeSize) : 15);

    return (
        <div className="w-full h-full relative overflow-hidden" style={{ backgroundColor }}>
            
            {/* MEDIA */}
            {isMedia && (
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

            {/* OVERLAY */}
            {post.imageOverlayEnabled && <div className="absolute inset-0 z-10" style={{ backgroundColor: resolveColor(post.imageOverlayColor, 'rgba(0,0,0,0.45)', organization) }} />}
            
            {/* TEXT */}
            {(post.headline || post.body) && <TextContent post={post} mode={mode} organization={organization} />}
            
            {/* TAGS */}
            {showTags && post.tagIds?.map(tagId => {
                const tag = (organization?.tags || allTagsFromProp)?.find(t => t.id === tagId);
                if (!tag) return null;
                const override = post.tagPositionOverrides?.find(o => o.tagId === tagId);
                return <DraggableTag key={tagId} tag={tag} override={override} mode={mode} />;
            })}

            {/* QR CODE */}
            {post.qrCodeUrl && (
                <DraggableQrCode 
                    url={post.qrCodeUrl} 
                    x={qrX} 
                    y={qrY} 
                    width={qrW} 
                />
            )}
        </div>
    );
};