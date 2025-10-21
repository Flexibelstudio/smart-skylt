import React, { useState, useEffect, useMemo } from 'react';
import { Organization, SystemSettings, AppNotification } from '../types';
import { getSystemSettings, updateSystemSettings, createSystemAnnouncement, listenToSystemAnnouncements, updateSystemAnnouncement, deleteSystemAnnouncement } from '../services/firebaseService';
import { MonitorIcon, PencilIcon, TrashIcon } from './icons';
import { PrimaryButton, SecondaryButton, DestructiveButton } from './Buttons';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from '../context/ToastContext';
import { parseToDate } from '../utils/dateUtils';

// --- ROBUST DATE PARSING UTILITY ---
// This utility handles multiple date formats that can come from Firestore.
type FirestoreTimestamp = { seconds: number; nanoseconds?: number; toDate?: () => Date };
// --- END UTILITY ---

const AnnouncementEditorModal: React.FC<{
    announcement: AppNotification;
    onClose: () => void;
    onSave: (data: { title: string; message: string }) => Promise<void>;
    isSaving: boolean;
}> = ({ announcement, onClose, onSave, isSaving }) => {
    const [title, setTitle] = useState(announcement.title);
    const [message, setMessage] = useState(announcement.message);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSave({ title, message });
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSave}>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Redigera meddelande</h3>
                    <div className="space-y-4">
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Titel på meddelandet"
                            className="w-full bg-slate-100 dark:bg-black text-black dark:text-white p-3 rounded-md border border-slate-300 dark:border-gray-600 focus:ring-2 focus:ring-primary focus:outline-none transition"
                            disabled={isSaving}
                        />
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Ditt meddelande här..."
                            rows={4}
                            className="w-full bg-slate-100 dark:bg-black text-black dark:text-white p-3 rounded-md border border-slate-300 dark:border-gray-600 focus:ring-2 focus:ring-primary focus:outline-none transition"
                            disabled={isSaving}
                        />
                    </div>
                    <div className="flex justify-end gap-4 mt-6">
                        <SecondaryButton type="button" onClick={onClose} disabled={isSaving}>Avbryt</SecondaryButton>
                        <PrimaryButton
                            type="submit"
                            disabled={!title.trim() || !message.trim()}
                            loading={isSaving}
                        >
                            Spara ändringar
                        </PrimaryButton>
                    </div>
                </form>
            </div>
        </div>
    );
};


const InvoiceLineItem: React.FC<{
    icon: React.ReactNode;
    label: string;
    price: number;
}> = ({ icon, label, price }) => {
    return (
        <div className="flex justify-between items-center text-sm py-2 border-b border-slate-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
                {icon}
                <span className="font-semibold text-gray-800 dark:text-gray-200">{label}</span>
            </div>
            <div className="flex items-center gap-6">
                <span className="font-bold text-gray-900 dark:text-white w-24 text-right">{price.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr</span>
            </div>
        </div>
    );
};

const PercentageIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l10-10m-10 0a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0zm10 10a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
    </svg>
)

const DiscountInput: React.FC<{ label: string, value: number, onChange: (value: number) => void, disabled?: boolean }> = ({ label, value, onChange, disabled }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
        <div className="relative">
            <input 
                type="number" 
                value={value} 
                onChange={(e) => onChange(Number(e.target.value))} 
                className="w-full bg-white dark:bg-gray-700 p-2 rounded-md border border-slate-300 dark:border-gray-600 pr-8"
                min="0"
                max="100"
                disabled={disabled}
            />
            <span className="absolute inset-y-0 right-3 flex items-center text-gray-500 dark:text-gray-400 pointer-events-none">%</span>
        </div>
    </div>
);


const OrganizationCard: React.FC<{
    org: Organization;
    settings: SystemSettings | null;
    onSelect: () => void;
    onDelete: () => void;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
}> = ({ org, settings, onSelect, onDelete, onUpdateOrganization }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [discountScreen, setDiscountScreen] = useState(org.discountScreen || 0);
    const { showToast } = useToast();

    useEffect(() => {
        setDiscountScreen(org.discountScreen || 0);
    }, [org]);
    
    const { grandTotal, periodText, invoiceItems } = useMemo(() => {
        if (!settings) return { grandTotal: 0, invoiceItems: [] };

        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const basePrice = settings.basePriceIncludingFirstScreen ?? 0;
        const priceAdditional = settings.pricePerScreenAdditional ?? 0;
        const discount = org.discountScreen || 0;

        let totalForNextInvoice = 0;
        const periodTexts = new Set<string>();
        const items: { label: string, price: number }[] = [];
        
        const calculateInitialCost = (activationDate: Date, monthlyPrice: number) => {
            const year = activationDate.getFullYear();
            const month = activationDate.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const remainingDays = daysInMonth - activationDate.getDate() + 1;
            const partialMonthCost = (remainingDays / daysInMonth) * monthlyPrice;
            const totalInitialCost = partialMonthCost + monthlyPrice;
            const nextMonthDate = new Date(year, month + 1, 1);
            const periodEnd = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1, 0);
            const nextMonthDays = new Date(year, month + 2, 0).getDate();
            const daysToBill = remainingDays + nextMonthDays;
            const periodStartStr = activationDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
            const periodEndStr = periodEnd.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
            return { cost: totalInitialCost, text: `${periodStartStr} – ${periodEndStr} (${daysToBill} dagar)` };
        };

        const physicalScreens = org.physicalScreens || [];
        if (physicalScreens.length === 0) return { grandTotal: 0, invoiceItems: [] };

        const sortedScreens = [...physicalScreens].sort((a, b) => {
            const dateA = parseToDate(a.pairedAt)?.getTime() ?? 0;
            const dateB = parseToDate(b.pairedAt)?.getTime() ?? 0;
            return dateA - dateB;
        });
        
        const firstScreen = sortedScreens[0];
        const firstScreenPairedAt = parseToDate(firstScreen.pairedAt);
        
        if (firstScreenPairedAt && firstScreenPairedAt >= currentMonthStart) {
            const { cost, text } = calculateInitialCost(firstScreenPairedAt, basePrice);
            totalForNextInvoice += cost;
            periodTexts.add(text);
            items.push({ label: `Grundpris (start ${firstScreenPairedAt.toLocaleDateString('sv-SE')})`, price: cost });
        } else {
            totalForNextInvoice += basePrice;
            items.push({ label: 'Grundpris (inkl. 1 skyltfönster)', price: basePrice });
        }

        const additionalScreens = sortedScreens.slice(1);
        let recurringAdditionalCount = 0;
        additionalScreens.forEach(screen => {
            const pairedAt = parseToDate(screen.pairedAt);
            if (pairedAt && pairedAt >= currentMonthStart) {
                const { cost, text } = calculateInitialCost(pairedAt, priceAdditional);
                totalForNextInvoice += cost;
                periodTexts.add(text);
                items.push({ label: `Extra skärm (start ${pairedAt.toLocaleDateString('sv-SE')})`, price: cost });
            } else {
                recurringAdditionalCount++;
            }
        });
        
        if (recurringAdditionalCount > 0) {
            const recurringCost = recurringAdditionalCount * priceAdditional;
            totalForNextInvoice += recurringCost;
            items.push({ label: `Ytterligare skyltfönster (${recurringAdditionalCount} st, löpande)`, price: recurringCost });
        }
        
        const totalBeforeDiscount = totalForNextInvoice;
        const discountAmount = totalBeforeDiscount * (discount / 100);
        const finalTotal = totalBeforeDiscount - discountAmount;

        return { grandTotal: finalTotal, periodText: Array.from(periodTexts).join('; '), invoiceItems: items };
    }, [org, settings]);

    const handleSaveDiscounts = async () => {
        setIsSaving(true);
        try {
            await onUpdateOrganization(org.id, {
                discountScreen: Number(discountScreen),
            });
            showToast({ message: "Rabatter sparade.", type: 'success' });
        } catch (error) {
            console.error(error);
            showToast({ message: "Kunde inte spara rabatter.", type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const discountsDirty = Number(discountScreen) !== (org.discountScreen || 0);

    return (
        <div className="bg-white dark:bg-gray-900/50 rounded-lg border border-slate-200 dark:border-gray-700 overflow-hidden shadow-sm transition-all duration-300">
            <div className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex-grow">
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{org.name}</p>
                     <div className="mt-2">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Att fakturera nästa period:</p>
                        <p className="text-3xl font-extrabold text-primary">{Math.round(grandTotal).toLocaleString('sv-SE')} kr</p>
                        {periodText && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{periodText}</p>}
                    </div>
                </div>
                <div className="flex gap-2 flex-shrink-0 self-end sm:self-center">
                     <SecondaryButton onClick={() => setIsExpanded(!isExpanded)}>
                        {isExpanded ? 'Dölj underlag' : 'Faktureringsunderlag'}
                    </SecondaryButton>
                    <PrimaryButton onClick={onSelect} className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                        Hantera
                    </PrimaryButton>
                    <DestructiveButton onClick={onDelete}>
                        Ta bort
                    </DestructiveButton>
                </div>
            </div>

            {isExpanded && (
                <div className="bg-slate-50 dark:bg-gray-800/50 p-4 border-t border-slate-200 dark:border-gray-700 space-y-2 animate-fade-in">
                    {invoiceItems.map((item, index) => (
                        <InvoiceLineItem
                            key={index}
                            icon={<MonitorIcon className="h-5 w-5 text-blue-500" />}
                            label={item.label}
                            price={item.price}
                        />
                    ))}
                    {(org.discountScreen || 0) > 0 && (
                        <div className="flex justify-between items-center text-sm py-2 border-b border-slate-200 dark:border-gray-700">
                            <div className="flex items-center gap-3">
                                <PercentageIcon className="h-5 w-5 text-red-500" />
                                <span className="font-semibold text-red-500">Organisationsrabatt ({org.discountScreen}%)</span>
                            </div>
                            <div className="flex items-center gap-6">
                                <span className="font-bold text-red-500 w-24 text-right">
                                    -{(grandTotal / (1 - (org.discountScreen || 0) / 100) * ((org.discountScreen || 0) / 100)).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr
                                </span>
                            </div>
                        </div>
                    )}
                     <div className="flex justify-end pt-2">
                        <div className="flex items-baseline gap-4">
                            <span className="font-bold text-gray-600 dark:text-gray-300">Totalsumma (exkl. moms):</span>
                            <span className="font-extrabold text-lg text-gray-900 dark:text-white">{Math.round(grandTotal).toLocaleString('sv-SE')} kr</span>
                        </div>
                     </div>
                     <div className="bg-slate-100 dark:bg-gray-800 p-4 rounded-lg mt-4 space-y-4 border border-slate-200 dark:border-slate-700">
                        <h4 className="font-bold text-gray-800 dark:text-gray-200">Ange rabatter</h4>
                        <div className="w-full sm:w-1/2 lg:w-1/4">
                            <DiscountInput label="Skyltfönster" value={discountScreen} onChange={setDiscountScreen} disabled={isSaving} />
                        </div>
                        <div className="flex justify-end">
                            <PrimaryButton onClick={handleSaveDiscounts} disabled={!discountsDirty || isSaving} loading={isSaving}>
                                Spara rabatter
                            </PrimaryButton>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

interface EditableSettingsGroupProps {
    title: string;
    infoText: string;
    onSave: (newInfoText: string) => Promise<void>;
    isEditing: boolean;
    onEdit: () => void;
    onCancel: () => void;
    isSaving: boolean;
}

const EditableSettingsGroup: React.FC<EditableSettingsGroupProps> = ({ title, infoText, onSave, isEditing, onEdit, onCancel, isSaving }) => {
    const [currentInfoText, setCurrentInfoText] = useState(infoText);

    useEffect(() => {
        setCurrentInfoText(infoText);
    }, [infoText]);

    const handleSave = async () => {
        await onSave(currentInfoText);
    };
    
    const textSummary = (text: string) => {
        if (!text) return "Ingen text angiven.";
        const firstLine = text.split('\n')[0];
        return firstLine.length > 80 ? firstLine.substring(0, 80) + '...' : firstLine;
    }

    if (isEditing) {
        return (
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-gray-800/50 border-2 border-primary space-y-4 animate-fade-in">
                <h4 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h4>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Informationstext (Markdown stöds)</label>
                    <textarea
                        rows={6}
                        value={currentInfoText ?? ''}
                        onChange={e => setCurrentInfoText(e.target.value)}
                        className="w-full bg-white dark:bg-black text-black dark:text-white p-3 rounded-md border border-slate-300 dark:border-gray-600 font-mono text-sm"
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <SecondaryButton onClick={onCancel} disabled={isSaving}>Avbryt</SecondaryButton>
                    <PrimaryButton onClick={handleSave} loading={isSaving}>Spara ändringar</PrimaryButton>
                </div>
            </div>
        );
    }
    
    return (
         <div className="p-4 rounded-xl bg-slate-100 dark:bg-gray-800/50 flex justify-between items-start border border-slate-200 dark:border-slate-700">
            <div className="flex-grow pr-4">
                <h4 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h4>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 italic">
                     "{textSummary(infoText)}"
                </p>
            </div>
            <button onClick={onEdit} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-gray-700 text-slate-500 hover:text-primary transition-colors flex-shrink-0">
                <PencilIcon className="h-5 w-5" />
            </button>
        </div>
    );
};

const ScreenPriceSettingsEditor: React.FC<{
    settings: SystemSettings | null;
    isSaving: boolean;
    onSave: (prices: { base: number, additional: number }) => Promise<void>;
}> = ({ settings, isSaving, onSave }) => {
    const [basePrice, setBasePrice] = useState(settings?.basePriceIncludingFirstScreen ?? 0);
    const [priceAdditional, setPriceAdditional] = useState(settings?.pricePerScreenAdditional ?? 0);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        setBasePrice(settings?.basePriceIncludingFirstScreen ?? 0);
        setPriceAdditional(settings?.pricePerScreenAdditional ?? 0);
    }, [settings]);

    const handleSave = async () => {
        await onSave({ base: basePrice, additional: priceAdditional });
        setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-gray-800/50 border-2 border-primary space-y-4 animate-fade-in">
                <h4 className="text-xl font-bold text-slate-900 dark:text-white">Prissättning Skyltfönster</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grundpris (inkl. 1 skärm) (kr/mån)</label>
                        <input type="number" value={basePrice ?? ''} onChange={e => setBasePrice(Number(e.target.value))} className="w-full bg-white dark:bg-black text-black dark:text-white p-3 rounded-md border border-slate-300 dark:border-gray-600" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pris Ytterligare (kr/mån)</label>
                        <input type="number" value={priceAdditional ?? ''} onChange={e => setPriceAdditional(Number(e.target.value))} className="w-full bg-white dark:bg-black text-black dark:text-white p-3 rounded-md border border-slate-300 dark:border-gray-600" />
                    </div>
                </div>
                 <p className="text-xs text-slate-500 dark:text-slate-400">Denna prissättning visas för kunden när de ansluter ett nytt skyltfönster.</p>
                <div className="flex justify-end gap-2">
                    <SecondaryButton onClick={() => setIsEditing(false)} disabled={isSaving}>Avbryt</SecondaryButton>
                    <PrimaryButton onClick={handleSave} loading={isSaving}>Spara priser</PrimaryButton>
                </div>
            </div>
        );
    }
    
    return (
         <div className="p-4 rounded-xl bg-slate-100 dark:bg-gray-800/50 flex justify-between items-start border border-slate-200 dark:border-slate-700">
            <div className="flex-grow pr-4">
                <h4 className="text-xl font-bold text-slate-900 dark:text-white">Prissättning Skyltfönster</h4>
                <div className="flex gap-6 mt-1">
                    <p className="text-lg font-semibold text-slate-600 dark:text-slate-300">Grundpris: <span className="text-slate-800 dark:text-slate-100">{settings?.basePriceIncludingFirstScreen ?? 0} kr/mån</span></p>
                    <p className="text-lg font-semibold text-slate-600 dark:text-slate-300">Ytterligare: <span className="text-slate-800 dark:text-slate-100">{settings?.pricePerScreenAdditional ?? 0} kr/mån</span></p>
                </div>
            </div>
            <button onClick={() => setIsEditing(true)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-gray-700 text-slate-500 hover:text-primary transition-colors flex-shrink-0">
                <PencilIcon className="h-5 w-5" />
            </button>
        </div>
    );
};


interface SystemOwnerScreenProps {
    allOrganizations: Organization[];
    onSelectOrganization: (organization: Organization) => void;
    onCreateOrganization: (orgData: Pick<Organization, 'name' | 'email'>) => Promise<void>;
    onDeleteOrganization: (organizationId: string) => void;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
}

export const SystemOwnerScreen: React.FC<SystemOwnerScreenProps> = ({ allOrganizations, onSelectOrganization, onCreateOrganization, onDeleteOrganization, onUpdateOrganization }) => {
    const [newOrgName, setNewOrgName] = useState('');
    const [newOrgEmail, setNewOrgEmail] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    
    const [settings, setSettings] = useState<SystemSettings | null>(null);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);
    const { showToast } = useToast();
    
    const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null);
    
    const [announcementTitle, setAnnouncementTitle] = useState('');
    const [announcementMessage, setAnnouncementMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const [announcements, setAnnouncements] = useState<AppNotification[]>([]);
    const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
    const [editingAnnouncement, setEditingAnnouncement] = useState<AppNotification | null>(null);
    const [announcementToDelete, setAnnouncementToDelete] = useState<AppNotification | null>(null);


    useEffect(() => {
        setIsLoadingAnnouncements(true);
        const unsubscribe = listenToSystemAnnouncements(announcementsData => {
            setAnnouncements(announcementsData);
            setIsLoadingAnnouncements(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const fetchedSettings = await getSystemSettings();
                setSettings(fetchedSettings);
            } catch (error) {
                console.error("Failed to load system settings", error);
                showToast({ message: "Kunde inte ladda systeminställningar.", type: 'error'});
            } finally {
                setIsLoadingSettings(false);
            }
        };
        fetchSettings();
    }, [showToast]);

    const handleSaveSettings = async (updatedGroup: Partial<SystemSettings>) => {
        setIsSavingSettings(true);
        const newSettings = { ...settings, ...updatedGroup };
        try {
            await updateSystemSettings(newSettings); 
            setSettings(newSettings as SystemSettings);
            showToast({ message: "Inställningar sparade!", type: 'success' });
        } catch (error) {
            console.error("Failed to save system settings", error);
            showToast({ message: "Kunde inte spara inställningar.", type: 'error'});
        } finally {
            setIsSavingSettings(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newOrgName.trim() || !newOrgEmail.trim()) return;
        setIsCreating(true);
        try {
            await onCreateOrganization({
                name: newOrgName.trim(),
                email: newOrgEmail.trim(),
            });
            setNewOrgName('');
            setNewOrgEmail('');
        } catch (error) {
            console.error(error);
            // The parent component will show a toast on error
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = (org: Organization) => {
        setOrgToDelete(org);
    };
    
    const confirmDelete = () => {
        if (orgToDelete) {
            onDeleteOrganization(orgToDelete.id);
            setOrgToDelete(null);
        }
    };

    const handleSendAnnouncement = async () => {
        if (!announcementTitle.trim() || !announcementMessage.trim()) return;
        setIsSending(true);
        try {
            await createSystemAnnouncement(announcementTitle.trim(), announcementMessage.trim());
            showToast({ message: "Meddelandet har skickats.", type: 'success' });
            setAnnouncementTitle('');
            setAnnouncementMessage('');
        } catch (error) {
            showToast({ message: `Kunde inte skicka: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsSending(false);
        }
    };

    const handleUpdateAnnouncement = async (data: { title: string; message: string; }) => {
        if (!editingAnnouncement) return;
        setIsSending(true);
        try {
            await updateSystemAnnouncement(editingAnnouncement.id, data);
            showToast({ message: "Meddelandet har uppdaterats.", type: 'success' });
            setEditingAnnouncement(null);
        } catch (error) {
            showToast({ message: `Kunde inte uppdatera: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsSending(false);
        }
    };

    const confirmDeleteAnnouncement = async () => {
        if (!announcementToDelete) return;
        setIsSending(true);
        try {
            await deleteSystemAnnouncement(announcementToDelete.id);
            showToast({ message: "Meddelandet har tagits bort.", type: 'success' });
        } catch (error) {
            showToast({ message: `Kunde inte ta bort: ${error instanceof Error ? error.message : 'Okänt fel'}`, type: 'error' });
        } finally {
            setIsSending(false);
            setAnnouncementToDelete(null);
        }
    };

    return (
        <div className="w-full max-w-5xl mx-auto space-y-8 animate-fade-in pb-12">
            <p className="text-center text-slate-500 dark:text-gray-400">
                Här hanterar du alla kundorganisationer i plattformen.
            </p>

            <div className="bg-slate-100 dark:bg-gray-800 p-6 rounded-xl space-y-4 border border-slate-200 dark:border-slate-700 shadow-md">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white border-b border-slate-300 dark:border-gray-700 pb-3">Hantera Organisationer</h3>
                <div className="space-y-3">
                    {allOrganizations.map(org => (
                        <OrganizationCard 
                            key={org.id}
                            org={org}
                            settings={settings}
                            onSelect={() => onSelectOrganization(org)}
                            onDelete={() => handleDelete(org)}
                            onUpdateOrganization={onUpdateOrganization}
                        />
                    ))}
                </div>
                <form onSubmit={handleCreate} className="pt-6 border-t border-slate-300 dark:border-gray-700 space-y-3">
                    <h4 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Skapa ny organisation</h4>
                     <div className="space-y-4">
                        <input
                            type="text"
                            value={newOrgName}
                            onChange={(e) => setNewOrgName(e.target.value)}
                            placeholder="Namn på organisation *"
                            className="w-full bg-white dark:bg-black text-black dark:text-white p-3 rounded-md border border-slate-300 dark:border-gray-600 focus:ring-2 focus:ring-primary focus:outline-none transition"
                            disabled={isCreating}
                            required
                        />
                        <input
                            type="email"
                            value={newOrgEmail}
                            onChange={(e) => setNewOrgEmail(e.target.value)}
                            placeholder="E-postadress *"
                            className="w-full bg-white dark:bg-black text-black dark:text-white p-3 rounded-md border border-slate-300 dark:border-gray-600 focus:ring-2 focus:ring-primary focus:outline-none transition"
                            disabled={isCreating}
                            required
                        />
                    </div>
                    <PrimaryButton type="submit" disabled={!newOrgName.trim() || !newOrgEmail.trim()} loading={isCreating} className="w-full bg-slate-700 hover:bg-slate-600 disabled:bg-slate-500">
                        Skapa Ny Organisation
                    </PrimaryButton>
                </form>
            </div>
            
            <div className="bg-slate-100 dark:bg-gray-800 p-6 rounded-xl space-y-4 border border-slate-200 dark:border-slate-700 shadow-md">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white border-b border-slate-300 dark:border-gray-700 pb-3">Systeminställningar & Prissättning</h3>
                {isLoadingSettings ? (
                    <p className="text-gray-500 dark:text-gray-400">Laddar inställningar...</p>
                ) : (
                    <div className="space-y-4">
                        <ScreenPriceSettingsEditor
                            settings={settings}
                            isSaving={isSavingSettings}
                            onSave={({ base, additional }) => handleSaveSettings({ basePriceIncludingFirstScreen: base, pricePerScreenAdditional: additional })}
                        />
                    </div>
                )}
            </div>
            
             <div className="bg-slate-100 dark:bg-gray-800 p-6 rounded-xl space-y-4 border border-slate-200 dark:border-slate-700 shadow-md">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white border-b border-slate-300 dark:border-gray-700 pb-3">Systemmeddelande</h3>
                <p className="text-sm text-slate-500 dark:text-gray-400">
                    Skicka en notis till alla administratörer i systemet. Används för att meddela om nya funktioner, uppdateringar eller driftinformation.
                </p>
                <div className="space-y-4">
                    <input
                        type="text"
                        value={announcementTitle}
                        onChange={(e) => setAnnouncementTitle(e.target.value)}
                        placeholder="Titel på meddelandet"
                        className="w-full bg-white dark:bg-black text-black dark:text-white p-3 rounded-md border border-slate-300 dark:border-gray-600 focus:ring-2 focus:ring-primary focus:outline-none transition"
                        disabled={isSending}
                    />
                    <textarea
                        value={announcementMessage}
                        onChange={(e) => setAnnouncementMessage(e.target.value)}
                        placeholder="Ditt meddelande här..."
                        rows={4}
                        className="w-full bg-white dark:bg-black text-black dark:text-white p-3 rounded-md border border-slate-300 dark:border-gray-600 focus:ring-2 focus:ring-primary focus:outline-none transition"
                        disabled={isSending}
                    />
                </div>
                <div className="flex justify-end">
                    <PrimaryButton
                        onClick={() => setShowConfirm(true)}
                        disabled={!announcementTitle.trim() || !announcementMessage.trim()}
                        loading={isSending}
                    >
                        Skicka till alla
                    </PrimaryButton>
                </div>
                <div className="pt-6 border-t border-slate-300 dark:border-gray-700 mt-6">
                    <h4 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">Tidigare meddelanden</h4>
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                        {isLoadingAnnouncements ? (
                            <p className="text-slate-500 dark:text-slate-400 text-center py-4">Laddar meddelanden...</p>
                        ) : announcements.length > 0 ? (
                            announcements.map(announcement => (
                                <div key={announcement.id} className="bg-white dark:bg-gray-900/50 p-4 rounded-lg border border-slate-200 dark:border-gray-700">
                                    <div className="flex justify-between items-start gap-4">
                                        <div>
                                            <h4 className="font-bold text-slate-800 dark:text-slate-200">{announcement.title}</h4>
                                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                                {new Date(announcement.createdAt).toLocaleString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="flex gap-1 flex-shrink-0">
                                            <button onClick={() => setEditingAnnouncement(announcement)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-gray-700 text-slate-500 hover:text-primary transition-colors">
                                                <PencilIcon className="h-5 w-5" />
                                            </button>
                                            <button onClick={() => setAnnouncementToDelete(announcement)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-gray-700 text-slate-500 hover:text-red-500 transition-colors">
                                                <TrashIcon className="h-5 w-5" />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                                        {announcement.message}
                                    </p>
                                </div>
                            ))
                        ) : (
                            <p className="text-slate-500 dark:text-slate-400 text-center py-4">Inga tidigare meddelanden hittades.</p>
                        )}
                    </div>
                </div>
            </div>

            <ConfirmDialog
                isOpen={!!orgToDelete}
                onClose={() => setOrgToDelete(null)}
                onConfirm={confirmDelete}
                title="Ta bort organisation"
            >
                <p>Är du säker på att du vill ta bort organisationen "{orgToDelete?.name}"? Detta kommer att radera all data permanent och kan inte ångras.</p>
            </ConfirmDialog>
            
            <ConfirmDialog
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={handleSendAnnouncement}
                title="Skicka systemmeddelande?"
                variant="primary"
                confirmText="Ja, skicka nu"
            >
                <p>Är du säker på att du vill skicka detta meddelande till <strong className="text-slate-800 dark:text-slate-100">alla</strong> administratörer? Detta kan inte ångras.</p>
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={!!announcementToDelete}
                onClose={() => setAnnouncementToDelete(null)}
                onConfirm={confirmDeleteAnnouncement}
                title="Ta bort meddelande"
                confirmText="Ja, ta bort"
            >
                <p>Är du säker på att du vill ta bort detta meddelande? Detta går inte att ångra.</p>
            </ConfirmDialog>

            {editingAnnouncement && (
                <AnnouncementEditorModal
                    announcement={editingAnnouncement}
                    onClose={() => setEditingAnnouncement(null)}
                    onSave={handleUpdateAnnouncement}
                    isSaving={isSending}
                />
            )}
        </div>
    );
};