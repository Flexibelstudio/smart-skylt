
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Organization, UserRole, DisplayScreen, DisplayPost, Tag, SystemSettings, PostTemplate, PhysicalScreen } from '../types';
import { getSystemSettings, pairAndActivateScreen, getPairingCode } from '../services/firebaseService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PrimaryButton, SecondaryButton } from './Buttons';
import { StyledInput, StyledSelect } from './Forms';
import { SparklesIcon, CodeBracketIcon, ShareIcon } from './icons';
import { DisplayPostRenderer } from './DisplayPostRenderer';
import { parseToDate } from '../utils/dateUtils';
import QRCode from 'https://esm.sh/qrcode@1.5.3';
import { AIGuideModal } from './AIGuideModal';
import { useLocation } from '../context/StudioContext';

// Import the extracted tabs
import { SkyltfonsterTab } from './admin/SkyltfonsterTab';
import { AdminTab } from './admin/AdminTab';
import { AiAutomationTab } from './admin/AiAutomationTab';
import { OrganisationTab } from './OrganisationTab';
import { MediaGalleryTab } from './admin/MediaGalleryTab';

// Import Modals (We can move these too later, but let's keep them here for now to minimize file explosion in one step)
// or assume they are internal to this file for simplicity if they weren't extracted.
// However, since I can't update non-existent files, I will keep the modals here but streamlined.

interface SuperAdminScreenProps {
    organization: Organization;
    adminRole: 'superadmin' | 'admin';
    userRole: UserRole;
    theme: string;
    onUpdateLogos: (organizationId: string, logos: { light: string; dark: string }) => Promise<void>;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
    onUpdateTags: (organizationId: string, tags: Tag[]) => Promise<void>;
    onUpdatePostTemplates: (organizationId: string, templates: PostTemplate[]) => Promise<void>;
    onEditDisplayScreen: (screen: DisplayScreen, post?: DisplayPost) => void;
    onUpdateDisplayScreens: (organizationId: string, displayScreens: DisplayScreen[]) => Promise<void>;
}

const getAspectRatioClass = (ratio?: DisplayScreen['aspectRatio']): string => {
    switch (ratio) {
        case '9:16': return 'aspect-[9/16]';
        case '4:3': return 'aspect-[4/3]';
        case '3:4': return 'aspect-[3/4]';
        case '16:9': default: return 'aspect-[16/9]';
    }
};

const DisplayScreenPreviewModal: React.FC<{
    screen: DisplayScreen;
    organization: Organization;
    onClose: () => void;
}> = ({ screen, organization, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const timerRef = React.useRef<number | null>(null);

    const activePosts = useMemo(() => {
        if (!screen.isEnabled || !screen.posts) return [];
        const now = new Date();
        return screen.posts.filter(post => {
            const start = parseToDate(post.startDate, false);
            if (start && start > now) return false;
            const end = parseToDate(post.endDate, true);
            if (end && end < now) return false;
            return true;
        });
    }, [screen]);

    useEffect(() => {
        if (currentIndex >= activePosts.length) setCurrentIndex(0);
    }, [activePosts, currentIndex]);

    const advance = React.useCallback(() => {
        if (activePosts.length <= 1) return;
        setCurrentIndex(prev => (prev + 1) % activePosts.length);
    }, [activePosts.length]);

    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (activePosts.length <= 1) return;

        const currentPost = activePosts[currentIndex];
        if (!currentPost || (currentPost.layout === 'video-fullscreen' && currentPost.videoUrl)) return;

        const duration = (currentPost.durationSeconds || 15) * 1000;
        timerRef.current = window.setTimeout(advance, duration);

        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [currentIndex, activePosts, advance]);

    const currentPost = activePosts[currentIndex];
    
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 w-full max-w-4xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">Förhandsgranskning: {screen.name}</h2>
                <div className={`${getAspectRatioClass(screen.aspectRatio)} w-full bg-slate-300 dark:bg-slate-900 rounded-lg overflow-hidden relative border-2 border-slate-300 dark:border-gray-600 shadow-lg`}>
                    {currentPost ? (
                        <DisplayPostRenderer 
                            post={currentPost} 
                            allTags={organization.tags} 
                            primaryColor={organization.primaryColor}
                            onVideoEnded={advance}
                            organization={organization}
                            aspectRatio={screen.aspectRatio}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
                            Inga aktiva inlägg.
                        </div>
                    )}
                </div>
                <div className="flex justify-end mt-4">
                    <SecondaryButton onClick={onClose}>Stäng</SecondaryButton>
                </div>
            </div>
        </div>
    );
};

const PairingModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    organization: Organization;
    systemSettings: SystemSettings | null;
    onPairSuccess: (newScreen: PhysicalScreen) => void;
    onUpdateOrganization: (orgId: string, data: Partial<Organization>) => Promise<void>;
}> = ({ isOpen, onClose, organization, systemSettings, onPairSuccess, onUpdateOrganization }) => {
    const [step, setStep] = useState<'code' | 'details' | 'success'>('code');
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    
    const [screenName, setScreenName] = useState('');
    const [selectedDisplayScreenId, setSelectedDisplayScreenId] = useState<string>('');

    const { currentUser } = useAuth();
    const { displayScreens: allDisplayScreens } = useLocation();

    useEffect(() => {
        if (isOpen) {
            setStep('code');
            setCode('');
            setIsLoading(false);
            setError('');
            setScreenName('');
            if (allDisplayScreens.length > 0) {
                setSelectedDisplayScreenId(allDisplayScreens[0].id);
            } else {
                setSelectedDisplayScreenId('');
            }
        }
    }, [isOpen, allDisplayScreens]);

    if (!isOpen) return null;

    const handleVerifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            const formattedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const codeDoc = await getPairingCode(formattedCode);
            if (codeDoc && codeDoc.status === 'pending') {
                setStep('details');
            } else {
                setError('Ogiltig eller redan använd kod.');
            }
        } catch (err) {
            setError('Kunde inte verifiera koden. Försök igen.');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePair = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser || !screenName.trim() || !selectedDisplayScreenId) return;
        setIsLoading(true);
        setError('');
        try {
            const formattedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const newScreen = await pairAndActivateScreen(formattedCode, organization.id, currentUser.uid, {
                name: screenName.trim(),
                displayScreenId: selectedDisplayScreenId,
            });

            const updatedScreens = [...(organization.physicalScreens || []), newScreen];
            onUpdateOrganization(organization.id, { physicalScreens: updatedScreens });
            
            onPairSuccess(newScreen);
            setStep('success');
        } catch (err) {
            setError(`Anslutningen misslyckades: ${err instanceof Error ? err.message : "Okänt fel"}`);
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
         <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                {step === 'code' && (
                    <form onSubmit={handleVerifyCode}>
                        <h2 className="text-2xl font-bold mb-4">Anslut ett nytt skyltfönster</h2>
                        <p className="text-slate-600 dark:text-slate-300 mb-6">Ange den 6-siffriga koden som visas på skärmen du vill ansluta.</p>
                        <StyledInput
                            type="text"
                            value={code}
                            onChange={e => setCode(e.target.value)}
                            placeholder="ABC-123"
                            className="text-center text-3xl font-mono tracking-[0.3em]"
                            autoFocus
                        />
                        {error && <p className="text-red-400 text-sm mt-2 text-center">{error}</p>}
                        <div className="flex justify-end gap-4 mt-6">
                            <SecondaryButton type="button" onClick={onClose} disabled={isLoading}>Avbryt</SecondaryButton>
                            <PrimaryButton type="submit" loading={isLoading} disabled={code.replace('-', '').length < 6}>Verifiera kod</PrimaryButton>
                        </div>
                    </form>
                )}
                {step === 'details' && (
                    <form onSubmit={handlePair}>
                        <h2 className="text-2xl font-bold mb-4">Konfigurera skyltfönster</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Namn på skyltfönstret</label>
                                <StyledInput type="text" value={screenName} onChange={e => setScreenName(e.target.value)} placeholder="T.ex. Kassan, Butik A" required autoFocus/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Välj kanal att visa</label>
                                {allDisplayScreens.length > 0 ? (
                                    <StyledSelect value={selectedDisplayScreenId} onChange={e => setSelectedDisplayScreenId(e.target.value)} required>
                                        {allDisplayScreens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </StyledSelect>
                                ) : (
                                    <p className="text-yellow-400 bg-yellow-900/50 p-3 rounded-lg text-sm">Du måste skapa en kanal först under "Kanaler".</p>
                                )}
                            </div>
                        </div>
                        {error && <p className="text-red-400 text-sm mt-2 text-center">{error}</p>}
                        <div className="flex justify-end gap-4 mt-6">
                            <SecondaryButton type="button" onClick={() => setStep('code')} disabled={isLoading}>Tillbaka</SecondaryButton>
                            <PrimaryButton type="submit" loading={isLoading} disabled={!screenName || !selectedDisplayScreenId}>Anslut</PrimaryButton>
                        </div>
                    </form>
                )}
                {step === 'success' && (
                     <div>
                        <h2 className="text-2xl font-bold mb-4 text-center text-green-400">Anslutningen lyckades!</h2>
                        <p className="text-slate-600 dark:text-slate-300 mb-6 text-center">Skyltfönstret "{screenName}" är nu anslutet och kommer att börja visa innehållet från kanalen "{allDisplayScreens.find(s=>s.id === selectedDisplayScreenId)?.name}".</p>
                        <div className="flex justify-center">
                            <PrimaryButton onClick={onClose}>Stäng</PrimaryButton>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => onClose()}>
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

const CompleteProfileModal: React.FC<{
    isOpen: boolean;
    onSave: (data: Partial<Organization>) => Promise<void>;
    organization: Organization;
}> = ({ isOpen, onSave, organization }) => {
    const [address, setAddress] = useState(organization.address || '');
    const [phone, setPhone] = useState(organization.phone || '');
    const [orgNumber, setOrgNumber] = useState(organization.orgNumber || '');
    const [contactPerson, setContactPerson] = useState(organization.contactPerson || '');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setAddress(organization.address || '');
            setPhone(organization.phone || '');
            setOrgNumber(organization.orgNumber || '');
            setContactPerson(organization.contactPerson || '');
        }
    }, [isOpen, organization]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setIsSaving(true);
        await onSave({
            address: address.trim(),
            phone: phone.trim(),
            orgNumber: orgNumber.trim(),
            contactPerson: contactPerson.trim(),
        });
        setIsSaving(false);
    };
    
    const canSave = address.trim() && phone.trim() && orgNumber.trim() && contactPerson.trim();

    return (
         <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in">
                <h2 className="text-2xl font-bold mb-2">Slutför er profil</h2>
                <p className="text-slate-600 dark:text-slate-300 mb-6">För att kunna ge bästa möjliga service och för framtida fakturering, vänligen fyll i de sista uppgifterna om er organisation.</p>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Organisationsnummer</label>
                        <StyledInput type="text" value={orgNumber} onChange={e => setOrgNumber(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Adress</label>
                        <StyledInput type="text" value={address} onChange={e => setAddress(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Kontaktperson</label>
                        <StyledInput type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Telefon</label>
                        <StyledInput type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
                    </div>
                </div>
                <div className="flex justify-end mt-6">
                    <PrimaryButton onClick={handleSave} loading={isSaving} disabled={!canSave}>
                        Spara och fortsätt
                    </PrimaryButton>
                </div>
            </div>
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


// --- Main Component ---

type AdminTabType = 'skyltfonster' | 'organisation' | 'galleri' | 'automation' | 'admin';

const TabButton: React.FC<{
    tabId: AdminTabType;
    activeTab: AdminTabType;
    setActiveTab: (tabId: AdminTabType) => void;
    children: React.ReactNode;
    highlight?: boolean;
}> = ({ tabId, activeTab, setActiveTab, children, highlight }) => {
    const isActive = activeTab === tabId;
    return (
        <button
            onClick={() => setActiveTab(tabId)}
            className={`relative px-4 py-2 text-base font-semibold transition-colors focus:outline-none rounded-t-lg whitespace-nowrap ${isActive
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

export const SuperAdminScreen: React.FC<SuperAdminScreenProps> = (props) => {
    const { organization, theme, onUpdateOrganization } = props;
    const { displayScreens } = useLocation();
    const [activeTab, setActiveTab] = useState<AdminTabType>('skyltfonster');
    
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    
    const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
    const [screenToPreview, setScreenToPreview] = useState<DisplayScreen | null>(null);
    const [screenToShare, setScreenToShare] = useState<DisplayScreen | null>(null);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [isAiGuideModalOpen, setIsAiGuideModalOpen] = useState(false);
    const ignoreProfileCheck = useRef(false);
    
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
            }
        };
        fetchSettings();
    }, []);
    
     useEffect(() => {
        // Check if essential information is missing. 
        // We use ignoreProfileCheck to prevent re-opening immediately after saving but before data sync.
        if (!ignoreProfileCheck.current && organization && (!organization.address || !organization.phone || !organization.orgNumber || !organization.contactPerson)) {
            setIsProfileModalOpen(true);
        } else {
            // If data is present, ensure modal is closed and reset the ignore flag for future
            if (organization && organization.address && organization.phone && organization.orgNumber && organization.contactPerson) {
                setIsProfileModalOpen(false);
                ignoreProfileCheck.current = false;
            }
        }
    }, [organization]);

    const handleSaveProfile = async (data: Partial<Organization>) => {
        // Set the flag to ignore checks temporarily to allow optimistic UI update
        ignoreProfileCheck.current = true;
        // Close modal immediately for better UX
        setIsProfileModalOpen(false);
        // Perform the update
        await onUpdateOrganization(organization.id, data);
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
                    <h1 className="text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">{organization.brandName || organization.name}</h1>
                )}
            </div>

            {isBrandingGuideVisible && (
                <BrandingSetupGuide 
                    onGoToBranding={handleGoToBrandingFromGuide} 
                    onDismiss={handleDismissBrandingGuide} 
                />
            )}

            <div className="flex justify-between items-end border-b border-slate-200 dark:border-slate-700">
                <div className="flex overflow-x-auto scrollbar-hide min-w-0" role="tablist">
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
                    <TabButton tabId="automation" activeTab={activeTab} setActiveTab={setActiveTab}>
                        Automation
                    </TabButton>
                    <TabButton tabId="admin" activeTab={activeTab} setActiveTab={setActiveTab}>
                        Administration
                    </TabButton>
                </div>
                <div>
                    <SecondaryButton onClick={() => setIsAiGuideModalOpen(true)}>
                        💡 AI-guide
                    </SecondaryButton>
                </div>
            </div>

            <div className="space-y-8">
                {activeTab === 'skyltfonster' && (
                    <SkyltfonsterTab
                        {...props}
                        displayScreens={displayScreens}
                        systemSettings={systemSettings}
                        onOpenPairingModal={() => setIsPairingModalOpen(true)}
                        onPreviewScreen={setScreenToPreview}
                        onShareScreen={setScreenToShare}
                    />
                )}
                {activeTab === 'organisation' && <OrganisationTab {...props} />}
                {activeTab === 'galleri' && <MediaGalleryTab {...props} />}
                {activeTab === 'automation' && <AiAutomationTab {...props} />}
                {activeTab === 'admin' && <AdminTab {...props} />}
            </div>
            
            <PairingModal
                isOpen={isPairingModalOpen}
                onClose={() => setIsPairingModalOpen(false)}
                organization={organization}
                systemSettings={systemSettings}
                onPairSuccess={() => {}}
                onUpdateOrganization={onUpdateOrganization}
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
            <AIGuideModal
                isOpen={isAiGuideModalOpen}
                onClose={() => setIsAiGuideModalOpen(false)}
            />
        </div>
    );
};
