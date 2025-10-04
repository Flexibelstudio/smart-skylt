import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Organization, DisplayPost, UserData, Tag, PostTemplate, DisplayScreen } from '../types';
import { Card } from './Card';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from './ConfirmDialog';
import { PrimaryButton, SecondaryButton, DestructiveButton } from './Buttons';
import { StyledInput, StyledSelect, FontSelector } from './Forms';
import { ChevronDownIcon, PencilIcon, TrashIcon } from './icons';
import QRCode from 'qrcode';
import { DisplayPostRenderer } from './DisplayPostRenderer';

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

const getTagAnimationClass = (animation?: Tag['animation']) => {
    switch(animation) {
        case 'pulse': return 'animate-pulse-tag';
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
        img.onerror = (error) => {
            URL.revokeObjectURL(img.src);
            reject(error);
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
    const [instagramUserId, setInstagramUserId] = useState(organization.instagramUserId || '');
    
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
        setInstagramUserId(organization.instagramUserId || '');
        
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
    }, [organization]);

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
        } else if (confirmReset === 'social') {
            setLatestInstagramPostUrl(organization.latestInstagramPostUrl || '');
            setInstagramUserId(organization.instagramUserId || '');
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

    const isSocialDirty = latestInstagramPostUrl !== (organization.latestInstagramPostUrl || '') || instagramUserId !== (organization.instagramUserId || '');

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
             <Card title="Varumärke" saving={isSaving}>
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

             <Card title="Sociala Medier" subTitle="Koppla innehåll från sociala medier.">
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
                <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-700">
                    <label htmlFor="insta-stories-id" className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Instagram Business Account ID (för Stories)</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Ange ID:t för ditt Instagram Business-konto för att automatiskt visa era händelser. <a href="https://www.facebook.com/business/help/1503421739714571" target="_blank" rel="noopener noreferrer" className="text-primary underline">Hur hittar jag detta?</a></p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
                        <strong>Viktigt:</strong> Kopplingen till Instagram behöver förnyas var 60:e dag på grund av Metas säkerhetspolicy. Du kommer att få en notis i appen när det är dags att förnya.
                    </p>
                    <StyledInput
                        id="insta-stories-id"
                        type="text"
                        value={instagramUserId}
                        onChange={(e) => setInstagramUserId(e.target.value)}
                        placeholder="T.ex. 17841405822392293"
                        className="mt-2"
                    />
                </div>
                 <div className="flex justify-end mt-4 gap-2">
                    {isSocialDirty && <SecondaryButton onClick={() => setConfirmReset('social')}>Återställ</SecondaryButton>}
                    <PrimaryButton 
                        onClick={() => handleSave(() => onUpdateOrganization(organization.id, { latestInstagramPostUrl, instagramUserId }), "Inställningar för sociala medier sparade.")} 
                        disabled={!isSocialDirty}
                        loading={isSaving}
                        title={!isSocialDirty ? "Inga ändringar att spara" : ""}
                    >
                        Spara
                    </PrimaryButton>
                </div>
            </Card>

            <Card title="Verksamhetsbeskrivning" subTitle="Hjälp AI:n att förstå din verksamhet för bättre resultat." saving={isSaving}>
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
            </Card>
            
            <TagManager 
                tags={tags}
                onSave={handleSaveTag}
                onDelete={(tag) => setTagToDelete(tag)}
                editingTag={editingTag}
                setEditingTag={setEditingTag}
            />
            <PostTemplateManager 
                organization={organization}
                onUpdatePostTemplates={onUpdatePostTemplates}
            />
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
                className="w-12 h-12 p-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
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
            onSave(currentTag);
        }
    };
    
    return (
        <div className="bg-slate-100 dark:bg-slate-700/60 p-4 rounded-lg space-y-4 border border-slate-200 dark:border-slate-600">
            {/* Live Preview */}
             <div className="p-4 rounded-lg bg-slate-200 dark:bg-slate-900/50 flex items-center justify-center min-h-[80px] border border-slate-300 dark:border-slate-600 border-dashed">
                <div
                    style={{
                        backgroundColor: currentTag.backgroundColor,
                        color: currentTag.textColor,
                        ...(currentTag.animation === 'glow' ? { '--glow-color': currentTag.backgroundColor } : {})
                    }}
                    className={`
                        inline-flex items-center rounded-lg shadow-lg uppercase tracking-wider
                        ${currentTag.url ? 'p-1' : 'px-4 py-2'}
                        ${getTagFontSizeClass(currentTag.fontSize, true)}
                        ${getTagFontFamilyClass(currentTag.fontFamily)}
                        ${getTagFontWeightClass(currentTag.fontWeight)}
                        ${getTagAnimationClass(currentTag.animation)}
                    `}
                >
                    {currentTag.url ? (
                        <div className="flex items-center gap-2">
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
                <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Position</label>
                    <div className="grid grid-cols-3 gap-1 w-24 h-24 p-1 rounded-lg bg-slate-200 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-600">
                        {(['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const).map(pos => {
                            const isActive = (currentTag.position || 'top-left') === pos;
                            return (
                                <button
                                    key={pos}
                                    type="button"
                                    onClick={() => setCurrentTag({ ...currentTag, position: pos })}
                                    className={`rounded-md transition-colors ${isActive ? 'bg-primary ring-2 ring-offset-2 ring-offset-slate-100 dark:ring-offset-slate-700 ring-primary' : 'bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600'}`}
                                    aria-label={`Position ${pos.replace('-', ' ')}`}
                                />
                            );
                        })}
                    </div>
                </div>
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
                <PrimaryButton onClick={handleSave} className="bg-green-600 hover:bg-green-500">Spara Tagg</PrimaryButton>
            </div>
        </div>
    );
}

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
            text: '',
            backgroundColor: '#ef4444',
            textColor: '#FFFFFF',
            fontSize: 'md',
            fontFamily: 'display',
            fontWeight: 'black',
            animation: 'pulse',
            position: 'top-left',
        });
    };
    
    return (
        <Card title="Taggar">
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
                        <PrimaryButton onClick={handleAddNew}>Skapa ny tagg</PrimaryButton>
                    </>
                )}
            </div>
        </Card>
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
        <Card title="Inläggsmallar" subTitle="Återanvändbara designer för dina inlägg. Skapa nya mallar från ett befintligt inlägg i kanal-redigeraren.">
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
            </div>

             <ConfirmDialog
                isOpen={!!templateToDelete}
                onClose={() => setTemplateToDelete(null)}
                onConfirm={confirmDelete}
                title="Ta bort mall"
            >
               <p>Är du säker på att du vill ta bort mallen "{templateToDelete?.templateName}"? Detta kan inte ångras.</p>
            </ConfirmDialog>
        </Card>
    );
};
