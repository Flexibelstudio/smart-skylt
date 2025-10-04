import React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Organization, CustomPage, UserRole, InfoCarousel, InfoMessage, DisplayScreen, DisplayPost, UserData, Tag, SystemSettings, ScreenPairingCode, BrandingOptions, PostTemplate, CampaignIdea, CustomEvent, PhysicalScreen, MediaItem } from '../types';
import { ToggleSwitch, CompactToggleSwitch, MonitorIcon, PencilIcon, TrashIcon, CodeBracketIcon, MagnifyingGlassIcon, SparklesIcon, ShareIcon, DuplicateIcon, ChevronDownIcon, CheckCircleIcon, VideoCameraIcon, PlayIcon, PauseIcon } from './icons';
import { getAdminsForOrganization, setAdminRole, inviteUser, getSystemSettings, getPairingCode, pairAndActivateScreen, uploadMediaForGallery } from '../services/firebaseService';
import { MarkdownRenderer } from './CustomContentScreen';
import { useAuth } from '../context/AuthContext';
import { DisplayPostRenderer } from './DisplayPostRenderer';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from './ConfirmDialog';
import { PrimaryButton, SecondaryButton, DestructiveButton } from './Buttons';
import { StyledInput, StyledSelect } from './Forms';
import { EmptyState } from './EmptyState';
import { getSwedishHolidays } from '../data/holidays';
import { generateCampaignIdeasForEvent } from '../services/geminiService';
import QRCode from 'qrcode';
import { Card } from './Card';
import { OrganisationTab } from './OrganisationTab';
import { InputDialog } from './DisplayScreenEditor/Modals';


interface SuperAdminScreenProps {
    organization: Organization;
    adminRole: 'superadmin' | 'admin';
    userRole: UserRole;
    theme: string;
    onSetUserScreenPin: (uid: string, pin: string) => Promise<void>;
    onUpdateLogos: (organizationId: string, logos: { light: string; dark: string }) => Promise<void>;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
    onUpdateDisplayScreens: (organizationId: string, displayScreens: DisplayScreen[]) => Promise<void>;
    onUpdateTags: (organizationId: string, tags: Tag[]) => Promise<void>;
    onUpdatePostTemplates: (organizationId: string, templates: PostTemplate[]) => Promise<void>;
    onEditDisplayScreen: (screen: DisplayScreen) => void;
}

const ShareModal: React.FC<{
    screen: DisplayScreen;
    organization: Organization;
    onClose: () => void;
}> = ({ screen, organization, onClose }) => {
    const [activeTab, setActiveTab] = useState<'embed' | 'link'>('embed');
    const embedUrl = `${window.location.origin}/embed/org/${organization.id}/screen/${screen.id}`;
    const iframeCode = `<iframe src="${embedUrl}" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>`;
    
    const [copiedCode, setCopiedCode] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');

    useEffect(() => {
        QRCode.toDataURL(embedUrl, { width: 256, margin: 1 })
            .then(setQrCodeDataUrl)
            .catch(console.error);
    }, [embedUrl]);

    const handleCopy = (text: string, type: 'code' | 'link') => {
        navigator.clipboard.writeText(text).then(() => {
            if (type === 'code') {
                setCopiedCode(true);
                setTimeout(() => setCopiedCode(false), 2000);
            } else {
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
            }
        });
    };

    const TabButton: React.FC<{
        tabId: 'embed' | 'link';
        children: React.ReactNode;
        icon: React.ReactNode;
    }> = ({ tabId, children, icon }) => (
        <button
            onClick={() => setActiveTab(tabId)}
            className={`flex-1 flex items-center justify-center gap-2 p-3 font-semibold rounded-t-lg transition-colors ${
                activeTab === tabId
                    ? 'bg-white dark:bg-slate-800 text-primary border-b-2 border-primary'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-900/30'
            }`}
        >
            {icon}
            {children}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="text-2xl font-bold mb-1">Dela eller Bädda In</h2>
                    <p className="text-slate-600 dark:text-slate-300">Visa innehållsmallen "{screen.name}" på din hemsida eller dela en direktlänk.</p>
                </div>
                <div className="flex bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                    <TabButton tabId="embed" icon={<CodeBracketIcon className="h-5 w-5" />}>Bädda in på hemsida</TabButton>
                    <TabButton tabId="link" icon={<ShareIcon className="h-5 w-5" />}>Direktlänk & QR-kod</TabButton>
                </div>
                
                <div className="p-6">
                    {activeTab === 'embed' && (
                        <div className="space-y-4 animate-fade-in">
                            <p className="text-sm text-slate-600 dark:text-slate-300">För att visa innehållet direkt på din egen hemsida, kopiera och klistra in denna HTML-kod. Detta är standardmetoden för att 'bädda in' innehåll.</p>
                            <div className="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg">
                                <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all font-mono">
                                    <code>{iframeCode}</code>
                                </pre>
                            </div>
                            <div className="flex justify-end">
                                <PrimaryButton onClick={() => handleCopy(iframeCode, 'code')}>
                                    {copiedCode ? 'Kopierad!' : 'Kopiera kod'}
                                </PrimaryButton>
                            </div>
                        </div>
                    )}

                    {activeTab === 'link' && (
                        <div className="space-y-6 animate-fade-in">
                            <div>
                                <h3 className="font-semibold mb-1">Direktlänk</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">Dela denna länk för att låta andra se innehållet i helskärm. Perfekt för e-post eller sociala medier.</p>
                                <div className="flex gap-2">
                                    <input readOnly value={embedUrl} className="w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 font-mono text-sm" />
                                    <PrimaryButton onClick={() => handleCopy(embedUrl, 'link')}>
                                        {copiedLink ? 'Kopierad!' : 'Kopiera'}
                                    </PrimaryButton>
                                </div>
                            </div>
                             <div>
                                <h3 className="font-semibold mb-2">QR-kod</h3>
                                <div className="flex items-center gap-6">
                                    {qrCodeDataUrl ? (
                                        <div className="bg-white p-3 rounded-lg"><img src={qrCodeDataUrl} alt="QR Code" className="w-32 h-32" /></div>
                                    ) : (
                                        <div className="w-32 h-32 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
                                    )}
                                    <div className="space-y-2">
                                        <p className="text-sm text-slate-600 dark:text-slate-300">Skanna koden med en mobil för att snabbt öppna innehållet.</p>
                                        <a href={qrCodeDataUrl} download={`qr-code-${screen.name.replace(/\s+/g, '-')}.png`}>
                                            <SecondaryButton>Ladda ner QR-kod</SecondaryButton>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                 <div className="flex justify-end gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 rounded-b-xl">
                    <SecondaryButton onClick={onClose}>Stäng</SecondaryButton>
                </div>
            </div>
        </div>
    );
};


type AdminTab = 'skyltfonster' | 'organisation' | 'galleri' | 'admin';

const TabButton: React.FC<{
    tabId: AdminTab;
    activeTab: AdminTab;
    setActiveTab: (tabId: AdminTab) => void;
    children: React.ReactNode;
    highlight?: boolean;
}> = ({ tabId, activeTab, setActiveTab, children, highlight }) => {
    const isActive = activeTab === tabId;
    return (
        <button
            onClick={() => setActiveTab(tabId)}
            className={`relative px-4 py-2 text-base font-semibold transition-colors focus:outline-none rounded-t-lg ${isActive
                ? 'bg-white dark:bg-slate-800 text-primary border-b-2 border-primary'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                }`}
            role="tab"
            aria-selected={isActive}
        >
            {children}
            {highlight && !isActive && (
                <span className="absolute top-1 right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </span>
            )}
        </button>
    );
};

interface CampaignIdeaGeneratorForOrgProps {
    isOpen: boolean;
    onClose: () => void;
    eventName: string | null;
    organization: Organization;
    onUpdateDisplayScreens: (organizationId: string, displayScreens: DisplayScreen[]) => Promise<void>;
    onEditDisplayScreen: (screen: DisplayScreen) => void;
}

const CampaignIdeaGeneratorForOrg: React.FC<CampaignIdeaGeneratorForOrgProps> = ({ isOpen, onClose, eventName, organization, onUpdateDisplayScreens, onEditDisplayScreen }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [ideas, setIdeas] = useState<CampaignIdea[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { showToast } = useToast();

    useEffect(() => {
        if (isOpen && eventName) {
            const fetchIdeas = async () => {
                setIsLoading(true);
                setIdeas(null);
                setError(null);
                try {
                    const fetchedIdeas = await generateCampaignIdeasForEvent(
                        eventName,
                        organization.name,
                        organization.businessType,
                        organization.businessDescription
                    );
                    setIdeas(fetchedIdeas);
                } catch (e) {
                    setError(e instanceof Error ? e.message : "Kunde inte hämta idéer.");
                } finally {
                    setIsLoading(false);
                }
            };
            fetchIdeas();
        }
    }, [isOpen, eventName, organization, organization.name, organization.businessType, organization.businessDescription]);

    const handleCreatePost = async (idea: CampaignIdea, screen: DisplayScreen) => {
        const newPost: DisplayPost = {
            id: `new-${Date.now()}`,
            internalTitle: `AI Idé: ${idea.headline}`,
            layout: 'image-fullscreen',
            headline: idea.headline,
            body: idea.body,
            durationSeconds: 15,
            backgroundColor: 'black',
            textColor: 'white',
            imageOverlayEnabled: true,
        };

        const updatedScreens = (organization.displayScreens || []).map(s => {
            if (s.id === screen.id) {
                return { ...s, posts: [...(s.posts || []), newPost] };
            }
            return s;
        });

        try {
            await onUpdateDisplayScreens(organization.id, updatedScreens);
            showToast({ message: `Utkast skapat för "${screen.name}".`, type: 'success' });
            onEditDisplayScreen(screen); // This will navigate the user
            onClose();
        } catch (e) {
            showToast({ message: "Kunde inte skapa inlägget.", type: 'error' });
        }
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-white shadow-2xl border border-slate-700 animate-fade-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-2">✨ AI-kampanjidéer för "{eventName}"</h2>
                {isLoading && (
                     <div className="text-center py-12">
                        <SparklesIcon className="h-10 w-10 text-primary animate-pulse mx-auto" />
                        <p className="mt-4 text-slate-300">Genererar kreativa idéer...</p>
                    </div>
                )}
                {error && (
                    <div className="text-center py-12">
                        <p className="text-red-400">Ett fel inträffade:</p>
                        <p className="text-slate-300 mt-2">{error}</p>
                    </div>
                )}
                {ideas && !isLoading && (
                    <div className="space-y-4 mt-6">
                        <p className="text-slate-300">Här är några förslag. Välj en idé och ett skyltfönster för att skapa ett utkast.</p>
                        {ideas.map((idea, index) => (
                            <div key={index} className="bg-slate-700/50 p-4 rounded-lg border border-slate-600">
                                <h3 className="font-bold text-primary">{idea.headline}</h3>
                                <p className="text-slate-300 text-sm mt-1 mb-3">{idea.body}</p>
                                <div className="pt-3 border-t border-slate-600">
                                    <h4 className="text-sm font-semibold text-slate-400 mb-2">Skapa inlägg i:</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {organization.displayScreens && organization.displayScreens.length > 0 ? (
                                            organization.displayScreens.map(screen => (
                                                <button
                                                    key={screen.id}
                                                    onClick={() => handleCreatePost(idea, screen)}
                                                    className="bg-slate-600 hover:bg-primary/80 text-white font-semibold px-3 py-1.5 rounded-lg text-sm"
                                                >
                                                    {screen.name}
                                                </button>
                                            ))
                                        ) : (
                                            <p className="text-xs text-slate-500">Inga skyltfönster har skapats än.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex justify-end mt-6">
                    <SecondaryButton onClick={onClose}>Stäng</SecondaryButton>
                </div>
            </div>
        </div>
    );
};

interface UpcomingEventBannerProps {
    event: { name: string; icon: string };
    daysUntil: number;
    onGenerateIdeas: (eventName: string) => void;
}

const UpcomingEventBanner: React.FC<UpcomingEventBannerProps> = ({ event, daysUntil, onGenerateIdeas }) => {
    let countdownText = '';
    if (daysUntil < 0) return null; // Should not happen with current logic, but a safeguard.
    if (daysUntil === 0) {
        countdownText = 'är idag!';
    } else if (daysUntil === 1) {
        countdownText = 'är imorgon!';
    } else {
        countdownText = `är om ${daysUntil} dagar!`;
    }

    return (
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-6 shadow-lg">
            <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="text-5xl">{event.icon}</div>
                <div>
                    <h3 className="text-2xl font-bold">{event.name} {countdownText}</h3>
                    <p className="text-purple-200">Dags att planera en kampanj?</p>
                </div>
            </div>
            <PrimaryButton onClick={() => onGenerateIdeas(event.name)} className="bg-white/90 hover:bg-white text-purple-700 font-bold flex-shrink-0">
                <SparklesIcon className="h-5 w-5" /> Hämta kampanjidéer
            </PrimaryButton>
        </div>
    );
};

const CompleteProfileModal: React.FC<{
    isOpen: boolean;
    onSave: (data: Partial<Organization>) => Promise<void>;
    organization: Organization;
}> = ({ isOpen, onSave, organization }) => {
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();
    const [details, setDetails] = useState({
        address: organization.address || '',
        email: organization.email || '',
        phone: organization.phone || '',
        contactPerson: organization.contactPerson || '',
        orgNumber: organization.orgNumber || '',
    });

    useEffect(() => {
        setDetails({
            address: organization.address || '',
            email: organization.email || '',
            phone: organization.phone || '',
            contactPerson: organization.contactPerson || '',
            orgNumber: organization.orgNumber || '',
        });
    }, [organization]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setDetails(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave(details);
            showToast({ message: "Profil uppdaterad. Tack!", type: 'success' });
        } catch (error) {
            showToast({ message: "Kunde inte spara profilen.", type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const isFormValid = details.address.trim() && details.email.trim() && details.phone.trim() && details.contactPerson.trim() && details.orgNumber.trim();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
            <div 
                className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in"
            >
                <form onSubmit={handleSave}>
                    <h2 className="text-2xl font-bold mb-2">Slutför er organisationsprofil</h2>
                    <p className="text-slate-600 dark:text-slate-300 mb-6">Välkommen! För att komma igång behöver vi lite mer information om er organisation. Fyll i fälten nedan.</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Adress</label>
                            <StyledInput type="text" name="address" value={details.address} onChange={handleChange} required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Kontaktperson</label>
                            <StyledInput type="text" name="contactPerson" value={details.contactPerson} onChange={handleChange} required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Organisationsnummer</label>
                            <StyledInput type="text" name="orgNumber" value={details.orgNumber} onChange={handleChange} required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">E-post</label>
                            <StyledInput type="email" name="email" value={details.email} onChange={handleChange} required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Telefon</label>
                            <StyledInput type="tel" name="phone" value={details.phone} onChange={handleChange} required />
                        </div>
                    </div>
                    
                    <div className="flex justify-end mt-8">
                        <PrimaryButton type="submit" loading={isSaving} disabled={!isFormValid}>
                            Spara och fortsätt
                        </PrimaryButton>
                    </div>
                </form>
            </div>
        </div>
    );
};

interface MediaGalleryManagerProps extends SuperAdminScreenProps {}

const MediaGalleryManager: React.FC<MediaGalleryManagerProps> = ({ organization, onUpdateOrganization }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useToast();

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const { url, type } = await uploadMediaForGallery(organization.id, file, (progress) => {
                setUploadProgress(progress);
            });
            
            const newMediaItem: MediaItem = {
                id: `media-${Date.now()}`,
                type,
                url,
                internalTitle: file.name,
                createdAt: new Date().toISOString(),
                createdBy: 'user',
            };

            const updatedLibrary = [...(organization.mediaLibrary || []), newMediaItem];
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
            
            showToast({ message: "Media uppladdad!", type: 'success' });

        } catch (error) {
            console.error(error);
            showToast({ message: `Kunde inte ladda upp fil: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
            if(fileInputRef.current) {
                fileInputRef.current.value = ""; // Reset file input
            }
        }
    };

    const handleDelete = async (mediaId: string) => {
        // Note: This only removes from Firestore DB, not from Storage.
        // A real-world app would need a cloud function to delete from Storage.
        // For this exercise, just removing the reference is sufficient.
        if (!window.confirm("Är du säker på att du vill ta bort denna media? Filen kommer inte tas bort från lagringen, men den kommer inte längre synas i galleriet.")) return;

        const updatedLibrary = (organization.mediaLibrary || []).filter(item => item.id !== mediaId);
        try {
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
            showToast({ message: "Media borttagen.", type: 'success' });
        } catch (error) {
            console.error(error);
            showToast({ message: `Kunde inte ta bort media: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        }
    };

    const mediaLibrary = organization.mediaLibrary || [];

    return (
        <Card title="Galleri" subTitle="Hantera dina återanvändbara bilder och videos.">
            <div className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <h4 className="font-semibold text-lg mb-2">Ladda upp ny media</h4>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/mp4" />
                <PrimaryButton onClick={() => fileInputRef.current?.click()} loading={isUploading} disabled={isUploading}>
                    {isUploading ? `Laddar upp... ${uploadProgress.toFixed(0)}%` : 'Välj fil (bild eller video)'}
                </PrimaryButton>
            </div>

            {mediaLibrary.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-6">
                    {mediaLibrary.map(item => (
                        <div key={item.id} className="relative group aspect-square bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden">
                            {item.type === 'image' ? (
                                <img src={item.url} alt={item.internalTitle} className="w-full h-full object-cover" />
                            ) : (
                                <video src={item.url} muted loop playsInline className="w-full h-full object-cover" />
                            )}
                             <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between">
                                <p className="text-white text-xs font-semibold line-clamp-2">{item.internalTitle}</p>
                                <DestructiveButton onClick={() => handleDelete(item.id)} className="self-end !p-2">
                                    <TrashIcon className="h-4 w-4" />
                                </DestructiveButton>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyState 
                    icon={<VideoCameraIcon className="h-12 w-12 text-slate-400" />}
                    title="Galleriet är tomt"
                    message="Ladda upp bilder och videos för att enkelt kunna återanvända dem i dina inlägg och collage."
                />
            )}
        </Card>
    );
};

export const SuperAdminScreen: React.FC<SuperAdminScreenProps> = (props) => {
    const { organization, theme, onUpdateDisplayScreens, onUpdateOrganization } = props;
    const [activeTab, setActiveTab] = useState<AdminTab>('skyltfonster');
    
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    const [isSettingsLoading, setIsSettingsLoading] = useState(true);
    
    const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
    const [screenToPreview, setScreenToPreview] = useState<DisplayScreen | null>(null);
    const [screenToShare, setScreenToShare] = useState<DisplayScreen | null>(null);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    
    const [isBrandingGuideVisible, setIsBrandingGuideVisible] = useState(false);
    const brandingGuideDismissedKey = `smart-skylt-branding-guide-dismissed-${organization.id}`;

    const isBrandingProfileIncomplete = useMemo(() => {
        return !organization.businessDescription || !organization.businessType || organization.businessType.length === 0;
    }, [organization.businessDescription, organization.businessType]);

    useEffect(() => {
        const dismissed = localStorage.getItem(brandingGuideDismissedKey);
        if (isBrandingProfileIncomplete && !dismissed) {
            setIsBrandingGuideVisible(true);
        } else {
            setIsBrandingGuideVisible(false);
        }
    }, [isBrandingProfileIncomplete, brandingGuideDismissedKey]);

    const handleDismissBrandingGuide = () => {
        localStorage.setItem(brandingGuideDismissedKey, 'true');
        setIsBrandingGuideVisible(false);
    };

    const handleGoToBrandingFromGuide = () => {
        setActiveTab('organisation');
        handleDismissBrandingGuide();
    };

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const settings = await getSystemSettings();
                setSystemSettings(settings);
            } catch (error) {
                console.error("Failed to load system settings", error);
            } finally {
                setIsSettingsLoading(false);
            }
        };
        fetchSettings();
    }, []);
    
     useEffect(() => {
        // Check if essential information is missing
        if (organization && (!organization.address || !organization.phone || !organization.orgNumber || !organization.contactPerson)) {
            setIsProfileModalOpen(true);
        } else {
            setIsProfileModalOpen(false);
        }
    }, [organization]);

    const handleSaveProfile = async (data: Partial<Organization>) => {
        await onUpdateOrganization(organization.id, data);
        // The modal will close automatically because the organization prop will update, and the useEffect will set isOpen to false.
    };

    const displayLogoUrl = theme === 'dark' 
        ? (organization.logoUrlDark || organization.logoUrlLight)
        : (organization.logoUrlLight || organization.logoUrlDark);

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8 animate-fade-in pb-12">
            {/* Identity Header */}
            <div className="text-center mb-4 min-h-[64px] flex items-center justify-center">
                {displayLogoUrl ? (
                    <img src={displayLogoUrl} alt={`${organization.name} logotyp`} className="max-h-16 object-contain" />
                ) : (
                    <h1 className="text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">{organization.name}</h1>
                )}
            </div>

            {isBrandingGuideVisible && (
                <BrandingSetupGuide 
                    onGoToBranding={handleGoToBrandingFromGuide} 
                    onDismiss={handleDismissBrandingGuide} 
                />
            )}

            <div className="mb-6 flex justify-center border-b border-slate-200 dark:border-slate-700" role="tablist">
                <TabButton tabId="skyltfonster" activeTab={activeTab} setActiveTab={setActiveTab}>
                    Skyltfönster
                </TabButton>
                <TabButton 
                    tabId="organisation" 
                    activeTab={activeTab} 
                    setActiveTab={setActiveTab}
                    highlight={isBrandingGuideVisible}
                >
                    Varumärke
                </TabButton>
                <TabButton tabId="galleri" activeTab={activeTab} setActiveTab={setActiveTab}>
                    Galleri
                </TabButton>
                <TabButton tabId="admin" activeTab={activeTab} setActiveTab={setActiveTab}>
                    Administration
                </TabButton>
            </div>

            <div className="space-y-8">
                {activeTab === 'skyltfonster' && <SkyltfonsterContent {...props} systemSettings={systemSettings} onOpenPairingModal={() => setIsPairingModalOpen(true)} onPreviewScreen={setScreenToPreview} onShareScreen={setScreenToShare} />}
                {activeTab === 'organisation' && <OrganisationTab {...props} />}
                {activeTab === 'galleri' && <MediaGalleryManager {...props} />}
                {activeTab === 'admin' && <AdminContent {...props} />}
            </div>
            
            <PairingModal
                isOpen={isPairingModalOpen}
                onClose={() => setIsPairingModalOpen(false)}
                organization={organization}
                systemSettings={systemSettings}
                onPairSuccess={(newScreen) => {
                    const updatedScreens = [...(organization.physicalScreens || []), newScreen];
                    onUpdateOrganization(organization.id, { physicalScreens: updatedScreens });
                }}
            />
            {screenToPreview && (
                <DisplayScreenPreviewModal
                    screen={screenToPreview}
                    organization={organization}
                    onClose={() => setScreenToPreview(null)}
                />
            )}
            {screenToShare && (
                <ShareModal
                    screen={screenToShare}
                    organization={organization}
                    onClose={() => setScreenToShare(null)}
                />
            )}
            <CompleteProfileModal
                isOpen={isProfileModalOpen}
                onSave={handleSaveProfile}
                organization={organization}
            />
        </div>
    );
};

const BrandingSetupGuide: React.FC<{ onGoToBranding: () => void; onDismiss: () => void }> = ({ onGoToBranding, onDismiss }) => {
    return (
        <div className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white p-6 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-6 shadow-lg relative animate-fade-in">
            <button onClick={onDismiss} className="absolute top-3 right-3 text-cyan-100 hover:text-white" title="Dölj guide">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="text-5xl">
                    <SparklesIcon className="w-12 h-12" />
                </div>
                <div>
                    <h3 className="text-2xl font-bold">Börja här för bästa resultat!</h3>
                    <p className="text-cyan-100 mt-1">Fyll i din varumärkesprofil så kan AI:n skapa innehåll som är perfekt anpassat för dig.</p>
                </div>
            </div>
            <PrimaryButton onClick={onGoToBranding} className="bg-white/90 hover:bg-white text-teal-600 font-bold flex-shrink-0">
                Fyll i varumärkesprofil
            </PrimaryButton>
        </div>
    );
};

// --- Content Components for each Tab ---

const ScreenStats: React.FC<{ screen: DisplayScreen }> = ({ screen }) => {
    const now = new Date();

    const activePosts = (screen.posts || []).filter(post => {
        const startDate = post.startDate ? new Date(post.startDate) : null;
        const endDate = post.endDate ? new Date(post.endDate) : null;
        if (startDate && startDate > now) return false;
        if (endDate && endDate < now) return false;
        return true;
    });

    const activePostCount = activePosts.length;
    
    // Logic to calculate days remaining until the last post expires
    let latestEndDate: Date | null = null;
    (screen.posts || []).forEach(post => {
        if (post.endDate) {
            const endDate = new Date(post.endDate);
            if (!latestEndDate || endDate > latestEndDate) {
                latestEndDate = endDate;
            }
        }
    });

    let daysRemaining: number | null = null;
    let daysRemainingText = '';
    let textColorClass = 'text-slate-500 dark:text-slate-400';

    if (latestEndDate && latestEndDate > now) {
        const diffTime = latestEndDate.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (daysRemaining <= 7) {
            textColorClass = 'text-red-500 font-bold';
        } else if (daysRemaining <= 14) {
            textColorClass = 'text-yellow-500';
        }
        
        daysRemainingText = `${daysRemaining} ${daysRemaining === 1 ? 'dag' : 'dagar'} kvar`;
    }

    return (
        <div className="flex items-center gap-4 text-sm font-semibold">
            {daysRemainingText && (
                <span className={textColorClass} title={`Sista inlägget går ut om ${daysRemaining} ${daysRemaining === 1 ? 'dag' : 'dagar'}.`}>
                    {daysRemainingText}
                </span>
            )}
            <span className="text-slate-600 dark:text-slate-300" title={`${activePostCount} inlägg är aktiva just nu.`}>
                {activePostCount} {activePostCount === 1 ? 'inlägg' : 'inlägg'}
            </span>
        </div>
    );
};

interface ScreenManagerProps {
    screens: DisplayScreen[];
    isSaving: boolean;
    onUpdateScreens: (updatedScreens: DisplayScreen[]) => void;
    onEditDisplayScreen: (screen: DisplayScreen) => void;
    onPreview: (screen: DisplayScreen) => void;
    onShare: (screen: DisplayScreen) => void;
    onCreateScreenTemplate: () => void;
}

const ScreenManager: React.FC<ScreenManagerProps> = ({ screens, isSaving, onUpdateScreens, onEditDisplayScreen, onPreview, onShare, onCreateScreenTemplate }) => {
    const [renamingScreenId, setRenamingScreenId] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [screenToDelete, setScreenToDelete] = useState<DisplayScreen | null>(null);

    const confirmDeleteScreen = () => {
        if (!screenToDelete) return;
        const updatedScreens = screens.filter(s => s.id !== screenToDelete.id);
        onUpdateScreens(updatedScreens);
        setScreenToDelete(null);
    };

    const handleSaveName = (screenId: string) => {
        if (newName.trim() === '') return;
        const updatedScreens = screens.map(s => s.id === screenId ? { ...s, name: newName.trim() } : s);
        onUpdateScreens(updatedScreens);
        setRenamingScreenId(null);
    };

    return (
        <>
            <div className="space-y-3">
                {(screens || []).length > 0 ? (
                    screens.map(screen => (
                        <div key={screen.id} className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg flex flex-col sm:flex-row justify-between items-center gap-4 border border-slate-200 dark:border-slate-700">
                            {renamingScreenId === screen.id ? (
                                <div className="w-full flex-grow flex items-center gap-2">
                                    <StyledInput
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveName(screen.id)}
                                    />
                                    <PrimaryButton onClick={() => handleSaveName(screen.id)}>Spara</PrimaryButton>
                                    <SecondaryButton onClick={() => setRenamingScreenId(null)}>Avbryt</SecondaryButton>
                                </div>
                            ) : (
                                <>
                                    <div className="flex-grow flex items-center gap-2 text-center sm:text-left justify-center sm:justify-start">
                                        <p className="font-semibold text-lg text-slate-900 dark:text-white">{screen.name}</p>
                                        <button
                                            onClick={() => { setRenamingScreenId(screen.id); setNewName(screen.name); }}
                                            disabled={isSaving}
                                            className="text-slate-400 hover:text-primary dark:hover:text-primary transition-colors p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600"
                                            aria-label={`Byt namn på ${screen.name}`}
                                        >
                                            <PencilIcon className="h-5 w-5" />
                                        </button>
                                    </div>
                                    <div className="flex items-center flex-wrap justify-center sm:justify-end gap-2">
                                        <div className="flex-shrink-0 mr-2">
                                            <ScreenStats screen={screen} />
                                        </div>
                                        <PrimaryButton onClick={() => onEditDisplayScreen(screen)} disabled={isSaving} className="bg-blue-600 hover:bg-blue-500">Hantera</PrimaryButton>
                                        <button onClick={() => onShare(screen)} disabled={isSaving} title="Dela / Bädda in" className="p-3 rounded-lg bg-slate-600 hover:bg-slate-500 text-white transition-colors"><ShareIcon className="h-5 w-5"/></button>
                                        <button onClick={() => onPreview(screen)} disabled={isSaving} title="Förhandsgranska" className="p-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition-colors"><MagnifyingGlassIcon className="h-5 w-5"/></button>
                                        <button onClick={() => setScreenToDelete(screen)} disabled={isSaving} title="Ta bort" className="p-3 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"><TrashIcon className="h-5 w-5"/></button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))
                ) : (
                   <EmptyState 
                        icon={<MonitorIcon className="h-12 w-12 text-slate-400" />}
                        title="Tomt på kanaler"
                        message="Skapa din första kanal för att komma igång."
                        action={{ text: 'Skapa första kanalen', onClick: onCreateScreenTemplate, disabled: isSaving }}
                   />
                )}
            </div>
            
            <ConfirmDialog
                isOpen={!!screenToDelete}
                onClose={() => setScreenToDelete(null)}
                onConfirm={confirmDeleteScreen}
                title="Bekräfta borttagning"
            >
                <p>Är du säker på att du vill ta bort kanalen "{screenToDelete?.name}" och allt dess innehåll? Detta kan inte ångras.</p>
            </ConfirmDialog>
        </>
    );
};


interface SkyltfonsterContentProps extends SuperAdminScreenProps {
    systemSettings: SystemSettings | null;
    onOpenPairingModal: () => void;
    onPreviewScreen: (screen: DisplayScreen) => void;
    onShareScreen: (screen: DisplayScreen) => void;
}

const WorkflowGuide: React.FC<{ onDismiss: () => void; }> = ({ onDismiss }) => {
    const Step: React.FC<{ num: number; icon: React.ReactNode; title: string; children: React.ReactNode; color: string; }> = ({ num, icon, title, children, color }) => (
        <div className="flex-1 flex items-start gap-4">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-lg ${color}`}>
                {num}
            </div>
            <div>
                <div className="flex items-center gap-2">
                    <span className="text-slate-500 dark:text-slate-400">{icon}</span>
                    <h4 className="font-bold text-lg text-slate-800 dark:text-white">{title}</h4>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{children}</p>
            </div>
        </div>
    );

    return (
        <div className="bg-white dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative animate-fade-in">
            <button onClick={onDismiss} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="Dölj guide">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 text-center">Så här kommer du igång!</h3>
            <div className="flex flex-col md:flex-row items-start gap-8">
                <Step num={1} icon={<PencilIcon className="h-5 w-5" />} title="Skapa en Kanal" color="bg-blue-500">
                    En kanal är en "spellista" eller mall för vad som ska visas. Du kan ha olika kanaler för olika skärmar, t.ex. en för kassan och en för entrén.
                </Step>
                <div className="hidden md:block text-slate-300 dark:text-slate-600 self-center transform rotate-90 md:rotate-0">
                    <ChevronDownIcon className="h-8 w-8" />
                </div>
                <Step num={2} icon={<MonitorIcon className="h-5 w-5" />} title="Fyll den med Inlägg" color="bg-purple-500">
                    Gå in på "Hantera" för din nya kanal och skapa inlägg. Det är här du lägger till text, bilder och videos som ska visas på skärmen.
                </Step>
                <div className="hidden md:block text-slate-300 dark:text-slate-600 self-center transform rotate-90 md:rotate-0">
                    <ChevronDownIcon className="h-8 w-8" />
                </div>
                 <Step num={3} icon={<CheckCircleIcon className="h-5 w-5" />} title="Anslut Skyltfönster" color="bg-teal-500">
                    När du är nöjd med din kanal, anslut en fysisk TV eller skärm genom att följa instruktionerna nedan. Du "parar ihop" skärmen med din kanal.
                </Step>
            </div>
        </div>
    );
};


const SkyltfonsterContent: React.FC<SkyltfonsterContentProps> = (props) => {
    const { organization, onUpdateDisplayScreens, onEditDisplayScreen, onOpenPairingModal, onPreviewScreen, onShareScreen, systemSettings, onUpdateOrganization } = props;
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();
    const [ideaModalEventName, setIdeaModalEventName] = useState<string | null>(null);
    const [isWorkflowGuideVisible, setIsWorkflowGuideVisible] = useState(() => (organization.physicalScreens || []).length === 0);
    
    const physicalScreens = organization.physicalScreens || [];


    const handleGenerateIdeasClick = (eventName: string) => {
        setIdeaModalEventName(eventName);
    };

    const nextEventData = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Ignore time for comparison

        const holidays = getSwedishHolidays(now.getFullYear());
        const holidaysNextYear = getSwedishHolidays(now.getFullYear() + 1);

        const allEvents = [
            ...holidays.map(h => ({ ...h, isCustom: false })),
            ...holidaysNextYear.map(h => ({ ...h, isCustom: false })),
            ...(organization.customEvents || []).map(ce => ({ date: new Date(`${ce.date}T12:00:00Z`), name: ce.name, icon: ce.icon, isCustom: true }))
        ];

        const upcomingEvents = allEvents
            .filter(event => event.date >= today)
            .sort((a, b) => a.date.getTime() - b.date.getTime());

        if (upcomingEvents.length === 0) {
            return null;
        }

        const nextEvent = upcomingEvents[0];
        const diffTime = nextEvent.date.getTime() - today.getTime();
        const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return { event: nextEvent, daysUntil };
    }, [organization.customEvents]);
    
    const handleUpdateScreens = async (updatedScreens: DisplayScreen[]) => {
        setIsSaving(true);
        try {
            await onUpdateDisplayScreens(organization.id, updatedScreens);
        } catch(e) {
             console.error(e);
             showToast({ message: `Ett fel uppstod: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateScreenTemplate = () => {
        const newScreen: DisplayScreen = {
            id: `screen-${Date.now()}`,
            name: 'Ny Kanal',
            isEnabled: true,
            posts: [],
            aspectRatio: '16:9',
        };
        handleUpdateScreens([...(organization.displayScreens || []), newScreen]);
    };

    return (
        <div className="space-y-8">
            {isWorkflowGuideVisible && <WorkflowGuide onDismiss={() => setIsWorkflowGuideVisible(false)} />}
            
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                 <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Anslut ett nytt skyltfönster</h3>
                <p className="text-slate-600 dark:text-slate-300">
                    Öppna webbläsaren på den nya skärmen och skriv in den korta adressen: <strong className="font-mono text-primary bg-slate-100 dark:bg-slate-900/50 px-2 py-1 rounded-md">skylt.smartskylt.se</strong>.
                    Skärmen visar då en 6-siffrig kod. Klicka på knappen nedan och ange koden för att para ihop skärmen med en av dina kanaler.
                </p>
            </div>


            {nextEventData && (
                <UpcomingEventBanner
                    event={nextEventData.event}
                    daysUntil={nextEventData.daysUntil}
                    onGenerateIdeas={handleGenerateIdeasClick}
                />
            )}
        
            <div className="flex justify-between items-center flex-wrap gap-4">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Dina Kanaler & Skyltfönster</h3>
                 <div className="flex flex-wrap gap-2">
                    <SecondaryButton onClick={handleCreateScreenTemplate}>
                        Skapa ny kanal
                    </SecondaryButton>
                    <PrimaryButton onClick={onOpenPairingModal} className="bg-teal-600 hover:bg-teal-500">
                        Anslut Skyltfönster till Kanal
                    </PrimaryButton>
                 </div>
            </div>

            <div className="space-y-6">
                <Card title="Dina kanaler" subTitle="Skapa och hantera kanaler som sedan kan visas på dina skyltfönster." saving={isSaving}>
                    <ScreenManager
                        screens={organization.displayScreens || []}
                        isSaving={isSaving}
                        onUpdateScreens={handleUpdateScreens}
                        onEditDisplayScreen={onEditDisplayScreen}
                        onPreview={onPreviewScreen}
                        onShare={onShareScreen}
                        onCreateScreenTemplate={handleCreateScreenTemplate}
                    />
                </Card>

                <Card title="Anslutna Skyltfönster" subTitle={`Du har ${physicalScreens.length} aktiva Skyltfönster.`} saving={isSaving}>
                    <PhysicalScreenManager 
                        organization={organization}
                        allDisplayScreens={organization.displayScreens || []}
                        onUpdateOrganization={onUpdateOrganization}
                    />
                </Card>
            </div>

            <CampaignIdeaGeneratorForOrg
                isOpen={!!ideaModalEventName}
                onClose={() => setIdeaModalEventName(null)}
                eventName={ideaModalEventName}
                organization={organization}
                onUpdateDisplayScreens={onUpdateDisplayScreens}
                onEditDisplayScreen={onEditDisplayScreen}
            />
        </div>
    );
};


// NEW Component to manage the list of physical screens
const PhysicalScreenManager: React.FC<{ 
    organization: Organization;
    allDisplayScreens: DisplayScreen[];
    onUpdateOrganization: (orgId: string, data: Partial<Organization>) => Promise<void>;
}> = ({ organization, allDisplayScreens, onUpdateOrganization }) => {
    const { showToast } = useToast();
    const [screenToRename, setScreenToRename] = useState<PhysicalScreen | null>(null);
    const [screenToDisconnect, setScreenToDisconnect] = useState<PhysicalScreen | null>(null);
    const physicalScreens = organization.physicalScreens || [];
    
    const getChannelName = (displayScreenId: string) => {
        return allDisplayScreens.find(s => s.id === displayScreenId)?.name || 'Okänd kanal';
    };

    const handleSaveName = async (newName: string) => {
        if (!screenToRename) return;
        const updatedScreens = physicalScreens.map(s => 
            s.id === screenToRename.id ? { ...s, name: newName } : s
        );
        try {
            await onUpdateOrganization(organization.id, { physicalScreens: updatedScreens });
            showToast({ message: "Namnet har ändrats.", type: 'success' });
        } catch (e) {
            showToast({ message: "Kunde inte ändra namnet.", type: 'error' });
        } finally {
            setScreenToRename(null);
        }
    };

    const confirmDisconnect = async () => {
        if (!screenToDisconnect) return;
        const updatedScreens = physicalScreens.filter(s => s.id !== screenToDisconnect.id);
        try {
            await onUpdateOrganization(organization.id, { physicalScreens: updatedScreens });
            showToast({ message: "Skyltfönstret har kopplats från.", type: 'success' });
        } catch (e) {
            showToast({ message: "Kunde inte koppla från.", type: 'error' });
        } finally {
            setScreenToDisconnect(null);
        }
    };

    return (
        <>
            <div className="space-y-3">
                {physicalScreens.length > 0 ? (
                    physicalScreens.map(screen => (
                        <div key={screen.id} className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg flex flex-col sm:flex-row justify-between items-center gap-4 border border-slate-200 dark:border-slate-700">
                            <div className="flex-grow text-center sm:text-left">
                                <p className="font-semibold text-lg text-slate-900 dark:text-white">{screen.name}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Visar: "{getChannelName(screen.displayScreenId)}"</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <SecondaryButton onClick={() => setScreenToRename(screen)}>Byt namn</SecondaryButton>
                                <DestructiveButton onClick={() => setScreenToDisconnect(screen)}>Koppla från</DestructiveButton>
                            </div>
                        </div>
                    ))
                ) : (
                    <EmptyState 
                        icon={<MonitorIcon className="h-12 w-12 text-slate-400" />}
                        title="Inga skyltfönster anslutna"
                        message="Använd knappen 'Anslut Skyltfönster till Kanal' för att para ihop en TV och aktivera din första licens."
                    />
                )}
            </div>

            <InputDialog
                isOpen={!!screenToRename}
                onClose={() => setScreenToRename(null)}
                onSave={handleSaveName}
                title="Byt namn på skyltfönster"
                labelText="Nytt namn"
                initialValue={screenToRename?.name || ''}
                saveText="Spara namn"
            />

            <ConfirmDialog
                isOpen={!!screenToDisconnect}
                onClose={() => setScreenToDisconnect(null)}
                onConfirm={confirmDisconnect}
                title="Koppla från skyltfönster"
                confirmText="Ja, koppla från"
            >
                <p>Är du säker på att du vill koppla från "{screenToDisconnect?.name}"? Skärmen kommer att återgå till anslutningsläget och behöver paras ihop på nytt för att visa innehåll.</p>
            </ConfirmDialog>
        </>
    );
};

const AdminContent: React.FC<SuperAdminScreenProps> = ({ organization, adminRole, onSetUserScreenPin, onUpdateOrganization }) => {
    const [name, setName] = useState(organization.name);
    const [address, setAddress] = useState(organization.address || '');
    const [email, setEmail] = useState(organization.email || '');
    const [phone, setPhone] = useState(organization.phone || '');
    const [contactPerson, setContactPerson] = useState(organization.contactPerson || '');
    const [orgNumber, setOrgNumber] = useState(organization.orgNumber || '');
    const [isSavingOrgDetails, setIsSavingOrgDetails] = useState(false);
    const { showToast } = useToast();

    const [admins, setAdmins] = useState<UserData[]>([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteResult, setInviteResult] = useState<{success: boolean, message: string, link?: string} | null>(null);
    const [isInviting, setIsInviting] = useState(false);
    
    const [editingPinForUid, setEditingPinForUid] = useState<string | null>(null);
    const [newPin, setNewPin] = useState('');
    const [isSettingPin, setIsSettingPin] = useState(false);


    const fetchUsers = useCallback(async () => {
        setAdmins(await getAdminsForOrganization(organization.id));
    }, [organization.id]);

    useEffect(() => {
        setName(organization.name);
        setAddress(organization.address || '');
        setEmail(organization.email || '');
        setPhone(organization.phone || '');
        setContactPerson(organization.contactPerson || '');
        setOrgNumber(organization.orgNumber || '');
        fetchUsers();
    }, [organization, fetchUsers]);
    
    const handleSaveGrunduppgifter = async () => {
        setIsSavingOrgDetails(true);
        try {
            await onUpdateOrganization(organization.id, { 
                name: name.trim(),
                address: address.trim(),
                email: email.trim(),
                phone: phone.trim(),
                contactPerson: contactPerson.trim(),
                orgNumber: orgNumber.trim(),
            });
            showToast({ message: "Organisationsuppgifter sparade.", type: 'success' });
        } catch (e) {
            showToast({ message: `Kunde inte spara: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsSavingOrgDetails(false);
        }
    };
    
    const isGrunduppgifterDirty = 
        name.trim() !== organization.name ||
        address.trim() !== (organization.address || '') ||
        email.trim() !== (organization.email || '') ||
        phone.trim() !== (organization.phone || '') ||
        contactPerson.trim() !== (organization.contactPerson || '') ||
        orgNumber.trim() !== (organization.orgNumber || '');

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!inviteEmail) return;
        setIsInviting(true);
        setInviteResult(null);
        const result = await inviteUser(organization.id, inviteEmail);
        setInviteResult(result);
        if (result.success) {
            showToast({ message: result.message, type: 'success' });
            setInviteEmail('');
            fetchUsers();
        } else {
             showToast({ message: result.message, type: 'error' });
        }
        setIsInviting(false);
    };
    
    const handleSavePin = async (uid: string) => {
        if (!/^\d{4,6}$/.test(newPin)) {
            showToast({ message: "PIN måste bestå av 4-6 siffror.", type: 'error' });
            return;
        }
        setIsSettingPin(true);
        try {
            await onSetUserScreenPin(uid, newPin);
            await fetchUsers();
            setEditingPinForUid(null);
            setNewPin('');
        } catch (error) {
            // Error is shown by parent component's toast
        } finally {
            setIsSettingPin(false);
        }
    };
    
    const renderUserRow = (user: UserData) => (
        <div key={user.uid} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border border-slate-200 dark:border-slate-700">
            <div className="flex-grow">
                <p className="font-semibold text-slate-800 dark:text-slate-200">{user.email}</p>
                {user.role === 'organizationadmin' && adminRole === 'superadmin' && (
                     <label className="flex items-center gap-2 mt-1 text-sm text-slate-500 dark:text-slate-400">
                         <CompactToggleSwitch checked={user.adminRole === 'superadmin'} onChange={checked => setAdminRole(user.uid, checked ? 'superadmin' : 'admin')} />
                         Superadmin
                     </label>
                )}
            </div>
            
            {editingPinForUid === user.uid ? (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <StyledInput 
                        type="password"
                        pattern="\d{4,6}"
                        maxLength={6}
                        value={newPin}
                        onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="4-6 siffror"
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleSavePin(user.uid)}
                        className="w-full sm:w-32"
                    />
                    <PrimaryButton onClick={() => handleSavePin(user.uid)} loading={isSettingPin}>Spara</PrimaryButton>
                    <SecondaryButton onClick={() => setEditingPinForUid(null)} disabled={isSettingPin}>Avbryt</SecondaryButton>
                </div>
            ) : (
                <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                        Skärm-PIN: {user.screenPin ? <span className="font-mono text-slate-700 dark:text-slate-300">••••••</span> : 'Ej satt'}
                    </span>
                    <SecondaryButton onClick={() => { setEditingPinForUid(user.uid); setNewPin(''); }}>
                        {user.screenPin ? 'Ändra PIN' : 'Sätt PIN'}
                    </SecondaryButton>
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-8">
            <Card title="Grunduppgifter" saving={isSavingOrgDetails}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Organisationsnamn</label>
                        <StyledInput type="text" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Organisationsnummer</label>
                        <StyledInput type="text" value={orgNumber} onChange={e => setOrgNumber(e.target.value)} />
                    </div>
                     <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Adress</label>
                        <StyledInput type="text" value={address} onChange={e => setAddress(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Kontaktperson</label>
                        <StyledInput type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">E-post</label>
                        <StyledInput type="email" value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Telefon</label>
                        <StyledInput type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
                    </div>
                </div>
                 <div className="flex justify-end mt-4">
                    <PrimaryButton 
                        onClick={handleSaveGrunduppgifter} 
                        disabled={!isGrunduppgifterDirty} 
                        loading={isSavingOrgDetails}
                        title={!isGrunduppgifterDirty ? "Inga ändringar att spara" : ""}
                    >
                        Spara
                    </PrimaryButton>
                </div>
            </Card>

            <Card title="Användare & Behörighet">
                
                <form onSubmit={handleInvite} className="space-y-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <h4 className="font-semibold text-lg">Bjud in ny administratör</h4>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <StyledInput type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="E-postadress" required />
                        <PrimaryButton type="submit" loading={isInviting}>Bjud in administratör</PrimaryButton>
                    </div>
                     {inviteResult?.link && <div className="text-xs text-slate-500 mt-1">Lösenordslänk (kopiera och skicka manuellt): <input readOnly value={inviteResult.link} className="w-full bg-slate-200 dark:bg-slate-800 p-1 rounded text-xs" /></div>}
                </form>

                <div className="mt-6 space-y-4">
                    <div>
                        <h4 className="font-semibold text-lg mb-2">Administratörer</h4>
                        <div className="space-y-2">
                            {admins.length > 0 ? (
                                admins.map(renderUserRow)
                            ) : (
                                <p className="text-slate-500 dark:text-slate-400 text-center py-4">Inga administratörer har bjudits in än.</p>
                            )}
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};

const PairingModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    organization: Organization;
    systemSettings: SystemSettings | null;
    onPairSuccess: (newScreen: PhysicalScreen) => void;
}> = ({ isOpen, onClose, organization, systemSettings, onPairSuccess }) => {
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    const [step, setStep] = useState<'code' | 'assign' | 'success'>('code');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [codeInput, setCodeInput] = useState('');
    
    const [displayScreenId, setDisplayScreenId] = useState('');
    const [physicalScreenName, setPhysicalScreenName] = useState('');
    
    useEffect(() => {
        if (isOpen) {
            setStep('code');
            setIsLoading(false);
            setError('');
            setCodeInput('');
            setDisplayScreenId('');
            setPhysicalScreenName('');
        }
    }, [isOpen]);

    const physicalScreensCount = organization.physicalScreens?.length || 0;
    const isFirstScreen = physicalScreensCount === 0;
    const discount = organization.discountScreen || 0;

    const confirmationText = useMemo(() => {
        if (!systemSettings) return 'En ny licens kommer att aktiveras.';

        if (isFirstScreen) {
            const basePrice = systemSettings?.basePriceIncludingFirstScreen ?? 0;
            const finalBasePrice = basePrice * (1 - discount / 100);

            return `## Aktivera ert abonnemang\n\nDu är på väg att ansluta er organisations första skärm. Detta aktiverar ert grundabonnemang på **${finalBasePrice.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr/mån**.\n\n### Den första skärmen ingår\n\nExtra kostnad för just denna anslutning: **0 kr/mån**.\n\nNär du slutför anslutningen kommer skärmen att vara redo att visa innehåll.`;
        } else { // It's an additional screen
            const additionalMonthlyCost = systemSettings?.pricePerScreenAdditional;
            const finalPrice = additionalMonthlyCost !== undefined ? additionalMonthlyCost * (1 - discount / 100) : 0;
            
            const priceText = additionalMonthlyCost !== undefined
                ? `Den extra månadskostnaden är **${finalPrice.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr** (exkl. moms) och läggs till på er faktura.`
                : 'Prisinformation ej tillgänglig.';
            
            return `## Anslut ett till skyltfönster\n\nDu är på väg att ansluta ytterligare en skärm. Ni har för närvarande ${physicalScreensCount} anslutna skyltfönster.\n\n${priceText}\n\nNär du slutför stegen kommer din nya skärm att vara ansluten.`;
        }
    }, [systemSettings, isFirstScreen, physicalScreensCount, discount]);


    const handleVerifyCode = async () => {
        setIsLoading(true);
        setError('');
        const code = codeInput.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        if (code.length !== 6) {
            setError('Koden måste vara 6 tecken lång.');
            setIsLoading(false);
            return;
        }
        try {
            const codeDoc = await getPairingCode(code);
            if (codeDoc && codeDoc.status === 'pending') {
                setStep('assign');
            } else {
                setError('Ogiltig eller redan använd kod.');
            }
        } catch (e) {
            setError('Kunde inte verifiera koden. Försök igen.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleAssign = async () => {
        if (!displayScreenId || !physicalScreenName.trim() || !currentUser) return;
        setIsLoading(true);
        setError('');
        try {
            const newScreen = await pairAndActivateScreen(
                codeInput.replace(/[^A-Z0-9]/gi, '').toUpperCase(),
                organization.id,
                currentUser.uid,
                { name: physicalScreenName.trim(), displayScreenId }
            );
            
            onPairSuccess(newScreen);
            
            showToast({ message: `Skärmen "${newScreen.name}" ansluten!`, type: 'success' });

            setStep('success');
        } catch(e) {
             setError(`Kunde inte ansluta skärmen: ${e instanceof Error ? e.message : 'Okänt fel'}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                {step === 'code' && (
                    <>
                        <h2 className="text-2xl font-bold mb-2">Anslut Skyltfönster till Kanal</h2>
                        <p className="text-slate-600 dark:text-slate-300 mb-6">Skriv in den 6-siffriga koden som visas på ditt skyltfönster för att påbörja anslutningen.</p>
                        <StyledInput 
                            value={codeInput}
                            onChange={(e) => setCodeInput(e.target.value)}
                            placeholder="ABC-123"
                            maxLength={7}
                            className="text-center text-3xl font-mono tracking-widest"
                            disabled={isLoading}
                        />
                         {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}
                        <div className="flex justify-end gap-4 mt-6">
                            <SecondaryButton onClick={onClose} disabled={isLoading}>Avbryt</SecondaryButton>
                            <PrimaryButton onClick={handleVerifyCode} disabled={codeInput.length < 6} loading={isLoading}>
                                Fortsätt
                            </PrimaryButton>
                        </div>
                    </>
                )}
                {step === 'assign' && (
                    <>
                        <h2 className="text-2xl font-bold mb-2">Aktivera & Konfigurera</h2>
                        <p className="text-slate-600 dark:text-slate-300 mb-6">Namnge skyltfönstret och välj vilken kanal den ska visa.</p>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Namnge skyltfönstret</label>
                                <StyledInput value={physicalScreenName} onChange={e => setPhysicalScreenName(e.target.value)} placeholder="T.ex. Butik A - Kassa"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Välj kanal</label>
                                <StyledSelect value={displayScreenId} onChange={e => setDisplayScreenId(e.target.value)}>
                                    <option value="">Välj en kanal...</option>
                                    {(organization.displayScreens || []).map(screen => <option key={screen.id} value={screen.id}>{screen.name}</option>)}
                                </StyledSelect>
                            </div>
                            <div className="!mt-6 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg">
                                <MarkdownRenderer content={confirmationText} className="" />
                            </div>
                        </div>
                         {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}
                        <div className="flex justify-end gap-4 mt-6">
                            <SecondaryButton onClick={() => setStep('code')} disabled={isLoading}>Tillbaka</SecondaryButton>
                            <PrimaryButton onClick={handleAssign} disabled={!displayScreenId || !physicalScreenName.trim()} loading={isLoading}>
                                Anslut & Aktivera
                            </PrimaryButton>
                        </div>
                    </>
                )}
                {step === 'success' && (
                     <div className="text-center">
                        <h2 className="text-2xl font-bold mb-2 text-primary">Ansluten!</h2>
                        <p className="text-slate-600 dark:text-slate-300 mb-6">Skärmen är nu ansluten och bör uppdateras inom några sekunder. Du kan se den i listan "Anslutna Skyltfönster".</p>
                        <PrimaryButton onClick={onClose}>Stäng</PrimaryButton>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- PREVIEW MODAL ---

const ChevronLeftIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
);
const ChevronRightIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
);

const PreviewProgressBar: React.FC<{ duration: number; isPaused: boolean; key: any }> = ({ duration, isPaused, key }) => {
    const animationStyle: React.CSSProperties = {
        animationDuration: `${duration}s`,
        animationPlayState: isPaused ? 'paused' : 'running',
    };
    return (
        <div className="absolute bottom-0 left-0 h-1.5 bg-white/20 w-full">
            <div
                key={key}
                className="h-full bg-white animate-progress-bar"
                style={animationStyle}
            ></div>
            <style>{`
                @keyframes progress-bar-animation {
                    from { width: 0%; }
                    to { width: 100%; }
                }
                .animate-progress-bar {
                    animation-name: progress-bar-animation;
                    animation-timing-function: linear;
                    animation-fill-mode: forwards;
                }
            `}</style>
        </div>
    );
};

const getAspectRatioClass = (ratio?: DisplayScreen['aspectRatio']): string => {
    switch (ratio) {
        case '9:16': return 'aspect-[9/16]';
        case '4:3': return 'aspect-[4/3]';
        case '3:4': return 'aspect-[3/4]';
        case '16:9':
        default: return 'aspect-[16/9]';
    }
};

const DisplayScreenPreviewModal: React.FC<{
    screen: DisplayScreen;
    organization: Organization;
    onClose: () => void;
}> = ({ screen, organization, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const timerRef = useRef<number | null>(null);

    const isPortrait = screen.aspectRatio === '9:16' || screen.aspectRatio === '3:4';

    const activePosts = useMemo(() => {
        if (!screen.isEnabled || !screen.posts) return [];
        const now = new Date();
        return screen.posts.filter(post => {
            const hasStartDate = post.startDate && post.startDate.length > 0;
            const hasEndDate = post.endDate && post.endDate.length > 0;
            if (hasStartDate && new Date(post.startDate!) > now) return false;
            if (hasEndDate && new Date(post.endDate!) < now) return false;
            return true;
        });
    }, [screen]);
    
    const advance = useCallback((direction: 'next' | 'prev') => {
        if (activePosts.length === 0) return;
        setCurrentIndex(prev => {
            if (direction === 'next') {
                return (prev + 1) % activePosts.length;
            } else {
                return (prev - 1 + activePosts.length) % activePosts.length;
            }
        });
    }, [activePosts.length]);

    useEffect(() => {
        const cleanup = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };

        if (isPaused || activePosts.length <= 1) return cleanup;
        
        const currentPost = activePosts[currentIndex];
        if (!currentPost) return cleanup;

        // The video's onEnded event will also call advance, but the `isPaused`
        // flag will prevent a double transition. The timer sets the max duration.
        const duration = (currentPost.durationSeconds || 10) * 1000;
        timerRef.current = window.setTimeout(() => advance('next'), duration);
        
        return cleanup;
    }, [currentIndex, activePosts, advance, isPaused]);

    const currentPost = activePosts[currentIndex];

    if (!currentPost) {
         return (
             <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
                 <div className="bg-slate-800 p-8 rounded-lg text-white">
                     <h3 className="text-xl font-bold mb-2">Förhandsgranskning</h3>
                     <p>Det finns inga aktiva inlägg att visa för denna kanal.</p>
                 </div>
             </div>
         );
    }

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50 p-4" onClick={onClose}>
             <div 
                className={`${getAspectRatioClass(screen.aspectRatio)} ${isPortrait ? 'h-full max-h-[85vh]' : 'w-full max-w-5xl'} bg-slate-900 rounded-lg overflow-hidden relative border-2 border-slate-600 shadow-2xl`}
                onClick={e => e.stopPropagation()}
            >
                <DisplayPostRenderer 
                    post={currentPost} 
                    allTags={organization.tags} 
                    onVideoEnded={() => advance('next')}
                    primaryColor={organization.primaryColor}
                    organization={organization}
                />
                 {activePosts.length > 1 && currentPost.layout !== 'video-fullscreen' && (
                    <PreviewProgressBar duration={currentPost.durationSeconds} isPaused={isPaused} key={currentIndex}/>
                 )}
            </div>
            
            {activePosts.length > 1 && (
                <div className="mt-4 flex items-center gap-6 p-2 bg-slate-800/50 rounded-full border border-slate-700" onClick={e => e.stopPropagation()}>
                    <button onClick={() => advance('prev')} className="p-2 text-white rounded-full hover:bg-slate-700"><ChevronLeftIcon className="h-6 w-6" /></button>
                    <button onClick={() => setIsPaused(!isPaused)} className="p-3 bg-primary text-white rounded-full hover:brightness-110">
                        {isPaused ? <PlayIcon className="h-6 w-6" /> : <PauseIcon className="h-6 w-6" />}
                    </button>
                    <button onClick={() => advance('next')} className="p-2 text-white rounded-full hover:bg-slate-700"><ChevronRightIcon className="h-6 w-6" /></button>
                </div>
            )}
        </div>
    );
};