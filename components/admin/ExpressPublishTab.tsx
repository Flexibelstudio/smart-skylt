import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Organization, DisplayScreen, DisplayPost } from '../../types';
import { useLocation } from '../../context/StudioContext';
import { useToast } from '../../context/ToastContext';
import { Card } from '../Card';
import { PrimaryButton } from '../Buttons';
import { StyledInput } from '../Forms';
import { LoadingSpinnerIcon, TrashIcon } from '../icons';
import QRCode from 'qrcode';
import { DisplayPostRenderer } from '../DisplayPostRenderer';
import { ScaledPreviewWrapper } from '../DisplayScreenEditor/PreviewPanes';

interface ExpressPublishTabProps {
    organization: Organization;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
    preselectedScreenId?: string;
    onClose?: () => void;
}

// Interactive Live QR Code preview component inside speed editor
const QrCodePreview: React.FC<{ url: string }> = ({ url }) => {
    const [dataUrl, setDataUrl] = useState('');
    useEffect(() => {
        if (url) {
            QRCode.toDataURL(url, { width: 128, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
                  .then(setDataUrl).catch(console.error);
        } else {
            setDataUrl('');
        }
    }, [url]);

    if (!dataUrl) return null;
    return (
        <div className="bg-white p-0.5 rounded shadow-md border border-slate-200/55 flex items-center justify-center">
            <img src={dataUrl} alt="QR kod" className="w-7 h-7 md:w-8 md:h-8 object-contain select-none pointer-events-none" />
        </div>
    );
};

// Compact SimulatedTag helper for live preview mockups
const SimulatedTag: React.FC<{ tag: any }> = ({ tag }) => {
    const isStamp = tag.displayType === 'stamp';
    const shape = tag.shape || 'circle';
    
    let classes = 'text-[9px] font-black uppercase tracking-wider text-center flex items-center justify-center p-1.5 ';
    if (isStamp) {
        if (shape === 'circle') {
            classes += 'rounded-full aspect-square w-12 h-12 ';
        } else if (shape === 'square') {
            classes += 'rounded-md aspect-square w-12 h-12 ';
        } else {
            classes += 'rounded-md px-2 py-1 ';
        }
        if (tag.border === 'solid') {
            classes += 'border-2 border-current ';
        } else if (tag.border === 'dashed') {
            classes += 'border-2 border-dashed border-current ';
        }
    } else {
        classes += 'rounded-full px-2 py-0.5 shadow-md ';
    }
    
    if (tag.animation === 'pulse') {
        classes += 'animate-pulse ';
    }

    return (
        <div 
            className={classes}
            style={{
                backgroundColor: tag.backgroundColor,
                color: tag.textColor,
                fontSize: isStamp ? '8px' : '7.5px',
                lineHeight: '1.1',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
            }}
        >
            <span>{tag.text}</span>
        </div>
    );
};

export const ExpressPublishTab: React.FC<ExpressPublishTabProps> = ({ 
    organization, 
    onUpdateOrganization,
    preselectedScreenId,
    onClose
}) => {
    const { displayScreens, updateDisplayScreen } = useLocation();
    const { showToast } = useToast();

    // Core States
    const [selectedScreenId, setSelectedScreenId] = useState<string>(preselectedScreenId || '');
    
    useEffect(() => {
        if (preselectedScreenId) {
            setSelectedScreenId(preselectedScreenId);
        }
    }, [preselectedScreenId]);

    const [headline, setHeadline] = useState('');
    const [description, setDescription] = useState('');
    const [webpageUrl, setWebpageUrl] = useState('');
    const [galleryImages, setGalleryImages] = useState<string[]>([]);
    const imageBase64 = galleryImages[0] || null;
    const [layout, setLayout] = useState<'image-left' | 'image-right' | 'image-fullscreen' | 'real-estate'>('image-left');
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    
    // Schemaläggnings-states för express-inlägg
    const [scheduleDays, setScheduleDays] = useState<number[]>([]);
    const [scheduleTimeRanges, setScheduleTimeRanges] = useState<{ startTime: string; endTime: string }[]>([]);
    
    // UI Helpers
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSoldUpdating, setIsSoldUpdating] = useState<string | null>(null);
    const [showActiveList, setShowActiveList] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-select first screen if no screen selected
    const activeScreen = useMemo(() => {
        const screens = displayScreens || [];
        if (screens.length === 0) return null;
        
        let screen = screens.find(s => s.id === selectedScreenId);
        if (!screen) {
            screen = screens[0];
            // Safe update after rendering cycle to initialize state
            setTimeout(() => setSelectedScreenId(screen.id), 0);
        }
        return screen;
    }, [displayScreens, selectedScreenId]);

    // Check screen orientation: Stående (Portrait) vs Liggande (Landscape)
    const isPortraitScreen = useMemo(() => {
        if (!activeScreen) return true; // Default to portrait
        return activeScreen.aspectRatio === '9:16' || activeScreen.aspectRatio === '3:4';
    }, [activeScreen]);

    // Active express posts on the selected channel
    const activeExpressPosts = useMemo(() => {
        if (!activeScreen) return [];
        return (activeScreen.posts || []).filter(post => post.isExpressPost === true && post.status !== 'archived');
    }, [activeScreen]);

    // Live virtual previewPost object mapping inputs in real-time
    const previewPost = useMemo<DisplayPost>(() => {
        let cleanUrl = webpageUrl.trim();
        if (cleanUrl) {
            if (!/^https?:\/\//i.test(cleanUrl)) {
                cleanUrl = 'https://' + cleanUrl;
            }
        }
        
        const defaultBody = description.trim() || 'Skanna QR-koden för specifikationer, pris samt att läsa mer på vår sida.';
        
        // Dynamic coords reflecting express publish formula exactly
        let hX = 50, hY = 50, hW = 100;
        let bX = 50, bY = 50, bW = 100;
        let qrX = 89, qrY = 84, qrW = 15;

        if (layout === 'image-fullscreen') {
            hX = 50; hY = 68; hW = 84;
            bX = 50; bY = 77; bW = 84;
            qrX = isPortraitScreen ? 86 : 89;
            qrY = isPortraitScreen ? 89 : 84;
            qrW = 15;
        } else if (layout === 'image-left') {
            if (isPortraitScreen) {
                hX = 50; hY = 64; hW = 84;
                bX = 50; bY = 75; bW = 84;
                qrX = 86; qrY = 89; qrW = 15;
            } else {
                hX = 75; hY = 40; hW = 42;
                bX = 75; bY = 52; bW = 42;
                qrX = 89; qrY = 84; qrW = 15;
            }
        } else if (layout === 'image-right') {
            if (isPortraitScreen) {
                hX = 50; hY = 20; hW = 84;
                bX = 50; bY = 31; bW = 84;
                qrX = 86; qrY = 89; qrW = 15;
            } else {
                hX = 25; hY = 40; hW = 42;
                bX = 25; bY = 52; bW = 42;
                qrX = 89; qrY = 84; qrW = 15;
            }
        } else if (layout === 'real-estate') {
            hX = 50; hY = 30; hW = 80;
            bX = 50; bY = 55; bW = 80;
            qrX = 50; qrY = 82; qrW = 15;
        }

        return {
            id: 'express_preview_temp',
            internalTitle: `⚡ Express Förhandsvisning`,
            layout: layout,
            headline: headline.trim() || 'Rubrik skrivs här',
            body: defaultBody,
            imageUrl: imageBase64,
            subImages: galleryImages.slice(1).map((img, i) => ({
                id: `sub_${Date.now()}_${i}`,
                imageUrl: img
            })),
            isExpressPost: true,
            isExpressSold: false,
            durationSeconds: 15,
            tagIds: selectedTagIds,
            scheduleDays: scheduleDays,
            scheduleTimeRanges: scheduleTimeRanges,
            ...(cleanUrl ? { qrCodeUrl: cleanUrl } : {}),

            // Font rendering matching engine rules
            headlineFontScale: layout === 'image-fullscreen' ? (isPortraitScreen ? 8.5 : 5.5) : (isPortraitScreen ? 5.5 : 3.6),
            bodyFontScale: layout === 'image-fullscreen' ? (isPortraitScreen ? 4.2 : 3.0) : (isPortraitScreen ? 3.8 : 2.5),
            headlineTextColor: '#ffffff',
            bodyTextColor: '#cbd5e1',
            backgroundColor: '#0f172a',

            headlinePositionX: hX,
            headlinePositionY: hY,
            headlineWidth: hW,
            bodyPositionX: bX,
            bodyPositionY: bY,
            bodyWidth: bW,
            qrPositionX: qrX,
            qrPositionY: qrY,
            qrWidth: qrW,

            imageOverlayEnabled: false,
            imageOverlayColor: 'transparent',
            textAlign: 'center',

            headlineShadowType: 'soft',
            headlineShadowColor: 'rgba(0, 0, 0, 0.95)',
            bodyShadowType: 'soft',
            bodyShadowColor: 'rgba(0, 0, 0, 0.95)'
        };
    }, [headline, description, webpageUrl, layout, selectedTagIds, imageBase64, galleryImages, isPortraitScreen, scheduleDays, scheduleTimeRanges]);

    // Handle Image Upload -> Base64
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const maxFiles = 4;
        const processFile = (file: File): Promise<string> => {
            return new Promise((resolve, reject) => {
                if (!file.type.startsWith('image/')) {
                    reject(new Error("Inte en bild"));
                    return;
                }
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (event.target?.result) {
                        resolve(event.target.result as string);
                    } else {
                        reject(new Error("Läsfel"));
                    }
                };
                reader.onerror = () => reject(new Error("Läsfel"));
                reader.readAsDataURL(file);
            });
        };

        const fileArray = Array.from(files);
        Promise.all(fileArray.map(f => processFile(f).catch(() => null)))
            .then(dataUrls => {
                const validUrls = dataUrls.filter((url): url is string => url !== null);
                if (validUrls.length === 0) {
                    showToast({ message: "Vänligen ladda enbart upp giltiga bildfiler.", type: 'error' });
                    return;
                }
                
                // Append and cap at 4 total images
                const combined = [...galleryImages, ...validUrls].slice(0, maxFiles);
                setGalleryImages(combined);
            });
    };

    // Clean up file input
    const clearImage = () => {
        setGalleryImages([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Trigger Publish directly
    const handlePublishDirect = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeScreen) {
            showToast({ message: "Du måste ha skapat en kanal först.", type: 'error' });
            return;
        }
        if (!headline.trim()) {
            showToast({ message: "Vänligen fyll i en rubrik.", type: 'error' });
            return;
        }
        if (!imageBase64) {
            showToast({ message: "Vänligen ladda upp en bild på bostaden/bilen först.", type: 'error' });
            return;
        }

        setIsSubmitting(true);
        try {
            const cleanUrl = webpageUrl.trim();
            const defaultBody = description.trim() || "Skanna QR-koden för specifikationer, pris samt att läsa mer på vår sida.";

            // Calculate pristine coordinate positions based on selected layout and screen shape
            // This ensures text fits perfectly in its dedicated containers, and never overlaps or darkens the beautiful pictures.
            let hX = 50;
            let hY = 40;
            let hW = 80;
            
            let bX = 50;
            let bY = 60;
            let bW = 80;

            let qrX = 92;
            let qrY = 92;
            let qrW = 15;

            if (layout === 'image-fullscreen') {
                // Placed gracefully on lower third, styled with robust shadows
                hX = 50;
                hY = 68; // Lowered to render beautifully at the bottom like preview
                hW = 90;

                bX = 50;
                bY = 77; // Positioned tightly and elegantly below the title (gap reduced to 9% for cohesive fit)
                bW = 90;

                qrX = isPortraitScreen ? 86 : 89;
                qrY = isPortraitScreen ? 89 : 84;
                qrW = 15;
            } else if (layout === 'image-left') {
                if (isPortraitScreen) {
                    // Portrait split: Image on Top (hY 0-50), Text Area on Bottom (hY 50-100)
                    hX = 50;
                    hY = 64; // middle of bottom text half, lowered slightly
                    hW = 90;

                    bX = 50;
                    bY = 75; // reduced gap to 11%
                    bW = 90;

                    qrX = 86;
                    qrY = 89;
                    qrW = 15;
                } else {
                    // Landscape split: Image on Left (wX 0-50), Text Area on Right (wX 50-100)
                    hX = 75; // middle of right text half
                    hY = 40;
                    hW = 42;

                    bX = 75;
                    bY = 52; // reduced gap
                    bW = 42;

                    qrX = 89;
                    qrY = 84;
                    qrW = 15;
                }
            } else if (layout === 'image-right') {
                if (isPortraitScreen) {
                    // Portrait split: Text Area on Top (hY 0-50), Image on Bottom (hY 50-100)
                    hX = 50;
                    hY = 20; // middle of top text half (pulled down from 16 to avoid clashing borders)
                    hW = 90;

                    bX = 50;
                    bY = 31; // snug text gap decreased to 11% (originally 30 - gap 14%)
                    bW = 90;

                    qrX = 86;
                    qrY = 89;
                    qrW = 15;
                } else {
                    // Landscape split: Text Area on Left (wX 0-50), Image on Right (wX 50-100)
                    hX = 25; // middle of left text half
                    hY = 40;
                    hW = 42;

                    bX = 25;
                    bY = 52;
                    bW = 42;

                    qrX = 89;
                    qrY = 84;
                    qrW = 15;
                }
            } else if (layout === 'real-estate') {
                hX = 50;
                hY = 30;
                hW = 80;

                bX = 50;
                bY = 55;
                bW = 80;

                qrX = 50;
                qrY = 82;
                qrW = 15;
            }

            const newPost: DisplayPost = {
                id: `express_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                internalTitle: `⚡ Express: ${headline.trim()}`,
                layout: layout,
                headline: headline.trim(),
                body: defaultBody,
                imageUrl: imageBase64,
                subImages: galleryImages.slice(1).map((img, i) => ({
                    id: `sub_${Date.now()}_${i}`,
                    imageUrl: img
                })),
                ...(cleanUrl ? { qrCodeUrl: cleanUrl } : {}),
                isExpressPost: true,
                isExpressSold: false,
                durationSeconds: 15,
                startDate: new Date().toISOString(), // Automatiskt sätta dagens datum och tid som start så att det visas direkt och ej som utkast!
                scheduleDays: scheduleDays,
                scheduleTimeRanges: scheduleTimeRanges,
                headlineFontScale: layout === 'image-fullscreen' ? (isPortraitScreen ? 8.5 : 5.5) : (isPortraitScreen ? 5.5 : 3.6),
                bodyFontScale: layout === 'image-fullscreen' ? (isPortraitScreen ? 4.2 : 3.0) : (isPortraitScreen ? 3.8 : 2.5),
                headlineTextColor: '#ffffff',
                bodyTextColor: '#cbd5e1',
                backgroundColor: '#0f172a',
                tagIds: selectedTagIds,
                
                // Position properties
                headlinePositionX: hX,
                headlinePositionY: hY,
                headlineWidth: hW,
                bodyPositionX: bX,
                bodyPositionY: bY,
                bodyWidth: bW,
                qrPositionX: qrX,
                qrPositionY: qrY,
                qrWidth: qrW,

                // High-End Readability: Disable muddy global image darken overlay, use elegant crisp text shadows
                imageOverlayEnabled: false,
                imageOverlayColor: 'transparent',
                textAlign: 'center',
                
                headlineShadowType: 'soft',
                headlineShadowColor: 'rgba(0, 0, 0, 0.95)',
                bodyShadowType: 'soft',
                bodyShadowColor: 'rgba(0, 0, 0, 0.95)'
            };

            const updatedPosts = [newPost, ...(activeScreen.posts || [])];
            await updateDisplayScreen(activeScreen.id, { posts: updatedPosts });

            showToast({ message: "Publicerad direkt! Din skärm uppdateras nu.", type: 'success' });
            
            // Clear inputs for next fast input, keep screen selected
            setHeadline('');
            setDescription('');
            setWebpageUrl('');
            setSelectedTagIds([]);
            setScheduleDays([]);
            setScheduleTimeRanges([]);
            clearImage();
        } catch (error) {
            console.error(error);
            showToast({ message: "Kunde inte spara inlägget.", type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Toggle Sold Stamp (Märk som SÅLD)
    const handleToggleSold = async (postId: string) => {
        if (!activeScreen) return;
        setIsSoldUpdating(postId);
        try {
            const updatedPosts = (activeScreen.posts || []).map(post => {
                if (post.id === postId) {
                    const nextSoldStatus = !post.isExpressSold;
                    return { ...post, isExpressSold: nextSoldStatus };
                }
                return post;
            });

            await updateDisplayScreen(activeScreen.id, { posts: updatedPosts });
            showToast({ message: "Ändringen har sparats och skärmarna uppdateras.", type: 'success' });
        } catch (error) {
            console.error(error);
            showToast({ message: "Kunde inte uppdatera status.", type: 'error' });
        } finally {
            setIsSoldUpdating(null);
        }
    };

    // Toggle specific Stamp/Tag directly on the active post card
    const handleToggleTag = async (postId: string, tagId: string) => {
        if (!activeScreen) return;
        try {
            const updatedPosts = (activeScreen.posts || []).map(post => {
                if (post.id === postId) {
                    const currentTagIds = post.tagIds || [];
                    const nextTagIds = currentTagIds.includes(tagId)
                        ? currentTagIds.filter(id => id !== tagId)
                        : [...currentTagIds, tagId];
                    return { ...post, tagIds: nextTagIds };
                }
                return post;
            });

            await updateDisplayScreen(activeScreen.id, { posts: updatedPosts });
            showToast({ message: "Skärmen har uppdaterats!", type: 'success' });
        } catch (error) {
            console.error(error);
            showToast({ message: "Kunde inte spara stämpel/tagg.", type: 'error' });
        }
    };

    // Auto-provision broker-oriented default stamps/tags
    const handleCreateBrokerTags = async () => {
        const defaultBrokerTags = [
            {
                id: `tag_nytt_${Date.now()}`,
                displayType: 'tag',
                text: 'NYTT OBJEKT',
                backgroundColor: '#0ea5e9', // Sky blue
                textColor: '#FFFFFF',
                fontSize: 'md',
                fontWeight: 'black',
                animation: 'pulse',
                shape: 'rectangle',
                border: 'none',
                opacity: 1
            },
            {
                id: `tag_budgivning_${Date.now()}`,
                displayType: 'tag',
                text: 'BUDGIVNING PÅGÅR',
                backgroundColor: '#f59e0b', // Amber/orange
                textColor: '#FFFFFF',
                fontSize: 'md',
                fontWeight: 'black',
                animation: 'pulse',
                shape: 'rectangle',
                border: 'none',
                opacity: 1
            },
            {
                id: `tag_sold_${Date.now()}`,
                displayType: 'stamp',
                text: 'SÅLD!',
                backgroundColor: '#ef4444', // Red stamp
                textColor: '#FFFFFF',
                fontSize: 'xl',
                fontWeight: 'black',
                animation: 'pulse',
                shape: 'circle',
                border: 'dashed',
                opacity: 0.9
            }
        ];

        try {
            const existingTags = organization.tags || [];
            // Remove duplicates with same text
            const cleanNewTags = defaultBrokerTags.filter(
                newTag => !existingTags.some(t => t.text.toLowerCase() === newTag.text.toLowerCase())
            );
            if (cleanNewTags.length === 0) {
                showToast({ message: "Mäklarstämplar existerar redan i din profil!", type: 'info' });
                return;
            }
            const mergedTags = [...existingTags, ...cleanNewTags];
            await onUpdateOrganization(organization.id, { tags: mergedTags });
            showToast({ message: "Mäklarstämplar har installerats! Du kan aktivera dem direkt nu.", type: 'success' });
        } catch (err) {
            console.error(err);
            showToast({ message: "Kunde inte spara stämplar.", type: 'error' });
        }
    };

    // Quick Delete Express Post
    const handleDeleteExpressPost = async (postId: string) => {
        if (!activeScreen) return;
        try {
            const updatedPosts = (activeScreen.posts || []).filter(post => post.id !== postId);
            await updateDisplayScreen(activeScreen.id, { posts: updatedPosts });
            showToast({ message: "Inlägget har raderats direkt.", type: 'success' });
        } catch (error) {
            console.error(error);
            showToast({ message: "Kunde inte ta bort inlägget.", type: 'error' });
        }
    };

    return (
        <div className="space-y-8 animate-fade-in text-slate-900 dark:text-slate-100">
            {/* Context/Helper card */}
            {!preselectedScreenId && (
                <div className="bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-cyan-500/10 border border-teal-200/50 dark:border-teal-900/40 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h2 className="text-xl font-bold tracking-tight text-teal-800 dark:text-teal-300">Speed-Publicering ⚡</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
                            Det snabbaste sättet för mäklare och bilhandlare att få upp objekt. Fyll i rubrik, länkadress för live QR-kod, ladda upp bild och klicka publicera. Snabbt, enkelt och med inbyggd förhandsgranskning som anpassar sig efter stående eller liggande skärmar!
                        </p>
                    </div>
                </div>
            )}

            {/* Main grid split */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Form column (Left) */}
                <div className="lg:col-span-3">
                    <Card title={preselectedScreenId ? "Snabb-inlägg" : "Skapa snabb-inlägg"} subTitle="Fyll i detaljerna så publiceras det direkt">
                        <form onSubmit={handlePublishDirect} className="space-y-6">
                            {/* Screen dropdown */}
                            {!preselectedScreenId && (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                        Välj kanal / skärm
                                    </label>
                                    <select
                                        value={selectedScreenId}
                                        onChange={(e) => setSelectedScreenId(e.target.value)}
                                        className="w-full bg-slate-50/50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 font-medium focus:ring-2 focus:ring-teal-500 transition-all outline-none"
                                    >
                                        {(displayScreens || []).map(screen => (
                                            <option key={screen.id} value={screen.id}>
                                                {screen.name} ({screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4' ? 'Stående 📱' : 'Liggande 🖥️'})
                                            </option>
                                        ))}
                                        {(displayScreens || []).length === 0 && (
                                            <option value="">Inga kanaler tillgängliga</option>
                                        )}
                                    </select>
                                </div>
                            )}

                            {/* Image Dropzone Upload */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                    Ladda upp bilder {layout === 'real-estate' ? "(Skyltfönster stöder upp till 4 st bilder)" : "(Huvudbild)"}
                                </label>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    accept="image/*"
                                    multiple={layout === 'real-estate'}
                                    className="hidden"
                                />
                                
                                {galleryImages.length === 0 || (layout !== 'real-estate' && galleryImages.length > 0) ? (
                                    <div 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-500 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-50/50 dark:bg-slate-900/30 gap-2 text-center"
                                    >
                                        <div className="p-2.5 bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400 rounded-xl">
                                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                                                {galleryImages.length > 0 ? "Klicka för att byta bild" : "Klicka eller dra bild hit för att ladda upp"}
                                            </p>
                                            <p className="text-[11px] text-slate-400 mt-0.5">Stöder JPG, PNG, WEBP</p>
                                        </div>
                                    </div>
                                ) : null}

                                {layout === 'real-estate' && galleryImages.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-4 gap-3">
                                            {galleryImages.map((img, idx) => (
                                                <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shadow-sm flex items-center justify-center">
                                                    <img src={img} alt="" className="w-full h-full object-cover" />
                                                    <div className="absolute top-1 left-1 bg-teal-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-sm">
                                                        {idx === 0 ? "Huvud" : idx + 1}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const next = [...galleryImages];
                                                            next.splice(idx, 1);
                                                            setGalleryImages(next);
                                                            if (fileInputRef.current) fileInputRef.current.value = '';
                                                        }}
                                                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full shadow-md hover:scale-110 transition-all cursor-pointer flex items-center justify-center"
                                                    >
                                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                    {idx > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const next = [...galleryImages];
                                                                const temp = next[idx];
                                                                next[idx] = next[idx - 1];
                                                                next[idx - 1] = temp;
                                                                setGalleryImages(next);
                                                            }}
                                                            className="absolute bottom-1 left-1 bg-slate-900/85 hover:bg-slate-950 text-white px-1.5 py-0.5 rounded text-[8px] font-bold shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex gap-0.5 items-center"
                                                            title="Flytta framåt"
                                                        >
                                                            ◀
                                                        </button>
                                                    )}
                                                    {idx < galleryImages.length - 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const next = [...galleryImages];
                                                                const temp = next[idx];
                                                                next[idx] = next[idx + 1];
                                                                next[idx + 1] = temp;
                                                                setGalleryImages(next);
                                                            }}
                                                            className="absolute bottom-1 right-1 bg-slate-900/85 hover:bg-slate-950 text-white px-1.5 py-0.5 rounded text-[8px] font-bold shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex gap-0.5 items-center"
                                                            title="Flytta bakåt"
                                                        >
                                                            ▶
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            {Array.from({ length: 4 - galleryImages.length }).map((_, i) => (
                                                <div 
                                                    key={i} 
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="aspect-square rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 bg-slate-50/30 dark:bg-slate-900/10 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all hover:bg-teal-500/5 text-slate-400 hover:text-teal-500"
                                                >
                                                    <span className="text-xl font-light">+</span>
                                                    <span className="text-[9px] font-medium">BILD {galleryImages.length + i + 1}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {galleryImages.length < 4 && (
                                            <p className="text-[11px] text-slate-400">
                                                Tips: Du kan klicka på de tomma rutorna för att ladda upp fler bilder (upp till 4 st) eller markera flera bilder i filväljaren på en gång.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Compact layout select options */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                    Layoutstil
                                </label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setLayout('image-left')}
                                        className={`p-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-1.5 ${layout === 'image-left' ? 'border-teal-500 bg-teal-500/5 text-teal-600 dark:text-teal-400 shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                                    >
                                        <div className="w-10 h-6 border rounded bg-slate-150 dark:bg-slate-800 flex overflow-hidden">
                                            <div className="w-2/5 h-full bg-slate-300 dark:bg-slate-600" />
                                            <div className="w-3/5 h-full flex flex-col justify-center p-0.5 gap-0.5"><div className="h-1 w-3/4 bg-slate-400" /><div className="h-0.5 w-full bg-slate-300" /></div>
                                        </div>
                                        {isPortraitScreen ? "Bild Överst" : "Bild Vänster"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLayout('image-right')}
                                        className={`p-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-1.5 ${layout === 'image-right' ? 'border-teal-500 bg-teal-500/5 text-teal-600 dark:text-teal-400 shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                                    >
                                        <div className="w-10 h-6 border rounded bg-slate-150 dark:bg-slate-800 flex overflow-hidden">
                                            <div className="w-3/5 h-full flex flex-col justify-center p-0.5 gap-0.5"><div className="h-1 w-3/4 bg-slate-400" /><div className="h-0.5 w-full bg-slate-300" /></div>
                                            <div className="w-2/5 h-full bg-slate-300 dark:bg-slate-600" />
                                        </div>
                                        {isPortraitScreen ? "Bild Nederst" : "Bild Höger"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLayout('image-fullscreen')}
                                        className={`p-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-1.5 ${layout === 'image-fullscreen' ? 'border-teal-500 bg-teal-500/5 text-teal-600 dark:text-teal-400 shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                                    >
                                        <div className="w-10 h-6 border rounded bg-slate-300 dark:bg-slate-600 flex items-end p-0.5"><div className="h-2 w-3/4 bg-slate-800/40 rounded-sm" /></div>
                                        Helskärm
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLayout('real-estate')}
                                        className={`p-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-1.5 ${layout === 'real-estate' ? 'border-teal-500 bg-teal-500/5 text-teal-600 dark:text-teal-400 shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                                    >
                                        <div className="w-10 h-6 border rounded bg-slate-300 dark:bg-slate-600 flex items-center justify-center relative overflow-hidden">
                                            <div className="w-3/5 h-4/5 bg-slate-900/80 rounded-sm border-[0.5px] border-white/20 flex flex-col justify-center items-center gap-[1px]">
                                                <div className="h-[2px] w-[80%] bg-slate-100" />
                                                <div className="h-[1px] w-[60%] bg-slate-300" />
                                                <div className="h-0.5 w-[40%] bg-slate-400" />
                                            </div>
                                        </div>
                                        Centrerad ruta
                                    </button>
                                </div>
                            </div>

                            {/* Headline */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Rubrik / Namn
                                </label>
                                <StyledInput
                                    type="text"
                                    value={headline}
                                    onChange={(e) => setHeadline(e.target.value)}
                                    placeholder="t.ex. Volvo XC60 t8 eller Vasagatan 3a"
                                    required
                                    className="font-medium"
                                />
                            </div>

                            {/* Optional Short Description */}
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                                        Kort beskrivning (valfritt)
                                    </label>
                                    <span className="text-xs text-slate-400 font-medium">
                                        {description.length}/140 tecken
                                    </span>
                                </div>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value.slice(0, 140))}
                                    placeholder="t.ex. Nyinkommen pärla! Endast 2400 mil. Kontakta oss för provkörning eller mer information."
                                    rows={2}
                                    maxLength={140}
                                    className="w-full bg-slate-50/50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-teal-500 transition-all outline-none resize-none text-sm"
                                />
                            </div>

                            {/* Webpage Link address for QR code */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Länkadress för QR-kod
                                </label>
                                <StyledInput
                                    type="url"
                                    value={webpageUrl}
                                    onChange={(e) => setWebpageUrl(e.target.value)}
                                    placeholder="https://bytbil.se/objekt/123 eller Hemnet-länk"
                                    className="font-mono text-sm"
                                />
                            </div>

                            {/* Veckodagarsschemaläggning (snabbinlägg) */}
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Begränsa till specifika veckodagar</label>
                                        <span className="text-[11px] text-slate-400 dark:text-slate-500">Om inga väljs visas inlägget alla dagar</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (scheduleDays.length === 7) {
                                                setScheduleDays([]);
                                            } else {
                                                setScheduleDays([1, 2, 3, 4, 5, 6, 0]);
                                            }
                                        }}
                                        className="text-xs font-bold text-teal-600 hover:text-teal-500 dark:text-teal-400"
                                    >
                                        {scheduleDays.length === 7 ? 'Spara ingen' : 'Välj alla'}
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { label: 'Mån', value: 1 },
                                        { label: 'Tis', value: 2 },
                                        { label: 'Ons', value: 3 },
                                        { label: 'Tor', value: 4 },
                                        { label: 'Fre', value: 5 },
                                        { label: 'Lör', value: 6 },
                                        { label: 'Sön', value: 0 },
                                    ].map(day => {
                                        const isSelected = scheduleDays.includes(day.value);
                                        return (
                                            <button
                                                type="button"
                                                key={day.value}
                                                onClick={() => {
                                                    const nextDays = isSelected
                                                        ? scheduleDays.filter(d => d !== day.value)
                                                        : [...scheduleDays, day.value];
                                                    setScheduleDays(nextDays);
                                                }}
                                                className={`w-11 h-9 rounded-xl text-xs font-extrabold border transition-all active:scale-95 ${
                                                    isSelected
                                                        ? 'border-teal-500 bg-teal-500 text-white shadow-sm ring-2 ring-teal-500/20'
                                                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                }`}
                                            >
                                                {day.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Tidsspannsschemaläggning under dygnet (snabbinlägg) */}
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Specifika tidsspann under dygnet</label>
                                        <span className="text-[11px] text-slate-400 dark:text-slate-500">Om inga tider anges visas inlägget dygnet runt</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setScheduleTimeRanges(prev => [...prev, { startTime: '08:00', endTime: '17:00' }]);
                                        }}
                                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-250 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 rounded-lg flex items-center gap-1 transition-all"
                                    >
                                        + Lägg till tid
                                    </button>
                                </div>

                                {scheduleTimeRanges.length > 0 ? (
                                    <div className="space-y-2">
                                        {scheduleTimeRanges.map((range, index) => (
                                            <div key={index} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                                                <div className="flex items-center gap-2 flex-grow">
                                                    <div className="w-1/2">
                                                        <input
                                                            type="time"
                                                            value={range.startTime || '08:00'}
                                                            onChange={e => {
                                                                const nextRanges = [...scheduleTimeRanges];
                                                                nextRanges[index] = { ...range, startTime: e.target.value };
                                                                setScheduleTimeRanges(nextRanges);
                                                            }}
                                                            className="w-full bg-white dark:bg-slate-800 border border-slate-250 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-teal-500"
                                                        />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-400">till</span>
                                                    <div className="w-1/2">
                                                        <input
                                                            type="time"
                                                            value={range.endTime || '17:00'}
                                                            onChange={e => {
                                                                const nextRanges = [...scheduleTimeRanges];
                                                                nextRanges[index] = { ...range, endTime: e.target.value };
                                                                setScheduleTimeRanges(nextRanges);
                                                            }}
                                                            className="w-full bg-white dark:bg-slate-800 border border-slate-250 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-teal-500"
                                                        />
                                                    </div>
                                                </div>
                                                
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const nextRanges = scheduleTimeRanges.filter((_, i) => i !== index);
                                                        setScheduleTimeRanges(nextRanges);
                                                    }}
                                                    className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-550 rounded-lg transition-colors"
                                                    title="Ta bort tidsspann"
                                                >
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-4 bg-slate-50/40 dark:bg-slate-900/10 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                                        <span className="text-xs text-slate-400 dark:text-slate-500">Standard: inlägget visas dygnet runt</span>
                                    </div>
                                )}
                            </div>

                            {/* Tagg/stämpelval för det nya inlägget */}
                            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-1">
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                                        Aktivera stämplar / taggar direkt (valfritt)
                                    </label>
                                    {(!organization.tags || organization.tags.length === 0) && (
                                        <button
                                            type="button"
                                            onClick={handleCreateBrokerTags}
                                            className="text-xs text-teal-600 hover:text-teal-500 font-bold transition-all text-left flex items-center gap-1"
                                        >
                                            ⚡ Skapa mäklarstämplar
                                        </button>
                                    )}
                                </div>
                                
                                {organization.tags && organization.tags.length > 0 ? (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {organization.tags.map(tag => {
                                            const isSelected = selectedTagIds.includes(tag.id);
                                            return (
                                                <button
                                                    type="button"
                                                    key={tag.id}
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            setSelectedTagIds(prev => prev.filter(id => id !== tag.id));
                                                        } else {
                                                            setSelectedTagIds(prev => [...prev, tag.id]);
                                                        }
                                                    }}
                                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 select-none active:scale-95 ${
                                                        isSelected 
                                                            ? 'border-teal-500 bg-teal-50 text-teal-600 dark:bg-teal-950/20 dark:text-teal-400 font-extrabold shadow-sm ring-1 ring-teal-500'
                                                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                    }`}
                                                    title={`${tag.displayType === 'stamp' ? 'Stämpel' : 'Tagg'}: ${tag.text}`}
                                                >
                                                    <span className="text-xs">{tag.displayType === 'stamp' ? '💮' : '🏷️'}</span>
                                                    <span>{tag.text}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-900/10 p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col gap-2">
                                        <span>Inga taggar eller stämplar finns i er profil ännu.</span>
                                        <button
                                            type="button"
                                            onClick={handleCreateBrokerTags}
                                            className="text-xs font-bold text-teal-600 hover:text-teal-500 flex items-center gap-1 self-start"
                                        >
                                            ⚡ Installera standardmäklarstämplar ("Nytt objekt", "Budgivning pågår", "SÅLD!")
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Submit Button */}
                            <PrimaryButton
                                type="submit"
                                disabled={isSubmitting || !imageBase64 || !headline.trim()}
                                className="w-full py-3.5 bg-teal-600 hover:bg-teal-500 dark:bg-teal-600 font-bold tracking-wide rounded-xl shadow-lg hover:shadow-xl transition-all select-none flex items-center justify-center gap-2 text-base"
                            >
                                {isSubmitting ? (
                                    <>
                                        <LoadingSpinnerIcon className="h-5 w-5 text-white animate-spin" />
                                        Publicerar...
                                    </>
                                ) : (
                                    <>
                                        <span>Skicka till skärmen direkt ⚡</span>
                                    </>
                                )}
                            </PrimaryButton>
                        </form>
                    </Card>
                </div>

                {/* Live Preview and Active Posts (Right side) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Visual Live Preview Frame based on Screen Aspect Ratio */}
                    <Card 
                        title="Live Förhandsvisning" 
                        subTitle={`Skärmformat: ${isPortraitScreen ? 'Stående (Mobil / TV stående)' : 'Liggande (TV / Datorskärm)'}`}
                    >
                        <div className="bg-slate-150 dark:bg-slate-950 p-4 md:p-6 rounded-2xl flex items-center justify-center overflow-hidden w-full border border-slate-200 dark:border-slate-800">
                            {/* Device Frame matching display engine rules exactly */}
                            <div className="w-full max-w-[280px] md:max-w-[340px] shadow-2xl rounded-2xl overflow-hidden border-4 border-slate-900 bg-slate-950">
                                <ScaledPreviewWrapper aspectRatio={activeScreen?.aspectRatio || '9:16'}>
                                    <DisplayPostRenderer 
                                        post={previewPost}
                                        allTags={organization.tags}
                                        primaryColor={organization.primaryColor}
                                        mode="live"
                                        aspectRatio={activeScreen?.aspectRatio || '9:16'}
                                        organization={organization}
                                    />
                                </ScaledPreviewWrapper>
                            </div>
                        </div>
                    </Card>

                    {/* Active posts quick list */}
                    <Card
                        title={`Aktiva i kanalen (${activeExpressPosts.length})`}
                        subTitle="Hantera inlägg, markera som sålda eller ta bort från skärmen"
                    >
                        <div className="space-y-4">
                            <button
                                type="button"
                                onClick={() => setShowActiveList(!showActiveList)}
                                className="w-full py-2.5 px-4 bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-xl border border-slate-250 dark:border-slate-800 flex justify-between items-center text-xs font-bold text-slate-700 dark:text-slate-300 transition-all active:scale-[0.99]"
                            >
                                <span className="flex items-center gap-2">
                                    <span className={`inline-block w-2 h-2 rounded-full ${activeExpressPosts.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
                                    <span>Visa aktiva snabbinlägg på skärmen</span>
                                </span>
                                <span className="text-slate-400 font-mono text-[10px]">
                                    {showActiveList ? '[ Dölj listan ▲ ]' : '[ Visa listan ▼ ]'}
                                </span>
                            </button>

                            {showActiveList && (
                                <div className="space-y-4 pt-2 animate-fade-in border-t border-slate-200/50 dark:border-slate-800/60 mt-2">
                                    {activeExpressPosts.map(post => {
                                        const isSold = post.isExpressSold;
                                        return (
                                            <div 
                                                key={post.id}
                                                className="bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-3.5 flex gap-4 hover:shadow-sm transition-all relative overflow-hidden group/item animate-fade-in"
                                            >
                                                <div className={`absolute top-0 bottom-0 left-0 w-1 ${isSold ? 'bg-red-500' : 'bg-teal-500'}`} />

                                                {/* Thumbnail image and sold stamp */}
                                                <div className="relative w-14 h-14 rounded-lg bg-slate-150 dark:bg-slate-800 overflow-hidden flex-shrink-0">
                                                    {post.imageUrl ? (
                                                        <img src={post.imageUrl} alt="Inlägg miniatyr" className="w-full h-full object-cover select-none pointer-events-none" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-[10px]">Ingen</div>
                                                    )}

                                                    {isSold && (
                                                        <div className="absolute inset-0 bg-red-500/20 backdrop-blur-[1px] flex items-center justify-center">
                                                            <span className="bg-red-650 text-white rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider select-none pointer-events-none shadow border border-white/20">
                                                                SÅLD!
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Core info text */}
                                                <div className="flex-grow min-w-0 flex flex-col justify-between">
                                                    <div className="space-y-0.5">
                                                        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 leading-snug truncate group-hover/item:text-teal-600 dark:group-hover/item:text-teal-400 transition-colors">
                                                            {post.headline}
                                                        </h4>
                                                        
                                                        {post.qrCodeUrl && (
                                                            <div className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                                                                <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                                                </svg>
                                                                <span className="truncate max-w-[140px] font-mono select-all">{post.qrCodeUrl}</span>
                                                            </div>
                                                        )}


                                                    </div>

                                                    {/* Specific actions bar inside info card */}
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleSold(post.id)}
                                                            disabled={isSoldUpdating === post.id}
                                                            className={`px-2 py-0.5 text-xs font-extrabold rounded-lg border flex items-center gap-1 transition-all select-none active:scale-95 ${
                                                                isSold 
                                                                    ? 'bg-red-50 dark:bg-red-955/20 text-red-600 dark:text-red-450 border-red-200 dark:border-red-900 hover:bg-white dark:hover:bg-slate-800'
                                                                    : 'bg-emerald-50 dark:bg-emerald-955/20 text-emerald-600 dark:text-emerald-450 border-emerald-200 dark:border-emerald-900/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/30'
                                                            }`}
                                                        >
                                                            {isSoldUpdating === post.id ? (
                                                                <LoadingSpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                                                            ) : isSold ? (
                                                                <span>Ångra Såld</span>
                                                            ) : (
                                                                <span>Märk som SÅLD ✅</span>
                                                            )}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteExpressPost(post.id)}
                                                            className="p-1 px-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-150/10 transition-colors"
                                                            title="Ta bort direkt"
                                                        >
                                                            <TrashIcon className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {activeExpressPosts.length === 0 && (
                                        <div className="text-center py-8 px-4 bg-slate-50/50 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-800/80 rounded-2xl flex flex-col items-center justify-center gap-2">
                                            <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500">
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                                </svg>
                                            </div>
                                            <h5 className="font-bold text-xs text-slate-600 dark:text-slate-300">Inga aktiva expressinlägg</h5>
                                            <p className="text-[11px] text-slate-400 max-w-[180px]">Skapa ett inlägg så dyker det upp här.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};
