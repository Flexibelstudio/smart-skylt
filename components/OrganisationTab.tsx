
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Organization, DisplayPost, UserData, Tag, PostTemplate, DisplayScreen, PreferenceProfile, PreferenceMediaItem, StyleProfile } from '../types';
import { Card } from './Card';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from './ConfirmDialog';
import { PrimaryButton, SecondaryButton, DestructiveButton } from './Buttons';
import { StyledInput, StyledSelect, FontSelector } from './Forms';
import { ChevronDownIcon, PencilIcon, TrashIcon, FacebookIcon, SparklesIcon, HandThumbUpIcon, HandThumbDownIcon, UserCircleIcon, UsersIcon, ChatBubbleLeftRightIcon, PaintBrushIcon, MegaphoneIcon, LinkIcon, LoadingSpinnerIcon } from './icons';
import QRCode from 'qrcode';
import { DisplayPostRenderer } from './DisplayPostRenderer';
import { uploadMediaForGallery } from '../services/firebaseService';
import { generateDnaAnalysis, analyzeWebsiteContent, generateTagOrStampWithAi } from '../services/geminiService';

interface SuperAdminScreenProps {
    organization: Organization;
    onUpdateLogos: (organizationId: string, logos: { light: string; dark: string }) => Promise<void>;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
    onUpdateDisplayScreens: (organizationId: string, displayScreens: DisplayScreen[]) => Promise<void>;
    onUpdateTags: (organizationId: string, tags: Tag[]) => Promise<void>;
    onUpdatePostTemplates: (organizationId: string, templates: PostTemplate[]) => Promise<void>;
}

// --- Helper functions for Tag Styling (mirrors DisplayPostRenderer) ---
const getTagFontSizeClass = (size?: Tag['fontSize'], isPreview: boolean = false) => {
    switch (size) {
        case 'sm': return 'text-xs';
        case 'md': return isPreview ? 'text-xs' : 'text-sm';
        case 'lg': return isPreview ? 'text-sm' : 'text-base';
        case 'xl': return isPreview ? 'text-base' : 'text-lg';
        case '2xl': return isPreview ? 'text-lg' : 'text-xl';
        case '3xl': return isPreview ? 'text-xl' : 'text-2xl';
        case '4xl': return isPreview ? 'text-2xl' : 'text-3xl';
        case '5xl': return isPreview ? 'text-3xl' : 'text-4xl';
        default: return isPreview ? 'text-xs' : 'text-sm';
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
        case 'glow': return 'animate-glow-tag';
        default: return '';
    }
};

const resizeImage = (file: File, maxWidth: number, maxHeight: number, quality: number = 0.9): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round(width * (maxHeight / height));
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                URL.revokeObjectURL(img.src);
                return reject(new Error('Could not get canvas context'));
            }
            
            const mimeType = 'image/png';
            
            ctx.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL(mimeType);
            URL.revokeObjectURL(img.src);
            resolve(dataUrl);
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(img.src);
            console.error("Image could not be loaded for resizing.", err);
            reject(new Error('Image could not be loaded for resizing'));
        };
    });
};

const ImageUploader: React.FC<{
  label: string;
  imageUrl?: string;
  onImageChange: (url: string) => void;
  isSaving: boolean;
}> = ({ label, imageUrl, onImageChange, isSaving }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const handleFile = async (file: File | null) => {
    if (file && file.type.startsWith('image/')) {
        try {
            const resizedImage = await resizeImage(file, 512, 512, 0.9);
            onImageChange(resizedImage);
        } catch (error) {
            console.error("Image resizing failed:", error);
            showToast({ message: "Bilden kunde inte förminskas.", type: 'error'});
        }
    }
  };

  const handleRemoveImage = () => { onImageChange(''); };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {imageUrl ? (
        <div className="relative group w-48 h-24 flex items-center justify-center bg-slate-100 dark:bg-slate-900/50 rounded-lg">
          <img src={imageUrl} alt="Förhandsvisning" className="max-w-full max-h-full object-contain p-2" />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
            <button onClick={handleRemoveImage} disabled={isSaving} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-full shadow-lg">
              Ta bort
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center p-4 w-48 h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors border-slate-300 dark:border-slate-600 hover:border-primary hover:bg-slate-50 dark:hover:bg-slate-700/50`}
        >
          <input type="file" ref={fileInputRef} onChange={(e) => handleFile(e.target.files?.[0] || null)} accept="image/*" className="hidden" disabled={isSaving}/>
          <div className="text-center text-slate-500 dark:text-slate-400">
             <p className="font-semibold text-sm">Välj en bild</p>
          </div>
        </div>
      )}
    </div>
  );
};

const QrCodePreview: React.FC<{ url: string }> = ({ url }) => {
    const [dataUrl, setDataUrl] = useState('');
    useEffect(() => {
        if (url) {
            QRCode.toDataURL(url, { width: 48, margin: 1 })
                .then(setDataUrl)
                .catch(console.error);
        } else {
            setDataUrl('');
        }
    }, [url]);
    if (!dataUrl) return null;
    return <img src={dataUrl} alt="QR Preview" className="w-10 h-10" />;
};

const OptionalColorPicker: React.FC<{
  label: string;
  color: string | undefined;
  onChange: (color: string | undefined) => void;
  defaultColor: string;
}> = ({ label, color, onChange, defaultColor }) => {
  if (color === undefined) {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
        <div className="flex items-center justify-center h-12 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600">
          <PrimaryButton onClick={() => onChange(defaultColor)} className="py-1 px-3 text-sm">
            Aktivera
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input 
            type="color" 
            value={color} 
            onChange={e => onChange(e.target.value)} 
            className="w-12 h-12 p-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
        />
        <StyledInput 
            type="text" 
            value={color} 
            onChange={e => onChange(e.target.value)} 
            className="font-mono h-12"
        />
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="h-12 w-12 flex-shrink-0 flex items-center justify-center bg-slate-200 hover:bg-red-100 dark:bg-slate-700 dark:hover:bg-red-900/50 rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          title="Ta bort färg"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

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

const PreferenceProfileManager: React.FC<{
    organization: Organization;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
}> = ({ organization, onUpdateOrganization }) => {
    const [profile, setProfile] = useState<PreferenceProfile>(organization.preferenceProfile || {});
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setProfile(organization.preferenceProfile || {});
    }, [organization.preferenceProfile]);

    const isDirty = useMemo(() => {
        return JSON.stringify(profile) !== JSON.stringify(organization.preferenceProfile || {});
    }, [profile, organization.preferenceProfile]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onUpdateOrganization(organization.id, { preferenceProfile: profile });
            showToast({ message: "AI-profilen har sparats.", type: 'success' });
        } catch (e) {
            showToast({ message: "Kunde inte spara profilen.", type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;
        setIsSaving(true);
        
        try {
            const uploadedItems: PreferenceMediaItem[] = [];
            for (const file of files) {
                if (file instanceof File) {
                    const { url } = await uploadMediaForGallery(organization.id, file, () => {});
                    uploadedItems.push({
                        id: `pref-media-${Date.now()}-${Math.random()}`,
                        url,
                        type: 'image'
                    });
                }
            }
            setProfile(p => ({ ...p, mediaItems: [...(p.mediaItems || []), ...uploadedItems] }));
            showToast({ message: `${files.length} bild(er) har lagts till.`, type: 'info' });
        } catch (error) {
            showToast({ message: `Kunde inte ladda upp media: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsSaving(false);
            if(fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleRemoveMedia = (id: string) => {
        setProfile(p => ({ ...p, mediaItems: (p.mediaItems || []).filter(item => item.id !== id) }));
    };

    const handleTextSnippetChange = (index: number, value: string) => {
        const newSnippets = [...(profile.textSnippets || [])];
        newSnippets[index] = value;
        setProfile(p => ({ ...p, textSnippets: newSnippets }));
    };

    const handleAddSnippet = () => {
        setProfile(p => ({ ...p, textSnippets: [...(p.textSnippets || []), ''] }));
    };

    const handleRemoveSnippet = (index: number) => {
        setProfile(p => ({ ...p, textSnippets: (p.textSnippets || []).filter((_, i) => i !== index) }));
    };

    const handleUspChange = (index: number, value: string) => {
        const newUsps = [...(profile.usps || [])];
        newUsps[index] = value;
        setProfile(p => ({ ...p, usps: newUsps }));
    };

    const handleAddUsp = () => {
        setProfile(p => ({ ...p, usps: [...(p.usps || []), ''] }));
    };

    const handleRemoveUsp = (index: number) => {
        setProfile(p => ({ ...p, usps: (p.usps || []).filter((_, i) => i !== index) }));
    };

    return (
        <div className="space-y-6">
            <div>
                <h4 className="font-semibold text-lg mb-2">Visuellt Referensmaterial</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Ladda upp logotyper, inspirationsbilder, bilder på lokalen eller tidigare kampanjer. AI:n kommer att använda dessa som visuell inspiration.</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {(profile.mediaItems || []).map(item => (
                        <div key={item.id} className="relative group aspect-square">
                            <img src={item.url} alt="Referensbild" className="w-full h-full object-cover rounded-md border border-slate-300 dark:border-slate-600"/>
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button onClick={() => handleRemoveMedia(item.id)} className="bg-red-600 text-white p-2 rounded-full"><TrashIcon className="h-4 w-4"/></button>
                            </div>
                        </div>
                    ))}
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-square flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer transition-colors border-slate-300 dark:border-slate-600 hover:border-primary hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-400 hover:text-primary"
                    >
                        <span className="text-3xl">+</span>
                        <span className="text-xs font-semibold">Lägg till</span>
                    </div>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*" className="hidden"/>
            </div>
            
            <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                <h4 className="font-semibold text-lg mb-2">Målgrupp</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Vilka riktar ni er till? Beskriv er idealkund (t.ex. "Barnfamiljer i närområdet", "Företag som behöver IT-support", "Hälsomedvetna unga vuxna").</p>
                <StyledInput 
                    value={profile.targetAudience || ''} 
                    onChange={e => setProfile(p => ({ ...p, targetAudience: e.target.value }))} 
                    placeholder="T.ex. Barnfamiljer i närområdet"
                />
            </div>

            <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                <h4 className="font-semibold text-lg mb-2">Unika Säljargument (USPs)</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Vad gör er unika? Varför ska kunden välja er? (t.ex. "Öppet dygnet runt", "Svensktillverkat", "Prisgaranti").</p>
                <div className="space-y-2">
                    {(profile.usps || []).map((usp, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <StyledInput value={usp} onChange={e => handleUspChange(index, e.target.value)} placeholder="T.ex. 'Alltid fri frakt'"/>
                            <button onClick={() => handleRemoveUsp(index)} className="p-2 rounded-full text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-red-500"><TrashIcon className="h-5 w-5"/></button>
                        </div>
                    ))}
                    <PrimaryButton onClick={handleAddUsp}>Lägg till USP</PrimaryButton>
                </div>
            </div>

            <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                <h4 className="font-semibold text-lg mb-2">Tonalitet & Språk</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Klistra in några korta text-exempel som representerar er röst. Det kan vara slogans, värdeord eller text från er hemsida.</p>
                <div className="space-y-2">
                    {(profile.textSnippets || []).map((snippet, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <StyledInput value={snippet} onChange={e => handleTextSnippetChange(index, e.target.value)} placeholder="T.ex. 'Kvalitet i varje detalj'"/>
                            <button onClick={() => handleRemoveSnippet(index)} className="p-2 rounded-full text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-red-500"><TrashIcon className="h-5 w-5"/></button>
                        </div>
                    ))}
                    <PrimaryButton onClick={handleAddSnippet}>Lägg till textrad</PrimaryButton>
                </div>
            </div>

            <div className="flex justify-end mt-4">
                <PrimaryButton onClick={handleSave} disabled={!isDirty || isSaving} loading={isSaving}>Spara AI-profil</PrimaryButton>
            </div>
        </div>
    );
};

const DnaAnalysisManager: React.FC<{
    organization: Organization;
    onUpdateOrganization: (orgId: string, data: Partial<Organization>) => Promise<void>;
}> = ({ organization, onUpdateOrganization }) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedProfile, setEditedProfile] = useState<Partial<StyleProfile>>({});
    const { showToast } = useToast();

    const analysis = organization.styleProfile;

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const newAnalysis = await generateDnaAnalysis(organization);
            await onUpdateOrganization(organization.id, { styleProfile: { ...analysis, ...newAnalysis } });
            showToast({ message: "DNA-analys har genererat en helt ny profil!", type: 'success' });
        } catch (error) {
            showToast({ message: `Kunde inte generera analys: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleFeedback = async (feedback: 'positive' | 'negative') => {
        if (!analysis) return;
        await onUpdateOrganization(organization.id, { styleProfile: { ...analysis, feedback } });
        showToast({ message: "Tack för din feedback! Detta hjälper oss att finslipa innehållsroboten.", type: 'info' });
    };
    
    const handleStartEdit = () => {
        setEditedProfile(analysis || {});
        setIsEditing(true);
    };

    const handleSaveEdit = async () => {
        await onUpdateOrganization(organization.id, { styleProfile: { ...analysis, ...editedProfile, lastUpdatedAt: new Date().toISOString() } });
        setIsEditing(false);
        showToast({ message: "Ditt varumärkes-DNA har uppdaterats.", type: 'success' });
    };
    
    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditedProfile({});
    };

    const handleFieldChange = (field: keyof StyleProfile, value: string) => {
        setEditedProfile(prev => ({...prev, [field]: value}));
    };

    const analysisItems = [
        { key: 'brandPersonality', label: 'Varumärkespersonlighet', description: 'Hur ert företag kommunicerar, känslomässiga kopplingar och attityd.', icon: <UserCircleIcon className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />, badgeColor: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' },
        { key: 'targetAudience', label: 'Målgrupp', description: 'De ideala blickarna ni vill nå ut till samt vad som engagerar dem.', icon: <UsersIcon className="h-5 w-5 text-teal-500 dark:text-teal-400" />, badgeColor: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' },
        { key: 'coreMessage', label: 'Kärnbudskap', description: 'Stommen i er kommunikation. Huvudvärdet ni genererar.', icon: <ChatBubbleLeftRightIcon className="h-5 w-5 text-sky-500 dark:text-sky-400" />, badgeColor: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
        { key: 'visualStyle', label: 'Visuell Stil', description: 'Grafiskt manér, designkänsla, rymd och strukturer som AI:n strävar efter.', icon: <PaintBrushIcon className="h-5 w-5 text-rose-500 dark:text-rose-400" />, badgeColor: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
        { key: 'toneOfVoice', label: 'Tonalitet (Tone of Voice)', description: 'Ordet, melodin och känslan i era texter (t.ex. professionell, varm, skämtsam).', icon: <MegaphoneIcon className="h-5 w-5 text-amber-500 dark:text-amber-400" />, badgeColor: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-5 bg-gradient-to-r from-teal-500/10 via-indigo-500/5 to-transparent rounded-2xl border border-teal-500/20">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <SparklesIcon className="h-5 w-5 text-teal-500 animate-pulse" />
                        <h4 className="font-bold text-lg text-slate-800 dark:text-slate-100">Varumärkes-DNA</h4>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                        Låt generativ AI sammanfoga din verksamhetsbeskrivning, dina USPs och din hemsida till en unik DNA-profil. Detta fungerar som AI:ns designkompass för alla framtida annonser.
                    </p>
                </div>
                <PrimaryButton 
                    onClick={handleGenerate} 
                    loading={isGenerating}
                    className="shadow-md bg-teal-600 hover:bg-teal-500 transition-all font-semibold"
                >
                    {analysis?.lastUpdatedAt ? 'Uppdatera DNA-profil' : 'Bygg DNA-profil automatiskt'}
                </PrimaryButton>
            </div>
            
            {analysis?.lastUpdatedAt && (
                <div className="p-1 space-y-4">
                    {isEditing ? (
                        <div className="space-y-5 bg-slate-50 dark:bg-slate-900/40 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <h5 className="font-bold text-slate-800 dark:text-slate-100 text-sm tracking-tight border-b border-slate-200 dark:border-slate-800 pb-2">Redigera varumärkeskompass</h5>
                            <div className="grid grid-cols-1 gap-5">
                                {analysisItems.map(item => (
                                    <div key={item.key} className="space-y-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            {item.icon}
                                            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.label}</span>
                                        </div>
                                        <textarea
                                            rows={3}
                                            value={editedProfile[item.key as keyof StyleProfile] as string || ''}
                                            onChange={e => handleFieldChange(item.key as keyof StyleProfile, e.target.value)}
                                            className="w-full bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-teal-500 text-sm shadow-inner transition-colors"
                                            placeholder={`Specificera din ${item.label.toLowerCase()}...`}
                                        />
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                                <SecondaryButton onClick={handleCancelEdit}>Avbryt</SecondaryButton>
                                <PrimaryButton onClick={handleSaveEdit} className="bg-teal-600 hover:bg-teal-500">Spara ändringar</PrimaryButton>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {/* DNA Profile Bento-ish Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {analysisItems.map(item => (
                                    <div key={item.key} className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-2 rounded-lg ${item.badgeColor}`}>
                                                        {item.icon}
                                                    </div>
                                                    <h5 className="font-bold text-slate-800 dark:text-slate-200 tracking-tight text-sm">{item.label}</h5>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-400 dark:text-slate-500 italic mt-0.5 leading-relaxed">{item.description}</p>
                                            <div className="text-slate-600 dark:text-slate-300 text-sm whitespace-pre-wrap leading-relaxed pt-1 bg-slate-50/50 dark:bg-slate-950/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/40">
                                                {analysis[item.key as keyof StyleProfile] as string || 'Ingen data genererad. Klicka på "Uppdatera DNA-profil" ovan.'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                
                                {/* Info Box explaining how it works */}
                                <div className="p-5 bg-indigo-50/20 dark:bg-indigo-950/10 rounded-2xl border border-indigo-200/30 flex flex-col justify-center items-center text-center space-y-3">
                                    <SparklesIcon className="h-8 w-8 text-indigo-500 animate-pulse" />
                                    <div className="space-y-1">
                                        <h5 className="font-bold text-indigo-900 dark:text-indigo-300 text-sm">Högsta AI-precision</h5>
                                        <p className="text-xs text-indigo-700/80 dark:text-indigo-400/80 max-w-xs leading-relaxed">
                                            Dina angivna profilinställningar vägs samman med detta DNA varje gång du beställer material för att garantera ett äkta varumärkesspråk.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* DNA footer feedback and manual edit */}
                            <div className="pt-4 mt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                                <div className="flex items-center gap-3">
                                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Stämmer DNA-beskrivningen med din verklighet?</p>
                                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-full">
                                        <button 
                                            onClick={() => handleFeedback('positive')} 
                                            className={`p-1.5 rounded-full transition-colors ${analysis.feedback === 'positive' ? 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                                            title="Mycket träffsäker!"
                                        >
                                            <HandThumbUpIcon className="h-4 w-4"/>
                                        </button>
                                        <button 
                                            onClick={() => handleFeedback('negative')} 
                                            className={`p-1.5 rounded-full transition-colors ${analysis.feedback === 'negative' ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                                            title="Behöver justeras."
                                        >
                                            <HandThumbDownIcon className="h-4 w-4"/>
                                        </button>
                                    </div>
                                </div>
                                <SecondaryButton onClick={handleStartEdit} className="w-full sm:w-auto text-sm">
                                    <PencilIcon className="h-4 w-4 mr-2 text-slate-500" />
                                    Justera DNA-profilen manuellt
                                </SecondaryButton>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const WebsiteImporter: React.FC<{
    onImportSuccess: (data: any, url: string) => void;
    organization: Organization;
}> = ({ onImportSuccess, organization }) => {
    const [url, setUrl] = useState(organization.preferenceProfile?.websiteUrl || '');
    const [isLoading, setIsLoading] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        if (organization.preferenceProfile?.websiteUrl) {
            setUrl(organization.preferenceProfile.websiteUrl);
        }
    }, [organization.preferenceProfile?.websiteUrl]);

    const handleAnalyze = async () => {
        if (!url.trim()) return;
        
        let validUrl = url.trim();
        if (!validUrl.startsWith('http')) {
            validUrl = 'https://' + validUrl;
        }

        setIsLoading(true);
        try {
            const result = await analyzeWebsiteContent(validUrl);
            onImportSuccess(result, validUrl);
            showToast({ message: "Analys klar! Profilen har uppdaterats.", type: 'success' });
        } catch (error) {
            console.error("Website analysis failed:", error);
            showToast({ message: `Analysen misslyckades: ${error instanceof Error ? error.message : "Okänt fel"}`, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card title="Importera från hemsida" subTitle="Ange en länk till er hemsida eller sociala medier (t.ex. Instagram). Låt AI:n besöka sidan och automatiskt ställa in färger, typsnitt och varumärkesprofil.">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-grow w-full">
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Webbadress</label>
                    <div className="relative">
                        <StyledInput 
                            type="url" 
                            value={url} 
                            onChange={e => setUrl(e.target.value)} 
                            placeholder="t.ex. minhemsida.se" 
                            disabled={isLoading}
                            className="pl-10"
                        />
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                            <LinkIcon className="h-5 w-5" />
                        </div>
                    </div>
                </div>
                <PrimaryButton 
                    onClick={handleAnalyze} 
                    loading={isLoading} 
                    disabled={!url.trim() || isLoading}
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500"
                >
                    <SparklesIcon className="h-5 w-5 mr-2" />
                    Analysera
                </PrimaryButton>
            </div>
        </Card>
    );
};


const TagManager: React.FC<{
    tags: Tag[],
    onSave: (tag: Tag) => void,
    onDelete: (tag: Tag) => void,
    editingTag: Tag | null,
    setEditingTag: (tag: Tag | null) => void,
    organization: Organization;
}> = ({ tags, onSave, onDelete, editingTag, setEditingTag, organization }) => {
    
    const handleAddNew = () => {
        setEditingTag({
            id: `tag-${Date.now()}`,
            displayType: 'tag',
            text: '',
            backgroundColor: '#ef4444',
            textColor: '#FFFFFF',
            fontSize: 'md',
            fontFamily: 'display',
            fontWeight: 'black',
            animation: 'pulse',
            shape: 'rectangle',
            border: 'none',
            opacity: 1,
        });
    };
    
    return (
        <div className="space-y-4">
            {editingTag && (
                <TagEditor 
                    tag={editingTag}
                    onSave={onSave}
                    onCancel={() => setEditingTag(null)}
                    organization={organization}
                />
            )}
             {!editingTag && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {tags.map(tag => (
                            <div key={tag.id} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg flex justify-between items-center border border-slate-200 dark:border-slate-700">
                                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{tag.text}</span>
                                <div className="flex gap-1">
                                    <button onClick={() => setEditingTag(tag)} className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-primary"><PencilIcon className="h-4 w-4" /></button>
                                    <button onClick={() => onDelete(tag)} className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-red-500"><TrashIcon className="h-4 w-4" /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <PrimaryButton onClick={handleAddNew}>Skapa ny tagg/stämpel</PrimaryButton>
                </>
            )}
        </div>
    );
};

interface PostTemplateManagerProps {
    organization: Organization;
    onUpdatePostTemplates: (organizationId: string, templates: PostTemplate[]) => Promise<void>;
}

const PostTemplateManager: React.FC<PostTemplateManagerProps> = ({ organization, onUpdatePostTemplates }) => {
    const { showToast } = useToast();
    const [templateToDelete, setTemplateToDelete] = useState<PostTemplate | null>(null);

    const templates = organization.postTemplates || [];

    const handleDelete = (template: PostTemplate) => {
        setTemplateToDelete(template);
    };

    const confirmDelete = async () => {
        if (!templateToDelete) return;

        const updatedTemplates = templates.filter(t => t.id !== templateToDelete.id);
        try {
            await onUpdatePostTemplates(organization.id, updatedTemplates);
            showToast({ message: `Mallen "${templateToDelete.templateName}" togs bort.`, type: 'success' });
        } catch (error) {
            showToast({ message: "Kunde inte ta bort mallen.", type: 'error' });
        } finally {
            setTemplateToDelete(null);
        }
    };

    return (
        <div className="space-y-3">
            {templates.length > 0 ? (
                templates.map(template => {
                    const postForPreview: DisplayPost = {
                        id: template.id,
                        internalTitle: template.templateName,
                        ...template.postData
                    };
                    return (
                        <div key={template.id} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg flex items-center gap-3 border border-slate-200 dark:border-slate-700">
                            <div className="flex-shrink-0 w-24 h-14 bg-black rounded-md overflow-hidden">
                                <DisplayPostRenderer 
                                    post={postForPreview}
                                    mode="preview"
                                    allTags={organization.tags}
                                    showTags={false}
                                    organization={organization}
                                />
                            </div>
                            <div className="flex-grow">
                                <p className="font-semibold text-slate-900 dark:text-white">{template.templateName}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{template.postData.layout}</p>
                            </div>
                            <div className="flex gap-1">
                                {/* Edit button could be added here later */}
                                <DestructiveButton onClick={() => handleDelete(template)}>Ta bort</DestructiveButton>
                            </div>
                        </div>
                    )
                })
            ) : (
                <p className="text-slate-500 dark:text-slate-400 text-center py-4">Inga mallar har sparats än.</p>
            )}
             <ConfirmDialog
                isOpen={!!templateToDelete}
                onClose={() => setTemplateToDelete(null)}
                onConfirm={confirmDelete}
                title="Ta bort mall"
            >
               <p>Är du säker på att du vill ta bort mallen "{templateToDelete?.templateName}"? Detta kan inte ångras.</p>
            </ConfirmDialog>
        </div>
    );
};

export const OrganisationTab: React.FC<SuperAdminScreenProps> = (props) => {
    const { organization, onUpdateLogos, onUpdateTags, onUpdateDisplayScreens, onUpdateOrganization, onUpdatePostTemplates } = props;
    
    // States for Sub-navigation tabs
    const [activeSubTab, setActiveSubTab] = useState<'profile' | 'visual' | 'ai_dna' | 'tags'>('profile');

    const [logoLight, setLogoLight] = useState(organization.logoUrlLight || '');
    const [logoDark, setLogoDark] = useState(organization.logoUrlDark || '');
    const [primaryColor, setPrimaryColor] = useState(organization.primaryColor || '#14b8a6');
    const [secondaryColor, setSecondaryColor] = useState<string | undefined>(organization.secondaryColor);
    const [tertiaryColor, setTertiaryColor] = useState<string | undefined>(organization.tertiaryColor);
    const [accentColor, setAccentColor] = useState<string | undefined>(organization.accentColor);
    const [headlineFontFamily, setHeadlineFontFamily] = useState<Tag['fontFamily']>(organization.headlineFontFamily || 'display');
    const [bodyFontFamily, setBodyFontFamily] = useState<Tag['fontFamily']>(organization.bodyFontFamily || 'sans');
    const [businessType, setBusinessType] = useState<string[]>([]);
    const [otherBusinessType, setOtherBusinessType] = useState('');
    const [businessDescription, setBusinessDescription] = useState(organization.businessDescription || '');
    
    // States for preference profile (the Soul elements)
    const [targetAudience, setTargetAudience] = useState(organization.preferenceProfile?.targetAudience || '');
    const [usps, setUsps] = useState<string[]>(organization.preferenceProfile?.usps || []);
    const [textSnippets, setTextSnippets] = useState<string[]>(organization.preferenceProfile?.textSnippets || []);
    const [mediaItems, setMediaItems] = useState<PreferenceMediaItem[]>(organization.preferenceProfile?.mediaItems || []);
    
    const [isSaving, setIsSaving] = useState(false);
    const [isReferenceUploading, setIsReferenceUploading] = useState(false);
    
    const { showToast } = useToast();
    const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);
    const [confirmReset, setConfirmReset] = useState<'branding' | 'business' | 'social' | 'dna' | null>(null);
    
    // State for Tag Manager
    const [tags, setTags] = useState<Tag[]>(organization.tags || []);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const refMediaInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setLogoLight(organization.logoUrlLight || '');
        setLogoDark(organization.logoUrlDark || '');
        setPrimaryColor(organization.primaryColor || '#14b8a6');
        setSecondaryColor(organization.secondaryColor);
        setTertiaryColor(organization.tertiaryColor);
        setAccentColor(organization.accentColor);
        setHeadlineFontFamily(organization.headlineFontFamily || 'display');
        setBodyFontFamily(organization.bodyFontFamily || 'sans');
        setTags(organization.tags || []);
        
        const pref = organization.preferenceProfile || {};
        setTargetAudience(pref.targetAudience || '');
        setUsps(pref.usps || []);
        setTextSnippets(pref.textSnippets || []);
        setMediaItems(pref.mediaItems || []);
        
        const orgTypes = organization.businessType || [];
        const otherTypeString = orgTypes.find(t => t.startsWith('Annat: '));
        if (otherTypeString) {
            setOtherBusinessType(otherTypeString.substring(7)); // Get text after "Annat: "
            setBusinessType(orgTypes.map(t => t.startsWith('Annat: ') ? 'Annat' : t));
        } else {
            setOtherBusinessType('');
            setBusinessType(orgTypes);
        }

        setBusinessDescription(organization.businessDescription || '');

        // Handle Facebook OAuth redirect
        const hash = window.location.hash;
        if (hash.includes('access_token')) {
            const params = new URLSearchParams(hash.substring(1)); // remove '#'
            const accessToken = params.get('access_token');
            if (accessToken) {
                showToast({ message: "Anslutningen till Facebook lyckades!", type: 'success'});
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            } else if (params.get('error')) {
                showToast({ message: "Anslutningen till Facebook misslyckades.", type: 'error'});
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }
    }, [organization, showToast]);

    const handleImportFromWebsite = async (data: any, url: string) => {
        setPrimaryColor(data.primaryColor || primaryColor);
        if (data.secondaryColor) setSecondaryColor(data.secondaryColor);
        
        if (data.logoUrl) {
            setLogoLight(data.logoUrl);
            setLogoDark(data.logoUrl);
        }

        if (data.headlineFontCategory === 'serif') setHeadlineFontFamily('merriweather');
        else if (data.headlineFontCategory === 'display') setHeadlineFontFamily('display');
        else if (data.headlineFontCategory === 'script') setHeadlineFontFamily('script');
        else setHeadlineFontFamily('sans');

        if (data.bodyFontCategory === 'serif') setBodyFontFamily('merriweather');
        else setBodyFontFamily('sans');

        setBusinessDescription(data.businessDescription || businessDescription);
        
        let newBusinessTypes = businessType;
        if (data.businessType && data.businessType.length > 0) {
            const types = data.businessType.filter((t: string) => businessTypes.includes(t));
            if (types.length > 0) {
                setBusinessType(types);
                newBusinessTypes = types;
            }
        }

        const updatedPreferenceProfile = { 
            ...(organization.preferenceProfile || {}),
            textSnippets: data.textSnippets || organization.preferenceProfile?.textSnippets || [],
            websiteUrl: url
        };

        const partialUpdate: Partial<Organization> = {
            preferenceProfile: updatedPreferenceProfile,
            businessDescription: data.businessDescription || organization.businessDescription,
            businessType: newBusinessTypes,
        };

        await onUpdateOrganization(organization.id, partialUpdate);

        try {
            const orgForAnalysis = { 
                ...organization, 
                ...partialUpdate, 
                primaryColor: data.primaryColor || organization.primaryColor,
            };
            
            showToast({ message: "Skapar DNA-profil...", type: 'info' });
            const dnaResult = await generateDnaAnalysis(orgForAnalysis);
            
            await onUpdateOrganization(organization.id, { 
                styleProfile: { 
                    ...(organization.styleProfile || {}), 
                    ...dnaResult, 
                    lastUpdatedAt: new Date().toISOString() 
                } 
            });
            showToast({ message: "DNA-profil skapad!", type: 'success' });

        } catch (e) {
            console.error("Auto DNA generation failed", e);
            showToast({ message: "Kunde inte skapa DNA-profil automatiskt.", type: 'error' });
        }
    };

    const handleSave = async (saveAction: () => Promise<any>, successMessage: string) => {
        setIsSaving(true);
        try {
            await saveAction();
            showToast({ message: successMessage, type: 'success' });
        } catch (e) {
            showToast({ message: `Kunde inte spara: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        if (confirmReset === 'branding') {
            setLogoLight(organization.logoUrlLight || '');
            setLogoDark(organization.logoUrlDark || '');
            setPrimaryColor(organization.primaryColor || '#14b8a6');
            setSecondaryColor(organization.secondaryColor);
            setTertiaryColor(organization.tertiaryColor);
            setAccentColor(organization.accentColor);
            setHeadlineFontFamily(organization.headlineFontFamily || 'display');
            setBodyFontFamily(organization.bodyFontFamily || 'sans');
        } else if (confirmReset === 'business') {
            const orgTypes = organization.businessType || [];
            const otherTypeString = orgTypes.find(t => t.startsWith('Annat: '));
            if (otherTypeString) {
                setOtherBusinessType(otherTypeString.substring(7));
                setBusinessType(orgTypes.map(t => t.startsWith('Annat: ') ? 'Annat' : t));
            } else {
                setOtherBusinessType('');
                setBusinessType(orgTypes);
            }
            setBusinessDescription(organization.businessDescription || '');
            setTargetAudience(organization.preferenceProfile?.targetAudience || '');
            setUsps(organization.preferenceProfile?.usps || []);
        } else if (confirmReset === 'dna') {
            setTextSnippets(organization.preferenceProfile?.textSnippets || []);
            setMediaItems(organization.preferenceProfile?.mediaItems || []);
        }
        setConfirmReset(null);
    };

    // USP List Management
    const handleAddUsp = () => setUsps(p => [...p, '']);
    const handleRemoveUsp = (index: number) => setUsps(p => p.filter((_, i) => i !== index));
    const handleUspChange = (index: number, val: string) => setUsps(p => p.map((u, i) => i === index ? val : u));

    // Snippets Management 
    const handleAddSnippet = () => setTextSnippets(p => [...p, '']);
    const handleRemoveSnippet = (index: number) => setTextSnippets(p => p.filter((_, i) => i !== index));
    const handleTextSnippetChange = (index: number, val: string) => setTextSnippets(p => p.map((u, i) => i === index ? val : u));

    // Media Items Upload for Moodboard
    const handleRefMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setIsReferenceUploading(true);
        try {
            const uploaded: PreferenceMediaItem[] = [];
            for (const file of files) {
                const { url } = await uploadMediaForGallery(organization.id, file, () => {});
                uploaded.push({
                    id: `pref-media-${Date.now()}-${Math.random()}`,
                    url,
                    type: 'image'
                });
            }
            setMediaItems(p => [...p, ...uploaded]);
            showToast({ message: `${files.length} inspirationsbild(er) har lagts till. Kom ihåg att Spara!`, type: 'success' });
        } catch (err) {
            showToast({ message: "Misslyckades att ladda upp inspirationsbild.", type: 'error' });
        } finally {
            setIsReferenceUploading(false);
            if (refMediaInputRef.current) refMediaInputRef.current.value = '';
        }
    };

    const handleRemoveRefMedia = (id: string) => {
        setMediaItems(p => p.filter(item => item.id !== id));
    };

    // Save Handlers for Tab 1
    const handleSaveProfileAndStory = async () => {
        setIsSaving(true);
        try {
            await onUpdateOrganization(organization.id, {
                businessType: businessTypesToSave,
                businessDescription: businessDescription,
                preferenceProfile: {
                    ...organization.preferenceProfile,
                    targetAudience,
                    usps,
                }
            });
            showToast({ message: "Varumärkesberättelse och grund sparades framgångsrikt!", type: 'success' });
        } catch (e) {
            showToast({ message: "Misslyckades att spara.", type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    // Save Handlers for Tab 2
    const handleSaveVisualBranding = async () => {
        setIsSaving(true);
        try {
            await Promise.all([
                onUpdateLogos(organization.id, { light: logoLight, dark: logoDark }),
                onUpdateOrganization(organization.id, {
                    primaryColor,
                    secondaryColor,
                    tertiaryColor,
                    accentColor,
                    headlineFontFamily,
                    bodyFontFamily,
                })
            ]);
            showToast({ message: "Dina visuella formregler har sparats!", type: 'success' });
        } catch (e) {
            showToast({ message: "Kunde inte spara.", type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    // Save Handlers for Tab 3
    const handleSaveAiDnaReferences = async () => {
        setIsSaving(true);
        try {
            await onUpdateOrganization(organization.id, {
                preferenceProfile: {
                    ...organization.preferenceProfile,
                    textSnippets,
                    mediaItems,
                }
            });
            showToast({ message: "Referensmaterial och tonalitet har sparats!", type: 'success' });
        } catch (e) {
            showToast({ message: "Kunde inte spara.", type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleSaveTag = (tagToSave: Tag) => {
        setEditingTag(null);
        setTags(prevTags => {
            let updatedTags;
            const isNew = !prevTags.some(t => t.id === tagToSave.id);
            if (isNew) {
                updatedTags = [...prevTags, tagToSave];
            } else {
                updatedTags = prevTags.map(t => t.id === tagToSave.id ? tagToSave : t);
            }
            handleSave(() => onUpdateTags(organization.id, updatedTags), isNew ? "Tagg skapad." : "Tagg uppdaterad.");
            return updatedTags;
        });
    };

    const confirmDeleteTag = () => {
        if (!tagToDelete) return;
        const tagId = tagToDelete.id;
        const updatedTags = tags.filter(t => t.id !== tagId);
        setTags(updatedTags);

        const updatedScreens = (organization.displayScreens || []).map(screen => ({
            ...screen,
            posts: screen.posts.map(post => ({
                ...post,
                tagIds: (post.tagIds || []).filter(id => id !== tagId)
            }))
        }));
        
        handleSave(() => Promise.all([
            onUpdateTags(organization.id, updatedTags),
            onUpdateDisplayScreens(organization.id, updatedScreens)
        ]), `Taggen "${tagToDelete.text}" togs bort.`);

        setTagToDelete(null);
    };

    const isVarumarkeDirty = logoLight !== (organization.logoUrlLight || '') || 
                             logoDark !== (organization.logoUrlDark || '') || 
                             primaryColor !== (organization.primaryColor || '#14b8a6') ||
                             secondaryColor !== organization.secondaryColor ||
                             tertiaryColor !== organization.tertiaryColor ||
                             accentColor !== organization.accentColor ||
                             headlineFontFamily !== (organization.headlineFontFamily || 'display') ||
                             bodyFontFamily !== (organization.bodyFontFamily || 'sans');
    
    const businessTypesToSave = useMemo(() => {
        return businessType
            .map(t => {
                if (t === 'Annat' && otherBusinessType.trim()) {
                    return `Annat: ${otherBusinessType.trim()}`;
                }
                return t;
            })
            .filter(t => t !== 'Annat' || otherBusinessType.trim());
    }, [businessType, otherBusinessType]);

    const isBusinessInfoDirty = JSON.stringify(businessTypesToSave) !== JSON.stringify(organization.businessType || []) || 
                                businessDescription !== (organization.businessDescription || '') ||
                                targetAudience !== (organization.preferenceProfile?.targetAudience || '') ||
                                JSON.stringify(usps) !== JSON.stringify(organization.preferenceProfile?.usps || []);

    const isDnaReferenserDirty = JSON.stringify(textSnippets) !== JSON.stringify(organization.preferenceProfile?.textSnippets || []) ||
                                 JSON.stringify(mediaItems) !== JSON.stringify(organization.preferenceProfile?.mediaItems || []);

    const handleBusinessTypeChange = (type: string, checked: boolean) => {
        setBusinessType(prev => {
            if (checked) {
                return [...prev, type];
            } else {
                if (type === 'Annat') {
                    setOtherBusinessType('');
                }
                return prev.filter(t => t !== type);
            }
        });
    };
    
    const businessTypes = ['Bageri', 'Butik', 'Café', 'Event', 'Förening', 'Företag/Kontor', 'Gym/Hälsa', 'Hantverk', 'Hotell', 'Inredning', 'Kampanj', 'Kedja', 'Klädesbutik', 'Köpcentrum', 'Massage', 'Mäklare', 'Optiker', 'Restaurang', 'Skola', 'Skönhet', 'Spa', 'Teknik', 'Tjänster', 'Annat'];

    return (
        <div className="space-y-6">
            
            {/* Horizontal Segmented Control / Subtabs */}
            <div className="flex flex-wrap gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl max-w-4xl border border-slate-200/50 dark:border-slate-800">
                <button
                    onClick={() => setActiveSubTab('profile')}
                    className={`flex items-center gap-2 py-3 px-5 rounded-xl font-bold text-sm transition-all duration-200 ${activeSubTab === 'profile' ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-md scale-102 border border-slate-200/40 dark:border-slate-700/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                >
                    <UserCircleIcon className="h-5 w-5" />
                    Varumärkets Själ & Grund
                </button>
                <button
                    onClick={() => setActiveSubTab('visual')}
                    className={`flex items-center gap-2 py-3 px-5 rounded-xl font-bold text-sm transition-all duration-200 ${activeSubTab === 'visual' ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-md scale-102 border border-slate-200/40 dark:border-slate-700/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                >
                    <PaintBrushIcon className="h-5 w-5" />
                    Visuell Design & Färger
                </button>
                <button
                    onClick={() => setActiveSubTab('ai_dna')}
                    className={`flex items-center gap-2 py-3 px-5 rounded-xl font-bold text-sm transition-all duration-200 ${activeSubTab === 'ai_dna' ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-md scale-102 border border-slate-200/40 dark:border-slate-700/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                >
                    <SparklesIcon className="h-5 w-5" />
                    AI-DNA & Röst
                </button>
                <button
                    onClick={() => setActiveSubTab('tags')}
                    className={`flex items-center gap-2 py-3 px-5 rounded-xl font-bold text-sm transition-all duration-200 ${activeSubTab === 'tags' ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-md scale-102 border border-slate-200/40 dark:border-slate-700/40' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                >
                    <MegaphoneIcon className="h-5 w-5" />
                    Design-Resurser
                </button>
            </div>

            {/* TAB CONTENT SPACES */}
            
            {/* SUB-TAB 1: Varumärkets Själ & Grund (About, Description, USPs, Instagram link) */}
            {activeSubTab === 'profile' && (
                <div className="space-y-6 animate-fade-in">
                    
                    {/* Magical website importer card */}
                    <WebsiteImporter onImportSuccess={handleImportFromWebsite} organization={organization} />

                    <Card title="Varumärkesberättelse & Verksamhet" subTitle="Berätta vem ditt företag är, vad er specialitet är och vilka ni vill kommunicera till. AI:n använder denna kontext som grundpelare för alla förslag." saving={isSaving}>
                        <div className="space-y-6">
                            
                            {/* Company Description */}
                            <div>
                                <label htmlFor="business-description" className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                    <span>Berätta om er verksamhet</span>
                                    <span className="text-[10px] text-slate-400 font-normal italic">(Tränar AI:n bäst)</span>
                                </label>
                                <textarea
                                    id="business-description"
                                    rows={4}
                                    value={businessDescription}
                                    onChange={e => setBusinessDescription(e.target.value)}
                                    placeholder="T.ex. 'Vi är en familjär hälso- och träningsstudio lokaliserad i centrala Varberg. Vi fokuserar på personligt bemötande, skräddarsydd massage och funktionell yoga i lugna omgivningar.'"
                                    className="w-full bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-300/80 dark:border-slate-700 font-sans text-sm tracking-wide leading-relaxed focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all shadow-inner"
                                />
                            </div>

                            {/* Target Audience */}
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Vilka är din målgrupp?</label>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mb-2 leading-relaxed">Berätta vem er idealkund är (t.ex. "Äldre personer som vill ha skonsam träning", "Stressade yrkesarbetande", "Lokala barnfamiljer").</p>
                                <StyledInput 
                                    value={targetAudience} 
                                    onChange={e => setTargetAudience(e.target.value)} 
                                    placeholder="T.ex. Hälsomedvetna i alla åldrar som söker personligt stöd och lugn"
                                    className="h-12 text-sm tracking-wide"
                                />
                            </div>

                            {/* Multi-Select Business types */}
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Typ av verksamhet (Välj gärna flera)</label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                    {businessTypes.map(type => {
                                        const isChecked = businessType.includes(type);
                                        return (
                                            <label 
                                                key={type} 
                                                style={{ borderColor: isChecked ? primaryColor : undefined }}
                                                className={`flex items-center gap-2 p-3 bg-white dark:bg-slate-900/60 rounded-xl border cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800 ${isChecked ? 'border-2 shadow-sm font-bold text-teal-600 dark:text-teal-400' : 'border-slate-200 dark:border-slate-800'}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={e => handleBusinessTypeChange(type, e.target.checked)}
                                                    className="h-4 w-4 rounded text-teal-500 focus:ring-teal-400 accent-teal-500"
                                                />
                                                <span className="text-xs truncate text-slate-800 dark:text-slate-200">{type}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                                 {businessType.includes('Annat') && (
                                    <div className="mt-3 animate-fade-in">
                                        <StyledInput
                                            type="text"
                                            value={otherBusinessType}
                                            onChange={e => setOtherBusinessType(e.target.value)}
                                            placeholder="Specificera annan bransch..."
                                            className="h-11 shadow-sm"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* USPs (Unique Selling Points) */}
                            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Unika Säljargument (USPs)</label>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">Vad särskiljer er från era kollegor? Säljargumenten vävs in i genererade rubriker och locktexter.</p>
                                <div className="space-y-2">
                                    {usps.map((usp, index) => (
                                        <div key={index} className="flex items-center gap-2 animate-fade-in">
                                            <StyledInput 
                                                value={usp} 
                                                onChange={e => handleUspChange(index, e.target.value)} 
                                                placeholder="T.ex. 'Alltid personlig tränare närvarande', 'Privat parkeringsplats utanför'"
                                                className="h-11 flex-grow text-sm shadow-sm"
                                            />
                                            <button 
                                                onClick={() => handleRemoveUsp(index)} 
                                                className="p-2.5 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20 dark:hover:text-red-400 transition-all flex-shrink-0"
                                            >
                                                <TrashIcon className="h-5 w-5"/>
                                            </button>
                                        </div>
                                    ))}
                                    <SecondaryButton onClick={handleAddUsp} className="py-2 text-xs font-bold border-dashed border-2 flex items-center justify-center gap-1">
                                        + Lägg till USP-säljargument
                                    </SecondaryButton>
                                </div>
                            </div>

                        </div>

                        {/* Card bottom bar containing save action */}
                        <div className="flex justify-end mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 gap-2">
                            {isBusinessInfoDirty && (
                                <SecondaryButton onClick={() => setConfirmReset('business')}>
                                    Återställ ändringar
                                </SecondaryButton>
                            )}
                            <PrimaryButton 
                                onClick={handleSaveProfileAndStory}
                                disabled={!isBusinessInfoDirty || isSaving}
                                className="bg-teal-600 hover:bg-teal-500 transition-all duration-150 py-3 px-6 shadow-md"
                            >
                                Spara profil & berättelse
                            </PrimaryButton>
                        </div>
                    </Card>
                </div>
            )}

            {/* SUB-TAB 2: Visuell Design & Färger (Colors, Typography, Logos + LIVE POST PREVIEW MOCKUP) */}
            {activeSubTab === 'visual' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in items-start">
                    
                    {/* Left pane: Branding configuration inputs */}
                    <div className="lg:col-span-7 space-y-6">
                        <Card title="Visuell Profil" subTitle="Bestäm färgregler, ladda upp logotyper och konfigurera typsnitt som representerar varumärket grafiskt på alla skärmar." saving={isSaving}>
                            <div className="space-y-6">
                                
                                {/* Light and Dark logos preview and uploader */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-extrabold text-slate-700 dark:text-slate-300">Varumärkeslogotyper</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                                            <ImageUploader label="Logotyp (för Ljus bakgrund)" imageUrl={logoLight} onImageChange={setLogoLight} isSaving={isSaving}/>
                                        </div>
                                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl">
                                            <ImageUploader label="Logotyp (för Mörk bakgrund)" imageUrl={logoDark} onImageChange={setLogoDark} isSaving={isSaving}/>
                                        </div>
                                    </div>
                                </div>

                                {/* Brand Palette Settings */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-extrabold text-slate-700 dark:text-slate-300">Dina färgregler</label>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed mb-1">Primärfärg och sekundärfärg används för paneler, texthuvuden och ränder. Accentfärg används sparsamt på taggar/erbjudandestämplar.</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800">
                                        <ColorPicker label="Primärfärg (Huvudtema)" color={primaryColor} onChange={setPrimaryColor} />
                                        <OptionalColorPicker label="Sekundärfärg (Bakgrund/Kontraster)" color={secondaryColor} onChange={setSecondaryColor} defaultColor="#1e293b" />
                                        <OptionalColorPicker label="Tertiärfärg (Mindre detaljer)" color={tertiaryColor} onChange={setTertiaryColor} defaultColor="#475569" />
                                        <OptionalColorPicker label="Accentfärg (Blickfång)" color={accentColor} onChange={setAccentColor} defaultColor="#f97316" />
                                    </div>
                                </div>

                                {/* Typography selectors */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                    <div className="space-y-1">
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Typsnitt (Rubriker / Titlar)</label>
                                        <FontSelector value={headlineFontFamily} onChange={setHeadlineFontFamily} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Typsnitt (Löpande brödtext)</label>
                                        <FontSelector value={bodyFontFamily} onChange={setBodyFontFamily} />
                                    </div>
                                </div>

                            </div>

                            {/* Card save block */}
                            <div className="flex justify-end mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 gap-2">
                                {isVarumarkeDirty && (
                                    <SecondaryButton onClick={() => setConfirmReset('branding')}>
                                        Nollställ ändringar
                                    </SecondaryButton>
                                )}
                                <PrimaryButton 
                                    onClick={handleSaveVisualBranding} 
                                    disabled={!isVarumarkeDirty || isSaving}
                                    className="bg-indigo-600 hover:bg-indigo-500 py-3 px-6 shadow-md"
                                >
                                    Spara visuell design
                                </PrimaryButton>
                            </div>
                        </Card>
                    </div>

                    {/* Right pane: INTERACTIVE REAL-TIME BRAND SIGNAGE PREVIEWER MOCKUP */}
                    <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-6">
                        <div className="p-1">
                            <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 block mb-2">Live förhandsvisning av profil</span>
                            
                            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
                                
                                {/* Browser Chrome Bar header */}
                                <div className="bg-slate-50 dark:bg-slate-950 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                                    </div>
                                    <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase font-bold">Butiksskärm Simulator (16:9)</span>
                                    <div className="w-12 h-1 bg-slate-200 dark:bg-slate-800 rounded-full" />
                                </div>
                                
                                {/* Simulated Digital Display POST */}
                                <div 
                                    className="aspect-[16/9] p-5 flex flex-col justify-between relative transition-all duration-500 overflow-hidden"
                                    style={{ backgroundColor: secondaryColor || '#0f172a' }}
                                >
                                    {/* Abstract decorative graphic in background representing accent gradient glow */}
                                    <div className="absolute -top-16 -left-16 w-44 h-44 rounded-full blur-[70px] pointer-events-none opacity-30 transition-all duration-500" style={{ backgroundColor: primaryColor }} />
                                    <div className="absolute -bottom-16 -right-16 w-44 h-44 rounded-full blur-[70px] pointer-events-none opacity-25 transition-all duration-500" style={{ backgroundColor: accentColor || '#14b8a6' }} />

                                    {/* Signage post header */}
                                    <div className="flex justify-between items-center z-10">
                                        {logoLight ? (
                                            <img src={logoLight} alt="Ljustema logotyp" className="max-h-8 max-w-[140px] object-contain transition-all" />
                                        ) : (
                                            <span className="font-extrabold tracking-tight text-white select-none text-sm">{organization.brandName || organization.name}</span>
                                        )}
                                        <span className="text-[9px] uppercase tracking-widest px-2.5 py-1 bg-white/10 text-white rounded-full font-bold border border-white/10 shadow-sm backdrop-blur-md">Öppet IDAG</span>
                                    </div>

                                    {/* Signage middle promotional teaser with dynamic fonts */}
                                    <div className="my-auto text-left z-10 pl-2">
                                        <div className="inline-block px-2 py-0.5 rounded text-[9px] text-white font-extrabold tracking-wider uppercase mb-1.5 shadow-sm" style={{ backgroundColor: accentColor || '#14b8a6' }}>
                                            Nyhet!
                                        </div>
                                        <h4 
                                            className="text-lg font-black mb-1 transition-all block text-white tracking-tight drop-shadow-sm leading-tight max-w-[320px]"
                                            style={{ fontFamily: headlineFontFamily === 'merriweather' ? 'Merriweather' : headlineFontFamily === 'display' ? 'sans-serif' : headlineFontFamily === 'script' ? 'cursive' : 'sans-serif' }}
                                        >
                                            Härlig inspiration i vardagen
                                        </h4>
                                        <p 
                                            className="text-[10px] max-w-[360px] opacity-85 transition-all text-white/90 leading-relaxed font-medium"
                                            style={{ fontFamily: bodyFontFamily === 'merriweather' ? 'Merriweather' : 'sans-serif' }}
                                        >
                                            {businessDescription ? (businessDescription.length > 100 ? `${businessDescription.slice(0, 100)}...` : businessDescription) : 'Vår generativa designmotor sätter samman rubriker, färger och er röst direkt på den fysiska skärmen.'}
                                        </p>
                                    </div>

                                    {/* Simulation specs bar */}
                                    <div className="flex justify-between items-center bg-black/10 p-2 rounded-xl border border-white/5 backdrop-blur-md z-10 text-[9px] text-white/80">
                                        <div className="flex items-center gap-1">
                                            <span className="font-bold">Tema:</span>
                                            <span className="opacity-75">Branded</span>
                                        </div>
                                        
                                        <div className="flex gap-1 items-center">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: primaryColor }} title="Primärfärg" />
                                            {secondaryColor && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: secondaryColor }} title="Sekundärfärg" />}
                                            {accentColor && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: accentColor }} title="Accentfärg" />}
                                        </div>
                                    </div>
                                </div>
                                
                            </div>
                            
                            {/* Color Contrast Verification Guideline */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl mt-4 space-y-2">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                    🔍 Kontrast- och läsbarhetsråd
                                </span>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                    Välj en mörk eller välmättad <strong className="text-slate-700 dark:text-slate-300">sekundärfärg</strong> om logotyperna är ljusa, så att text och logotyp framträder skarpt under sändning i butiksmiljön. Alternera med en framträdande <strong className="text-slate-700 dark:text-slate-300">accentfärg</strong> för viktiga blickfång som priser eller stämplar!
                                </p>
                            </div>
                            
                        </div>
                    </div>
                </div>
            )}

            {/* SUB-TAB 3: AI-DNA & Röst (DnaAnalysisManager, Preference Moodboard References, Tonalitet examples) */}
            {activeSubTab === 'ai_dna' && (
                <div className="space-y-6 animate-fade-in">
                    
                    {/* Brand DNA Section (Bento Grid Profile) */}
                    <DnaAnalysisManager organization={organization} onUpdateOrganization={onUpdateOrganization} />

                    <hr className="border-slate-200 dark:border-slate-800 my-4" />

                    {/* Preference Assets & Tonalitet Card */}
                    <Card title="Tonalitet & Inspirationsmaterial" subTitle="Bifoga röst-exempel och visuell inspiration. AI:n granskar materialet och anpassar skyltdesignen efter ert särdrag." saving={isSaving}>
                        <div className="space-y-6">
                            
                            {/* Tone and voice text snippets */}
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Typiska texter & Värdeord</label>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">Skriv in slogans, slogans från annonser, eller känslor som representerar er röst (t.ex. "Din stund för återhämtning", "Välkommen in på en rykande färsk espresso!").</p>
                                <div className="space-y-2">
                                    {textSnippets.map((snippet, index) => (
                                        <div key={index} className="flex items-center gap-2 animate-fade-in">
                                            <StyledInput 
                                                value={snippet} 
                                                onChange={e => handleTextSnippetChange(index, e.target.value)} 
                                                placeholder="T.ex. 'Det ska kännas enkelt att må bra varje dag'"
                                                className="h-11 flex-grow text-sm shadow-sm"
                                            />
                                            <button 
                                                onClick={() => handleRemoveSnippet(index)} 
                                                className="p-2.5 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20 dark:hover:text-red-400 transition-all flex-shrink-0"
                                            >
                                                <TrashIcon className="h-5 w-5"/>
                                            </button>
                                        </div>
                                    ))}
                                    <SecondaryButton onClick={handleAddSnippet} className="py-2 text-xs font-bold border-dashed border-2 flex items-center justify-center gap-1">
                                        + Lägg till text-exempel
                                    </SecondaryButton>
                                </div>
                            </div>

                            {/* Reference Images Moodboard */}
                            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Visuellt Moodburst (Referensbilder)</label>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">Ladda upp miljöbilder, skyltar, eller önskade layouter. AI-motorn analyserar förlagorna vid skapandet.</p>
                                
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-2">
                                    {mediaItems.map(item => (
                                        <div key={item.id} className="relative group aspect-square rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:scale-102">
                                            <img src={item.url} alt="Inspirationsreferens" className="w-full h-full object-cover"/>
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <button 
                                                    onClick={() => handleRemoveRefMedia(item.id)} 
                                                    className="bg-red-600 hover:bg-red-500 text-white p-2.5 rounded-full shadow-md transition-transform transform hover:scale-105"
                                                    title="Ta bort referensbild"
                                                >
                                                    <TrashIcon className="h-4 w-4"/>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {/* Reference Upload Box Trigger */}
                                    <div
                                        onClick={() => refMediaInputRef.current?.click()}
                                        className="aspect-square flex flex-col items-center justify-center border-2 border-dashed rounded-2xl cursor-pointer transition-all border-slate-300 dark:border-slate-700 hover:border-teal-500 hover:bg-teal-50/20 dark:hover:bg-slate-850 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 bg-slate-50 dark:bg-slate-900/10"
                                    >
                                        {isReferenceUploading ? (
                                            <LoadingSpinnerIcon className="h-6 w-6 text-teal-600 animate-spin" />
                                        ) : (
                                            <>
                                                <span className="text-2xl font-normal mb-1">+</span>
                                                <span className="text-[10px] font-bold">Ladda upp</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <input 
                                    type="file" 
                                    ref={refMediaInputRef} 
                                    onChange={handleRefMediaUpload} 
                                    multiple 
                                    accept="image/*" 
                                    className="hidden"
                                />
                            </div>

                        </div>

                        {/* Save references button */}
                        <div className="flex justify-end mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 gap-2">
                            {isDnaReferenserDirty && (
                                <SecondaryButton onClick={() => setConfirmReset('dna')}>
                                    Återställ referenser
                                </SecondaryButton>
                            )}
                            <PrimaryButton 
                                onClick={handleSaveAiDnaReferences}
                                disabled={!isDnaReferenserDirty || isSaving}
                                className="bg-teal-600 hover:bg-teal-500 py-3 px-6 shadow-md"
                            >
                                Spara referenser & tonalitet
                            </PrimaryButton>
                        </div>
                    </Card>
                </div>
            )}

            {/* SUB-TAB 4: Design-Resurser (Tags & Badge Manager) */}
            {activeSubTab === 'tags' && (
                <div className="animate-fade-in">
                    <Card title="Design- & Innehållsresurser" subTitle="Skapa dina egna återanvändbara designbrickor, runda kampanjstämplar eller märken (t.ex. 'NYHET', '-20%', 'EKO') för att enkelt dra och släppa dem på dina skyltar.">
                        <div className="space-y-6">
                            <TagManager tags={tags} onSave={handleSaveTag} onDelete={(tag) => setTagToDelete(tag)} editingTag={editingTag} setEditingTag={setEditingTag} organization={organization} />
                        </div>
                    </Card>
                </div>
            )}
            
            <ConfirmDialog
                isOpen={!!tagToDelete}
                onClose={() => setTagToDelete(null)}
                onConfirm={confirmDeleteTag}
                title="Ta bort tagg"
            >
               <p>Är du säker på att du vill ta bort taggen "{tagToDelete?.text}"? Den kommer också att tas bort från alla inlägg den är kopplad till.</p>
            </ConfirmDialog>
            <ConfirmDialog
                isOpen={!!confirmReset}
                onClose={() => setConfirmReset(null)}
                onConfirm={handleReset}
                title="Återställ ändringar"
                confirmText="Ja, återställ"
            >
                <p>Är du säker på att du vill återställa dina ändringar? De kommer inte att sparas.</p>
            </ConfirmDialog>
        </div>
    );
};

const ColorPicker: React.FC<{
  label: string;
  color: string;
  onChange: (color: string) => void;
}> = ({ label, color, onChange }) => (
    <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
        <div className="flex items-center gap-2">
            <input 
                type="color" 
                value={color} 
                onChange={e => onChange(e.target.value)} 
                className="w-12 h-12 p-1 bg-white dark:bg-black rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
            />
            <StyledInput 
                type="text" 
                value={color} 
                onChange={e => onChange(e.target.value)} 
                className="font-mono h-12"
            />
        </div>
    </div>
);


// --- Tag Manager Component ---
const TagEditor: React.FC<{ tag: Tag, onSave: (tag: Tag) => void, onCancel: () => void, organization: Organization }> = ({ tag, onSave, onCancel, organization }) => {
    const { showToast } = useToast();
    const [currentTag, setCurrentTag] = useState(tag);
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiGenerating, setAiGenerating] = useState(false);
    const [aiExplanation, setAiExplanation] = useState('');
    // Background options for preview testing: 'grid', 'light', 'dark', 'vivid'
    const [previewBg, setPreviewBg] = useState<'grid' | 'light' | 'dark' | 'vivid'>('grid');
    
    // Gradient custom colors state
    const [gradientColor1, setGradientColor1] = useState(() => {
        if (tag.backgroundColor && tag.backgroundColor.startsWith('linear-gradient')) {
            const matches = tag.backgroundColor.match(/#[a-fA-F0-9]{6}/g);
            return (matches && matches[0]) ? matches[0] : '#f97316';
        }
        return tag.backgroundColor.startsWith('#') && tag.backgroundColor.length === 7 ? tag.backgroundColor : '#f97316';
    });
    const [gradientColor2, setGradientColor2] = useState(() => {
        if (tag.backgroundColor && tag.backgroundColor.startsWith('linear-gradient')) {
            const matches = tag.backgroundColor.match(/#[a-fA-F0-9]{6}/g);
            return (matches && matches[1]) ? matches[1] : '#ec4899';
        }
        return '#ec4899';
    });
    
    const [backgroundType, setBackgroundType] = useState<'solid' | 'gradient' | 'glass'>(() => {
        if (tag.backgroundColor.startsWith('linear-gradient')) {
            return 'gradient';
        } else if (tag.backgroundColor.includes('rgba(')) {
            return 'glass';
        }
        return 'solid';
    });

    useEffect(() => {
        setCurrentTag(tag);
        if (tag.backgroundColor.startsWith('linear-gradient')) {
            setBackgroundType('gradient');
            const matches = tag.backgroundColor.match(/#[a-fA-F0-9]{6}/g);
            if (matches && matches.length >= 2) {
                setGradientColor1(matches[0]);
                setGradientColor2(matches[1]);
            }
        } else if (tag.backgroundColor.includes('rgba(')) {
            setBackgroundType('glass');
        } else {
            setBackgroundType('solid');
        }
    }, [tag]);

    const handleBackgroundTypeChange = (type: 'solid' | 'gradient' | 'glass') => {
        setBackgroundType(type);
        if (type === 'solid') {
            setCurrentTag(t => ({ ...t, backgroundColor: '#ef4444' }));
        } else if (type === 'gradient') {
            setCurrentTag(t => ({ ...t, backgroundColor: `linear-gradient(135deg, ${gradientColor1} 0%, ${gradientColor2} 100%)` }));
        } else if (type === 'glass') {
            setCurrentTag(t => ({ ...t, backgroundColor: 'rgba(255, 255, 255, 0.25)', textColor: '#FFFFFF' }));
        }
    };

    const handleGradientColorChange = (c1: string, c2: string) => {
        setGradientColor1(c1);
        setGradientColor2(c2);
        setCurrentTag(t => ({ ...t, backgroundColor: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)` }));
    };

    const handleGenerateWithAi = async () => {
        if (!aiPrompt.trim()) return;
        setAiGenerating(true);
        setAiExplanation('');
        try {
            const result = await generateTagOrStampWithAi(
                aiPrompt,
                organization,
                currentTag.displayType || 'tag'
            );
            if (result) {
                setCurrentTag(t => ({
                    ...t,
                    text: result.text || t.text,
                    displayType: result.displayType || t.displayType,
                    backgroundColor: result.backgroundColor || t.backgroundColor,
                    textColor: result.textColor || t.textColor || '#FFFFFF',
                    fontSize: result.fontSize || t.fontSize,
                    fontFamily: result.fontFamily || t.fontFamily,
                    fontWeight: result.fontWeight || t.fontWeight,
                    animation: result.animation || t.animation,
                    shape: result.shape || t.shape,
                    border: result.border || t.border,
                    opacity: result.opacity !== undefined ? result.opacity : t.opacity,
                }));
                
                // Sync colors and type
                const newBg = result.backgroundColor || '';
                if (newBg.startsWith('linear-gradient')) {
                    setBackgroundType('gradient');
                    const matches = newBg.match(/#[a-fA-F0-9]{6}/g);
                    if (matches && matches.length >= 2) {
                        setGradientColor1(matches[0]);
                        setGradientColor2(matches[1]);
                    }
                } else if (newBg.includes('rgba(')) {
                    setBackgroundType('glass');
                } else {
                    setBackgroundType('solid');
                }
                
                if (result.explanation) {
                    setAiExplanation(result.explanation);
                }
                showToast({ message: "Designtillgång genererad baserat på ditt varumärkes-DNA!", type: "success" });
            }
        } catch (e: any) {
            showToast({ message: e?.message || "Kunde inte generera med AI.", type: "error" });
        } finally {
            setAiGenerating(false);
        }
    };

    const handleSave = () => {
        if (currentTag.text.trim()) {
            const tagToSave = { ...currentTag };
            if (tagToSave.displayType === 'stamp' && !tagToSave.shape) {
                tagToSave.shape = 'circle';
            }
            onSave(tagToSave);
        }
    };
    
    const isStamp = currentTag.displayType === 'stamp';
    const isPreview = true;

    // Build stamp specific styles and classes
    let stampClasses = '';
    let stampStyles: React.CSSProperties = {};
    const shape = (isStamp && currentTag.shape) ? currentTag.shape : 'circle';

    if (isStamp) {
        stampClasses += ' justify-center text-center uppercase tracking-[2px] font-bold ';
        stampStyles.boxShadow = 'inset 0 0 8px rgba(0, 0, 0, 0.2), 0 4px 6px -1px rgba(0, 0, 0, 0.1)';

        if (shape === 'circle') {
            stampClasses += ' rounded-full aspect-square ';
        } else if (shape === 'square') {
            stampClasses += ' rounded-xl aspect-square ';
        } else { // rectangle
            stampClasses += ' rounded-xl ';
        }
        
        if (currentTag.border === 'solid') {
            stampClasses += ' border-4 ';
            stampStyles.borderColor = 'currentColor';
        } else if (currentTag.border === 'dashed') {
            stampClasses += ' border-4 border-dashed ';
            stampStyles.borderColor = 'currentColor';
        }
    } else {
        stampClasses += ' rounded-full ';
    }
    
    let paddingClass = '';
    const isShapeVertical = isStamp && (shape === 'circle' || shape === 'square');
    if (currentTag.url) {
        paddingClass = isPreview ? 'p-1' : 'p-2';
    } else if (isStamp) {
        if (shape === 'circle' || shape === 'square') {
            paddingClass = isPreview ? 'p-3' : 'p-6';
        } else { // rectangle
            paddingClass = isPreview ? 'px-3 py-1.5' : 'px-6 py-3';
        }
    } else { // it's a tag
        paddingClass = isPreview ? 'px-4 py-2' : 'px-8 py-4';
    }

    // Gorgeous preset designs to fast click
    const PRESETS = [
        {
            name: 'Klassisk Röd Retro',
            displayType: 'stamp',
            backgroundColor: '#dc2626',
            textColor: '#FFFFFF',
            fontSize: 'xl',
            fontWeight: 'black',
            fontFamily: 'display',
            animation: 'pulse',
            shape: 'circle',
            border: 'dashed',
            opacity: 0.95,
            icon: '🏷️'
        },
        {
            name: 'Ekologisk Mjukgrön',
            displayType: 'tag',
            backgroundColor: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            textColor: '#FFFFFF',
            fontSize: 'md',
            fontWeight: 'bold',
            fontFamily: 'sans',
            animation: 'none',
            shape: 'rectangle',
            border: 'none',
            opacity: 1,
            icon: '🌿'
        },
        {
            name: 'Guld Lyx',
            displayType: 'stamp',
            backgroundColor: 'linear-gradient(135deg, #b45309 0%, #f59e0b 50%, #b45309 100%)',
            textColor: '#FFFFFF',
            fontSize: 'lg',
            fontWeight: 'black',
            fontFamily: 'display',
            animation: 'none',
            shape: 'circle',
            border: 'solid',
            opacity: 1,
            icon: '✨'
        },
        {
            name: 'Neon Cyber Glow',
            displayType: 'tag',
            backgroundColor: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
            textColor: '#FFFFFF',
            fontSize: 'lg',
            fontWeight: 'black',
            fontFamily: 'display',
            animation: 'glow',
            shape: 'rectangle',
            border: 'none',
            opacity: 1,
            icon: '🌈'
        },
        {
            name: 'Frostat Ljust Glas',
            displayType: 'tag',
            backgroundColor: 'rgba(255, 255, 255, 0.22)',
            textColor: '#FFFFFF',
            fontSize: 'md',
            fontWeight: 'black',
            fontFamily: 'sans',
            animation: 'none',
            shape: 'rectangle',
            border: 'none',
            opacity: 1,
            icon: '🧊'
        },
        {
            name: 'Orange Solnedgång',
            displayType: 'tag',
            backgroundColor: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)',
            textColor: '#FFFFFF',
            fontSize: 'xl',
            fontWeight: 'black',
            fontFamily: 'display',
            animation: 'pulse',
            shape: 'rectangle',
            border: 'none',
            opacity: 1,
            icon: '🔥'
        },
        {
            name: 'Gul Rabattstämpel',
            displayType: 'stamp',
            backgroundColor: '#fbbf24',
            textColor: '#000000',
            fontSize: '2xl',
            fontWeight: 'black',
            fontFamily: 'display',
            animation: 'none',
            shape: 'square',
            border: 'solid',
            opacity: 1,
            icon: '⚡'
        },
        {
            name: 'Mörk Premium',
            displayType: 'tag',
            backgroundColor: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            textColor: '#FFFFFF',
            fontSize: 'sm',
            fontWeight: 'bold',
            fontFamily: 'sans',
            animation: 'none',
            shape: 'rectangle',
            border: 'none',
            opacity: 1,
            icon: '🎯'
        }
    ];

    const GRADIENT_PRESETS = [
        { name: 'Sunset', c1: '#f97316', c2: '#ec4899' },
        { name: 'Emerald', c1: '#34d399', c2: '#059669' },
        { name: 'Oceans', c1: '#06b6d4', c2: '#2563eb' },
        { name: 'Luxury Gold', c1: '#b45309', c2: '#fbbf24' },
        { name: 'Cosmic', c1: '#8b5cf6', c2: '#ec4899' },
        { name: 'Midnight', c1: '#334155', c2: '#0f172a' }
    ];

    const SIZES: Tag['fontSize'][] = ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'];

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl animate-fade-in space-y-6">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left Controls column */}
                <div className="lg:col-span-7 space-y-6">
                    
                    {/* Skylie AI Generator Module */}
                    <div className="bg-slate-50 dark:bg-slate-950 border border-teal-500/30 rounded-2xl p-4 space-y-3 relative overflow-hidden">
                        {/* Decorative background ambient shine */}
                        <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />
                        
                        <div className="flex items-center gap-2">
                            <span className="text-base">✨</span>
                            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-widest flex items-center gap-1.5">
                                Skapa med Skylie AI
                                <span className="text-[10px] font-medium text-teal-600 dark:text-teal-400 bg-teal-100/60 dark:bg-teal-950/40 px-1.5 py-0.5 rounded">DNA-Matchad</span>
                            </h4>
                        </div>
                        
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            Beskriv vad du vill ha (t.ex. <span className="italic">"Sälj-kapplöpningsstämpel för 'visning'"</span>), eller skriv fritt. Skylie hämtar stilinspiration från din <strong>{organization.brandName || organization.name || "organisation"}</strong> DNA-profil och bransch för att matcha typsnitt, färger och känsla perfekt.
                        </p>
                        
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="text"
                                placeholder='T.ex. "Skapa en stämpel som säger NYTT OBJEKT"'
                                value={aiPrompt}
                                onChange={e => setAiPrompt(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleGenerateWithAi();
                                    }
                                }}
                                disabled={aiGenerating}
                                className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 disabled:opacity-60"
                            />
                            <button
                                type="button"
                                onClick={handleGenerateWithAi}
                                disabled={aiGenerating || !aiPrompt.trim()}
                                className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all w-full sm:w-auto shrink-0 shadow-sm"
                            >
                                {aiGenerating ? (
                                    <>
                                        <LoadingSpinnerIcon className="h-4 w-4 animate-spin" />
                                        Analyserar & bygger...
                                    </>
                                ) : (
                                    <>
                                        <span>Generera design</span>
                                        <span>✨</span>
                                    </>
                                )}
                            </button>
                        </div>
                        
                        {aiExplanation && (
                            <div className="mt-2 text-[11.5px] bg-teal-50/50 dark:bg-teal-950/20 text-slate-700 dark:text-slate-300 p-3 rounded-xl border border-teal-100/50 dark:border-teal-900/40 leading-relaxed animate-fade-in flex gap-2">
                                <span className="text-sm shrink-0">💡</span>
                                <div>
                                    <span className="font-bold text-teal-800 dark:text-teal-400">Skylie förklarar valet:</span>{" "}
                                    {aiExplanation}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Visual Preset Choices */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Snabba Förinställningar (Klicka och bygg vidare)</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {PRESETS.map((p, idx) => {
                                const active = currentTag.displayType === p.displayType && 
                                               currentTag.backgroundColor === p.backgroundColor &&
                                               currentTag.textColor === p.textColor &&
                                               currentTag.fontSize === p.fontSize &&
                                               currentTag.shape === p.shape &&
                                               currentTag.border === p.border;
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => {
                                            setCurrentTag(t => ({
                                                ...t,
                                                displayType: p.displayType as any,
                                                backgroundColor: p.backgroundColor,
                                                textColor: p.textColor as any,
                                                fontSize: p.fontSize as any,
                                                fontWeight: p.fontWeight as any,
                                                fontFamily: p.fontFamily as any,
                                                animation: p.animation as any,
                                                shape: p.shape as any,
                                                border: p.border as any,
                                                opacity: p.opacity,
                                            }));
                                            if (p.backgroundColor.startsWith('linear-gradient')) {
                                                setBackgroundType('gradient');
                                                const matches = p.backgroundColor.match(/#[a-fA-F0-9]{6}/g);
                                                if (matches && matches.length >= 2) {
                                                    setGradientColor1(matches[0]);
                                                    setGradientColor2(matches[1]);
                                                }
                                            } else if (p.backgroundColor.includes('rgba(')) {
                                                setBackgroundType('glass');
                                            } else {
                                                setBackgroundType('solid');
                                            }
                                        }}
                                        className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                                            active 
                                            ? 'border-teal-500 bg-teal-500/5 ring-2 ring-teal-500/25' 
                                            : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        <span className="text-xl mb-1">{p.icon}</span>
                                        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate w-full">{p.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="h-[1px] bg-slate-100 dark:bg-slate-800" />

                    {/* Tag vs Stamp Picker & Text area */}
                    <div className="space-y-4">
                        <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl">
                            <button
                                type="button"
                                onClick={() => setCurrentTag(t => ({ ...t, displayType: 'tag' }))}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-bold text-xs transition-all ${(!currentTag.displayType || currentTag.displayType === 'tag') ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                            >
                                🏷️ Tagg (Aktiv form på inlägg)
                            </button>
                            <button
                                type="button"
                                onClick={() => setCurrentTag(t => ({ ...t, displayType: 'stamp' }))}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-bold text-xs transition-all ${currentTag.displayType === 'stamp' ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                            >
                                💮 Stämpel (Rund/kantig stämpel-design)
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Skylttext (Använd Enter för flera rader)</label>
                            <textarea 
                                placeholder="T.ex. NYHET eller -20%" 
                                value={currentTag.text} 
                                onChange={e => {
                                    // Limit stamps to short uppercase phrases
                                    const textVal = e.target.value;
                                    setCurrentTag({...currentTag, text: textVal});
                                }} 
                                className="w-full bg-slate-50 dark:bg-slate-955 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all min-h-[70px]"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">QR-kod förankring (Valfritt)</label>
                            <div className="relative">
                                <StyledInput 
                                    type="url" 
                                    placeholder="https://exempel.se/erbjudande" 
                                    value={currentTag.url || ''} 
                                    onChange={e => setCurrentTag({...currentTag, url: e.target.value.trim()})} 
                                    className="pl-9 h-11"
                                />
                                <span className="absolute left-3.5 top-3.5 text-slate-400 text-xs">🔗</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-[1px] bg-slate-100 dark:bg-slate-800" />

                    {/* Background styling types */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Bakgrundsstil & Effekter</label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleBackgroundTypeChange('solid')}
                                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${backgroundType === 'solid' ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 shadow-sm' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-50'}`}
                                >
                                    🎨 Enfärgad
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleBackgroundTypeChange('gradient')}
                                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${backgroundType === 'gradient' ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 shadow-sm' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-50'}`}
                                >
                                    🌈 Färggradient
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleBackgroundTypeChange('glass')}
                                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${backgroundType === 'glass' ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 shadow-sm' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-50'}`}
                                >
                                    🧊 Frostat Glas
                                </button>
                            </div>
                        </div>

                        {/* Solid color configuration options */}
                        {backgroundType === 'solid' && (
                            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-850 animate-fade-in">
                                <span className="text-xs font-bold text-slate-500">Välj kulör:</span>
                                <input 
                                    type="color" 
                                    value={currentTag.backgroundColor.startsWith('#') ? currentTag.backgroundColor : '#ef4444'} 
                                    onChange={e => setCurrentTag({...currentTag, backgroundColor: e.target.value})} 
                                    className="w-10 h-10 p-0.5 bg-white rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer overflow-hidden rounded-full"
                                />
                                <input 
                                    type="text" 
                                    maxLength={7}
                                    value={currentTag.backgroundColor.startsWith('#') ? currentTag.backgroundColor : '#ef4444'} 
                                    onChange={e => setCurrentTag({...currentTag, backgroundColor: e.target.value})} 
                                    className="w-24 px-3 py-1.5 bg-white dark:bg-slate-900 text-xs font-mono uppercase font-bold rounded-lg border border-slate-200 dark:border-slate-700"
                                />
                                <div className="flex gap-1 items-center flex-wrap ml-auto">
                                    {['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#3f3f46'].map(col => (
                                        <button
                                            key={col}
                                            type="button"
                                            onClick={() => setCurrentTag({...currentTag, backgroundColor: col})}
                                            className="w-6 h-6 rounded-full border border-white dark:border-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 transition-transform transform hover:scale-110"
                                            style={{ backgroundColor: col }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Gradient configuration options */}
                        {backgroundType === 'gradient' && (
                            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-850 space-y-3 animate-fade-in">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-500">Gradientförslag:</span>
                                    <div className="flex gap-2 overflow-x-auto py-1">
                                        {GRADIENT_PRESETS.map((gp, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => handleGradientColorChange(gp.c1, gp.c2)}
                                                className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold"
                                            >
                                                <span className="w-3.5 h-3.5 rounded-full" style={{ background: `linear-gradient(135deg, ${gp.c1}, ${gp.c2})` }} />
                                                {gp.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 py-2 border-t border-slate-200/50 dark:border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400 font-bold">Färg 1:</span>
                                        <input 
                                            type="color" 
                                            value={gradientColor1} 
                                            onChange={e => handleGradientColorChange(e.target.value, gradientColor2)} 
                                            className="w-10 h-10 p-0.5 bg-white rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer rounded-full"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400 font-bold">Färg 2:</span>
                                        <input 
                                            type="color" 
                                            value={gradientColor2} 
                                            onChange={e => handleGradientColorChange(gradientColor1, e.target.value)} 
                                            className="w-10 h-10 p-0.5 bg-white rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer rounded-full"
                                        />
                                    </div>
                                    <div className="ml-auto w-24 h-10 rounded-xl border border-slate-200 dark:border-slate-800" style={{ background: `linear-gradient(135deg, ${gradientColor1}, ${gradientColor2})` }} />
                                </div>
                            </div>
                        )}

                        {/* Glassmorphism configuration options */}
                        {backgroundType === 'glass' && (
                            <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-850 flex items-center gap-3 animate-fade-in">
                                <span className="text-xs font-bold text-slate-500">Frostat tema:</span>
                                <button
                                    type="button"
                                    onClick={() => setCurrentTag(t => ({ ...t, backgroundColor: 'rgba(255, 255, 255, 0.22)', textColor: '#FFFFFF' }))}
                                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${currentTag.backgroundColor === 'rgba(255, 255, 255, 0.22)' ? 'bg-white border-white text-teal-600 shadow-sm font-black' : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'}`}
                                >
                                    🧊 Ljust Glas (Frostvit)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentTag(t => ({ ...t, backgroundColor: 'rgba(15, 23, 42, 0.45)', textColor: '#FFFFFF' }))}
                                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${currentTag.backgroundColor === 'rgba(15, 23, 42, 0.45)' ? 'bg-slate-800 border-slate-700 text-teal-400 shadow-sm font-black' : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'}`}
                                >
                                    🦇 Mörkt Glas (Nattfrost)
                                </button>
                            </div>
                        )}

                        {/* Text values foreground pickers */}
                        <div className="flex gap-4 items-center pl-1">
                            <span className="text-xs font-bold text-slate-400 uppercase">Textfärg:</span>
                            <div className="flex gap-2 w-48">
                                <button 
                                    type="button"
                                    onClick={() => setCurrentTag({...currentTag, textColor: '#FFFFFF'})} 
                                    className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl transition-all border font-bold text-xs ${currentTag.textColor === '#FFFFFF' ? 'border-teal-500 bg-teal-50 text-slate-900 ring-2 ring-teal-500/20' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200'}`}
                                >
                                    <span className="w-3.5 h-3.5 rounded-full bg-white border border-slate-400" /> Vit text
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setCurrentTag({...currentTag, textColor: '#000000'})} 
                                    className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl transition-all border font-bold text-xs ${currentTag.textColor === '#000000' ? 'border-teal-500 bg-teal-50 text-slate-900 ring-2 ring-teal-500/20' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200'}`}
                                >
                                    <span className="w-3.5 h-3.5 rounded-full bg-black border border-slate-800" /> Svart text
                                </button>
                            </div>

                            {/* Transparent support for stamps */}
                            {isStamp && (
                                <div className="flex-grow pl-4">
                                    <div className="flex justify-between items-center mb-1 text-xs font-bold text-slate-400">
                                        <span>Opacitet:</span>
                                        <span>{Math.round((currentTag.opacity ?? 1) * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="20"
                                        max="100"
                                        step="5"
                                        value={Math.round((currentTag.opacity ?? 1) * 100)}
                                        onChange={e => setCurrentTag({...currentTag, opacity: parseInt(e.target.value, 10) / 100 })}
                                        className="w-full accent-teal-600 h-2 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="h-[1px] bg-slate-100 dark:bg-slate-800" />

                    {/* Shapes, sizes and Typography detail configuration */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        
                        {/* Size slider / visual button selections */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-400 uppercase">Textstorlek</label>
                            <div className="flex flex-wrap gap-1.5">
                                {SIZES.map(sz => (
                                    <button
                                        key={sz}
                                        type="button"
                                        onClick={() => setCurrentTag({...currentTag, fontSize: sz})}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${currentTag.fontSize === sz ? 'bg-teal-600 border-teal-600 text-white font-extrabold scale-102' : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400 bg-white dark:bg-slate-950 hover:bg-slate-50'}`}
                                    >
                                        {sz.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Font Families */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-400 uppercase">Typsnitt</label>
                            <FontSelector value={currentTag.fontFamily || 'sans'} onChange={font => setCurrentTag({...currentTag, fontFamily: font})} />
                        </div>

                        {/* Additional shape options ONLY for STAMP and animations */}
                        {isStamp && (
                            <>
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-slate-400 uppercase">Stämpelform</label>
                                    <div className="flex gap-2">
                                        {(['circle', 'rectangle', 'square'] as Tag['shape'][]).map(sh => (
                                            <button
                                                key={sh}
                                                type="button"
                                                onClick={() => setCurrentTag({...currentTag, shape: sh})}
                                                className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl border capitalize transition-all ${currentTag.shape === sh ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent shadow' : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400 bg-white dark:bg-slate-950 hover:bg-slate-50'}`}
                                            >
                                                {sh === 'circle' ? '🔴 Cirkel' : sh === 'square' ? '🟥 Kvadrat' : '➖ Rektangel'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-slate-400 uppercase">Stämpelram</label>
                                    <div className="flex gap-2">
                                        {(['none', 'solid', 'dashed'] as Tag['border'][]).map(bd => (
                                            <button
                                                key={bd}
                                                type="button"
                                                onClick={() => setCurrentTag({...currentTag, border: bd})}
                                                className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl border capitalize transition-all ${currentTag.border === bd ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent shadow' : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400 bg-white dark:bg-slate-950 hover:bg-slate-50'}`}
                                            >
                                                {bd === 'none' ? 'Utan ram' : bd === 'solid' ? 'Helfylld' : 'Streckad'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-400 uppercase">Styrka & Tjocklek</label>
                            <StyledSelect value={currentTag.fontWeight} onChange={e => setCurrentTag({...currentTag, fontWeight: e.target.value as Tag['fontWeight']})}>
                                <option value="bold">Fyllig (Bold)</option>
                                <option value="black">Kraftig (Black / Extra tjock)</option>
                            </StyledSelect>
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-400 uppercase">Animation (Ska dra blickarna till sig)</label>
                            <StyledSelect value={currentTag.animation} onChange={e => setCurrentTag({...currentTag, animation: e.target.value as Tag['animation']})}>
                                <option value="none">Ingen rörelse</option>
                                <option value="pulse">Hemsidans mjuka puls</option>
                                <option value="glow">Skenande färgGLOW</option>
                            </StyledSelect>
                        </div>
                    </div>

                </div>

                {/* Right Sticky Preview column */}
                <div className="lg:col-span-5 lg:sticky lg:top-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Förhandstitt i realtid</label>
                        <div className="flex gap-1.5 bg-slate-200 dark:bg-slate-900 p-0.5 rounded-lg">
                            <button
                                type="button"
                                title="Transparent rutnät"
                                onClick={() => setPreviewBg('grid')}
                                className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${previewBg === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                🏁
                            </button>
                            <button
                                type="button"
                                title="Ljus bakgrund"
                                onClick={() => setPreviewBg('light')}
                                className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${previewBg === 'light' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                ⚪
                            </button>
                            <button
                                type="button"
                                title="Mörk bakgrund"
                                onClick={() => setPreviewBg('dark')}
                                className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${previewBg === 'dark' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                ⚫
                            </button>
                            <button
                                type="button"
                                title="Färgglad kontrast"
                                onClick={() => setPreviewBg('vivid')}
                                className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${previewBg === 'vivid' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                🎨
                            </button>
                        </div>
                    </div>

                    {/* Interactive Preview area container */}
                    <div 
                        className={`min-h-[220px] flex items-center justify-center rounded-xl overflow-hidden shadow-inner relative transition-all border border-slate-250 dark:border-slate-800`}
                        style={{
                            background: 
                                previewBg === 'grid' ? undefined :
                                previewBg === 'light' ? '#f8fafc' :
                                previewBg === 'dark' ? '#0f172a' :
                                'linear-gradient(135deg, #1e3a8a 0%, #ec4899 100%)',
                        }}
                    >
                        {previewBg === 'grid' && (
                            <div className="absolute inset-0 bg-slate-200/50 dark:bg-slate-900/60 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px]" />
                        )}

                        <div
                            style={{
                                background: isStamp && !currentTag.backgroundColor.startsWith('linear-gradient') ? hexToRgba(currentTag.backgroundColor, currentTag.opacity ?? 1) : currentTag.backgroundColor,
                                opacity: currentTag.opacity ?? 1,
                                color: currentTag.textColor,
                                ...(currentTag.animation === 'glow' ? { '--glow-color': currentTag.backgroundColor } : {}),
                                ...stampStyles,
                                ...(isStamp ? {} : {
                                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.35), 0 8px 10px -6px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255,255,255,0.2)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    backdropFilter: 'blur(8px)',
                                })
                            }}
                            className={`
                                inline-flex items-center shadow-lg transition-all z-10 duration-200
                                ${paddingClass}
                                ${getTagFontSizeClass(currentTag.fontSize, true)}
                                ${getTagFontFamilyClass(currentTag.fontFamily)}
                                ${isStamp ? '' : getTagFontWeightClass(currentTag.fontWeight)}
                                ${getTagAnimationClass(currentTag.animation, currentTag.displayType)}
                                ${stampClasses}
                                whitespace-pre-wrap text-center
                            `}
                        >
                            {currentTag.url ? (
                                <div className={`flex items-center ${isShapeVertical ? 'flex-col gap-1.5' : 'gap-3'}`}>
                                    <span style={{
                                        textShadow: isStamp ? 'none' : '0 2px 4px rgba(0,0,0,0.2)'
                                    }}>{currentTag.text || "Taggtext"}</span>
                                    <div className="bg-white p-1 rounded-md shadow-sm">
                                        <QrCodePreview url={currentTag.url} />
                                    </div>
                                </div>
                            ) : (
                                <span style={{
                                    textShadow: isStamp ? 'none' : '0 2px 4px rgba(0,0,0,0.2)'
                                }}>{currentTag.text || "Taggtext"}</span>
                            )}
                        </div>
                    </div>

                    {/* Specification summary list */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-3 rounded-xl text-[10px] font-mono text-slate-400 dark:text-slate-500 space-y-1">
                        <div className="flex justify-between"><span>Typ:</span><span className="font-bold text-slate-600 dark:text-slate-300 capitalize">{currentTag.displayType || 'tag'}</span></div>
                        <div className="flex justify-between"><span>Storlek:</span><span className="font-bold text-slate-600 dark:text-slate-300">{currentTag.fontSize}</span></div>
                        <div className="flex justify-between"><span>Typsnitt:</span><span className="font-bold text-slate-600 dark:text-slate-300">{currentTag.fontFamily || 'sans'}</span></div>
                        {isStamp && <div className="flex justify-between"><span>Form & ram:</span><span className="font-bold text-slate-600 dark:text-slate-300 uppercase">{shape} / {currentTag.border || 'none'}</span></div>}
                        <div className="flex justify-between"><span>Rörelseeffekt:</span><span className="font-bold text-slate-600 dark:text-slate-300 uppercase">{currentTag.animation || 'ingen'}</span></div>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={onCancel} className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition-all">
                            Avbryt
                        </button>
                        <button onClick={handleSave} className="flex-1 py-3 px-4 bg-teal-600 hover:bg-teal-500 font-bold text-xs text-white rounded-xl shadow transition-all">
                            Spara designresurs
                        </button>
                    </div>

                </div>

            </div>

        </div>
    );
};
