
import React, { useState, useEffect } from 'react';
import { Organization, UserRole, SystemSettings } from '../../types';
import { callTestFunction, getAiUsage, getSystemSettings } from '../../services/firebaseService';
import { Card } from '../Card';
import { StyledInput } from '../Forms';
import { PrimaryButton } from '../Buttons';
import { useToast } from '../../context/ToastContext';

interface AdminTabProps {
    organization: Organization;
    adminRole: 'superadmin' | 'admin';
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
}

export const AdminTab: React.FC<AdminTabProps> = ({ organization, adminRole, onUpdateOrganization }) => {
    const [name, setName] = useState(organization.name);
    const [brandName, setBrandName] = useState(organization.brandName || '');
    const [address, setAddress] = useState(organization.address || '');
    const [email, setEmail] = useState(organization.email || '');
    const [phone, setPhone] = useState(organization.phone || '');
    const [contactPerson, setContactPerson] = useState(organization.contactPerson || '');
    const [orgNumber, setOrgNumber] = useState(organization.orgNumber || '');
    const [isSavingOrgDetails, setIsSavingOrgDetails] = useState(false);
    const [isTestingFunction, setIsTestingFunction] = useState(false);
    const [usage, setUsage] = useState<{ totalCredits: number; counts: Record<string, number> } | null>(null);
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    const { showToast } = useToast();

    useEffect(() => {
        let isMounted = true;
        getSystemSettings().then(res => {
            if (isMounted) setSystemSettings(res);
        });
        return () => { isMounted = false; };
    }, []);

    useEffect(() => {
        let isMounted = true;
        if (organization?.id) {
            getAiUsage(organization.id).then(res => {
                if (isMounted) setUsage(res);
            });
        }
        return () => { isMounted = false; };
    }, [organization?.id]);

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

    const renderSubscriptionCard = () => {
        if (!systemSettings || systemSettings.basePriceIncludingFirstScreen === undefined) {
            return null;
        }

        const basePrice = systemSettings.basePriceIncludingFirstScreen;
        const pricePerScreenAdditional = systemSettings.pricePerScreenAdditional ?? 0;
        const connectedScreensCount = (organization.physicalScreens || []).length;
        const extraScreensCount = Math.max(0, connectedScreensCount - 1);
        const extraPriceTotal = extraScreensCount * pricePerScreenAdditional;
        const subtotal = basePrice + extraPriceTotal;

        const discountPercent = organization.discountScreen || 0;
        const discountAmount = discountPercent > 0 ? Math.round(subtotal * (discountPercent / 100)) : 0;
        const totalPrice = subtotal - discountAmount;

        return (
            <Card title="Ditt abonnemang">
                <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                    <div className="flex justify-between items-center">
                        <span>Grundpaket (inkl. 1 skyltfönster)</span>
                        <span className="font-semibold">{basePrice.toLocaleString('sv-SE')} kr/mån</span>
                    </div>

                    {extraScreensCount > 0 && (
                        <div className="flex justify-between items-center">
                            <span>{extraScreensCount} extra skyltfönster à {pricePerScreenAdditional.toLocaleString('sv-SE')} kr</span>
                            <span className="font-semibold">{extraPriceTotal.toLocaleString('sv-SE')} kr/mån</span>
                        </div>
                    )}

                    {discountPercent > 0 && (
                        <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-medium">
                            <span>Rabatt</span>
                            <span>−{discountAmount.toLocaleString('sv-SE')} kr/mån</span>
                        </div>
                    )}

                    <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex justify-between items-center text-base font-bold text-slate-900 dark:text-white">
                        <span>Totalt</span>
                        <span>{totalPrice.toLocaleString('sv-SE')} kr/mån</span>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 pt-2">
                        Priserna gäller från nästa hela månad vid ändringar. Vill du ansluta fler skyltfönster? Kontakta oss.
                    </p>
                </div>
            </Card>
        );
    };

    return (
        <div className="space-y-8">
            {renderSubscriptionCard()}
            {usage && (() => {
                const limit = organization.aiMonthlyCreditLimit ?? 4000;
                const used = usage.totalCredits;
                const pct = Math.min(100, Math.round((used / limit) * 100));

                const grouped = Object.entries(usage.counts).reduce((acc, [action, n]) => {
                    const key = /image/i.test(action) ? 'Bilder' : 'Text & idéer';
                    acc[key] = (acc[key] || 0) + (n as number);
                    return acc;
                }, {} as Record<string, number>);

                const monthName = new Date().toLocaleDateString('sv-SE', { month: 'long' });
                const formattedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                const barColor = pct > 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-teal-500';

                const groupSummary = ['Bilder', 'Text & idéer']
                    .map(key => `${key}: ${grouped[key] || 0} st`)
                    .join(' · ');

                return (
                    <Card title={`AI-användning · ${formattedMonth}`}>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-center text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">
                                    <span>{used} av {limit} krediter</span>
                                    <span>{pct}%</span>
                                </div>
                                <div className="w-full bg-slate-200 dark:bg-slate-700 h-3 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full transition-all duration-500 ${barColor}`} 
                                        style={{ width: `${pct}%` }} 
                                    />
                                </div>
                            </div>

                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                {groupSummary}
                            </p>

                            {pct >= 90 && (
                                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                                    Nära månadens tak — bildgenerering pausas vid {limit} krediter. Kontakta oss för utökad kvot.
                                </div>
                            )}
                        </div>
                    </Card>
                );
            })()}

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
