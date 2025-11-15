import React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Organization, CustomPage, UserRole, InfoCarousel, InfoMessage, DisplayScreen, DisplayPost, UserData, Tag, SystemSettings, ScreenPairingCode, BrandingOptions, PostTemplate, CampaignIdea, CustomEvent, PhysicalScreen, MediaItem, AiAutomation, SuggestedPost } from '../types';
import { ToggleSwitch, CompactToggleSwitch, MonitorIcon, PencilIcon, TrashIcon, CodeBracketIcon, MagnifyingGlassIcon, SparklesIcon, ShareIcon, DuplicateIcon, ChevronDownIcon, CheckCircleIcon, VideoCameraIcon, PlayIcon, PauseIcon, LightBulbIcon, Cog6ToothIcon, LoadingSpinnerIcon, HandThumbUpIcon } from './icons';
import { getAdminsForOrganization, setAdminRole, inviteUser, getSystemSettings, getPairingCode, pairAndActivateScreen, uploadMediaForGallery, deleteMediaFromStorage, unpairPhysicalScreen, isOffline, callTestFunction, updateDisplayScreen, listenToSuggestedPosts, updateSuggestedPost, deleteSuggestedPost } from '../services/firebaseService';
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
// FIX: Added import for AiImageEditorModal.
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
        
        if (nextEvent) {
            const diffDays = (nextEvent.date.getTime() - now.getTime()) / (1000 * 3600 * 24);
            if (diffDays <= 30) {
                const lastShownKey = `event-banner-shown-${organization.id}-${nextEvent.name}-${year}`;
                const lastShown = localStorage.getItem(lastShownKey);
                if (!lastShown) {
                    setEvent(nextEvent);
                    localStorage.setItem(lastShownKey, 'true');
                } else {
                    setIsLoading(false);
                }
            } else {
                 setIsLoading(false);
            }
        } else {
            setIsLoading(false);
        }
    }, [organization]);

    useEffect(() => {
        if (event) {
            const hasExistingCampaign = (organization.displayScreens || []).some(screen =>
                (screen.posts || []).some(post => post.internalTitle.toLowerCase().includes(event.name.toLowerCase()))
            );
            const now = new Date();
            const diffTime = event.date.getTime() - now.getTime();
            const daysUntil = Math.max(0, Math.ceil(diffTime / (1000 * 3600 * 24)));

            generateEventReminderText(event, daysUntil, organization, hasExistingCampaign)
                .then(setReminder)
                .catch(err => {
                    console.error("Failed to generate event reminder text:", err);
                    setReminder({
                        headline: `${event.name} närmar sig!`,
                        subtext: 'Ska vi skapa en kampanj?'
                    });
                })
                .finally(() => setIsLoading(false));
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

// FIX: Added missing component definition.
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

// FIX: Added missing component definition.
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

const MediaGalleryManager: React.FC<SuperAdminScreenProps> = ({ organization, onUpdateOrganization }) => {
    const { displayScreens, updateDisplayScreen } = useLocation();
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useToast();
    const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null);

    const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
    const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
    const [batchShareModal, setBatchShareModal] = useState(false);
    const [isSharing, setIsSharing] = useState(false);

    const [editingMediaItem, setEditingMediaItem] = useState<MediaItem | null>(null);
    const [isAiEditorOpen, setIsAiEditorOpen] = useState(false);
    const [isEditingMedia, setIsEditingMedia] = useState(false);

    const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'unused'>(() => {
        try {
            return (localStorage.getItem('mediaGalleryFilter') as any) || 'all';
        } catch (e) {
            return 'all';
        }
    });
    const [sort, setSort] = useState<'newest' | 'oldest' | 'size'>(() => {
        try {
            return (localStorage.getItem('mediaGallerySort') as any) || 'newest';
        } catch (e) {
            return 'newest';
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem('mediaGalleryFilter', filter);
        } catch (e) { console.warn("Could not save media filter to localStorage", e); }
    }, [filter]);

    useEffect(() => {
        try {
            localStorage.setItem('mediaGallerySort', sort);
        } catch (e) { console.warn("Could not save media sort to localStorage", e); }
    }, [sort]);

    const mediaUsageMap = useMemo(() => {
        const usage = new Map<string, string[]>();
        if (!organization.mediaLibrary || !displayScreens) {
            return usage;
        }

        for (const media of organization.mediaLibrary) {
            usage.set(media.id, []);
        }

        for (const screen of displayScreens) {
            for (const post of (screen.posts || [])) {
                const urlsInPost = new Set<string | undefined>();
                urlsInPost.add(post.imageUrl);
                urlsInPost.add(post.videoUrl);
                urlsInPost.add(post.backgroundVideoUrl);
                (post.subImages || []).forEach(si => urlsInPost.add(si.imageUrl));
                (post.collageItems || []).forEach(ci => {
                    if (ci) {
                      urlsInPost.add(ci.imageUrl);
                      urlsInPost.add(ci.videoUrl);
                    }
                });

                for (const url of urlsInPost) {
                    if (url) {
                        const mediaItem = organization.mediaLibrary.find(m => m.url === url);
                        if (mediaItem) {
                            const screens = usage.get(mediaItem.id) || [];
                            if (!screens.includes(screen.name)) {
                                screens.push(screen.name);
                                usage.set(mediaItem.id, screens);
                            }
                        }
                    }
                }
            }
        }
        return usage;
    }, [organization.mediaLibrary, displayScreens]);
    
    const processedMedia = useMemo(() => {
        const library = organization.mediaLibrary || [];
        
        const filtered = library.filter(item => {
            switch (filter) {
                case 'image': return item.type === 'image';
                case 'video': return item.type === 'video';
                case 'unused': return (mediaUsageMap.get(item.id) || []).length === 0;
                case 'all': default: return true;
            }
        });
        
        return filtered.sort((a, b) => {
            switch (sort) {
                case 'oldest': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                case 'size': return (b.sizeBytes || 0) - (a.sizeBytes || 0);
                case 'newest': default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
        });
    }, [organization.mediaLibrary, filter, sort, mediaUsageMap]);


    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const { url, type, size } = await uploadMediaForGallery(organization.id, file, (progress) => {
                setUploadProgress(progress);
            });
            
            const newMediaItem: MediaItem = {
                id: `media-${Date.now()}`,
                type: type as 'image' | 'video',
                url,
                internalTitle: file.name,
                createdAt: new Date().toISOString(),
                createdBy: 'user',
                sizeBytes: size,
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

    const handleDelete = async (mediaItem: MediaItem) => {
        if (!window.confirm("Är du säker på att du vill ta bort denna media?")) return;

        try {
            if (mediaItem.url.includes('firebasestorage.googleapis.com')) {
                await deleteMediaFromStorage(mediaItem.url);
            }
            const updatedLibrary = (organization.mediaLibrary || []).filter(item => item.id !== mediaItem.id);
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
            showToast({ message: "Media borttagen.", type: 'success' });
        } catch (error) {
            console.error(error);
            showToast({ message: `Kunde inte ta bort media: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        }
    };

    const handleEditMediaItem = async (editPrompt: string) => {
        if (!editingMediaItem) return;
        setIsAiEditorOpen(false);
        setIsEditingMedia(true);
    
        try {
            const { mimeType, data } = await urlToBase64(editingMediaItem.url);
            const { imageBytes: newImageBytes, mimeType: newMimeType } = await editDisplayPostImage(data, mimeType, editPrompt);
            const newDataUri = `data:${newMimeType};base64,${newImageBytes}`;
            
            const newMediaItem: MediaItem = {
                id: `media-ai-${Date.now()}`,
                type: 'image',
                url: newDataUri,
                internalTitle: `AI Edit: ${editingMediaItem.internalTitle}`,
                createdAt: new Date().toISOString(),
                createdBy: 'ai',
                aiPrompt: editPrompt,
                sizeBytes: (newImageBytes.length * 3 / 4) 
            };
    
            const updatedLibrary = [...(organization.mediaLibrary || []), newMediaItem];
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
    
            showToast({ message: 'Ny bildvariant skapad och sparad i galleriet!', type: 'success' });
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : 'Kunde inte redigera bilden.', type: 'error' });
        } finally {
            setIsEditingMedia(false);
            setEditingMediaItem(null);
        }
    };
    
    // --- Batch Action Handlers ---
    const handleToggleSelection = (mediaId: string) => {
        setSelectedMediaIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(mediaId)) newSet.delete(mediaId);
            else newSet.add(mediaId);
            return newSet;
        });
    };

    const handleSelectAllVisible = () => setSelectedMediaIds(new Set(processedMedia.map(item => item.id)));
    const handleClearSelection = () => setSelectedMediaIds(new Set());

    const handleBatchDelete = async () => {
        setBatchDeleteConfirm(false);
        const itemsToDelete = (organization.mediaLibrary || []).filter(item => selectedMediaIds.has(item.id));
        
        try {
            await Promise.all(itemsToDelete.map(item => {
                if (item.url.includes('firebasestorage.googleapis.com')) {
                    return deleteMediaFromStorage(item.url);
                }
                return Promise.resolve();
            }));
            const updatedLibrary = (organization.mediaLibrary || []).filter(item => !selectedMediaIds.has(item.id));
            await onUpdateOrganization(organization.id, { mediaLibrary: updatedLibrary });
            showToast({ message: `${itemsToDelete.length} filer togs bort.`, type: 'success' });
        } catch (error) {
            showToast({ message: `Kunde inte ta bort alla filer: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            handleClearSelection();
        }
    };
    
    const handleBatchDownload = () => {
        showToast({ message: `Laddar ner ${selectedMediaIds.size} filer. Du kan behöva godkänna flera nedladdningar.`, type: 'info', duration: 8000 });
        const selectedItems = (organization.mediaLibrary || []).filter(item => selectedMediaIds.has(item.id));
        selectedItems.forEach((item, index) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = item.url;
                const urlParts = item.url.split('?')[0].split('.');
                const extension = urlParts.length > 1 ? urlParts.pop() : (item.type === 'video' ? 'mp4' : 'jpg');
                link.download = `${item.internalTitle.replace(/[^a-z0-9]/gi, '_')}.${extension}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, index * 300);
        });
    };
    
    const handleBatchShareConfirm = async (targetScreenIds: string[]) => {
        setIsSharing(true);
        const selectedItems = (organization.mediaLibrary || []).filter(item => selectedMediaIds.has(item.id));

        try {
            for (const screenId of targetScreenIds) {
                const screen = displayScreens.find(s => s.id === screenId);
                if (!screen) continue;

                const newPosts: DisplayPost[] = selectedItems.map(item => ({
                    id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    internalTitle: `Delat från galleri: ${item.internalTitle}`,
                    layout: item.type === 'image' ? 'image-fullscreen' : 'video-fullscreen',
                    imageUrl: item.type === 'image' ? item.url : undefined,
                    videoUrl: item.type === 'video' ? item.url : undefined,
                    durationSeconds: 15,
                    startDate: new Date().toISOString(),
                }));
                
                const updatedPosts = [...(screen.posts || []), ...newPosts];
                await updateDisplayScreen(screenId, { posts: updatedPosts });
            }
            showToast({ message: `Delade ${selectedItems.length} filer till ${targetScreenIds.length} kanal(er).`, type: 'success' });
        } catch (e) {
            showToast({ message: "Kunde inte dela filerna.", type: 'error' });
        } finally {
            handleClearSelection();
            setBatchShareModal(false);
            setIsSharing(false);
        }
    };


    const formatBytes = (bytes?: number, decimals = 2) => {
        if (!bytes) return 'N/A';
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    
    const LazyMediaItemThumbnail: React.FC<{
        item: MediaItem;
        usageText: string;
        isSelected: boolean;
        selectionActive: boolean;
        onToggleSelection: (id: string) => void;
        onPreview: (item: MediaItem) => void;
        onDelete: (item: MediaItem) => void;
        onEdit: (item: MediaItem) => void;
    }> = ({ item, usageText, isSelected, selectionActive, onToggleSelection, onPreview, onDelete, onEdit }) => {
        const ref = useRef<HTMLDivElement>(null);
        const [isInView, setIsInView] = useState(false);
        const [hasError, setHasError] = useState(false);

        useEffect(() => {
            const observer = new IntersectionObserver(
                ([entry]) => {
                    if (entry.isIntersecting) {
                        setIsInView(true);
                        observer.disconnect();
                    }
                }, { rootMargin: '200px' }
            );
            if (ref.current) observer.observe(ref.current);
            return () => observer.disconnect();
        }, []);

        const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#E2E8F0"/><text x="50" y="50" font-family="sans-serif" font-size="8" fill="#94A3B8" text-anchor="middle" dominant-baseline="middle">Laddar...</text></svg>`;
        const PLACEHOLDER_URL = `data:image/svg+xml;base64,${btoa(PLACEHOLDER_SVG)}`;
        
        const handleClick = () => {
            if (selectionActive) {
                onToggleSelection(item.id);
            } else {
                onPreview(item);
            }
        };

        return (
             <div ref={ref} className="group flex flex-col gap-2">
                <div 
                    className={`relative aspect-square bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden cursor-pointer transition-all ${isSelected ? 'ring-4 ring-primary' : ''}`}
                    onClick={handleClick}
                >
                    {isInView ? (
                        <>
                            {item.type === 'image' ? (
                                <img src={hasError ? PLACEHOLDER_URL : item.url} alt={item.internalTitle} className="w-full h-full object-cover" onError={() => setHasError(true)} />
                            ) : (
                                <>
                                    <video src={hasError ? undefined : item.url} muted loop playsInline className="w-full h-full object-cover" onError={() => setHasError(true)} onMouseEnter={e => e.currentTarget.play()} onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }} />
                                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none group-hover:bg-black/10 transition-colors">
                                        <PlayIcon className="h-10 w-10 text-white/80 drop-shadow-lg group-hover:opacity-0 transition-opacity" />
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <img src={PLACEHOLDER_URL} alt="Loading..." className="w-full h-full object-contain p-2" />
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between items-start">
                        <div className="flex flex-col gap-1">
                            <button onClick={(e) => { e.stopPropagation(); onPreview(item); }} className="p-2 bg-slate-100/20 hover:bg-slate-100/40 text-white rounded-full" aria-label="Förhandsgranska" title="Förhandsgranska"><MagnifyingGlassIcon className="h-4 w-4" /></button>
                            {item.type === 'image' && (
                                <button onClick={(e) => { e.stopPropagation(); onEdit(item); }} className="p-2 bg-purple-600/80 hover:bg-purple-500 text-white rounded-full" aria-label="Redigera med AI" title="Redigera med AI"><SparklesIcon className="h-4 w-4" /></button>
                            )}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="self-end p-2 bg-red-600/80 hover:bg-red-500 text-white rounded-full" aria-label="Ta bort" title="Ta bort"><TrashIcon className="h-4 w-4" /></button>
                    </div>
                    <div className={`absolute top-2 left-2 z-10 transition-opacity ${selectionActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} onClick={e => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelection(item.id)}
                            className="w-5 h-5 rounded text-primary focus:ring-primary border-slate-400 bg-white/50 shadow"
                        />
                    </div>
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{item.internalTitle}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{usageText}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(item.createdAt).toLocaleDateString('sv-SE')}
                        {item.sizeBytes ? ` • ${formatBytes(item.sizeBytes)}` : ''}
                    </p>
                </div>
            </div>
        );
    };

    const FilterButton: React.FC<{ label: string; value: typeof filter; current: typeof filter; onClick: (value: typeof filter) => void; }> = ({ label, value, current, onClick }) => (
        <button
            onClick={() => onClick(value)}
            className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-shadow ${
                current === value 
                ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' 
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
            }`}
        >
            {label}
        </button>
    );

    const allVisibleSelected = processedMedia.length > 0 && processedMedia.every(item => selectedMediaIds.has(item.id));
    const selectionActive = selectedMediaIds.size > 0;

    return (
        <Card title="Galleri" subTitle="Hantera dina återanvändbara bilder och videos.">
            <div className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <h4 className="font-semibold text-lg mb-2">Ladda upp ny media</h4>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/mp4" />
                <PrimaryButton onClick={() => fileInputRef.current?.click()} loading={isUploading} disabled={isUploading}>
                    {isUploading ? `Laddar upp... ${uploadProgress.toFixed(0)}%` : 'Välj fil (bild eller video)'}
                </PrimaryButton>
            </div>
            
            {selectionActive && (
                <div className="bg-primary/10 dark:bg-primary/20 p-3 rounded-lg flex items-center justify-between gap-4 my-4 border border-primary/20 sticky top-16 z-30 animate-fade-in">
                    <div>
                        <span className="font-bold text-primary">{selectedMediaIds.size} filer valda</span>
                        <button onClick={allVisibleSelected ? handleClearSelection : handleSelectAllVisible} className="ml-4 text-sm font-bold text-primary hover:underline">
                            {allVisibleSelected ? 'Avmarkera alla' : 'Markera alla synliga'}
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <SecondaryButton onClick={() => setBatchShareModal(true)}>Dela till kanal...</SecondaryButton>
                        <SecondaryButton onClick={handleBatchDownload}>Ladda ner</SecondaryButton>
                        <DestructiveButton onClick={() => setBatchDeleteConfirm(true)}>Ta bort</DestructiveButton>
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <FilterButton label="Alla filer" value="all" current={filter} onClick={setFilter} />
                    <FilterButton label="Bilder" value="image" current={filter} onClick={setFilter} />
                    <FilterButton label="Videos" value="video" current={filter} onClick={setFilter} />
                    <FilterButton label="Ej i bruk" value="unused" current={filter} onClick={setFilter} />
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                    <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Sortera:</label>
                    <StyledSelect value={sort} onChange={e => setSort(e.target.value as any)}>
                        <option value="newest">Senaste först</option>
                        <option value="oldest">Äldsta först</option>
                        <option value="size">Störst filstorlek</option>
                    </StyledSelect>
                </div>
            </div>

            {processedMedia.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6 mt-6">
                    {processedMedia.map(item => {
                        const usage = mediaUsageMap.get(item.id) || [];
                        const usageText = usage.length > 0 ? `Används i: ${usage.join(', ')}` : 'Ej i bruk';
                        return (
                           <LazyMediaItemThumbnail
                                key={item.id}
                                item={item}
                                usageText={usageText}
                                isSelected={selectedMediaIds.has(item.id)}
                                selectionActive={selectionActive}
                                onToggleSelection={handleToggleSelection}
                                onPreview={setPreviewMedia}
                                onDelete={handleDelete}
                                onEdit={(itemToEdit) => { setEditingMediaItem(itemToEdit); setIsAiEditorOpen(true); }}
                            />
                        );
                    })}
                </div>
            ) : (
                <div className="mt-6">
                    {(organization.mediaLibrary || []).length > 0 ? (
                        <EmptyState 
                            icon={<MagnifyingGlassIcon className="h-12 w-12 text-slate-400" />}
                            title="Inga träffar"
                            message="Inga filer i galleriet matchar dina filterval."
                        />
                    ) : (
                        <EmptyState 
                            icon={<VideoCameraIcon className="h-12 w-12 text-slate-400" />}
                            title="Galleriet är tomt"
                            message="Ladda upp bilder och videos för att enkelt kunna återanvända dem i dina inlägg och collage."
                        />
                    )}
                </div>
            )}
            {previewMedia && (
                <MediaPreviewModal 
                    media={previewMedia} 
                    onClose={() => setPreviewMedia(null)}
                    usageText={(mediaUsageMap.get(previewMedia.id) || []).join(', ') || 'Ej i bruk'}
                />
            )}
            <ConfirmDialog
                isOpen={batchDeleteConfirm}
                onClose={() => setBatchDeleteConfirm(false)}
                onConfirm={handleBatchDelete}
                title={`Ta bort ${selectedMediaIds.size} filer?`}
                confirmText="Ja, ta bort"
            >
                Är du säker? Filerna tas bort permanent från lagringen och galleriet.
            </ConfirmDialog>
            <ShareMediaToChannelModal
                isOpen={batchShareModal}
                onClose={() => setBatchShareModal(false)}
                onShare={handleBatchShareConfirm}
                screens={displayScreens}
                isSharing={isSharing}
            />
             <AiImageEditorModal
                isOpen={isAiEditorOpen}
                onClose={() => setIsAiEditorOpen(false)}
                onGenerate={handleEditMediaItem}
                isLoading={isEditingMedia}
            />
        </Card>
    );
};

// FIX: Added missing component definition.
const AiAutomationContent: React.FC<SuperAdminScreenProps> = ({ organization, onUpdateOrganization, onEditDisplayScreen }) => {
    const { showToast } = useToast();
    const { displayScreens, updateDisplayScreen } = useLocation();
    const [editingAutomation, setEditingAutomation] = useState<AiAutomation | null>(null);
    const [automationToDelete, setAutomationToDelete] = useState<AiAutomation | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    
    const [suggestions, setSuggestions] = useState<SuggestedPost[]>([]);
    const [expandedAutomations, setExpandedAutomations] = useState<Set<string>>(new Set());

    const toggleExpand = (automationId: string) => {
        setExpandedAutomations(prev => {
            const newSet = new Set(prev);
            if (newSet.has(automationId)) {
                newSet.delete(automationId);
            } else {
                newSet.add(automationId);
            }
            return newSet;
        });
    };
    
    useEffect(() => {
        const unsub = listenToSuggestedPosts(organization.id, setSuggestions);
        return () => unsub();
    }, [organization.id]);

    const automations = organization.aiAutomations || [];
    
    const handleEdit = (automation: AiAutomation) => {
        setEditingAutomation(automation);
        setIsEditorOpen(true);
    };

    const handleAddNew = () => {
        setEditingAutomation(null);
        setIsEditorOpen(true);
    };

    const handleSave = async (automation: AiAutomation) => {
        const isNew = !automations.some(a => a.id === automation.id);
        const updatedAutomations = isNew
            ? [...automations, automation]
            : automations.map(a => a.id === automation.id ? automation : a);
        
        try {
            await onUpdateOrganization(organization.id, { aiAutomations: updatedAutomations });
            showToast({ message: 'Automation sparad.', type: 'success' });
        } catch (e) {
            showToast({ message: 'Kunde inte spara automation.', type: 'error' });
        } finally {
            setIsEditorOpen(false);
        }
    };

    const handleDelete = (automation: AiAutomation) => {
        setAutomationToDelete(automation);
    };

    const confirmDelete = async () => {
        if (!automationToDelete) return;

        const updatedAutomations = automations.filter(a => a.id !== automationToDelete.id);
        try {
            await onUpdateOrganization(organization.id, { aiAutomations: updatedAutomations });
            showToast({ message: 'Automation borttagen.', type: 'success' });
        } catch (e) {
            showToast({ message: 'Kunde inte ta bort automation.', type: 'error' });
        } finally {
            setAutomationToDelete(null);
        }
    };
    
    const handleApprove = async (suggestion: SuggestedPost) => {
        try {
            const targetScreen = displayScreens.find(s => s.id === suggestion.targetScreenId);
            if (!targetScreen) throw new Error("Målkanalen kunde inte hittas.");

            const newPost: DisplayPost = {
                ...suggestion.postData,
                id: `post-${Date.now()}`,
                startDate: new Date().toISOString(),
                suggestionOriginId: suggestion.id, // Behåll för spårning, men ingen inlärning sker
            };

            const updatedPosts = [...(targetScreen.posts || []), newPost];
            await updateDisplayScreen(targetScreen.id, { posts: updatedPosts });
            await updateSuggestedPost(organization.id, suggestion.id, { status: 'approved', finalPostId: newPost.id });

            showToast({ message: `Inlägget "${newPost.internalTitle}" har publicerats i "${targetScreen.name}".`, type: 'success' });
        } catch (e) {
            showToast({ message: `Kunde inte godkänna förslaget: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
        }
    };

    const handleReject = async (suggestion: SuggestedPost) => {
        try {
            await updateSuggestedPost(organization.id, suggestion.id, { status: 'rejected' });
            showToast({
                message: 'Förslaget har förkastats.',
                type: 'info',
                duration: 6000,
                action: {
                    label: 'Ångra',
                    onClick: () => updateSuggestedPost(organization.id, suggestion.id, { status: 'pending' }),
                },
            });
        } catch (e) {
            showToast({ message: 'Kunde inte förkasta förslaget.', type: 'error' });
        }
    };
    
    const handleEditSuggestion = (suggestion: SuggestedPost) => {
        const targetScreen = displayScreens.find(s => s.id === suggestion.targetScreenId);
        if (targetScreen) {
            onEditDisplayScreen(targetScreen, {
                ...suggestion.postData,
                suggestionOriginId: suggestion.id,
            });
        } else {
            showToast({ message: "Kunde inte hitta målkanalen för att redigera.", type: 'error' });
        }
    };

    const pendingSuggestions = useMemo(() => {
        return suggestions
            .filter(s => s.status === 'pending')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [suggestions]);

    return (
        <div className="space-y-8">
            <Card 
                title="AI Automationer" 
                subTitle="Skapa automatiska inlägg baserat på ett schema och kreativa instruktioner."
                actions={<PrimaryButton onClick={handleAddNew}>Skapa ny automation</PrimaryButton>}
            >
                <div className="space-y-3">
                    {automations.length > 0 ? (
                        automations.map(auto => {
                            const isExpanded = expandedAutomations.has(auto.id);
                            const isLongText = auto.topic.length > 150;
                            return (
                                <div key={auto.id} className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-grow">
                                            <p className="font-semibold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                                <span className={`w-3 h-3 rounded-full ${auto.isEnabled ? 'bg-green-500' : 'bg-slate-400'}`} />
                                                {auto.name}
                                            </p>
                                            <p className={`text-sm text-slate-500 dark:text-slate-400 mt-1 whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-2'}`}>
                                                {auto.topic}
                                            </p>
                                            {isLongText && (
                                                <button onClick={() => toggleExpand(auto.id)} className="text-sm font-semibold text-primary hover:underline mt-1">
                                                    {isExpanded ? 'Visa mindre' : 'Visa mer...'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex gap-2 flex-shrink-0">
                                            <SecondaryButton onClick={() => handleEdit(auto)}>Redigera</SecondaryButton>
                                            <DestructiveButton onClick={() => handleDelete(auto)}>Ta bort</DestructiveButton>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <SkylieEmptyState 
                            title="Låt mig jobba åt dig!"
                            message={<>Skapa en automation för att låta mig generera nya inläggsförslag automatiskt, t.ex. 'varje måndag' eller 'en gång i månaden'. Perfekt för att hålla dina kanaler levande!</>}
                            action={{ text: 'Skapa första automationen', onClick: handleAddNew }}
                        />
                    )}
                </div>
            </Card>

            <Card 
                title="Inläggsförslag för godkännande" 
                subTitle="Här dyker AI-genererade inlägg upp som du kan granska, redigera och publicera."
            >
                {pendingSuggestions.length > 0 ? (
                    <div className="space-y-4">
                        {pendingSuggestions.map(sugg => (
                            <SuggestionCard
                                key={sugg.id}
                                suggestion={sugg}
                                organization={organization}
                                displayScreens={displayScreens}
                                onApprove={handleApprove}
                                onReject={handleReject}
                                onEdit={handleEditSuggestion}
                            />
                        ))}
                    </div>
                ) : (
                     <SkylieEmptyState 
                        title="Inkorgen är tom"
                        message="När en av dina automationer körs kommer nya förslag att dyka upp här för dig att granska."
                    />
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
            <ConfirmDialog
                isOpen={!!automationToDelete}
                onClose={() => setAutomationToDelete(null)}
                onConfirm={confirmDelete}
                title="Ta bort automation"
            >
                <p>Är du säker på att du vill ta bort automationen "{automationToDelete?.name}"?</p>
            </ConfirmDialog>
        </div>
    );
};

const SuggestionCard: React.FC<{
    suggestion: SuggestedPost;
    organization: Organization;
    displayScreens: DisplayScreen[];
    onApprove: (s: SuggestedPost) => void;
    onReject: (s: SuggestedPost) => void;
    onEdit: (s: SuggestedPost) => void;
}> = ({ suggestion, organization, displayScreens, onApprove, onReject, onEdit }) => {
    const targetScreen = useMemo(() => displayScreens.find(s => s.id === suggestion.targetScreenId), [displayScreens, suggestion.targetScreenId]);
    const automationName = useMemo(() => organization.aiAutomations?.find(a => a.id === suggestion.automationId)?.name, [organization.aiAutomations, suggestion.automationId]);

    if (!targetScreen) {
        return (
            <div className="p-4 bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-lg text-red-800 dark:text-red-200">
                Kunde inte visa förslag: Målkanalen med ID "{suggestion.targetScreenId}" finns inte längre.
            </div>
        );
    }
    
    return (
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 animate-slide-in-item">
            <div className="flex flex-col md:flex-row gap-4">
                <div className="w-full md:w-48 flex-shrink-0">
                    <div className={`${getAspectRatioClass(targetScreen.aspectRatio)} w-full bg-black rounded-md overflow-hidden shadow-md border border-slate-300 dark:border-slate-600`}>
                        <DisplayPostRenderer
                            post={suggestion.postData}
                            organization={organization}
                            aspectRatio={targetScreen.aspectRatio}
                            mode="preview"
                        />
                    </div>
                </div>
                <div className="flex-grow flex flex-col justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase text-primary tracking-wider">Förslag för "{targetScreen.name}"</p>
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white mt-1">{suggestion.postData.headline}</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{suggestion.postData.body}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                            Från automation: <span className="font-semibold">{automationName || 'Okänd'}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                        <PrimaryButton onClick={() => onApprove(suggestion)} className="bg-green-600 hover:bg-green-500"><HandThumbUpIcon className="w-5 h-5 mr-2" /> Godkänn & Publicera</PrimaryButton>
                        <SecondaryButton onClick={() => onEdit(suggestion)}><PencilIcon className="w-5 h-5 mr-2" /> Redigera</SecondaryButton>
                        <DestructiveButton onClick={() => onReject(suggestion)}>Förkasta</DestructiveButton>
                    </div>
                </div>
            </div>
        </div>
    );
};


export const SuperAdminScreen: React.FC<SuperAdminScreenProps> = (props) => {
    const { organization, theme, onUpdateOrganization, onEditDisplayScreen } = props;
    const { displayScreens } = useLocation();
    const [activeTab, setActiveTab] = useState<AdminTab>('skyltfonster');
    
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    const [isSettingsLoading, setIsSettingsLoading] = useState(true);
    
    const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
    const [screenToPreview, setScreenToPreview] = useState<DisplayScreen | null>(null);
    const [screenToShare, setScreenToShare] = useState<DisplayScreen | null>(null);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [isAiGuideModalOpen, setIsAiGuideModalOpen] = useState(false);
    
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
                    {/* // Tidigare snabbguide ersatt med permanent AI-guide-modal för bättre tillgänglighet. */}
                    <SecondaryButton onClick={() => setIsAiGuideModalOpen(true)}>
                        💡 AI-guide
                    </SecondaryButton>
                </div>
            </div>

            <div className="space-y-8">
                {activeTab === 'skyltfonster' && <SkyltfonsterContent {...props} displayScreens={displayScreens} systemSettings={systemSettings} onOpenPairingModal={() => setIsPairingModalOpen(true)} onPreviewScreen={setScreenToPreview} onShareScreen={setScreenToShare} />}
                {activeTab === 'organisation' && <OrganisationTab {...props} />}
                {activeTab === 'galleri' && <MediaGalleryManager {...props} />}
                {activeTab === 'automation' && <AiAutomationContent {...props} />}
                {activeTab === 'admin' && <AdminContent {...props} />}
            </div>
            
            <PairingModal
                isOpen={isPairingModalOpen}
                onClose={() => setIsPairingModalOpen(false)}
                organization={organization}
                systemSettings={systemSettings}
                onPairSuccess={(newScreen) => {
                    // This is now handled by the context listener, but we might keep it for optimistic updates
                }}
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
    onEditDisplayScreen: (screen: DisplayScreen) => void;
    onPreview: (screen: DisplayScreen) => void;
    onShare: (screen: DisplayScreen) => void;
    onCreateScreenTemplate: () => void;
    organization: Organization;
    onUpdateOrganization: (orgId: string, data: Partial<Organization>) => Promise<void>;
    onGetCampaignIdeas: (event: any) => void;
    isAIAssistantEnabled: boolean;
}

const ScreenManager: React.FC<ScreenManagerProps> = ({ screens, isSaving, onEditDisplayScreen, onPreview, onShare, onCreateScreenTemplate, organization, onUpdateOrganization, onGetCampaignIdeas, isAIAssistantEnabled }) => {
    const { updateDisplayScreen, deleteDisplayScreen } = useLocation();
    const { showToast } = useToast();
    const [renamingScreenId, setRenamingScreenId] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [screenToDelete, setScreenToDelete] = useState<DisplayScreen | null>(null);
    const [expandedScreenId, setExpandedScreenId] = useState<string | null>(null);
    
    const toggleExpand = (screenId: string) => {
        setExpandedScreenId(prev => prev === screenId ? null : screenId);
    };

    const handleUpdatePosts = async (screenId: string, updatedPosts: DisplayPost[]) => {
        try {
            await updateDisplayScreen(screenId, { posts: updatedPosts });
        } catch(e) {
            showToast({ message: "Kunde inte spara planering.", type: 'error' });
        }
    };

    const confirmDeleteScreen = async () => {
        if (!screenToDelete) return;
        try {
            await deleteDisplayScreen(screenToDelete.id);
            showToast({message: 'Kanalen togs bort.', type: 'success'});
        } catch (e) {
            showToast({message: 'Kunde inte ta bort kanalen.', type: 'error'});
        } finally {
            setScreenToDelete(null);
        }
    };

    const handleSaveName = async (screenId: string) => {
        if (newName.trim() === '') return;
        try {
            await updateDisplayScreen(screenId, { name: newName.trim() });
            showToast({message: 'Namnet uppdaterades.', type: 'success'});
        } catch (e) {
            showToast({message: 'Kunde inte uppdatera namnet.', type: 'error'});
        } finally {
            setRenamingScreenId(null);
        }
    };

    return (
        <>
            <div className="space-y-3">
                {(screens || []).length > 0 ? (
                    screens.map(screen => {
                        const isExpanded = expandedScreenId === screen.id;
                        return (
                        <div key={screen.id} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 transition-all duration-300">
                           {renamingScreenId === screen.id ? (
                                <div className="p-4 w-full flex-grow flex items-center gap-2">
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
                                <div className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4 cursor-pointer" onClick={() => toggleExpand(screen.id)}>
                                    <div className="flex-grow flex items-center gap-3 text-center sm:text-left justify-center sm:justify-start">
                                        <ChevronDownIcon className={`h-6 w-6 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                        <p className="font-semibold text-lg text-slate-900 dark:text-white">{screen.name}</p>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setRenamingScreenId(screen.id); setNewName(screen.name); }}
                                            disabled={isSaving}
                                            className="text-slate-400 hover:text-primary dark:hover:text-primary transition-colors p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600"
                                            aria-label={`Byt namn på ${screen.name}`}
                                        >
                                            <PencilIcon className="h-5 w-5" />
                                        </button>
                                    </div>
                                    <div onClick={e => e.stopPropagation()} className="flex items-center flex-wrap justify-center sm:justify-end gap-2">
                                        <div className="flex-shrink-0 mr-2">
                                            <ScreenStats screen={screen} />
                                        </div>
                                        <PrimaryButton onClick={() => onEditDisplayScreen(screen)} disabled={isSaving} className="bg-blue-600 hover:bg-blue-500">Hantera inlägg</PrimaryButton>
                                        <button onClick={() => onPreview(screen)} disabled={isSaving} title="Förhandsgranska" className="p-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition-colors"><MagnifyingGlassIcon className="h-5 w-5"/></button>
                                        <button onClick={() => setScreenToDelete(screen)} disabled={isSaving} title="Ta bort" className="p-3 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"><TrashIcon className="h-5 w-5"/></button>
                                    </div>
                                </div>
                            )}

                            {isExpanded && (
                                <div className="border-t border-slate-200 dark:border-slate-700 p-0 sm:p-4 bg-slate-100 dark:bg-slate-900/50 animate-fade-in">
                                    <PlanningView 
                                        screen={screen}
                                        posts={screen.posts || []}
                                        organization={organization}
                                        onUpdateOrganization={onUpdateOrganization}
                                        onGetCampaignIdeas={onGetCampaignIdeas}
                                        isAIAssistantEnabled={isAIAssistantEnabled}
                                        onUpdatePosts={(updatedPosts) => handleUpdatePosts(screen.id, updatedPosts)}
                                    />
                                </div>
                            )}
                        </div>
                    )})
                ) : (
                   <SkylieEmptyState
                        title="Dags att skapa en kanal!"
                        message={<>En 'kanal' är som en spellista för ditt innehåll. Du kan ha olika kanaler för olika skärmar. Ska vi hjälpa dig skapa din första? 💡</>}
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
    displayScreens: DisplayScreen[];
    systemSettings: SystemSettings | null;
    onOpenPairingModal: () => void;
    onPreviewScreen: (screen: DisplayScreen) => void;
    onShareScreen: (screen: DisplayScreen) => void;
}

const SkyltfonsterContent: React.FC<SkyltfonsterContentProps> = (props) => {
    const { organization, displayScreens, onUpdateOrganization, onEditDisplayScreen, onOpenPairingModal, onPreviewScreen, onShareScreen, systemSettings } = props;
    const { addDisplayScreen } = useLocation();
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();
    const [ideaModalEvent, setIdeaModalEvent] = useState<{ name: string; date: Date } | null>(null);
    const [isRhythmIdeaModalOpen, setIsRhythmIdeaModalOpen] = useState(false);
    const [rhythmContext, setRhythmContext] = useState('');
    const [isSeasonalIdeaModalOpen, setIsSeasonalIdeaModalOpen] = useState(false);
    const [seasonalContext, setSeasonalContext] = useState('');
    
    const physicalScreens = organization.physicalScreens || [];


    const handleGenerateIdeasClick = (event: { name: string; date: Date; icon: string; }) => {
        setIdeaModalEvent(event);
    };
    
    const handleCreateScreenTemplate = async () => {
        setIsSaving(true);
        try {
            const newScreen: Omit<DisplayScreen, 'id'> = {
                name: 'Ny Kanal',
                isEnabled: true,
                posts: [],
                aspectRatio: '16:9',
            };
            await addDisplayScreen(newScreen);
            showToast({ message: "Ny kanal skapad.", type: 'success' });
        } catch(e) {
             console.error(e);
             showToast({ message: `Ett fel uppstod: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-8">
            <ProactiveUpcomingEventBanner
                organization={organization}
                onGenerateIdeas={handleGenerateIdeasClick}
            />

            <ProactiveSeasonalBanner
                organization={organization}
                onGenerateIdeas={(context) => {
                    setSeasonalContext(context);
                    setIsSeasonalIdeaModalOpen(true);
                }}
            />
            
            <ProactiveRhythmBanner
                organization={organization}
                onGenerateIdeas={(context) => {
                    setRhythmContext(context);
                    setIsRhythmIdeaModalOpen(true);
                }}
            />

            <div>
                <Card 
                    title="Dina kanaler" 
                    subTitle="Skapa och hantera kanaler som sedan kan visas på dina skyltfönster." 
                    saving={isSaving}
                    actions={
                        <SecondaryButton onClick={handleCreateScreenTemplate} disabled={isSaving}>
                            Skapa ny kanal
                        </SecondaryButton>
                    }
                >
                    <ScreenManager
                        screens={displayScreens}
                        isSaving={isSaving}
                        onEditDisplayScreen={onEditDisplayScreen}
                        onPreview={onPreviewScreen}
                        onShare={onShareScreen}
                        onCreateScreenTemplate={handleCreateScreenTemplate}
                        organization={organization}
                        onUpdateOrganization={onUpdateOrganization}
                        onGetCampaignIdeas={handleGenerateIdeasClick}
                        isAIAssistantEnabled={true}
                    />
                </Card>

                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <Card 
                        title="Anslutna skyltfönster" 
                        subTitle={`Här ser du vilka skärmar som är kopplade till dina kanaler. Du har ${physicalScreens.length} anslutna skyltfönster.`} 
                        saving={isSaving}
                        actions={
                            <PrimaryButton onClick={onOpenPairingModal} className="bg-teal-600 hover:bg-teal-500">
                                Anslut nytt skyltfönster
                            </PrimaryButton>
                        }
                    >
                        <PhysicalScreenManager 
                            organization={organization}
                            allDisplayScreens={displayScreens}
                            onUpdateOrganization={onUpdateOrganization}
                        />
                    </Card>
                </div>
            </div>

            <CampaignIdeaGeneratorForOrg
                isOpen={!!ideaModalEvent}
                onClose={() => setIdeaModalEvent(null)}
                event={ideaModalEvent}
                organization={organization}
                onUpdateOrganization={onUpdateOrganization}
                onEditDisplayScreen={onEditDisplayScreen}
            />
            <CampaignIdeaGeneratorForOrg
                isOpen={isRhythmIdeaModalOpen}
                onClose={() => setIsRhythmIdeaModalOpen(false)}
                event={{ name: `Inläggsförslag`, date: new Date() }}
                organization={organization}
                onUpdateOrganization={onUpdateOrganization}
                onEditDisplayScreen={onEditDisplayScreen}
                planningContext={rhythmContext}
            />
            <CampaignIdeaGeneratorForOrg
                isOpen={isSeasonalIdeaModalOpen}
                onClose={() => setIsSeasonalIdeaModalOpen(false)}
                event={{ name: `Idéer baserat på förra året`, date: new Date() }}
                organization={organization}
                onUpdateOrganization={onUpdateOrganization}
                onEditDisplayScreen={onEditDisplayScreen}
                planningContext={seasonalContext}
            />
        </div>
    );
};


// --- NEW Component to manage the list of physical screens
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
        try {
            await unpairPhysicalScreen(organization.id, screenToDisconnect.id);
            // The UI will update automatically via the onSnapshot listener in StudioContext for online mode.
            // For offline mode, we need to trigger a state update manually.
            if (isOffline) {
                const updatedScreens = (organization.physicalScreens || []).filter(s => s.id !== screenToDisconnect.id);
                // This prop chain eventually updates the context state, forcing a re-render.
                await onUpdateOrganization(organization.id, { physicalScreens: updatedScreens });
            }
            showToast({ message: "Skyltfönstret har kopplats från.", type: 'success' });
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "Ett okänt fel inträffade.";
            showToast({ message: `Kunde inte koppla från: ${errorMessage}`, type: 'error' });
            if ((window as any).DEBUG_MODE) {
                console.error("Full unpair error object:", e);
            }
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
                    <SkylieEmptyState
                        title="Dags att ansluta en skärm!"
                        message={<>Nu när du har en kanal är det dags att koppla den till en fysisk TV eller skärm. Använd knappen 'Anslut nytt skyltfönster' för att komma igång! 💡</>}
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

const AdminContent: React.FC<SuperAdminScreenProps> = ({ organization, adminRole, onUpdateOrganization }) => {
    const [name, setName] = useState(organization.name);
    const [brandName, setBrandName] = useState(organization.brandName || '');
    const [address, setAddress] = useState(organization.address || '');
    const [email, setEmail] = useState(organization.email || '');
    const [phone, setPhone] = useState(organization.phone || '');
    const [contactPerson, setContactPerson] = useState(organization.contactPerson || '');
    const [orgNumber, setOrgNumber] = useState(organization.orgNumber || '');
    const [isSavingOrgDetails, setIsSavingOrgDetails] = useState(false);
    const [isTestingFunction, setIsTestingFunction] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        setName(organization.name);
        setBrandName(organization.brandName || '');
        setAddress(organization.address || '');
        setEmail(organization.email || '');
        setPhone(organization.phone || '');
        setContactPerson(organization.contactPerson || '');
        setOrgNumber(organization.orgNumber || '');
    }, [organization]);
    
    const handleSaveGrunduppgifter = async () => {
        setIsSavingOrgDetails(true);
        try {
            await onUpdateOrganization(organization.id, { 
                name: name.trim(),
                brandName: brandName.trim(),
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
        brandName.trim() !== (organization.brandName || '') ||
        address.trim() !== (organization.address || '') ||
        email.trim() !== (organization.email || '') ||
        phone.trim() !== (organization.phone || '') ||
        contactPerson.trim() !== (organization.contactPerson || '') ||
        orgNumber.trim() !== (organization.orgNumber || '');

    const handleTestCloudFunction = async () => {
        setIsTestingFunction(true);
        try {
            const result = await callTestFunction();
            console.log("Svar från Cloud Function:", result);
            showToast({
                message: result.message || "Okänt svar från funktionen.",
                type: 'success',
                duration: 8000
            });
        } catch (error) {
            console.error(error);
            showToast({
                message: `Fel vid anrop: ${error instanceof Error ? error.message : 'Okänt fel'}`,
                type: 'error',
                duration: 8000
            });
        } finally {
            setIsTestingFunction(false);
        }
    };

    return (
        <div className="space-y-8">
            <Card title="Grunduppgifter" saving={isSavingOrgDetails}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Organisationsnamn (juridiskt)</label>
                        <StyledInput type="text" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Varumärkesnamn (för kommunikation)</label>
                        <StyledInput type="text" value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="T.ex. Flexibel Hälsostudio"/>
                    </div>
                     <div className="md:col-span-2">
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

            <Card title="Användare">
                <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                    <h4 className="font-semibold text-lg text-slate-900 dark:text-white">Kontakta oss för att lägga till nya användare</h4>
                    <p className="mt-2 text-slate-600 dark:text-slate-300">
                        För att lägga till en ny administratör eller innehållsskapare, vänligen skicka ett mail till <a href="mailto:info@flexibelfriskvardhalsa.se" className="text-primary font-semibold hover:underline">info@flexibelfriskvardhalsa.se</a> med personens e-postadress och önskad roll.
                    </p>
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                        <h5 className="font-semibold text-slate-800 dark:text-slate-200">Roller:</h5>
                        <ul className="mt-2 space-y-2 list-disc list-inside text-slate-600 dark:text-slate-300">
                            <li>
                                <strong className="font-semibold text-slate-800 dark:text-slate-200">Organisationsadmin:</strong> Har fullständig tillgång att hantera allt för er organisation, inklusive skyltfönster, varumärke, innehåll och andra användare.
                            </li>
                            <li>
                                <strong className="font-semibold text-slate-800 dark:text-slate-200">Innehållsskapare:</strong> Har begränsad tillgång till att endast skapa och hantera innehåll (skyltfönster och inlägg). Kan inte ändra varumärkesinställningar eller hantera användare.
                            </li>
                        </ul>
                    </div>
                </div>
            </Card>

            {adminRole === 'superadmin' && (
                 <Card title="Utvecklarverktyg">
                    <div className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <h4 className="font-semibold text-lg mb-2">Testa Cloud Function</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Denna knapp anropar en testfunktion (`testFunction`) i Firebase för att verifiera att kopplingen mellan frontend och backend fungerar. Svaret visas som en notis.
                        </p>
                        <PrimaryButton
                            onClick={handleTestCloudFunction}
                            loading={isTestingFunction}
                            disabled={isTestingFunction}
                        >
                            Kör testfunktion
                        </PrimaryButton>
                    </div>
                </Card>
            )}
        </div>
    );
};