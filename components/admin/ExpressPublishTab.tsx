import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Organization, DisplayScreen, DisplayPost } from '../../types';
import { useLocation } from '../../context/StudioContext';
import { useToast } from '../../context/ToastContext';
import { Card } from '../Card';
import { PrimaryButton } from '../Buttons';
import { StyledInput } from '../Forms';
import { LoadingSpinnerIcon, TrashIcon } from '../icons';
import QRCode from 'qrcode';

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
        <div className="bg-white p-1 rounded-xl shadow-md border border-slate-200 flex items-center justify-center">
            <img src={dataUrl} alt="QR kod" className="w-12 h-12 md:w-16 md:h-16 object-contain select-none pointer-events-none" />
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
    
    // UI Helpers
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSoldUpdating, setIsSoldUpdating] = useState<string | null>(null);
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
        return (activeScreen.posts || []).filter(post => post.isExpressPost === true);
    }, [activeScreen]);

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

            let qrX = 86;
            let qrY = 86;
            let qrW = 12;

            if (layout === 'image-fullscreen') {
                // Placed gracefully on lower third, styled with robust shadows
                hX = 50;
                hY = 58;
                hW = 84;

                bX = 50;
                bY = 74;
                bW = 84;

                qrX = 86;
                qrY = 86;
                qrW = 12;
            } else if (layout === 'image-left') {
                if (isPortraitScreen) {
                    // Portrait split: Image on Top (hY 0-50), Text Area on Bottom (hY 50-100)
                    hX = 50;
                    hY = 62; // middle of bottom text half
                    hW = 84;

                    bX = 50;
                    bY = 76;
                    bW = 84;

                    qrX = 86;
                    qrY = 86;
                    qrW = 11;
                } else {
                    // Landscape split: Image on Left (wX 0-50), Text Area on Right (wX 50-100)
                    hX = 75; // middle of right text half
                    hY = 30;
                    hW = 42;

                    bX = 75;
                    bY = 52;
                    bW = 42;

                    qrX = 75;
                    qrY = 78;
                    qrW = 11;
                }
            } else if (layout === 'image-right') {
                if (isPortraitScreen) {
                    // Portrait split: Text Area on Top (hY 0-50), Image on Bottom (hY 50-100)
                    hX = 50;
                    hY = 16; // middle of top text half
                    hW = 84;

                    bX = 50;
                    bY = 30;
                    bW = 84;

                    qrX = 86;
                    qrY = 36;
                    qrW = 11;
                } else {
                    // Landscape split: Text Area on Left (wX 0-50), Image on Right (wX 50-100)
                    hX = 25; // middle of left text half
                    hY = 30;
                    hW = 42;

                    bX = 25;
                    bY = 52;
                    bW = 42;

                    qrX = 25;
                    qrY = 78;
                    qrW = 11;
                }
            } else if (layout === 'real-estate') {
                hX = 50;
                hY = 30;
                hW = 80;

                bX = 50;
                bY = 55;
                bW = 80;

                qrX = 50;
                qrY = 80;
                qrW = 10;
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
                                    <span className="text-xs text-slate-400">Standardtext används om tomt</span>
                                </div>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="t.ex. Nyinkommen pärla! Endast 2400 mil. Kontakta oss för provkörning eller mer information."
                                    rows={2}
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
                        <div className="bg-slate-100 dark:bg-slate-950 p-6 rounded-2xl flex items-center justify-center overflow-hidden">
                            {/* Physical Device Border Mockup */}
                            <div 
                                className={`relative overflow-hidden rounded-2xl border-[6px] border-slate-900 bg-slate-900 shadow-2xl transition-all duration-300 w-full ${
                                    isPortraitScreen 
                                        ? 'max-w-[240px] aspect-[9/16]' 
                                        : 'max-w-md aspect-video'
                                }`}
                            >
                                {/* Inner Screen space */}
                                <div className="absolute inset-0 z-0 bg-slate-900 flex flex-col select-none pointer-events-none">
                                    
                                    {/* FULLSCREEN IMAGE LAYOUT */}
                                    {layout === 'image-fullscreen' && (
                                        <>
                                            {imageBase64 ? (
                                                <img src={imageBase64} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-slate-800 flex flex-col items-center justify-center text-slate-500 text-[10px] p-4 text-center">
                                                    <svg className="h-6 w-6 text-slate-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                    Ladda upp ett objektfoto
                                                </div>
                                            )}
                                            {/* Elegant bottom gradient leave top 60% entirely bright and crispy */}
                                            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
                                            
                                            {/* Text over the background (centered for premium aesthetic rhythm) */}
                                            <div className="absolute inset-x-0 bottom-0 p-4 pb-14 space-y-1.5 z-10 text-center">
                                                <h3 className="text-white font-extrabold tracking-tight leading-tight line-clamp-2 drop-shadow-md" style={{ fontSize: isPortraitScreen ? '13px' : '15px' }}>
                                                    {headline.trim() || 'Rubrik skrivs här'}
                                                </h3>
                                                <p className="text-slate-300 text-[10px] leading-snug line-clamp-3 drop-shadow-sm">
                                                    {description.trim() || 'Skanna QR-koden för specifikationer, pris samt att läsa mer på vår sida.'}
                                                </p>
                                            </div>
                                        </>
                                    )}

                                    {/* SPLIT IMAGE LAYOUT: IMAGE-LEFT (Image Top in Portrait, Left in Landscape) */}
                                    {layout === 'image-left' && (
                                        <div className={`w-full h-full flex ${isPortraitScreen ? 'flex-col' : 'flex-row'}`}>
                                            {/* Image - Fully bright, no overlay */}
                                            <div className={`${isPortraitScreen ? 'h-[45%] w-full' : 'w-[45%] h-full'} relative bg-slate-800 flex-shrink-0 overflow-hidden`}>
                                                {imageBase64 ? (
                                                    <img src={imageBase64} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 text-[9px] p-2 text-center">
                                                        <svg className="h-5 w-5 text-slate-750 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                        Fotoval
                                                    </div>
                                                )}
                                            </div>
                                            {/* Text space */}
                                            <div className="flex-grow p-3 flex flex-col justify-center text-center bg-slate-900 border-l border-t border-slate-850">
                                                <div className="space-y-1.5 max-w-full">
                                                    <h3 className="text-white font-extrabold tracking-tight leading-tight line-clamp-2" style={{ fontSize: isPortraitScreen ? '13px' : '15px' }}>
                                                        {headline.trim() || 'Rubrik skrivs här'}
                                                    </h3>
                                                    <p className="text-slate-400 text-[10px] leading-snug line-clamp-3">
                                                        {description.trim() || 'Skanna QR-koden för specifikationer, pris samt att läsa mer på vår sida.'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* SPLIT IMAGE LAYOUT: IMAGE-RIGHT (Image Bottom in Portrait, Right in Landscape) */}
                                    {layout === 'image-right' && (
                                        <div className={`w-full h-full flex ${isPortraitScreen ? 'flex-col-reverse' : 'flex-row-reverse'}`}>
                                            {/* Image - Fully bright, no overlay */}
                                            <div className={`${isPortraitScreen ? 'h-[45%] w-full' : 'w-[45%] h-full'} relative bg-slate-800 flex-shrink-0 overflow-hidden`}>
                                                {imageBase64 ? (
                                                    <img src={imageBase64} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 text-[9px] p-2 text-center">
                                                        <svg className="h-5 w-5 text-slate-750 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                        Fotoval
                                                    </div>
                                                )}
                                            </div>
                                            {/* Text space */}
                                            <div className="flex-grow p-3 flex flex-col justify-center text-center bg-slate-900 border-r border-b border-slate-850">
                                                <div className="space-y-1.5 max-w-full">
                                                    <h3 className="text-white font-extrabold tracking-tight leading-tight line-clamp-2" style={{ fontSize: isPortraitScreen ? '13px' : '15px' }}>
                                                        {headline.trim() || 'Rubrik skrivs här'}
                                                    </h3>
                                                    <p className="text-slate-400 text-[10px] leading-snug line-clamp-3">
                                                        {description.trim() || 'Skanna QR-koden för specifikationer, pris samt att läsa mer på vår sida.'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* REAL ESTATE / CENTERED CARD LAYOUT */}
                                    {layout === 'real-estate' && (
                                        <>
                                            {galleryImages.length > 0 ? (
                                                <div className="absolute inset-0 w-full h-full overflow-hidden">
                                                    {galleryImages.length === 1 ? (
                                                        <img src={galleryImages[0]} alt="" className="w-full h-full object-cover" />
                                                    ) : galleryImages.length === 2 ? (
                                                        <div className="w-full h-full grid grid-cols-2 gap-0.5 bg-slate-950">
                                                            {galleryImages.map((img, i) => (
                                                                <img key={i} src={img} alt="" className="w-full h-full object-cover" />
                                                            ))}
                                                        </div>
                                                    ) : galleryImages.length === 3 ? (
                                                        <div className="w-full h-full grid grid-cols-2 gap-0.5 bg-slate-950">
                                                            <img src={galleryImages[0]} alt="" className="w-full h-full object-cover" />
                                                            <div className="grid grid-rows-2 gap-0.5">
                                                                <img src={galleryImages[1]} alt="" className="w-full h-full object-cover" />
                                                                <img src={galleryImages[2]} alt="" className="w-full h-full object-cover" />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5 bg-slate-950">
                                                            {galleryImages.slice(0, 4).map((img, i) => (
                                                                <img key={i} src={img} alt="" className="w-full h-full object-cover" />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="w-full h-full bg-slate-800 flex flex-col items-center justify-center text-slate-500 text-[10px] p-4 text-center">
                                                    <svg className="h-6 w-6 text-slate-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                    Ladda upp ett objektfoto
                                                </div>
                                            )}
                                            
                                            {/* Centered card overlay mock inside preview */}
                                            <div 
                                                className="absolute border border-white/25 bg-slate-950/85 backdrop-blur-md rounded-xl text-white p-4 text-center flex flex-col justify-between"
                                                style={{
                                                    top: '50%',
                                                    left: '50%',
                                                    transform: 'translate(-50%, -50%)',
                                                    width: isPortraitScreen ? '70%' : '46%',
                                                    minHeight: isPortraitScreen ? '48%' : '56%',
                                                     maxHeight: isPortraitScreen ? '82%' : '88%',
                                                    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8)',
                                                    /* fontSize: '11px' */
                                                }}
                                            >
                                                {/* Elegant corners for a premium feel inside preview */}
                                                 <div className="absolute top-1.5 left-1.5 w-3 h-3 border-t-2 border-l-2 border-teal-400 opacity-90 rounded-tl"></div>
                                                 <div className="absolute top-1.5 right-1.5 w-3 h-3 border-t-2 border-r-2 border-teal-400 opacity-90 rounded-tr"></div>
                                                 <div className="absolute bottom-1.5 left-1.5 w-3 h-3 border-b-2 border-l-2 border-teal-400 opacity-90 rounded-bl"></div>
                                                 <div className="absolute bottom-1.5 right-1.5 w-3 h-3 border-b-2 border-r-2 border-teal-400 opacity-90 rounded-br"></div>

                                                 {/* Header & Title */}
                                                <div>
                                                    <span className="text-[10px] text-teal-400 font-extrabold uppercase tracking-widest block pb-0.5">
                                                        {selectedTagIds.length > 0 && organization.tags 
                                                            ? (organization.tags.find(t => selectedTagIds.includes(t.id))?.name || 'INFO') 
                                                            : (organization.name || 'ANNONS')}
                                                    </span>
                                                    <h3 className="text-white font-extrabold tracking-normal leading-tight uppercase line-clamp-2 mt-1.5" style={{ fontSize: isPortraitScreen ? '14px' : '16px' }}>
                                                        {headline.trim() || 'RUBRIK SKRIVS HÄR'}
                                                    </h3>
                                                </div>

                                                {/* Divider */}
                                                <div className="w-16 h-[1.5px] bg-gradient-to-r from-transparent via-white/30 to-transparent mx-auto my-1.5" />

                                                {/* Body */}
                                                <div className="flex-1 flex items-center justify-center overflow-hidden py-1.5">
                                                    <p className="text-slate-100 leading-relaxed line-clamp-6 whitespace-pre-wrap font-medium" style={{ fontSize: isPortraitScreen ? '12px' : '13px' }}>
                                                        {description.trim() || 'Skanna QR-koden för specifikationer, pris samt att läsa mer på vår sida.'}
                                                    </p>
                                                </div>

                                                {/* Divider */}
                                                <div className="w-16 h-[1.5px] bg-gradient-to-r from-transparent via-white/20 to-transparent mx-auto my-1.5" />

                                                {/* Footer QR mock or Organization text */}
                                                <div className="flex flex-col items-center justify-center">
                                                    {webpageUrl ? (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <div className="w-10 h-10 bg-white p-1 rounded-md flex items-center justify-center shadow-lg">
                                                                <div className="w-full h-full bg-slate-900 flex items-center justify-center rounded-sm"><span className="text-[6px] text-teal-400 font-mono font-bold">QR</span></div>
                                                            </div>
                                                            <span className="text-[8px] text-teal-400 font-semibold truncate max-w-[120px] mt-0.5 font-mono">
                                                                {webpageUrl.replace('https://', '').replace('http://', '').replace('www.', '')}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[12px] text-teal-300 uppercase tracking-widest block font-serif font-black">
                                                            {organization.name}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* LIVE DRAFT STATE TAGS OVERLAY inside preview */}
                                    {layout !== 'real-estate' && organization.tags && organization.tags.length > 0 && selectedTagIds.length > 0 && (
                                        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-40 pointer-events-none">
                                            {organization.tags.filter(t => selectedTagIds.includes(t.id)).map(tag => (
                                                <SimulatedTag key={tag.id} tag={tag} />
                                            ))}
                                        </div>
                                    )}

                                    {/* LIVE QR-CODE OVERLAY inside preview */}
                                    {layout !== 'real-estate' && webpageUrl.trim() && (
                                        <div 
                                            className="absolute" 
                                            style={{
                                                right: isPortraitScreen ? '24px' : '16px',
                                                bottom: isPortraitScreen ? '24px' : '16px',
                                                transform: 'scale(1)',
                                                zIndex: 35
                                            }}
                                        >
                                            <QrCodePreview url={webpageUrl.trim()} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Active posts quick list */}
                    <Card
                        title={`Aktiva i kanalen (${activeExpressPosts.length})`}
                        subTitle="Markera objekt som sålda eller ta bort direkt"
                    >
                        <div className="space-y-4">
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
                    </Card>
                </div>
            </div>
        </div>
    );
};
