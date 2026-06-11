import React, { useState, useEffect } from 'react';
import { DisplayScreen, ScreenZoneConfig, BrandingConfig } from '../../types';
import { StyledInput, StyledSelect } from '../Forms';
import { ToggleSwitch, Cog6ToothIcon, MonitorIcon, SparklesIcon } from '../icons';
import { PrimaryButton, SecondaryButton } from '../Buttons';

interface ChannelSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    screen: DisplayScreen;
    onUpdateScreen: (screenId: string, updates: Partial<DisplayScreen>) => Promise<void> | void;
}

export const ChannelSettingsModal: React.FC<ChannelSettingsModalProps> = ({
    isOpen,
    onClose,
    screen,
    onUpdateScreen
}) => {
    const [channelName, setChannelName] = useState(screen.name);
    const [aspectRatio, setAspectRatio] = useState(screen.aspectRatio || '16:9');
    
    // Branding
    const [showLogo, setShowLogo] = useState(screen.branding?.showLogo ?? false);
    const [showName, setShowName] = useState(screen.branding?.showName ?? false);
    const [brandingPosition, setBrandingPosition] = useState(screen.branding?.position || 'bottom-right');

    // Zones
    const [layoutType, setLayoutType] = useState<string>(screen.zones?.layoutType || 'none');
    const [showClock, setShowClock] = useState(screen.zones?.showClock ?? true);
    const [showWeather, setShowWeather] = useState(screen.zones?.showWeather ?? false);
    const [sidebarTitle, setSidebarTitle] = useState(screen.zones?.sidebarTitle || '');
    const [sidebarText, setSidebarText] = useState(screen.zones?.sidebarText || '');
    const [showQrCode, setShowQrCode] = useState(screen.zones?.showQrCode ?? false);
    const [qrCodeUrl, setQrCodeUrl] = useState(screen.zones?.qrCodeUrl || '');
    const [qrCodeLabel, setQrCodeLabel] = useState(screen.zones?.qrCodeLabel || '');
    const [tickerText, setTickerText] = useState(screen.zones?.tickerText || '');

    const [isSaving, setIsSaving] = useState(false);

    // Keep state synced if screen changes
    useEffect(() => {
        setChannelName(screen.name);
        setAspectRatio(screen.aspectRatio || '16:9');
        setShowLogo(screen.branding?.showLogo ?? false);
        setShowName(screen.branding?.showName ?? false);
        setBrandingPosition(screen.branding?.position || 'bottom-right');
        setLayoutType(screen.zones?.layoutType || 'none');
        setShowClock(screen.zones?.showClock ?? true);
        setShowWeather(screen.zones?.showWeather ?? false);
        setSidebarTitle(screen.zones?.sidebarTitle || '');
        setSidebarText(screen.zones?.sidebarText || '');
        setShowQrCode(screen.zones?.showQrCode ?? false);
        setQrCodeUrl(screen.zones?.qrCodeUrl || '');
        setQrCodeLabel(screen.zones?.qrCodeLabel || '');
        setTickerText(screen.zones?.tickerText || '');
    }, [screen]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const branding: BrandingConfig = {
                showLogo,
                showName,
                position: brandingPosition as any
            };

            const zones: ScreenZoneConfig = {
                isEnabled: layoutType !== 'none',
                layoutType: layoutType as any,
                showClock,
                showWeather,
                sidebarTitle,
                sidebarText,
                showQrCode,
                qrCodeUrl,
                qrCodeLabel,
                tickerText
            };

            await onUpdateScreen(screen.id, {
                name: channelName,
                aspectRatio,
                branding,
                zones
            });
            onClose();
        } catch (error) {
            console.error("Kunde inte spara kanalinställningar:", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[110] p-4 transition-all duration-300"
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-4xl text-slate-900 dark:text-white shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/20 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh] animate-fade-in"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 md:p-8 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                            <Cog6ToothIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black tracking-tight dialog-title">Kanalinställningar</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Anpassa kanalen "{screen.name}"</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors text-slate-500 hover:text-slate-800 dark:hover:text-white"
                        aria-label="Stäng"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="p-6 md:p-8 space-y-8 overflow-y-auto flex-grow">
                    {/* Basic Info & Orientation Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Kanalens namn</label>
                            <StyledInput 
                                type="text" 
                                value={channelName} 
                                onChange={(e) => setChannelName(e.target.value)} 
                                placeholder="Namn på kanalen"
                                className="!py-3 !px-4 text-base"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Skärmriktning / Format</label>
                            <div className="flex gap-4">
                                {/* Landscape Option */}
                                <button
                                    onClick={() => setAspectRatio('16:9')}
                                    className={`relative flex-1 p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 group ${
                                        aspectRatio === '16:9'
                                            ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                                            : 'border-slate-200 dark:border-slate-750 hover:border-primary/50 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800'
                                    }`}
                                >
                                    <div className={`w-12 h-8 border-2 rounded transition-colors ${aspectRatio === '16:9' ? 'border-primary bg-primary/20' : 'border-slate-400 dark:border-slate-500 group-hover:border-primary/50'}`} />
                                    <span className="text-xs font-bold uppercase tracking-wide">Liggande (16:9)</span>
                                </button>

                                {/* Portrait Option */}
                                <button
                                    onClick={() => setAspectRatio('9:16')}
                                    className={`relative flex-1 p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 group ${
                                        aspectRatio === '9:16' || aspectRatio === '3:4'
                                            ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                                            : 'border-slate-200 dark:border-slate-750 hover:border-primary/50 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800'
                                    }`}
                                >
                                    <div className={`w-6 h-10 border-2 rounded transition-colors ${aspectRatio === '9:16' || aspectRatio === '3:4' ? 'border-primary bg-primary/20' : 'border-slate-400 dark:border-slate-500 group-hover:border-primary/50'}`} />
                                    <span className="text-xs font-bold uppercase tracking-wide">Stående (9:16)</span>
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">Välj det format som matchar monteringen av den fysiska TV-skärmen.</p>
                        </div>
                    </div>

                    {/* Branding Panel */}
                    <div className="pt-6 border-t border-slate-100 dark:border-slate-700/50">
                        <h3 className="font-extrabold text-slate-900 dark:text-white mb-4 flex items-center gap-2.5 text-lg">
                            <SparklesIcon className="w-5 h-5 text-purple-500" />
                            Skärmdesign & Varumärkesprofil
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Välj om och var din företagslogotyp och företagsnamn ska visas på skärmen.</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 flex items-center">
                                <ToggleSwitch 
                                    label="Visa logotyp" 
                                    checked={showLogo} 
                                    onChange={setShowLogo} 
                                />
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 flex items-center">
                                <ToggleSwitch 
                                    label="Visa företagsnamn" 
                                    checked={showName} 
                                    onChange={setShowName} 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Loggans placering</label>
                                <StyledSelect 
                                    value={brandingPosition} 
                                    onChange={(e) => setBrandingPosition(e.target.value)}
                                    className="!text-sm !py-2"
                                >
                                    <option value="top-left">Övre vänstra hörnet</option>
                                    <option value="top-right">Övre högra hörnet</option>
                                    <option value="bottom-left">Nedre vänstra hörnet</option>
                                    <option value="bottom-right">Nedre högra hörnet</option>
                                </StyledSelect>
                            </div>
                        </div>
                    </div>

                    {/* Zones Panel */}
                    <div className="pt-6 border-t border-slate-100 dark:border-slate-700/50">
                        <h3 className="font-extrabold text-slate-900 dark:text-white mb-2 flex items-center gap-2.5 text-lg">
                            <MonitorIcon className="w-5 h-5 text-teal-500" />
                            Zonlayout & Smart split-skärm
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Dela fläckfritt upp din skärm i zoner för att visa en digital klocka, skräddarsydd information eller ett rullande nyhetsband bredvid dina bilder.</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="md:col-span-1">
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Skärmlayout</label>
                                <StyledSelect 
                                    value={layoutType} 
                                    onChange={(e) => setLayoutType(e.target.value)}
                                    className="!text-sm !py-2"
                                >
                                    <option value="none">Helskärm (Standard)</option>
                                    <option value="main-sidebar">Huvudyta + Sidopanel</option>
                                    <option value="main-footer">Huvudyta + Nyhetsband nertill</option>
                                    <option value="traditional-3split">Tre-delad split (Hela paketet)</option>
                                </StyledSelect>
                            </div>

                            {layoutType !== 'none' && (
                                <div className="md:col-span-3 space-y-6 bg-slate-50 dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 animate-fade-in text-left">
                                    {/* Sidebar Details */}
                                    {(layoutType === 'main-sidebar' || layoutType === 'traditional-3split') && (
                                        <div className="space-y-4">
                                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 pb-2">Sidopanelens innehåll</h4>
                                            
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div className="space-y-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                                                    <ToggleSwitch 
                                                        label="Visa klocka" 
                                                        checked={showClock} 
                                                        onChange={setShowClock} 
                                                    />
                                                    <ToggleSwitch 
                                                        label="Visa väderinfo" 
                                                        checked={showWeather} 
                                                        onChange={setShowWeather} 
                                                    />
                                                    <ToggleSwitch 
                                                        label="Visa QR-kod" 
                                                        checked={showQrCode} 
                                                        onChange={setShowQrCode} 
                                                    />
                                                </div>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Rubrik</label>
                                                        <StyledInput 
                                                            type="text" 
                                                            placeholder="T.ex. Öppettider"
                                                            value={sidebarTitle} 
                                                            onChange={(e) => setSidebarTitle(e.target.value)}
                                                            className="!py-2 !text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Textinformation</label>
                                                        <StyledInput 
                                                            type="text" 
                                                            placeholder="T.ex. Mån-Fre 10:00 - 18:00"
                                                            value={sidebarText} 
                                                            onChange={(e) => setSidebarText(e.target.value)}
                                                            className="!py-2 !text-sm"
                                                        />
                                                    </div>
                                                </div>
                                                <div className={`space-y-3 transition-all duration-300 ${showQrCode ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Länk till QR-kod</label>
                                                        <StyledInput 
                                                            type="url" 
                                                            disabled={!showQrCode}
                                                            placeholder="https://din-hemsida.se"
                                                            value={qrCodeUrl} 
                                                            onChange={(e) => setQrCodeUrl(e.target.value)}
                                                            className="!py-2 !text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Text under QR-koden</label>
                                                        <StyledInput 
                                                            type="text" 
                                                            disabled={!showQrCode}
                                                            placeholder="T.ex. SKANNA HÄR"
                                                            value={qrCodeLabel} 
                                                            onChange={(e) => setQrCodeLabel(e.target.value)}
                                                            className="!py-2 !text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Footer Details */}
                                    {(layoutType === 'main-footer' || layoutType === 'traditional-3split') && (
                                        <div className="space-y-2 pt-2">
                                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 pb-2">Rullande nyhetsband (Ticker)</h4>
                                            <div>
                                                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Skriv meddelandet som rullar längst ner på skärmen</label>
                                                <StyledInput 
                                                    type="text" 
                                                    placeholder="T.ex. Välkommen! Just nu: 15% rabatt på alla ansiktsbehandlingar vid bokning online med koden VÅR2026..."
                                                    value={tickerText} 
                                                    onChange={(e) => setTickerText(e.target.value)}
                                                    className="!py-2.5 !text-sm w-full font-mono font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/20"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="p-6 md:p-8 border-t border-slate-200 dark:border-slate-750 flex flex-col sm:flex-row justify-end gap-3 bg-slate-50 dark:bg-slate-800/20">
                    <SecondaryButton onClick={onClose} disabled={isSaving} className="w-full sm:w-auto">
                        Avbryt
                    </SecondaryButton>
                    <PrimaryButton onClick={handleSave} disabled={isSaving || !channelName.trim()} className="w-full sm:w-auto">
                        {isSaving ? 'Sparar...' : 'Spara inställningar'}
                    </PrimaryButton>
                </div>
            </div>
        </div>
    );
};
