
import React, { useState, useRef, useMemo } from 'react';
import { Organization, MediaItem } from '../../types';
import { uploadMediaForGallery } from '../../services/firebaseService';
import { Card } from '../Card';
import { PrimaryButton, SecondaryButton, DestructiveButton } from '../Buttons';
import { useToast } from '../../context/ToastContext';
import { PhotoIcon, VideoCameraIcon, TrashIcon, MagnifyingGlassIcon, SparklesIcon, ExclamationTriangleIcon, CheckCircleIcon, XCircleIcon } from '../icons';
import { ConfirmDialog } from '../ConfirmDialog';
import { StyledInput } from '../Forms';

interface MediaGalleryTabProps {
    organization: Organization;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
}

export const MediaGalleryTab: React.FC<MediaGalleryTabProps> = ({ organization, onUpdateOrganization }) => {
    const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [visibleCount, setVisibleCount] = useState(12);
    
    const [isUploading, setIsUploading] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);
    
    // Multi-select states
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

    const [brokenMediaIds, setBrokenMediaIds] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useToast();

    const mediaLibrary = organization.mediaLibrary || [];

    // Filter and Sort Logic
    const filteredMedia = useMemo(() => {
        return mediaLibrary.filter(item => {
            const matchesType = filter === 'all' || item.type === filter;
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch = !searchQuery || 
                (item.internalTitle && item.internalTitle.toLowerCase().includes(searchLower)) ||
                (item.aiPrompt && item.aiPrompt.toLowerCase().includes(searchLower));
            
            return matchesType && matchesSearch;
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [mediaLibrary, filter, searchQuery]);

    // Pagination Logic
    const visibleMedia = filteredMedia.slice(0, visibleCount);
    const hasMore = visibleMedia.length < filteredMedia.length;

    const handleLoadMore = () => {
        setVisibleCount(prev => prev + 12);
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        setVisibleCount(12); // Reset pagination on search
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        
        // Hantera multipla filer om det skulle behövas i framtiden, men nu tar vi första
        // (input saknar 'multiple' attributet i nuvarande render)
        const file = e.target.files[0];
        
        if (file.size > 20 * 1024 * 1024) {
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

    const handleDeleteSingle = async () => {
        if (!itemToDelete) return;
        
        const updatedLibrary = mediaLibrary.filter(item => item.id !== itemToDelete.id);
        try {
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
            showToast({ message: "Filen togs bort.", type: 'success' });
        } catch (error) {
            showToast({ message: "Kunde inte ta bort filen.", type: 'error' });
        } finally {
            setItemToDelete(null);
        }
    };

    const handleToggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        setIsBulkDeleting(true);
        
        const updatedLibrary = mediaLibrary.filter(item => !selectedIds.has(item.id));
        try {
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
            showToast({ message: `${selectedIds.size} filer togs bort.`, type: 'success' });
            setSelectedIds(new Set());
            setIsSelectionMode(false);
        } catch (error) {
            showToast({ message: "Kunde inte ta bort filerna.", type: 'error' });
        } finally {
            setIsBulkDeleting(false);
            setShowBulkDeleteConfirm(false);
        }
    };

    const toggleSelectionMode = () => {
        if (isSelectionMode) {
            // Cancel selection
            setIsSelectionMode(false);
            setSelectedIds(new Set());
        } else {
            setIsSelectionMode(true);
        }
    };

    const handleMediaError = (id: string) => {
        setBrokenMediaIds(prev => new Set(prev).add(id));
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <Card 
                title={
                    <div className="flex items-center gap-2">
                        <span>Mediabibliotek</span>
                        <span className="text-sm font-normal text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                            {filteredMedia.length}
                        </span>
                    </div>
                }
                subTitle="Ladda upp och hantera bilder och videos för dina inlägg."
            >
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    className="hidden" 
                    accept="image/*,video/*" 
                />

                {/* Toolbar */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                    {/* Left: Search & Filter */}
                    <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                        <div className="relative w-full sm:w-64">
                            <input
                                type="text"
                                placeholder="Sök..."
                                value={searchQuery}
                                onChange={handleSearchChange}
                                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:outline-none transition-shadow"
                            />
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        </div>
                        
                        <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg self-start sm:self-auto">
                            <button 
                                onClick={() => setFilter('all')} 
                                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${filter === 'all' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                Alla
                            </button>
                            <button 
                                onClick={() => setFilter('image')} 
                                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${filter === 'image' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                <PhotoIcon className="w-3 h-3"/> Bilder
                            </button>
                            <button 
                                onClick={() => setFilter('video')} 
                                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${filter === 'video' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                <VideoCameraIcon className="w-3 h-3"/> Video
                            </button>
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
                        {isSelectionMode ? (
                            <div className="flex items-center gap-2 bg-purple-50 dark:bg-purple-900/20 px-3 py-1.5 rounded-lg border border-purple-100 dark:border-purple-800/50 animate-fade-in">
                                <span className="text-sm font-semibold text-purple-700 dark:text-purple-300 mr-2">
                                    {selectedIds.size} valda
                                </span>
                                {selectedIds.size > 0 && (
                                    <button 
                                        onClick={() => setShowBulkDeleteConfirm(true)}
                                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                                        title="Radera valda"
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                )}
                                <div className="w-px h-4 bg-purple-200 dark:bg-purple-700 mx-1"></div>
                                <button 
                                    onClick={toggleSelectionMode}
                                    className="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200"
                                    title="Avbryt markering"
                                >
                                    <XCircleIcon className="w-5 h-5" />
                                </button>
                            </div>
                        ) : (
                            <SecondaryButton onClick={toggleSelectionMode} disabled={mediaLibrary.length === 0}>
                                Välj
                            </SecondaryButton>
                        )}
                        
                        <PrimaryButton onClick={() => fileInputRef.current?.click()} loading={isUploading} className={isSelectionMode ? 'hidden sm:flex' : ''}>
                            Ladda upp
                        </PrimaryButton>
                    </div>
                </div>

                {/* Gallery Grid */}
                {visibleMedia.length > 0 ? (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {visibleMedia.map((item) => {
                                const isBroken = brokenMediaIds.has(item.id);
                                const isSelected = selectedIds.has(item.id);
                                
                                return (
                                    <div 
                                        key={item.id} 
                                        className={`group relative aspect-square bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden border transition-all cursor-pointer ${
                                            isSelected 
                                                ? 'border-purple-500 ring-2 ring-purple-500 shadow-md' 
                                                : 'border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md'
                                        }`}
                                        onClick={() => {
                                            if (isSelectionMode) {
                                                handleToggleSelection(item.id);
                                            }
                                        }}
                                    >
                                        {isBroken ? (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-2 bg-slate-200 dark:bg-slate-800">
                                                <ExclamationTriangleIcon className="w-8 h-8 mb-1" />
                                                <span className="text-[10px] text-center">Filen saknas</span>
                                            </div>
                                        ) : (
                                            item.type === 'image' ? (
                                                <img 
                                                    src={item.url} 
                                                    alt={item.internalTitle} 
                                                    className={`w-full h-full object-cover transition-transform duration-500 ${isSelected ? 'scale-90' : 'group-hover:scale-105'}`}
                                                    loading="lazy" 
                                                    onError={() => handleMediaError(item.id)}
                                                />
                                            ) : (
                                                <video 
                                                    src={item.url} 
                                                    className={`w-full h-full object-cover transition-transform duration-500 ${isSelected ? 'scale-90' : 'group-hover:scale-105'}`}
                                                    muted 
                                                    loop 
                                                    onMouseOver={e => !isSelectionMode && e.currentTarget.play().catch(() => {})} 
                                                    onMouseOut={e => !isSelectionMode && e.currentTarget.pause()}
                                                    onError={() => handleMediaError(item.id)}
                                                />
                                            )
                                        )}
                                        
                                        {/* Selection Checkbox (Visible in selection mode OR hover) */}
                                        <div className={`absolute top-2 left-2 z-20 transition-opacity ${isSelectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                            <div 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!isSelectionMode) setIsSelectionMode(true);
                                                    handleToggleSelection(item.id);
                                                }}
                                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center cursor-pointer shadow-sm transition-colors ${
                                                    isSelected 
                                                        ? 'bg-purple-500 border-purple-500 text-white' 
                                                        : 'bg-white/80 border-slate-300 hover:border-purple-400 hover:bg-white'
                                                }`}
                                            >
                                                {isSelected && <CheckCircleIcon className="w-4 h-4" />}
                                            </div>
                                        </div>

                                        {/* Type Badge */}
                                        <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full pointer-events-none">
                                            {item.type === 'image' ? 'BILD' : 'VIDEO'}
                                        </div>
                                        
                                        {item.createdBy === 'ai' && (
                                            <div className="absolute bottom-2 left-2 bg-purple-500/80 backdrop-blur-sm text-white p-1 rounded-full pointer-events-none" title="Skapad av AI">
                                                <SparklesIcon className="w-3 h-3" />
                                            </div>
                                        )}

                                        {/* Overlay Actions (Only when NOT in selection mode) */}
                                        {!isSelectionMode && (
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2 pointer-events-none">
                                                <div className="pointer-events-auto flex flex-col items-center gap-2">
                                                    <p className="text-white text-xs font-semibold text-center line-clamp-2 px-1 mb-1 break-all">
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
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <MagnifyingGlassIcon className="w-4 h-4" />
                                                            </a>
                                                        )}
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); setItemToDelete(item); }}
                                                            className="p-2 bg-red-500/80 hover:bg-red-600 text-white rounded-full backdrop-blur-sm transition-colors"
                                                            title="Ta bort"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        
                        {/* Load More Button */}
                        {hasMore && (
                            <div className="flex justify-center mt-6">
                                <SecondaryButton onClick={handleLoadMore}>
                                    Visa fler
                                </SecondaryButton>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700">
                        <div className="flex justify-center mb-3 text-slate-300 dark:text-slate-600">
                            {searchQuery ? <MagnifyingGlassIcon className="w-12 h-12" /> : <PhotoIcon className="w-12 h-12" />}
                        </div>
                        <h4 className="text-lg font-semibold text-slate-600 dark:text-slate-300">
                            {searchQuery ? "Inga träffar" : "Här var det tomt"}
                        </h4>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                            {searchQuery 
                                ? `Inga filer matchade "${searchQuery}"`
                                : filter === 'all' 
                                    ? "Ladda upp bilder eller videoklipp för att komma igång." 
                                    : `Inga ${filter === 'image' ? 'bilder' : 'videoklipp'} hittades.`}
                        </p>
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                className="mt-4 text-primary hover:underline text-sm font-medium"
                            >
                                Rensa sökning
                            </button>
                        )}
                    </div>
                )}
            </Card>

            {/* Single Delete Dialog */}
            <ConfirmDialog
                isOpen={!!itemToDelete}
                onClose={() => setItemToDelete(null)}
                onConfirm={handleDeleteSingle}
                title="Ta bort fil"
                confirmText="Ta bort"
                variant="destructive"
            >
                <p>Är du säker på att du vill ta bort filen "{itemToDelete?.internalTitle}"?</p>
                <p className="text-sm text-slate-500 mt-2">Observera: Om filen används i publicerade inlägg kommer de att sluta fungera korrekt.</p>
            </ConfirmDialog>

            {/* Bulk Delete Dialog */}
            <ConfirmDialog
                isOpen={showBulkDeleteConfirm}
                onClose={() => setShowBulkDeleteConfirm(false)}
                onConfirm={handleBulkDelete}
                title={`Ta bort ${selectedIds.size} filer?`}
                confirmText="Ta bort alla"
                variant="destructive"
            >
                <p>Är du säker på att du vill ta bort {selectedIds.size} markerade filer?</p>
                <p className="text-sm text-slate-500 mt-2">Detta går inte att ångra. Inlägg som använder dessa filer kan sluta fungera.</p>
            </ConfirmDialog>
        </div>
    );
};
