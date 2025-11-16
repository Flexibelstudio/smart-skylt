import React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Organization, CustomPage, UserRole, InfoCarousel, InfoMessage, DisplayScreen, DisplayPost, UserData, Tag, SystemSettings, ScreenPairingCode, BrandingOptions, PostTemplate, CampaignIdea, CustomEvent, PhysicalScreen, MediaItem, AiAutomation, SuggestedPost } from '../types';
import { ToggleSwitch, CompactToggleSwitch, MonitorIcon, PencilIcon, TrashIcon, CodeBracketIcon, MagnifyingGlassIcon, SparklesIcon, ShareIcon, DuplicateIcon, ChevronDownIcon, CheckCircleIcon, VideoCameraIcon, PlayIcon, PauseIcon, LightBulbIcon, Cog6ToothIcon, LoadingSpinnerIcon, HandThumbUpIcon, PhotoIcon } from './icons';
// FIX: Import `isOffline` from `firebaseInit` instead of `firebaseService`.
import { getAdminsForOrganization, setAdminRole, inviteUser, getSystemSettings, getPairingCode, pairAndActivateScreen, uploadMediaForGallery, deleteMediaFromStorage, unpairPhysicalScreen, callTestFunction, updateDisplayScreen, listenToSuggestedPosts, updateSuggestedPost, deleteSuggestedPost } from '../services/firebaseService';
import { isOffline } from '../services/firebaseInit';
import { MarkdownRenderer } from './CustomContentScreen';
import { useAuth } from '../context/AuthContext';
import { DisplayPostRenderer } from './DisplayPostRenderer';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from './ConfirmDialog';
import { PrimaryButton, SecondaryButton, DestructiveButton } from './Buttons';
import { StyledInput, StyledSelect } from './Forms';
import { EmptyState } from './EmptyState';
import { getSwedishHolidays } from '../data/holidays';
import { parseToDate } from '../utils/dateUtils';
import { generateCampaignIdeasForEvent, generateSeasonalCampaignIdeas, generateEventReminderText, generateDisplayPostCampaign, generateDisplayPostImage, urlToBase64, editDisplayPostImage } from '../services/geminiService';
import QRCode from 'https://esm.sh/qrcode@1.5.3';
import { Card } from './Card';
import { OrganisationTab } from './OrganisationTab';
import { InputDialog, AiImageEditorModal } from './DisplayScreenEditor/Modals';
import { ProactiveRhythmBanner, ProactiveSeasonalBanner } from './ProactiveRhythmBanner';
import { AIGuideModal } from './AIGuideModal';
import { AiAutomationEditorModal } from './AiAutomationEditorModal';
import { useLocation } from '../context/StudioContext';
import { SkylieEmptyState } from './SkylieEmptyState';
import { PlanningView } from './DisplayScreenEditor/PlanningView';


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
    const timerRef = useRef<number | null>(null);

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

    const advance = useCallback(() => {
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
    const { showToast } = useToast();
    const { displayScreens: allDisplayScreens } = useLocation();

    useEffect(() => {
        if (isOpen) {
            // Reset state when modal opens
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

            // The context will update automatically via listener, but we can do an optimistic update
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

const ProactiveUpcomingEventBanner: React.FC<{
    organization: Organization;
    onGenerateIdeas: (event: { name: string; date: Date; icon: string; }) => void;
}> = ({ organization, onGenerateIdeas }) => {
    const [event, setEvent] = useState<{ name: string; date: Date; icon: string; } | null>(null);
    const [reminder, setReminder] = useState<{ headline: string, subtext: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const now = new Date();
        const year = now.getFullYear();
        const holidays = getSwedishHolidays(year);
        const customEvents = (organization.customEvents || []).map(ce => ({ ...ce, date: parseToDate(ce.date) as Date }));
        
        const allEvents = [...holidays, ...customEvents].filter(e => e.date && e.date >= now);
        allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
        
        const nextEvent = allEvents[0];
        
        if (!nextEvent) {
            setIsLoading(false);
            setEvent(null);
            return;
        }

        const diffDays = (nextEvent.date.getTime() - now.getTime()) / (1000 * 3600 * 24);

        if (diffDays <= 30) {
            const hasExistingCampaign = (organization.displayScreens || []).some(screen =>
                (screen.posts || []).some(post => post.internalTitle.toLowerCase().includes(nextEvent.name.toLowerCase()))
            );

            if (!hasExistingCampaign) {
                setEvent(nextEvent);
            } else {
                setEvent(null);
                setIsLoading(false);
            }
        } else {
            setEvent(null);
            setIsLoading(false);
        }
    }, [organization]);

    useEffect(() => {
        if (event) {
            const now = new Date();
            const diffTime = event.date.getTime() - now.getTime();
            const daysUntil = Math.max(0, Math.ceil(diffTime / (1000 * 3600 * 24)));

            // hasExistingCampaign is always false when this runs, due to logic in first useEffect
            generateEventReminderText(event, daysUntil, organization, false)
                .then(setReminder)
                .catch(err => {
                    console.error("Failed to generate event reminder text:", err);
                    setReminder({
                        headline: `${event.name} närmar sig!`,
                        subtext: 'Ska vi skapa en kampanj?'
                    });
                })
                .finally(() => setIsLoading(false));
        } else {
            setReminder(null);
        }
    }, [event, organization]);

    if (isLoading || !reminder || !event) {
        return null;
    }

    return (
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-4 rounded-xl shadow-lg animate-fade-in flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="text-4xl">{event.icon}</div>
                <div>
                    <h3 className="text-xl font-bold">{reminder.headline}</h3>
                    <p className="text-pink-200 mt-1">{reminder.subtext}</p>
                </div>
            </div>
            <PrimaryButton onClick={() => onGenerateIdeas(event)} className="bg-white/90 hover:bg-white text-pink-600 font-bold flex-shrink-0">
                <SparklesIcon className="h-5 w-5 mr-2"/>
                Generera Idéer
            </PrimaryButton>
        </div>
    );
};


type AdminTab = 'skyltfonster' | 'organisation' | 'galleri' | 'automation' | 'admin';

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

interface CampaignIdeaGeneratorForOrgProps {
    isOpen: boolean;
    onClose: () => void;
    event: { name: string; date: Date } | null;
    organization: Organization;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
    onEditDisplayScreen: (screen: DisplayScreen, post?: DisplayPost) => void;
    planningContext?: string;
}

const CampaignIdeaGeneratorForOrg: React.FC<CampaignIdeaGeneratorForOrgProps> = ({ isOpen, onClose, event, organization, onUpdateOrganization, onEditDisplayScreen, planningContext }) => {
    const { displayScreens } = useLocation();
    const [isLoading, setIsLoading] = useState(false);
    const [ideas, setIdeas] = useState<CampaignIdea[] | null>(null);
    const [followUpSuggestion, setFollowUpSuggestion] = useState<{ question: string; eventName: string; } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { showToast } = useToast();
    const isGeneratingRef = useRef(false);
    const [modalTitle, setModalTitle] = useState('');

    const [step, setStep] = useState<'ideas' | 'configure' | 'generating'>('ideas');
    const [selectedIdea, setSelectedIdea] = useState<CampaignIdea | null>(null);
    const [selectedScreenId, setSelectedScreenId] = useState<string>('');
    const [generationStatus, setGenerationStatus] = useState('');
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);

    useEffect(() => {
        if (displayScreens && displayScreens.length > 0) {
            setSelectedScreenId(displayScreens[0].id);
        }
    }, [displayScreens]);

    const fetchEventIdeas = useCallback(async (eventForIdeas: { name: string, date: Date }) => {
        setModalTitle(`✨ AI-inläggsidéer för "${eventForIdeas.name}"`);
        setIsLoading(true);
        setIdeas(null);
        setFollowUpSuggestion(null);
        setError(null);
        try {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const eventDate = new Date(eventForIdeas.date.getFullYear(), eventForIdeas.date.getMonth(), eventForIdeas.date.getDate());
            const diffTime = eventDate.getTime() - today.getTime();
            const daysUntil = Math.max(0, Math.ceil(diffTime / (1000 * 3600 * 24)));
            const { ideas: fetchedIdeas, followUpSuggestion: suggestion } = await generateCampaignIdeasForEvent(eventForIdeas.name, daysUntil, organization);
            setIdeas(fetchedIdeas);
            setFollowUpSuggestion(suggestion || null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Kunde inte hämta idéer.");
        } finally {
            setIsLoading(false);
        }
    }, [organization]);

    useEffect(() => {
        if (isOpen) {
            if (isGeneratingRef.current) {
                return; // Prevent reset during generation/update cycle
            }
            setStep('ideas');
            setSelectedIdea(null);
            
            if (event) {
                fetchEventIdeas(event);
            } else if (planningContext) {
                setModalTitle(`✨ AI-inläggsidéer`);
                const fetchSeasonalIdeas = async () => {
                    setIsLoading(true);
                    setIdeas(null);
                    setFollowUpSuggestion(null);
                    try {
                        const { ideas: fetchedIdeas } = await generateSeasonalCampaignIdeas(organization, planningContext);
                        setIdeas(fetchedIdeas);
                        setFollowUpSuggestion(null);
                    } catch (e) {
                        setError(e instanceof Error ? e.message : "Kunde inte hämta idéer.");
                    } finally {
                        setIsLoading(false);
                    }
                };
                fetchSeasonalIdeas();
            }
        } else {
            // When modal closes, ensure the ref is reset for the next time.
            isGeneratingRef.current = false;
        }
    }, [isOpen, event, organization, planningContext, fetchEventIdeas]);

    const handleSelectIdea = (idea: CampaignIdea) => {
        setSelectedIdea(idea);
        setStep('configure');
    };

    const handleBackToIdeas = () => {
        setSelectedIdea(null);
        setStep('ideas');
    };

    const handleAttemptClose = () => {
        if (step === 'configure' || step === 'generating') {
            setIsConfirmCloseOpen(true);
        } else {
            onClose();
        }
    };
    
    const handleConfirmClose = () => {
        onClose();
        setIsConfirmCloseOpen(false);
    };

    const handleGenerateCampaign = async () => {
        if (!selectedIdea || !selectedScreenId) return;
    
        isGeneratingRef.current = true;
        setStep('generating');
        setGenerationStatus('Skapar inläggsutkast...');
        setError(null);
        try {
            const screen = displayScreens.find(s => s.id === selectedScreenId);
            if (!screen) throw new Error("Valt skyltfönster kunde inte hittas.");
    
            const newPost: DisplayPost = {
                id: `new-${Date.now()}`,
                internalTitle: selectedIdea.headline || 'AI-genererat inlägg',
                headline: selectedIdea.headline,
                body: selectedIdea.text,
                layout: 'image-fullscreen',
                durationSeconds: 15,
                imageUrl: undefined,
                videoUrl: undefined,
                aiImagePrompt: selectedIdea.visual.imageIdea,
                isAiGeneratedImage: false,
                isAiGeneratedVideo: false,
                backgroundColor: 'black',
                textColor: 'white',
                imageOverlayEnabled: false,
                headlineFontFamily: organization.headlineFontFamily,
                bodyFontFamily: organization.bodyFontFamily,
            };
    
            showToast({ message: `Utkast skapat! Öppnar redigeraren för "${screen.name}".`, type: 'success' });
            
            onEditDisplayScreen(screen, newPost);
            onClose();
    
        } catch (e) {
            setError(e instanceof Error ? e.message : "Kunde inte skapa inlägg.");
            setStep('configure');
            isGeneratingRef.current = false;
        } finally {
            setGenerationStatus('');
        }
    };
    
    const handleFollowUpClick = (eventName: string) => {
        fetchEventIdeas({ name: eventName, date: new Date() });
    };

    if (!isOpen) return null;

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="text-center py-12">
                   <SparklesIcon className="h-10 w-10 text-primary animate-pulse mx-auto" />
                   <p className="mt-4 text-slate-600 dark:text-slate-300">Genererar kreativa idéer...</p>
               </div>
           );
        }
        if (error && step === 'ideas') {
             return (
                <div className="text-center py-12">
                    <p className="text-red-400">Ett fel inträffade:</p>
                    <p className="text-slate-600 dark:text-slate-300 mt-2">{error}</p>
                </div>
            );
        }

        switch (step) {
            case 'generating':
                return (
                    <div className="text-center py-12">
                        <SparklesIcon className="h-10 w-10 text-primary animate-pulse mx-auto" />
                        <p className="mt-4 text-slate-600 dark:text-slate-300">{generationStatus || 'AI:n arbetar...'}</p>
                    </div>
                );
            case 'configure':
                return (
                    <>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold">Konfigurera Inlägg</h2>
                            <SecondaryButton onClick={handleBackToIdeas}>Tillbaka till idéer</SecondaryButton>
                        </div>
                        <div className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600 mb-6">
                            <h3 className="font-bold text-primary">{selectedIdea?.headline}</h3>
                            <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">{selectedIdea?.text}</p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Lägg till i kanal</label>
                                {displayScreens && displayScreens.length > 0 ? (
                                    <StyledSelect value={selectedScreenId} onChange={e => setSelectedScreenId(e.target.value)}>
                                        {displayScreens.map(screen => <option key={screen.id} value={screen.id}>{screen.name}</option>)}
                                    </StyledSelect>
                                ) : (
                                    <p className="text-sm text-yellow-400 bg-yellow-900/50 p-3 rounded-lg">Du måste skapa ett skyltfönster (en kanal) först.</p>
                                )}
                            </div>
                        </div>
                        {error && <p className="text-red-400 mt-4">{error}</p>}
                    </>
                );
            case 'ideas':
            default:
                return (
                    <>
                        <h2 className="text-2xl font-bold mb-2">{modalTitle}</h2>
                        <div className="space-y-4 mt-6">
                            <p className="text-slate-600 dark:text-slate-300">Här är några förslag. Välj en idé för att låta AI:n bygga ett inlägg.</p>
                            {ideas && ideas.map((idea, index) => (
                                <div key={index} className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div className="flex-grow">
                                        <h3 className="font-bold text-primary">{idea.headline}</h3>
                                        <p className="text-slate-600 dark:text-slate-300 text-sm mt-1 mb-3">{idea.text}</p>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 italic space-y-1">
                                            <p><strong>Visuell Idé:</strong> {idea.visual.imageIdea}</p>
                                            <p><strong>Stil:</strong> {idea.visual.style}, {idea.visual.mood}, {idea.visual.colorPalette}</p>
                                        </div>
                                    </div>
                                    <PrimaryButton onClick={() => handleSelectIdea(idea)} className="flex-shrink-0 self-start sm:self-center">
                                        Använd denna inläggsidé
                                    </PrimaryButton>
                                </div>
                            ))}
                            {followUpSuggestion && (
                                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-600 text-center">
                                    <button
                                        onClick={() => handleFollowUpClick(followUpSuggestion.eventName)}
                                        className="text-sm text-purple-400 italic hover:underline hover:text-purple-300 transition-colors"
                                    >
                                        {followUpSuggestion.question}
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                );
        }
    }

    return (
        <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => handleAttemptClose()}>
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                    {renderContent()}
                    <div className="flex justify-end gap-4 mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
                        {step === 'configure' && (
                            <PrimaryButton 
                                onClick={handleGenerateCampaign} 
                                disabled={!selectedScreenId || (displayScreens?.length || 0) === 0}
                            >
                                Skapa Utkast
                            </PrimaryButton>
                        )}
                        <SecondaryButton onClick={handleAttemptClose}>Stäng</SecondaryButton>
                    </div>
                </div>
            </div>
            <ConfirmDialog
                isOpen={isConfirmCloseOpen}
                onClose={() => setIsConfirmCloseOpen(false)}
                onConfirm={handleConfirmClose}
                title="Avbryta skapandet?"
                confirmText="Ja, avbryt"
                variant="destructive"
            >
                <p>Är du säker på att du vill stänga? Dina val kommer inte att sparas och du får börja om från början.</p>
            </ConfirmDialog>
        </>
    );
};

const MediaPreviewModal: React.FC<{
    media: MediaItem;
    onClose: () => void;
    usageText: string;
}> = ({ media, onClose, usageText }) => {
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 w-full max-w-4xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex-grow flex items-center justify-center relative min-h-0">
                    {media.type === 'image' ? (
                        <img src={media.url} alt={media.internalTitle} className="max-w-full max-h-full object-contain" />
                    ) : (
                        <video src={media.url} controls autoPlay className="max-w-full max-h-full" />
                    )}
                </div>
                <div className="flex-shrink-0 p-4 border-t border-slate-200 dark:border-slate-700">
                    <h3 className="font-bold text-lg">{media.internalTitle}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Används i: {usageText}</p>
                    <div className="flex justify-end mt-4">
                        <SecondaryButton onClick={onClose}>Stäng</SecondaryButton>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ShareMediaToChannelModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onShare: (targetScreenIds: string[]) => void;
    screens: DisplayScreen[];
    isSharing: boolean;
}> = ({ isOpen, onClose, onShare, screens, isSharing }) => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    useEffect(() => { if (isOpen) setSelectedIds([]); }, [isOpen]);
    if (!isOpen) return null;

    const handleToggle = (screenId: string) => {
        setSelectedIds(prev => prev.includes(screenId) ? prev.filter(id => id !== screenId) : [...prev, screenId]);
    };
    const handleSubmit = () => { onShare(selectedIds); };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-2">Dela media till kanaler</h2>
                <p className="text-slate-600 dark:text-slate-300 mb-6">Vald media kommer att skapas som nya inlägg i de valda kanalerna.</p>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                    {screens.length > 0 ? (
                        screens.map(screen => (
                            <label key={screen.id} className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(screen.id)}
                                    onChange={() => handleToggle(screen.id)}
                                    className="h-5 w-5 rounded text-primary focus:ring-primary"
                                />
                                <span className="font-medium text-slate-800 dark:text-slate-200">{screen.name}</span>
                            </label>
                        ))
                    ) : (
                        <p className="text-slate-500 dark:text-slate-400 text-center py-4">Det finns inga kanaler att dela till.</p>
                    )}
                </div>
                <div className="flex justify-end gap-4 mt-8 border-t border-slate-200 dark:border-slate-700 pt-4">
                    <SecondaryButton onClick={onClose} disabled={isSharing}>Avbryt</SecondaryButton>
                    <PrimaryButton onClick={handleSubmit} disabled={selectedIds.length === 0 || isSharing} loading={isSharing}>
                        Dela
                    </PrimaryButton>
                </div>
            </div>
        </div>
    );
};

const MediaGalleryManager: React.FC<SuperAdminScreenProps> = ({ organization, onUpdateOrganization, onEditDisplayScreen }) => {
    const { displayScreens, updateDisplayScreen } = useLocation();
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [isSaving, setIsSaving] = useState(false);

    const [mediaToPreview, setMediaToPreview] = useState<MediaItem | null>(null);
    const [mediaToDelete, setMediaToDelete] = useState<MediaItem | null>(null);
    const [mediaToShare, setMediaToShare] = useState<MediaItem | null>(null);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;
        setIsSaving(true);
        const currentLibrary = organization.mediaLibrary || [];
        
        const uploadPromises = files.map(async (file) => {
            const tempId = `upload-${Date.now()}-${file.name}`;
            try {
                const { url, type, size } = await uploadMediaForGallery(organization.id, file, (progress) => {
                    setUploadProgress(prev => ({ ...prev, [tempId]: progress }));
                });
                const newMediaItem: MediaItem = {
                    id: `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: type as 'image' | 'video',
                    url,
                    internalTitle: file.name,
                    createdAt: new Date().toISOString(),
                    createdBy: 'user',
                    sizeBytes: size,
                };
                return newMediaItem;
            } catch (error) {
                console.error("Upload failed for file:", file.name, error);
                showToast({ message: `Kunde inte ladda upp ${file.name}.`, type: 'error' });
                return null;
            } finally {
                setUploadProgress(prev => {
                    const newProgress = { ...prev };
                    delete newProgress[tempId];
                    return newProgress;
                });
            }
        });

        const newItems = (await Promise.all(uploadPromises)).filter((item): item is MediaItem => item !== null);

        if (newItems.length > 0) {
            await onUpdateOrganization(organization.id, { mediaLibrary: [...currentLibrary, ...newItems] });
            showToast({ message: `${newItems.length} fil(er) har laddats upp.`, type: 'success' });
        }
        setIsSaving(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleDeleteMedia = async () => {
        if (!mediaToDelete) return;
        setIsSaving(true);
        try {
            if (mediaToDelete.url.includes('firebasestorage.googleapis.com')) {
                await deleteMediaFromStorage(mediaToDelete.url);
            }
            const updatedLibrary = (organization.mediaLibrary || []).filter(item => item.id !== mediaToDelete.id);
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
            showToast({ message: 'Media borttagen.', type: 'success' });
        } catch (error) {
            showToast({ message: `Kunde inte ta bort media: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsSaving(false);
            setMediaToDelete(null);
        }
    };
    
    const handleShareMedia = async (targetScreenIds: string[]) => {
        if (!mediaToShare) return;
        setIsSaving(true);
        try {
            for (const screenId of targetScreenIds) {
                const screen = displayScreens.find(s => s.id === screenId);
                if (!screen) continue;
                
                const newPost: DisplayPost = {
                    id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    internalTitle: mediaToShare.internalTitle,
                    layout: mediaToShare.type === 'video' ? 'video-fullscreen' : 'image-fullscreen',
                    imageUrl: mediaToShare.type === 'image' ? mediaToShare.url : undefined,
                    videoUrl: mediaToShare.type === 'video' ? mediaToShare.url : undefined,
                    durationSeconds: 15,
                    startDate: new Date().toISOString(),
                };
                
                const updatedPosts = [...(screen.posts || []), newPost];
                await updateDisplayScreen(screenId, { posts: updatedPosts });
            }
            showToast({ message: `Media delad till ${targetScreenIds.length} kanal(er).`, type: 'success' });

        } catch (error) {
             showToast({ message: `Kunde inte dela media: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        } finally {
             setIsSaving(false);
             setMediaToShare(null);
        }
    };

    const calculateUsage = (mediaUrl: string) => {
        const usages = (organization.displayScreens || [])
            .flatMap(screen => (screen.posts || []).map(post => ({ screenName: screen.name, post })))
            .filter(({ post }) => JSON.stringify(post).includes(mediaUrl))
            .map(({ screenName }) => screenName);
        
        if (usages.length === 0) return 'Används inte';
        return `Används i: ${[...new Set(usages)].join(', ')}`;
    };

    const sortedMedia = useMemo(() => {
        return [...(organization.mediaLibrary || [])].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [organization.mediaLibrary]);

    return (
        <>
            <Card title="Galleri" subTitle="Hantera dina uppladdade bilder och videos." actions={
                <PrimaryButton onClick={() => fileInputRef.current?.click()} disabled={isSaving}>Ladda upp media</PrimaryButton>
            }>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple accept="image/*,video/mp4,video/quicktime" className="hidden"/>
                {Object.keys(uploadProgress).length > 0 && (
                    <div className="space-y-2 mb-4">
                        {Object.entries(uploadProgress).map(([id, progress]) => (
                             <div key={id} className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                                <div className="bg-primary h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                            </div>
                        ))}
                    </div>
                )}
                
                {sortedMedia.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {sortedMedia.map(item => (
                            <div key={item.id} className="relative group aspect-square bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                                {item.type === 'image' ? 
                                    <img src={item.url} alt={item.internalTitle} className="w-full h-full object-cover" /> : 
                                    <video src={item.url} muted playsInline className="w-full h-full object-cover" />
                                }
                                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between">
                                    <p className="text-white text-xs font-semibold line-clamp-2">{item.internalTitle}</p>
                                    <div className="flex justify-center gap-2">
                                        <button onClick={() => setMediaToPreview(item)} className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-full" title="Förhandsgranska"><MagnifyingGlassIcon className="h-4 w-4" /></button>
                                        <button onClick={() => setMediaToShare(item)} className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-full" title="Dela till kanal"><ShareIcon className="h-4 w-4" /></button>
                                        <button onClick={() => setMediaToDelete(item)} className="p-2 bg-red-600/80 hover:bg-red-500 text-white rounded-full" title="Ta bort"><TrashIcon className="h-4 w-4" /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <SkylieEmptyState title="Galleriet är tomt" message="Ladda upp bilder och videos för att enkelt kunna återanvända dem i dina inlägg." action={{text: 'Ladda upp media', onClick: () => fileInputRef.current?.click()}} />}
            </Card>
            {mediaToPreview && <MediaPreviewModal media={mediaToPreview} onClose={() => setMediaToPreview(null)} usageText={calculateUsage(mediaToPreview.url)} />}
            {mediaToShare && <ShareMediaToChannelModal isOpen={!!mediaToShare} onClose={() => setMediaToShare(null)} onShare={handleShareMedia} screens={displayScreens} isSharing={isSaving} />}
            <ConfirmDialog isOpen={!!mediaToDelete} onClose={() => setMediaToDelete(null)} onConfirm={handleDeleteMedia} title={`Ta bort "${mediaToDelete?.internalTitle}"?`}>
                Är du säker? Filen kommer att raderas permanent.
            </ConfirmDialog>
        </>
    );
};

const AiAutomationContent: React.FC<SuperAdminScreenProps> = ({ organization, onUpdateOrganization, onEditDisplayScreen }) => {
    const { showToast } = useToast();
    const [editingAutomation, setEditingAutomation] = useState<AiAutomation | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [automationToDelete, setAutomationToDelete] = useState<AiAutomation | null>(null);
    const [suggestedPosts, setSuggestedPosts] = useState<SuggestedPost[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);
    const { displayScreens } = useLocation();

    useEffect(() => {
        if (!organization?.id) return;
        setIsLoadingSuggestions(true);
        const unsubscribe = listenToSuggestedPosts(organization.id, (posts) => {
            setSuggestedPosts(posts);
            setIsLoadingSuggestions(false);
        });
        return () => unsubscribe();
    }, [organization?.id]);

    const handleOpenEditor = (automation: AiAutomation | null) => {
        setEditingAutomation(automation);
        setIsEditorOpen(true);
    };

    const handleSave = async (automationToSave: AiAutomation) => {
        const currentAutomations = organization.aiAutomations || [];
        const isNew = !currentAutomations.some(a => a.id === automationToSave.id);
        const updatedAutomations = isNew 
            ? [...currentAutomations, automationToSave]
            : currentAutomations.map(a => a.id === automationToSave.id ? automationToSave : a);
            
        try {
            await onUpdateOrganization(organization.id, { aiAutomations: updatedAutomations });
            showToast({ message: `Automation ${isNew ? 'skapades' : 'uppdaterades'}.`, type: 'success' });
            setIsEditorOpen(false);
        } catch (error) {
            showToast({ message: `Kunde inte spara automation: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        }
    };
    
    const handleToggle = async (automationId: string, isEnabled: boolean) => {
        const updatedAutomations = (organization.aiAutomations || []).map(a => a.id === automationId ? { ...a, isEnabled } : a);
        try {
            await onUpdateOrganization(organization.id, { aiAutomations: updatedAutomations });
        } catch (error) {
            showToast({ message: 'Kunde inte ändra status.', type: 'error' });
        }
    };

    const confirmDelete = async () => {
        if (!automationToDelete) return;
        const updatedAutomations = (organization.aiAutomations || []).filter(a => a.id !== automationToDelete.id);
        try {
            await onUpdateOrganization(organization.id, { aiAutomations: updatedAutomations });
            showToast({ message: `Automation "${automationToDelete.name}" togs bort.`, type: 'success' });
        } catch (error) {
            showToast({ message: 'Kunde inte ta bort automation.', type: 'error' });
        } finally {
            setAutomationToDelete(null);
        }
    };

    const handleSuggestionAction = async (suggestion: SuggestedPost, action: 'approve' | 'reject') => {
        const targetScreen = displayScreens.find(s => s.id === suggestion.targetScreenId);
        if (!targetScreen) {
            showToast({ message: 'Målkanalen för förslaget kunde inte hittas.', type: 'error' });
            return;
        }

        if (action === 'approve') {
            const finalPost: DisplayPost = { ...suggestion.postData, startDate: new Date().toISOString(), suggestionOriginId: suggestion.id };
            onEditDisplayScreen(targetScreen, finalPost);
        } else { // reject
            try {
                await updateSuggestedPost(organization.id, suggestion.id, { status: 'rejected' });
                showToast({ message: 'Förslaget har förkastats.', type: 'info' });
            } catch (e) {
                showToast({ message: 'Kunde inte förkasta förslaget.', type: 'error' });
            }
        }
    };
    
    return (
        <div className="space-y-8">
            <Card title="Automationer" subTitle="Låt AI:n skapa innehåll åt dig automatiskt." actions={
                <PrimaryButton onClick={() => handleOpenEditor(null)}>Skapa ny automation</PrimaryButton>
            }>
                <div className="space-y-3">
                    {(organization.aiAutomations || []).length > 0 ? (
                        (organization.aiAutomations || []).map(auto => (
                            <div key={auto.id} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg flex justify-between items-center border border-slate-200 dark:border-slate-700">
                                <div className="flex-grow">
                                    <p className="font-semibold text-lg text-slate-900 dark:text-white">{auto.name}</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">"{auto.topic}"</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <CompactToggleSwitch checked={auto.isEnabled} onChange={(c) => handleToggle(auto.id, c)} />
                                    <button onClick={() => handleOpenEditor(auto)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-primary"><PencilIcon className="h-5 w-5" /></button>
                                    <button onClick={() => setAutomationToDelete(auto)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <SkylieEmptyState title="Automatisera ditt innehåll" message="Skapa en automation för att låta AI:n generera inläggsförslag åt dig, t.ex. varje måndag morgon." action={{text: 'Skapa första automationen', onClick: () => handleOpenEditor(null)}}/>
                    )}
                </div>
            </Card>

            <Card title="AI-genererade förslag" subTitle="Här dyker nya förslag från dina automationer upp för godkännande.">
                {isLoadingSuggestions ? <div className="text-center p-8"><LoadingSpinnerIcon className="h-8 w-8 mx-auto text-primary" /></div> : (
                    <div className="space-y-3">
                        {suggestedPosts.filter(p => p.status === 'pending').length > 0 ? (
                            suggestedPosts.filter(p => p.status === 'pending').map(sugg => (
                                <div key={sugg.id} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg flex items-center gap-3 border border-slate-200 dark:border-slate-700">
                                    <div className="flex-shrink-0 w-24 h-14 bg-black rounded-md overflow-hidden"><DisplayPostRenderer post={sugg.postData} mode="preview" allTags={organization.tags} showTags={false} organization={organization}/></div>
                                    <div className="flex-grow">
                                        <p className="font-semibold text-slate-900 dark:text-white">{sugg.postData.headline}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">För kanal: {displayScreens.find(sc => sc.id === sugg.targetScreenId)?.name || 'Okänd'}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <SecondaryButton onClick={() => handleSuggestionAction(sugg, 'reject')}>Förkasta</SecondaryButton>
                                        <PrimaryButton onClick={() => handleSuggestionAction(sugg, 'approve')}>Redigera & Godkänn</PrimaryButton>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <SkylieEmptyState title="Inga nya förslag" message="När dina automationer skapar nya inlägg kommer de att visas här för dig att godkänna." />
                        )}
                    </div>
                )}
            </Card>

            {isEditorOpen && (
                <AiAutomationEditorModal 
                    isOpen={isEditorOpen}
                    onClose={() => setIsEditorOpen(false)}
                    onSave={handleSave}
                    automation={editingAutomation}
                    organization={organization}
                />
            )}
            <ConfirmDialog isOpen={!!automationToDelete} onClose={() => setAutomationToDelete(null)} onConfirm={confirmDelete} title={`Ta bort "${automationToDelete?.name}"?`}>
                Är du säker? Detta kan inte ångras.
            </ConfirmDialog>
        </div>
    );
};

export const SuperAdminScreen: React.FC<SuperAdminScreenProps> = (props) => {
    const { organization, adminRole, userRole, theme, onUpdateOrganization, onUpdateLogos, onUpdateTags, onUpdatePostTemplates, onEditDisplayScreen, onUpdateDisplayScreens } = props;

    const [activeTab, setActiveTab] = useState<AdminTab>('skyltfonster');
    
    const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
    const [previewScreen, setPreviewScreen] = useState<DisplayScreen | null>(null);
    const [shareScreen, setShareScreen] = useState<DisplayScreen | null>(null);
    const [newScreenName, setNewScreenName] = useState('');
    const [isCreatingScreen, setIsCreatingScreen] = useState(false);
    const [screenToDelete, setScreenToDelete] = useState<DisplayScreen | null>(null);
    
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    
    const [isCompleteProfileModalOpen, setIsCompleteProfileModalOpen] = useState(false);
    const [admins, setAdmins] = useState<UserData[]>([]);
    const [isLoadingAdmins, setIsLoadingAdmins] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [isInviting, setIsInviting] = useState(false);

    const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
    const [selectedEventForIdeas, setSelectedEventForIdeas] = useState<{name: string, date: Date, icon: string} | null>(null);
    const [planningContextForIdeas, setPlanningContextForIdeas] = useState<string | null>(null);

    const [isAIGuideOpen, setIsAIGuideOpen] = useState(false);
    
    const { currentUser } = useAuth();
    const { showToast } = useToast();
    const { displayScreens: allDisplayScreens, addDisplayScreen, deleteDisplayScreen: fbDeleteDisplayScreen } = useLocation();

    useEffect(() => {
        const fetchAdmins = async () => {
            if (activeTab === 'admin' && adminRole === 'superadmin') {
                setIsLoadingAdmins(true);
                try {
                    const fetchedAdmins = await getAdminsForOrganization(organization.id);
                    setAdmins(fetchedAdmins);
                } catch (e) {
                    console.error("Failed to fetch admins:", e);
                } finally {
                    setIsLoadingAdmins(false);
                }
            }
        };
        fetchAdmins();
    }, [activeTab, organization.id, adminRole]);

    useEffect(() => {
        if (!organization.address || !organization.phone || !organization.orgNumber || !organization.contactPerson) {
            const hasDismissed = sessionStorage.getItem(`dismiss-complete-profile-${organization.id}`);
            if (!hasDismissed) {
                // Wait a bit before showing the modal to not be too intrusive on load
                const timer = setTimeout(() => setIsCompleteProfileModalOpen(true), 3000);
                return () => clearTimeout(timer);
            }
        }
    }, [organization.id, organization.address, organization.phone, organization.orgNumber, organization.contactPerson]);
    
    useEffect(() => {
        if (isPairingModalOpen) {
            getSystemSettings().then(setSystemSettings).catch(console.error);
        }
    }, [isPairingModalOpen]);

    const handleCreateDisplayScreen = async () => {
        if (!newScreenName.trim()) return;
        setIsCreatingScreen(true);
        try {
            const newScreen: Omit<DisplayScreen, 'id'> = {
                name: newScreenName,
                isEnabled: true,
                posts: [],
                aspectRatio: '16:9',
            };
            await addDisplayScreen(newScreen);
            setNewScreenName('');
        } catch (e) {
            console.error(e);
            showToast({ message: 'Kunde inte skapa kanalen.', type: 'error' });
        } finally {
            setIsCreatingScreen(false);
        }
    };

    const handleDeleteScreen = async () => {
        if (!screenToDelete) return;
        try {
            await fbDeleteDisplayScreen(screenToDelete.id);
        } catch (e) {
            console.error(e);
            showToast({ message: 'Kunde inte ta bort kanalen.', type: 'error' });
        } finally {
            setScreenToDelete(null);
        }
    };
    
    const handleSetAdminRole = async (uid: string, role: 'superadmin' | 'admin') => {
        try {
            await setAdminRole(uid, role);
            setAdmins(prev => prev.map(a => a.uid === uid ? { ...a, adminRole: role } : a));
            showToast({ message: 'Behörighet uppdaterad.', type: 'success' });
        } catch (error) {
            showToast({ message: 'Kunde inte uppdatera behörighet.', type: 'error' });
        }
    };
    
    const handleInviteUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteEmail.trim()) return;
        setIsInviting(true);
        try {
            const result = await inviteUser(organization.id, inviteEmail.trim());
            if (result.success) {
                showToast({ message: result.message, type: 'success' });
                setInviteEmail('');
                // Refetch admins
                const fetchedAdmins = await getAdminsForOrganization(organization.id);
                setAdmins(fetchedAdmins);
            } else {
                showToast({ message: result.message, type: 'error' });
            }
        } catch (e) {
            showToast({ message: `Inbjudan misslyckades: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsInviting(false);
        }
    };

    const handleGetCampaignIdeas = (event: { name: string, date: Date, icon: string }) => {
        setSelectedEventForIdeas(event);
        setPlanningContextForIdeas(null);
        setIsCampaignModalOpen(true);
    };

    const handleGetSeasonalIdeas = (context: string) => {
        setPlanningContextForIdeas(context);
        setSelectedEventForIdeas(null);
        setIsCampaignModalOpen(true);
    };
    
    const handleUnpair = async (physicalScreenId: string) => {
        if (!window.confirm("Är du säker på att du vill koppla från detta skyltfönster?")) return;
        try {
            await unpairPhysicalScreen(organization.id, physicalScreenId);
            showToast({ message: 'Skyltfönstret har kopplats från.', type: 'success' });
        } catch (e) {
            console.error("Failed to unpair screen:", e);
            showToast({ message: `Kunde inte koppla från: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error'});
        }
    };

    const handleSaveCompletedProfile = async (data: Partial<Organization>) => {
        await onUpdateOrganization(organization.id, data);
        setIsCompleteProfileModalOpen(false);
        sessionStorage.setItem(`dismiss-complete-profile-${organization.id}`, 'true');
        showToast({ message: 'Tack! Din profil är nu uppdaterad.', type: 'success' });
    };

    return (
        <div className="w-full max-w-7xl mx-auto space-y-6 pb-12 animate-fade-in">
             <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{organization.name}</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Här hanterar du allt innehåll och alla inställningar för din organisation.</p>
                </div>
                <button
                    onClick={() => setIsAIGuideOpen(true)}
                    className="flex items-center gap-2 text-sm font-semibold text-purple-600 dark:text-purple-400 hover:underline"
                >
                    <LightBulbIcon className="h-5 w-5" />
                    Hur fungerar AI-assistenten?
                </button>
            </div>
            
            <div className="space-y-6 mb-8">
                <ProactiveUpcomingEventBanner organization={organization} onGenerateIdeas={handleGetCampaignIdeas} />
                <ProactiveRhythmBanner organization={organization} onGenerateIdeas={handleGetSeasonalIdeas} />
                <ProactiveSeasonalBanner organization={organization} onGenerateIdeas={handleGetSeasonalIdeas} />
            </div>

            <div className="border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                    <TabButton tabId="skyltfonster" activeTab={activeTab} setActiveTab={setActiveTab}>Skyltfönster</TabButton>
                    <TabButton tabId="organisation" activeTab={activeTab} setActiveTab={setActiveTab}>Varumärke</TabButton>
                    <TabButton tabId="galleri" activeTab={activeTab} setActiveTab={setActiveTab}>Galleri</TabButton>
                    <TabButton tabId="automation" activeTab={activeTab} setActiveTab={setActiveTab} highlight={(organization.aiAutomations || []).some(a => (a.isAutopilotEnabled && a.isEnabled))}>Automation</TabButton>
                    {adminRole === 'superadmin' && (
                        <TabButton tabId="admin" activeTab={activeTab} setActiveTab={setActiveTab}>Admin</TabButton>
                    )}
                </div>
            </div>

            <div className="mt-6">
                {activeTab === 'skyltfonster' && (
                    <div className="space-y-8">
                        <Card title="Anslutna Skyltfönster" subTitle="Fysiska skärmar som är parkopplade med ditt konto." actions={<PrimaryButton onClick={() => setIsPairingModalOpen(true)}>Anslut ny skärm</PrimaryButton>}>
                            <div className="space-y-3">
                                {(organization.physicalScreens || []).map(ps => (
                                    <div key={ps.id} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg flex justify-between items-center border border-slate-200 dark:border-slate-700">
                                        <div>
                                            <p className="font-semibold text-slate-900 dark:text-white">{ps.name}</p>
                                            <p className="text-sm text-slate-500 dark:text-slate-400">Visar kanalen: {allDisplayScreens.find(ds => ds.id === ps.displayScreenId)?.name || 'Okänd'}</p>
                                        </div>
                                        <DestructiveButton onClick={() => handleUnpair(ps.id)}>Koppla från</DestructiveButton>
                                    </div>
                                ))}
                                {(organization.physicalScreens || []).length === 0 && (
                                    <SkylieEmptyState 
                                        title="Inga anslutna skyltfönster" 
                                        message="Klicka på 'Anslut ny skärm' för att parkoppla din första fysiska skärm med en kod."
                                        action={{ text: "Anslut ny skärm", onClick: () => setIsPairingModalOpen(true) }}
                                    />
                                )}
                            </div>
                        </Card>
                         <Card title="Kanaler" subTitle="En kanal är en spellista med innehåll som du kan visa på ett eller flera skyltfönster.">
                             <div className="space-y-3">
                                {allDisplayScreens.map(screen => (
                                    <div key={screen.id} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg flex items-center gap-4 border border-slate-200 dark:border-slate-700">
                                        <div className={`${getAspectRatioClass(screen.aspectRatio)} w-32 bg-slate-200 dark:bg-slate-900 rounded-md overflow-hidden flex-shrink-0 relative group`}>
                                            {screen.posts && screen.posts.length > 0 && <DisplayPostRenderer post={screen.posts[0]} mode="preview" allTags={organization.tags} showTags={false} organization={organization}/>}
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <button onClick={() => setPreviewScreen(screen)} className="bg-white/80 text-black px-3 py-1.5 text-xs font-bold rounded-full">Förhandsgranska</button>
                                            </div>
                                        </div>
                                        <div className="flex-grow">
                                            <p className="font-semibold text-lg text-slate-900 dark:text-white">{screen.name}</p>
                                            <p className="text-sm text-slate-500 dark:text-slate-400">{screen.posts?.length || 0} inlägg</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <SecondaryButton onClick={() => setShareScreen(screen)}>Dela</SecondaryButton>
                                            <PrimaryButton onClick={() => onEditDisplayScreen(screen)}>Redigera</PrimaryButton>
                                            <DestructiveButton onClick={() => setScreenToDelete(screen)}><TrashIcon/></DestructiveButton>
                                        </div>
                                    </div>
                                ))}
                                <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                                    <form onSubmit={e => { e.preventDefault(); handleCreateDisplayScreen(); }} className="flex gap-2">
                                        <StyledInput value={newScreenName} onChange={e => setNewScreenName(e.target.value)} placeholder="Namn på ny kanal" />
                                        <PrimaryButton type="submit" disabled={!newScreenName.trim()} loading={isCreatingScreen}>Skapa</PrimaryButton>
                                    </form>
                                </div>
                            </div>
                         </Card>
                    </div>
                )}
                {activeTab === 'organisation' && (
                    <OrganisationTab {...props} />
                )}
                {activeTab === 'galleri' && (
                    <MediaGalleryManager {...props} />
                )}
                {activeTab === 'automation' && (
                    <AiAutomationContent {...props} />
                )}
                {activeTab === 'admin' && adminRole === 'superadmin' && (
                    <Card title="Administratörer" subTitle={`Hantera användare med behörighet för ${organization.name}.`}>
                        <div className="space-y-3">
                            {isLoadingAdmins && <p>Laddar...</p>}
                            {admins.map(admin => (
                                <div key={admin.uid} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg flex justify-between items-center border border-slate-200 dark:border-slate-700">
                                    <div>
                                        <p className="font-semibold text-slate-800 dark:text-slate-200">{admin.email}</p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{admin.adminRole === 'superadmin' ? 'Superadmin' : 'Admin'}</p>
                                    </div>
                                    {admin.uid !== currentUser?.uid && (
                                        <StyledSelect value={admin.adminRole} onChange={e => handleSetAdminRole(admin.uid, e.target.value as 'superadmin' | 'admin')}>
                                            <option value="admin">Admin</option>
                                            <option value="superadmin">Superadmin</option>
                                        </StyledSelect>
                                    )}
                                </div>
                            ))}
                        </div>
                         <form onSubmit={handleInviteUser} className="pt-6 border-t border-slate-300 dark:border-gray-700 space-y-3 mt-6">
                            <h4 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Bjud in ny administratör</h4>
                            <div className="flex gap-2">
                                <StyledInput type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="E-postadress" required />
                                <PrimaryButton type="submit" disabled={!inviteEmail.trim()} loading={isInviting}>Bjud in</PrimaryButton>
                            </div>
                        </form>
                    </Card>
                )}
            </div>

            {previewScreen && <DisplayScreenPreviewModal screen={previewScreen} organization={organization} onClose={() => setPreviewScreen(null)} />}
            {shareScreen && <ShareModal screen={shareScreen} organization={organization} onClose={() => setShareScreen(null)} />}
            <PairingModal isOpen={isPairingModalOpen} onClose={() => setIsPairingModalOpen(false)} organization={organization} systemSettings={systemSettings} onPairSuccess={() => {}} onUpdateOrganization={onUpdateOrganization} />
            <ConfirmDialog isOpen={!!screenToDelete} onClose={() => setScreenToDelete(null)} onConfirm={handleDeleteScreen} title={`Ta bort kanalen "${screenToDelete?.name}"?`}>
                Är du säker? Alla inlägg i kanalen kommer att raderas permanent.
            </ConfirmDialog>
            <CampaignIdeaGeneratorForOrg
                isOpen={isCampaignModalOpen}
                onClose={() => setIsCampaignModalOpen(false)}
                event={selectedEventForIdeas}
                planningContext={planningContextForIdeas}
                organization={organization}
                onUpdateOrganization={onUpdateOrganization}
                onEditDisplayScreen={onEditDisplayScreen}
            />
            <CompleteProfileModal
                isOpen={isCompleteProfileModalOpen}
                onSave={handleSaveCompletedProfile}
                organization={organization}
            />
             <AIGuideModal isOpen={isAIGuideOpen} onClose={() => setIsAIGuideOpen(false)} />
        </div>
    );
};
```
  </change>
  <change>
    <file>components/ErrorBoundary.tsx</file>
    <description>Förbättrar ErrorBoundary genom att konvertera render-metoden till en standard klassmetod, vilket är bästa praxis och kan hjälpa till att förhindra subtila fel i vissa byggmiljöer.</description>
    <content><![CDATA[import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: undefined,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    if ((window as any).DEBUG_MODE) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
    }
  }

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-4 text-center">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 max-w-lg">
                <h1 className="text-3xl font-bold text-red-400 mb-4">Ett oväntat fel inträffade</h1>
                <p className="text-slate-300 mb-6">
                    Något gick fel under renderingen av applikationen. Detta har loggats automatiskt.
                    Försök att ladda om sidan.
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="bg-primary hover:brightness-110 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                    Ladda om sidan
                </button>
                 {(window as any).DEBUG_MODE && this.state.error && (
                    <pre className="mt-6 p-4 bg-slate-900 rounded-md text-left text-xs text-red-300 overflow-auto max-h-60">
                        <code>
                            {this.state.error?.stack}
                        </code>
                    </pre>
                )}
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```
  </change>
</changes>
```