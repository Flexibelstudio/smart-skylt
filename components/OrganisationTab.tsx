
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
import { generateDnaAnalysis, analyzeWebsiteContent } from '../services/geminiService';

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

            <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                 <h4 className="font-semibold text-lg mb-2">Webbplats</h4>
                 <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Ange en länk till er hemsida eller sociala medier (t.ex. Instagram) för ytterligare kontext.</p>
                 <StyledInput value={profile.websiteUrl || ''} onChange={e => setProfile(p => ({...p, websiteUrl: e.target.value}))} placeholder="https://www.exempel.se"/>
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
            showToast({ message: "DNA-analys har genererats!", type: 'success' });
        } catch (error) {
            showToast({ message: `Kunde inte generera analys: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleFeedback = async (feedback: 'positive' | 'negative') => {
        if (!analysis) return;
        await onUpdateOrganization(organization.id, { styleProfile: { ...analysis, feedback } });
        showToast({ message: "Tack för din feedback!", type: 'info' });
    };
    
    const handleStartEdit = () => {
        setEditedProfile(analysis || {});
        setIsEditing(true);
    };

    const handleSaveEdit = async () => {
        await onUpdateOrganization(organization.id, { styleProfile: { ...analysis, ...editedProfile, lastUpdatedAt: new Date().toISOString() } });
        setIsEditing(false);
        showToast({ message: "Analys uppdaterad.", type: 'success' });
    };
    
    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditedProfile({});
    };

    const handleFieldChange = (field: keyof StyleProfile, value: string) => {
        setEditedProfile(prev => ({...prev, [field]: value}));
    };

    const analysisItems = [
        { key: 'brandPersonality', label: 'Varumärkespersonlighet', icon: <UserCircleIcon className="h-6 w-6 text-indigo-400" /> },
        { key: 'targetAudience', label: 'Målgrupp', icon: <UsersIcon className="h-6 w-6 text-teal-400" /> },
        { key: 'coreMessage', label: 'Kärnbudskap', icon: <ChatBubbleLeftRightIcon className="h-6 w-6 text-sky-400" /> },
        { key: 'visualStyle', label: 'Visuell Stil', icon: <PaintBrushIcon className="h-6 w-6 text-rose-400" /> },
        { key: 'toneOfVoice', label: 'Tonalitet', icon: <MegaphoneIcon className="h-6 w-6 text-amber-400" /> },
    ];

    return (
        <div>
            <div className="flex justify-between items-center">
                <div>
                    <h4 className="font-semibold text-lg mb-2">DNA-analys</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                        Låt AI:n analysera din verksamhetsinformation för att skapa en "DNA-profil". Denna profil hjälper AI:n att generera mer träffsäkert innehåll.
                    </p>
                </div>
                <PrimaryButton onClick={handleGenerate} loading={isGenerating}>
                    {analysis?.lastUpdatedAt ? 'Uppdatera DNA-analys' : 'Generera DNA-analys'}
                </PrimaryButton>
            </div>
            
            {analysis?.lastUpdatedAt && (
                <div className="mt-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                    {isEditing ? (
                        <div className="space-y-4">
                            {analysisItems.map(item => (
                                <div key={item.key}>
                                    <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1">{item.label}</label>
                                    <textarea
                                        rows={2}
                                        value={editedProfile[item.key as keyof StyleProfile] as string || ''}
                                        onChange={e => handleFieldChange(item.key as keyof StyleProfile, e.target.value)}
                                        className="w-full bg-white dark:bg-slate-800 p-2 rounded-md border border-slate-300 dark:border-slate-600"
                                    />
                                </div>
                            ))}
                            <div className="flex justify-end gap-2">
                                <SecondaryButton onClick={handleCancelEdit}>Avbryt</SecondaryButton>
                                <PrimaryButton onClick={handleSaveEdit}>Spara ändringar</PrimaryButton>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {analysisItems.map(item => (
                                <div key={item.key} className="flex items-start gap-3">
                                    <div className="flex-shrink-0 pt-1">{item.icon}</div>
                                    <div>
                                        <h5 className="font-bold text-slate-700 dark:text-slate-200">{item.label}</h5>
                                        <p className="text-slate-600 dark:text-slate-400">{analysis[item.key as keyof StyleProfile] as string || '...'}</p>
                                    </div>
                                </div>
                            ))}
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Är analysen korrekt?</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <button onClick={() => handleFeedback('positive')} className={`p-2 rounded-full transition-colors ${analysis.feedback === 'positive' ? 'bg-green-100 dark:bg-green-900/50 text-green-500' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                            <HandThumbUpIcon className="h-5 w-5"/>
                                        </button>
                                        <button onClick={() => handleFeedback('negative')} className={`p-2 rounded-full transition-colors ${analysis.feedback === 'negative' ? 'bg-red-100 dark:bg-red-900/50 text-red-500' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                            <HandThumbDownIcon className="h-5 w-5"/>
                                        </button>
                                    </div>
                                </div>
                                <SecondaryButton onClick={handleStartEdit}><PencilIcon className="h-4 w-4 mr-2"/> Redigera</SecondaryButton>
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
}> = ({ onImportSuccess }) => {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { showToast } = useToast();

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
        <Card title="Importera från hemsida" subTitle="Låt AI:n besöka din hemsida och automatiskt ställa in färger, typsnitt och varumärkesprofil.">
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
}> = ({ tags, onSave, onDelete, editingTag, setEditingTag }) => {
    
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
    const [latestInstagramPostUrl, setLatestInstagramPostUrl] = useState(organization.latestInstagramPostUrl || '');
    
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();
    const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);
    const [confirmReset, setConfirmReset] = useState<'branding' | 'business' | 'social' | null>(null);
    
    // State for Tag Manager
    const [tags, setTags] = useState<Tag[]>(organization.tags || []);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);

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
        setLatestInstagramPostUrl(organization.latestInstagramPostUrl || '');
        
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
                console.log("Facebook Access Token received:", accessToken);
                // Here, you would typically save this token securely to your backend
                // and exchange it for a long-lived token.
                showToast({ message: "Anslutningen till Facebook lyckades! Ditt token är loggat i konsolen.", type: 'success'});
                // Clean the URL
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            } else if (params.get('error')) {
                console.error("Facebook OAuth Error:", params.get('error_description'));
                showToast({ message: "Anslutningen till Facebook misslyckades.", type: 'error'});
                 window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }
    }, [organization, showToast]);

    const handleImportFromWebsite = async (data: any, url: string) => {
        // Map the AI result to state variables
        setPrimaryColor(data.primaryColor || primaryColor);
        if (data.secondaryColor) setSecondaryColor(data.secondaryColor);
        
        // Logo
        if (data.logoUrl) {
            setLogoLight(data.logoUrl);
            setLogoDark(data.logoUrl);
        }

        // Map font categories to our specific fonts (best guess)
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

        // --- ONE CLICK SETUP LOGIC ---
        // 1. Construct temporary profile objects
        const updatedPreferenceProfile = { 
            ...(organization.preferenceProfile || {}),
            textSnippets: data.textSnippets || organization.preferenceProfile?.textSnippets || [],
            websiteUrl: url
        };

        // 2. Prepare partial organization update for DB
        const partialUpdate: Partial<Organization> = {
            preferenceProfile: updatedPreferenceProfile,
            businessDescription: data.businessDescription || organization.businessDescription,
            businessType: newBusinessTypes,
        };

        // 3. Update DB immediately with structural data
        await onUpdateOrganization(organization.id, partialUpdate);

        // 4. Trigger DNA Analysis
        try {
            // Merge for the AI prompt context
            const orgForAnalysis = { 
                ...organization, 
                ...partialUpdate, 
                // Mix in visual data even if not saved to DB yet, so DNA analysis knows colors
                primaryColor: data.primaryColor || organization.primaryColor,
            };
            
            showToast({ message: "Skapar DNA-profil...", type: 'info' });
            const dnaResult = await generateDnaAnalysis(orgForAnalysis);
            
            // 5. Save DNA result
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

    const handleFacebookConnect = () => {
        // @ts-ignore
        const clientId = window.RUNTIME_CONFIG?.facebookAppId || '';
        if (!clientId || clientId.startsWith('YOUR_')) {
            showToast({
                message: "Facebook App ID är inte konfigurerat. Uppdatera public/config.js med ett giltigt App ID.",
                type: 'error',
                duration: 8000
            });
            return;
        }

        const redirectUri = window.location.origin + window.location.pathname; // Redirect back to the current page
        const scope = 'instagram_basic,pages_show_list,instagram_manage_insights';
        
        const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=token`;
        
        // Redirect the user to the Facebook auth page
        window.location.href = authUrl;
    };

    const handleSave = async (saveAction: () => Promise<any>, successMessage: string) => {
        setIsSaving(true);
        try {
            await saveAction();
            showToast({ message: successMessage, type: 'success' });
        } catch (e) {
            showToast({ message: `Kunde inte spara: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
            if ((window as any).DEBUG_MODE) {
                console.error("Full save error object:", e);
            }
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
        } else if (confirmReset === 'social') {
            setLatestInstagramPostUrl(organization.latestInstagramPostUrl || '');
        }
        setConfirmReset(null);
    };
    
    const handleSaveTag = (tagToSave: Tag) => {
        setEditingTag(null);
        // Use a functional update to prevent issues with stale state, and perform an optimistic update
        setTags(prevTags => {
            let updatedTags;
            const isNew = !prevTags.some(t => t.id === tagToSave.id);
            if (isNew) {
                updatedTags = [...prevTags, tagToSave];
            } else {
                updatedTags = prevTags.map(t => t.id === tagToSave.id ? tagToSave : t);
            }
            
            // Asynchronously save to the backend
            handleSave(() => onUpdateTags(organization.id, updatedTags), isNew ? "Tagg skapad." : "Tagg uppdaterad.");
            
            // Return the new state for the optimistic update
            return updatedTags;
        });
    };

    const confirmDeleteTag = () => {
        if (!tagToDelete) return;
        
        const tagId = tagToDelete.id;
        const updatedTags = tags.filter(t => t.id !== tagId);
        setTags(updatedTags); // Optimistic update

        const updatedScreens = (organization.displayScreens || []).map(screen => ({
            ...screen,
            posts: screen.posts.map(post => ({
                ...post,
                tagIds: (post.tagIds || []).filter(id => id !== tagId)
            }))
        }));
        // Save both updates
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

    const isBusinessInfoDirty = JSON.stringify(businessTypesToSave) !== JSON.stringify(organization.businessType || []) || businessDescription !== (organization.businessDescription || '');

    const isSocialDirty = latestInstagramPostUrl !== (organization.latestInstagramPostUrl || '');

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
        <div className="space-y-8">
            <WebsiteImporter onImportSuccess={handleImportFromWebsite} />

            <Card title="Visuell Identitet" subTitle="Fasta regler för ditt varumärke som AI:n följer, som logotyper, färger och typsnitt." saving={isSaving}>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ImageUploader label="Logotyp (Ljust tema)" imageUrl={logoLight} onImageChange={setLogoLight} isSaving={isSaving}/>
                        <ImageUploader label="Logotyp (Mörkt tema)" imageUrl={logoDark} onImageChange={setLogoDark} isSaving={isSaving}/>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Varumärkesfärger</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <ColorPicker label="Primärfärg" color={primaryColor} onChange={setPrimaryColor} />
                            <OptionalColorPicker label="Sekundärfärg" color={secondaryColor} onChange={setSecondaryColor} defaultColor="#f97316" />
                            <OptionalColorPicker label="Tertiärfärg" color={tertiaryColor} onChange={setTertiaryColor} defaultColor="#3b82f6" />
                            <OptionalColorPicker label="Accentfärg" color={accentColor} onChange={setAccentColor} defaultColor="#ec4899" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-gray-400 mb-1">Typsnitt (Rubriker)</label>
                            <FontSelector value={headlineFontFamily} onChange={setHeadlineFontFamily} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-gray-400 mb-1">Typsnitt (Brödtext)</label>
                            <FontSelector value={bodyFontFamily} onChange={setBodyFontFamily} />
                        </div>
                    </div>
                </div>
                 <div className="flex justify-end mt-4 gap-2">
                    {isVarumarkeDirty && <SecondaryButton onClick={() => setConfirmReset('branding')}>Återställ</SecondaryButton>}
                    <PrimaryButton 
                        onClick={() => handleSave(() => Promise.all([
                            onUpdateLogos(organization.id, {light: logoLight, dark: logoDark}), 
                            onUpdateOrganization(organization.id, {
                                primaryColor: primaryColor,
                                secondaryColor: secondaryColor,
                                tertiaryColor: tertiaryColor,
                                accentColor: accentColor,
                                headlineFontFamily: headlineFontFamily,
                                bodyFontFamily: bodyFontFamily,
                            })
                        ]), "Varumärke sparat.")} 
                        disabled={!isVarumarkeDirty}
                        loading={isSaving}
                        title={!isVarumarkeDirty ? "Inga ändringar att spara" : ""}
                    >
                        Spara varumärke
                    </PrimaryButton>
                </div>
            </Card>

            <Card title="AI-träning & Personalisering" subTitle="Ge AI:n inspiration och kontext för att skapa innehåll som matchar din stil och röst." saving={isSaving}>
                 <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Typ av verksamhet</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {businessTypes.map(type => (
                                <label key={type} className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={businessType.includes(type)}
                                        onChange={e => handleBusinessTypeChange(type, e.target.checked)}
                                        className="h-5 w-5 rounded text-primary focus:ring-primary"
                                    />
                                    <span className="font-medium text-slate-800 dark:text-slate-200">{type}</span>
                                </label>
                            ))}
                        </div>
                         {businessType.includes('Annat') && (
                            <div className="mt-2 animate-fade-in">
                                <StyledInput
                                    type="text"
                                    value={otherBusinessType}
                                    onChange={e => setOtherBusinessType(e.target.value)}
                                    placeholder="Beskriv din verksamhet..."
                                />
                            </div>
                        )}
                    </div>
                    <div>
                        <label htmlFor="business-description" className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Beskriv din verksamhet</label>
                        <textarea
                            id="business-description"
                            rows={4}
                            value={businessDescription}
                            onChange={e => setBusinessDescription(e.target.value)}
                            placeholder="T.ex. 'Vi är ett familjeägt bageri som specialiserar oss på surdegsbröd och ekologiska råvaror. Vi har även ett café med lunchservering.'"
                            className="w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                        />
                    </div>
                </div>
                <div className="flex justify-end mt-4 gap-2">
                    {isBusinessInfoDirty && <SecondaryButton onClick={() => setConfirmReset('business')}>Återställ</SecondaryButton>}
                    <PrimaryButton
                        onClick={() => handleSave(() => onUpdateOrganization(organization.id, { businessType: businessTypesToSave, businessDescription }), "Beskrivning sparad.")}
                        disabled={!isBusinessInfoDirty}
                        loading={isSaving}
                        title={!isBusinessInfoDirty ? "Inga ändringar att spara" : ""}
                    >
                        Spara beskrivning
                    </PrimaryButton>
                </div>
                <hr className="my-6 border-slate-200 dark:border-slate-700" />
                <DnaAnalysisManager organization={organization} onUpdateOrganization={onUpdateOrganization} />
                <hr className="my-6 border-slate-200 dark:border-slate-700" />
                <PreferenceProfileManager organization={organization} onUpdateOrganization={onUpdateOrganization} />
            </Card>

            <Card title="Design- & Innehållsresurser" subTitle="Dina egna återanvändbara byggstenar för att snabbt skapa innehåll.">
                 <div className="space-y-6">
                    <div>
                        <h4 className="text-xl font-bold text-slate-900 dark:text-white">Taggar & Stämplar</h4>
                        <TagManager tags={tags} onSave={handleSaveTag} onDelete={(tag) => setTagToDelete(tag)} editingTag={editingTag} setEditingTag={setEditingTag} />
                    </div>
                    <hr className="my-6 border-slate-200 dark:border-slate-700" />
                    <div>
                        <h4 className="text-xl font-bold text-slate-900 dark:text-white">Inläggsmallar</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">Återanvändbara designer för dina inlägg. Skapa nya mallar från ett befintligt inlägg i kanal-redigeraren.</p>
                        <PostTemplateManager organization={organization} onUpdatePostTemplates={onUpdatePostTemplates} />
                    </div>
                </div>
            </Card>

            <Card title="Integrationer" subTitle="Koppla externa källor som sociala medier för att automatiskt hämta innehåll.">
                <div>
                    <label htmlFor="insta-url" className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Länk till senaste Instagram-inlägg</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Klistra in länken här varje gång ni publicerar ett nytt inlägg på Instagram. Alla skyltfönster som använder 'Senaste Instagram'-inlägget kommer att uppdateras automatiskt.</p>
                    <StyledInput
                        id="insta-url"
                        type="url"
                        value={latestInstagramPostUrl}
                        onChange={(e) => setLatestInstagramPostUrl(e.target.value)}
                        placeholder="https://www.instagram.com/p/..."
                    />
                </div>
                 <div className="flex justify-end mt-4 gap-2">
                    {isSocialDirty && <SecondaryButton onClick={() => setConfirmReset('social')}>Återställ</SecondaryButton>}
                    <PrimaryButton 
                        onClick={() => handleSave(() => onUpdateOrganization(organization.id, { latestInstagramPostUrl }), "Inställningar för sociala medier sparade.")} 
                        disabled={!isSocialDirty}
                        loading={isSaving}
                        title={!isSocialDirty ? "Inga ändringar att spara" : ""}
                    >
                        Spara
                    </PrimaryButton>
                </div>
            </Card>
            
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
const TagEditor: React.FC<{ tag: Tag, onSave: (tag: Tag) => void, onCancel: () => void }> = ({ tag, onSave, onCancel }) => {
    const [currentTag, setCurrentTag] = useState(tag);
    
    useEffect(() => {
        setCurrentTag(tag);
    }, [tag]);

    const handleSave = () => {
        if (currentTag.text.trim()) {
            const tagToSave = { ...currentTag };
            if (tagToSave.displayType === 'stamp' && !tagToSave.shape) {
                tagToSave.shape = 'circle'; // Ensure shape is set for stamps
            }
            onSave(tagToSave);
        }
    };
    
    const isStamp = currentTag.displayType === 'stamp';
    const isPreview = true;

    let stampClasses = '';
    let stampStyles: React.CSSProperties = {};
    const shape = (isStamp && currentTag.shape) ? currentTag.shape : 'circle';


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
        
        if (currentTag.border === 'solid') {
            stampClasses += ' border-2 ';
            stampStyles.borderColor = 'currentColor';
        } else if (currentTag.border === 'dashed') {
            stampClasses += ' border-2 border-dashed ';
            stampStyles.borderColor = 'currentColor';
        }
    } else {
        stampClasses += ' rounded-lg ';
    }
    
    let paddingClass = '';
    const isShapeVertical = isStamp && (shape === 'circle' || shape === 'square');
    if (currentTag.url) {
        paddingClass = isPreview ? 'p-0.5' : 'p-1';
    } else if (isStamp) {
        if (shape === 'circle' || shape === 'square') {
            paddingClass = isPreview ? 'p-2' : 'p-4';
        } else { // rectangle
            paddingClass = isPreview ? 'px-2 py-1' : 'px-4 py-2';
        }
    } else { // it's a tag
        paddingClass = isPreview ? 'px-2 py-1' : 'px-4 py-2';
    }

    return (
        <div className="bg-slate-100 dark:bg-slate-700/60 p-4 rounded-lg space-y-4 border border-slate-200 dark:border-slate-600">
            {/* Live Preview */}
             <div className="p-4 rounded-lg bg-slate-200 dark:bg-slate-900/50 flex items-center justify-center min-h-[80px] border border-slate-300 dark:border-slate-600 border-dashed">
                <div
                    style={{
                        backgroundColor: isStamp ? hexToRgba(currentTag.backgroundColor, currentTag.opacity ?? 1) : currentTag.backgroundColor,
                        color: currentTag.textColor,
                        ...(currentTag.animation === 'glow' ? { '--glow-color': currentTag.backgroundColor } : {}),
                        ...stampStyles
                    }}
                    className={`
                        inline-flex items-center shadow-lg
                        ${paddingClass}
                        ${getTagFontSizeClass(currentTag.fontSize, true)}
                        ${getTagFontFamilyClass(currentTag.fontFamily)}
                        ${isStamp ? '' : getTagFontWeightClass(currentTag.fontWeight)}
                        ${getTagAnimationClass(currentTag.animation, currentTag.displayType)}
                        ${stampClasses}
                    `}
                >
                    {currentTag.url ? (
                        <div className={`flex items-center ${isShapeVertical ? 'flex-col gap-1' : 'gap-2'}`}>
                            <span>{currentTag.text || "Taggtext"}</span>
                            <div className="bg-white p-0.5 rounded-sm">
                                <QrCodePreview url={currentTag.url} />
                            </div>
                        </div>
                    ) : (
                        currentTag.text || "Taggtext"
                    )}
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center gap-2 p-1 bg-slate-200 dark:bg-slate-900 rounded-lg">
                    <button
                        type="button"
                        onClick={() => setCurrentTag(t => ({ ...t, displayType: 'tag' }))}
                        className={`flex-1 py-2 px-4 rounded-md font-semibold text-sm transition-shadow ${(!currentTag.displayType || currentTag.displayType === 'tag') ? 'bg-white dark:bg-slate-700 shadow' : 'text-slate-600 dark:text-slate-300'}`}
                    >
                        Tagg
                    </button>
                    <button
                        type="button"
                        onClick={() => setCurrentTag(t => ({ ...t, displayType: 'stamp' }))}
                        className={`flex-1 py-2 px-4 rounded-md font-semibold text-sm transition-shadow ${currentTag.displayType === 'stamp' ? 'bg-white dark:bg-slate-700 shadow' : 'text-slate-600 dark:text-slate-300'}`}
                    >
                        Stämpel
                    </button>
                </div>
                <StyledInput type="text" placeholder="Taggens text" value={currentTag.text} onChange={e => setCurrentTag({...currentTag, text: e.target.value})} />
                <StyledInput type="url" placeholder="URL för QR-kod (valfritt)" value={currentTag.url || ''} onChange={e => setCurrentTag({...currentTag, url: e.target.value.trim()})} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                     <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Bakgrundsfärg</label>
                     <input type="color" value={currentTag.backgroundColor} onChange={e => setCurrentTag({...currentTag, backgroundColor: e.target.value})} className="w-full h-12 p-1 bg-white dark:bg-black rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"/>
                </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Textfärg</label>
                    <div className="flex gap-2">
                        <button onClick={() => setCurrentTag({...currentTag, textColor: '#FFFFFF'})} className={`flex-1 h-12 p-2 rounded-lg transition-all ${currentTag.textColor === '#FFFFFF' ? 'ring-2 ring-primary' : ''} bg-white text-black shadow-inner-soft`}>Vit</button>
                        <button onClick={() => setCurrentTag({...currentTag, textColor: '#000000'})} className={`flex-1 h-12 p-2 rounded-lg transition-all ${currentTag.textColor === '#000000' ? 'ring-2 ring-primary' : ''} bg-black text-white`}>Svart</button>
                    </div>
                 </div>
                 {isStamp && (
                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                            Opacitet ({Math.round((currentTag.opacity ?? 1) * 100)}%)
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round((currentTag.opacity ?? 1) * 100)}
                            onChange={e => setCurrentTag({...currentTag, opacity: parseInt(e.target.value, 10) / 100 })}
                            className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                 )}
                 <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Storlek</label>
                    <StyledSelect value={currentTag.fontSize} onChange={e => setCurrentTag({...currentTag, fontSize: e.target.value as Tag['fontSize']})}>
                        <option value="sm">Liten</option>
                        <option value="md">Mellan</option>
                        <option value="lg">Stor</option>
                        <option value="xl">XL</option>
                        <option value="2xl">2XL</option>
                        <option value="3xl">3XL</option>
                        <option value="4xl">4XL</option>
                        <option value="5xl">5XL (Jätte)</option>
                    </StyledSelect>
                </div>
                {isStamp ? (
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Form</label>
                            {/* Triangel borttagen p.g.a. textklippning och layoutproblem. Kan återinföras som ikonvariant vid behov. */}
                            <StyledSelect value={currentTag.shape || 'circle'} onChange={e => setCurrentTag({...currentTag, shape: e.target.value as Tag['shape']})}>
                                <option value="circle">Cirkel</option>
                                <option value="rectangle">Rektangel</option>
                                <option value="square">Kvadrat</option>
                            </StyledSelect>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Ram</label>
                            <StyledSelect value={currentTag.border || 'none'} onChange={e => setCurrentTag({...currentTag, border: e.target.value as Tag['border']})}>
                                <option value="none">Ingen</option>
                                <option value="solid">Solid</option>
                                <option value="dashed">Streckad</option>
                            </StyledSelect>
                        </div>
                    </div>
                ) : (
                    // Position-funktionen borttagen – taggens placering hanteras nu direkt i förhandsgranskningen.
                    null
                )}
                <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Typsnitt</label>
                    <FontSelector value={currentTag.fontFamily || 'sans'} onChange={font => setCurrentTag({...currentTag, fontFamily: font})} />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Tjocklek</label>
                    <StyledSelect value={currentTag.fontWeight} onChange={e => setCurrentTag({...currentTag, fontWeight: e.target.value as Tag['fontWeight']})}>
                        <option value="bold">Bold</option>
                        <option value="black">Black (Extra tjock)</option>
                    </StyledSelect>
                </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Animation</label>
                    <StyledSelect value={currentTag.animation} onChange={e => setCurrentTag({...currentTag, animation: e.target.value as Tag['animation']})}>
                        <option value="none">Ingen</option>
                        <option value="pulse">Puls</option>
                        <option value="glow">Glow</option>
                    </StyledSelect>
                </div>
            </div>
            <div className="flex justify-end gap-2">
                <SecondaryButton onClick={onCancel}>Avbryt</SecondaryButton>
                <PrimaryButton onClick={handleSave} className="bg-green-600 hover:bg-green-500">Spara</PrimaryButton>
            </div>
        </div>
    );
}
