
import React, { useState, useRef } from 'react';
import { Organization, MediaItem } from '../../types';
import { uploadMediaForGallery } from '../../services/firebaseService';
import { Card } from '../Card';
import { PrimaryButton } from '../Buttons';
import { useToast } from '../../context/ToastContext';
import { PhotoIcon, VideoCameraIcon, TrashIcon, MagnifyingGlassIcon, SparklesIcon, ExclamationTriangleIcon } from '../icons';
import { ConfirmDialog } from '../ConfirmDialog';

interface MediaGalleryTabProps {
    organization: Organization;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
}

export const MediaGalleryTab: React.FC<MediaGalleryTabProps> = ({ organization, onUpdateOrganization }) => {
    const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
    const [isUploading, setIsUploading] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);
    const [brokenMediaIds, setBrokenMediaIds] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useToast();

    const mediaLibrary = organization.mediaLibrary || [];

    const filteredMedia = mediaLibrary.filter(item => {
        if (filter === 'all') return true;
        return item.type === filter;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        
        // Simple client-side validation
        if (file.size > 20 * 1024 * 1024) { // 20MB limit
             showToast({ message: "Filen är för stor (max 20MB).", type: 'error' });
             return;
        }

        setIsUploading(true);
        try {
            const { url } = await uploadMediaForGallery(organization.id, file, (progress) => {
                console.log(`Upload progress: ${progress}%`);
            });

            const newItem: MediaItem = {
                id: `media-${Date.now()}`,
                type: file.type.startsWith('video/') ? 'video' : 'image',
                url,
                internalTitle: file.name,
                createdAt: new Date().toISOString(),
                createdBy: 'user',
                sizeBytes: file.size
            };

            const updatedLibrary = [newItem, ...mediaLibrary];
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
            showToast({ message: "Filen har laddats upp!", type: 'success' });
        } catch (error) {
            console.error("Upload failed:", error);
            showToast({ message: `Uppladdning misslyckades: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async () => {
        if (!itemToDelete) return;
        
        const updatedLibrary = mediaLibrary.filter(item => item.id !== itemToDelete.id);
        try {
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
            showToast({ message: "Filen togs bort från biblioteket.", type: 'success' });
        } catch (error) {
            showToast({ message: "Kunde inte ta bort filen.", type: 'error' });
        } finally {
            setItemToDelete(null);
        }
    };

    const handleMediaError = (id: string) => {
        setBrokenMediaIds(prev => new Set(prev).add(id));
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <Card 
                title={`Mediabibliotek (${mediaLibrary.length})`} 
                subTitle="Ladda upp och hantera bilder och videos som du vill använda i dina inlägg."
                actions={
                    <PrimaryButton onClick={() => fileInputRef.current?.click()} loading={isUploading}>
                        Ladda upp
                    </PrimaryButton>
                }
            >
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    className="hidden" 
                    accept="image/*,video/*" 
                />

                {/* Filter Tabs */}
                <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 pb-4 mb-6">
                    <button 
                        onClick={() => setFilter('all')} 
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filter === 'all' ? 'bg-slate-100 dark:bg-slate-700 text-primary' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        Alla
                    </button>
                    <button 
                        onClick={() => setFilter('image')} 
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${filter === 'image' ? 'bg-slate-100 dark:bg-slate-700 text-primary' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        <PhotoIcon className="w-4 h-4"/> Bilder
                    </button>
                    <button 
                        onClick={() => setFilter('video')} 
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${filter === 'video' ? 'bg-slate-100 dark:bg-slate-700 text-primary' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        <VideoCameraIcon className="w-4 h-4"/> Video
                    </button>
                </div>

                {/* Gallery Grid */}
                {filteredMedia.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {filteredMedia.map((item) => {
                            const isBroken = brokenMediaIds.has(item.id);
                            return (
                                <div key={item.id} className="group relative aspect-square bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all">
                                    {isBroken ? (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-2 bg-slate-200 dark:bg-slate-800">
                                            <ExclamationTriangleIcon className="w-8 h-8 mb-1" />
                                            <span className="text-[10px] text-center">Filen saknas eller är trasig</span>
                                        </div>
                                    ) : (
                                        item.type === 'image' ? (
                                            <img 
                                                src={item.url} 
                                                alt={item.internalTitle} 
                                                className="w-full h-full object-cover" 
                                                loading="lazy" 
                                                onError={() => handleMediaError(item.id)}
                                            />
                                        ) : (
                                            <video 
                                                src={item.url} 
                                                className="w-full h-full object-cover" 
                                                muted 
                                                loop 
                                                onMouseOver={e => e.currentTarget.play().catch(() => {})} 
                                                onMouseOut={e => e.currentTarget.pause()}
                                                onError={() => handleMediaError(item.id)}
                                            />
                                        )
                                    )}
                                    
                                    {/* Type Badge */}
                                    <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full">
                                        {item.type === 'image' ? 'BILD' : 'VIDEO'}
                                    </div>
                                    {item.createdBy === 'ai' && (
                                        <div className="absolute top-2 left-2 bg-purple-500/80 backdrop-blur-sm text-white p-1 rounded-full" title="Skapad av AI">
                                            <SparklesIcon className="w-3 h-3" />
                                        </div>
                                    )}

                                    {/* Overlay Actions */}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                                        <p className="text-white text-xs font-semibold text-center line-clamp-2 px-1 mb-2 break-all">
                                            {item.internalTitle}
                                        </p>
                                        <div className="flex gap-2">
                                            {!isBroken && (
                                                <a 
                                                    href={item.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-sm transition-colors"
                                                    title="Visa fullstorlek"
                                                >
                                                    <MagnifyingGlassIcon className="w-4 h-4" />
                                                </a>
                                            )}
                                            <button 
                                                onClick={() => setItemToDelete(item)}
                                                className="p-2 bg-red-500/80 hover:bg-red-600 text-white rounded-full backdrop-blur-sm transition-colors"
                                                title="Ta bort"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700">
                        <div className="flex justify-center mb-3 text-slate-300 dark:text-slate-600">
                            <PhotoIcon className="w-12 h-12" />
                        </div>
                        <h4 className="text-lg font-semibold text-slate-600 dark:text-slate-300">Här var det tomt</h4>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">
                            {filter === 'all' 
                                ? "Ladda upp bilder eller videoklipp för att komma igång." 
                                : `Inga ${filter === 'image' ? 'bilder' : 'videoklipp'} hittades.`}
                        </p>
                    </div>
                )}
            </Card>

            <ConfirmDialog
                isOpen={!!itemToDelete}
                onClose={() => setItemToDelete(null)}
                onConfirm={handleDelete}
                title="Ta bort fil"
                confirmText="Ta bort"
                variant="destructive"
            >
                <p>Är du säker på att du vill ta bort filen "{itemToDelete?.internalTitle}"?</p>
                <p className="text-sm text-slate-500 mt-2">Observera: Om filen används i publicerade inlägg kommer de att sluta fungera korrekt.</p>
            </ConfirmDialog>
        </div>
    );
};
