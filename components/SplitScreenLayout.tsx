import React, { useState, useEffect } from 'react';
import { DisplayScreen, ScreenZoneConfig, Organization } from '../types';
import QRCode from 'qrcode';

interface SidebarQrCodeProps {
  url: string;
  label?: string;
}

const SidebarQrCode: React.FC<SidebarQrCodeProps> = ({ url, label }) => {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    if (url) {
      QRCode.toDataURL(url, {
        width: 256,
        margin: 1,
        color: {
          dark: '#0f172a', // slate-900 for high-contrast scanning
          light: '#ffffff',
        }
      })
      .then(setDataUrl)
      .catch((err) => console.error("Error generating sidebar QR code:", err));
    }
  }, [url]);

  if (!url || !dataUrl) return null;

  return (
    <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/80 backdrop-blur-sm flex flex-col items-center justify-center text-center mt-3 shrink-0">
      <div className="bg-white p-1.5 rounded shadow-lg inline-block">
        <img src={dataUrl} alt="QR Code" className="w-[110px] h-[110px] object-contain rounded" style={{ display: 'block' }} />
      </div>
      {label && (
        <p className="text-[10px] font-bold text-teal-400 uppercase tracking-widest mt-2 px-1 max-w-[150px] truncate">
          {label}
        </p>
      )}
    </div>
  );
};

interface SplitScreenLayoutProps {
  screen: DisplayScreen;
  organization: Organization;
  children: React.ReactNode;
}

export const SplitScreenLayout: React.FC<SplitScreenLayoutProps> = ({ screen, organization, children }) => {
  const zones = screen.zones;

  // Real-time Clock logic
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isLayoutEnabled = zones?.isEnabled || (zones?.layoutType && zones.layoutType !== 'none');

  if (!zones || !isLayoutEnabled || zones.layoutType === 'none') {
    return <>{children}</>;
  }

  const layoutType = zones.layoutType;

  const timeString = time.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  const secondsString = time.toLocaleTimeString('sv-SE', { second: '2-digit' });
  const dateString = time.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' });

  // Render Sidebar
  const renderSidebar = () => {
    const logoUrl = organization?.logoUrlDark || organization?.logoUrlLight;
    return (
      <div className="h-full flex flex-col justify-between bg-slate-900 text-white p-4 border-l border-slate-800/60 relative overflow-hidden select-none animate-fade-in">
        {/* Subtle background glow effect */}
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="space-y-4 z-10 w-full">
          {/* Organization Logo/Header in Sidebar */}
          {logoUrl ? (
            <div className="flex flex-col items-center justify-center py-2.5 border-b border-slate-800/50 mb-4 bg-slate-950/20 rounded-lg p-2">
              <img src={logoUrl} alt={`${organization.brandName || organization.name}`} className="max-h-12 max-w-[85%] object-contain" />
              {organization.brandName && (
                <span className="text-[9px] font-bold tracking-widest uppercase text-slate-400 mt-1.5">{organization.brandName}</span>
              )}
            </div>
          ) : (
            <div className="py-2 text-center font-bold tracking-widest uppercase text-slate-400 border-b border-slate-800/50 mb-4 text-[10px] bg-slate-950/20 rounded-lg">
              {organization.brandName || organization.name}
            </div>
          )}

          {/* Digital Clock */}
          {zones.showClock !== false && (
            <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/80 backdrop-blur-sm">
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-3xl font-extrabold tracking-tight text-white drop-shadow">
                  {timeString}
                </span>
                <span className="font-mono text-md font-medium text-slate-400">
                  :{secondsString}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-400 capitalize mt-1 tracking-wide">
                📆 {dateString}
              </p>
            </div>
          )}

          {/* Weather Widget */}
          {zones.showWeather && (
            <div className="bg-gradient-to-br from-slate-900/80 to-indigo-950/40 p-3 rounded-lg border border-indigo-950/40 backdrop-blur-sm">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">☀️</span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Väder just nu</p>
                  <p className="text-xs font-semibold text-white truncate">Ute på display</p>
                  <p className="text-[10px] text-indigo-300">18°C, Mestadels soligt</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Custom text & information */}
        <div className="space-y-2 z-10 flex-grow my-4 overflow-hidden flex flex-col justify-center">
          {zones.sidebarTitle && (
            <h5 className="text-xs font-extrabold text-teal-400 uppercase tracking-widest leading-snug line-clamp-2">
              📢 {zones.sidebarTitle}
            </h5>
          )}
          {zones.sidebarText ? (
            <p className={`text-xs text-slate-300 leading-relaxed whitespace-pre-wrap ${zones.showQrCode ? 'line-clamp-[4]' : 'line-clamp-[8]'}`}>
              {zones.sidebarText}
            </p>
          ) : (
            <p className="text-[11px] text-slate-500 italic">
              Skriv information som rör din verksamhet eller skylt så visas det här!
            </p>
          )}
        </div>

        {/* QR Code Widget */}
        {zones.showQrCode && zones.qrCodeUrl && (
          <SidebarQrCode url={zones.qrCodeUrl} label={zones.qrCodeLabel} />
        )}

        {/* Organization Info Footer */}
        <div className="z-10 pt-2 border-t border-slate-800/80 text-[9px] text-slate-500 flex justify-between items-center bg-slate-900/30">
          <span className="font-bold uppercase tracking-wider truncate mr-1">{organization.brandName || organization.name}</span>
          <span className="font-mono shrink-0">Zoner</span>
        </div>
      </div>
    );
  };

  // Render Bottom Ticker
  const renderTicker = () => {
    const defaultTickerText = `Välkommen till ${organization.brandName || organization.name}! Håll utkik här för våra senaste erbjudanden och nyheter.`;
    const textToRepeat = zones.tickerText || defaultTickerText;

    return (
      <div className="w-full h-full bg-teal-900 text-teal-100 border-t border-teal-800/80 flex items-center overflow-hidden relative select-none">
        {/* Style injection for seamless marquee */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes splitTickerMarquee {
            0% { transform: translate3d(0, 0, 0); }
            100% { transform: translate3d(-50%, 0, 0); }
          }
          .split-screen-marquee-container {
            display: flex;
            width: max-content;
            animation: splitTickerMarquee 20s linear infinite;
          }
        `}} />
        
        {/* News Flash Badge */}
        <div className="bg-teal-700 text-white text-[11px] font-extrabold uppercase px-3.5 py-2 flex items-center h-full z-10 shrink-0 shadow-lg tracking-widest border-r border-teal-800">
          🔥 Aktuellt
        </div>
        
        {/* Seamless scrolling wrap */}
        <div className="flex-1 overflow-hidden relative w-full h-full flex items-center">
          <div className="split-screen-marquee-container whitespace-nowrap text-xs font-semibold text-white flex items-center py-1">
            <span className="inline-flex items-center gap-10 pr-10">
              <span>{textToRepeat}</span>
              <span className="text-teal-400">✦</span>
              <span>{textToRepeat}</span>
              <span className="text-teal-400">✦</span>
            </span>
            {/* Repeated block for seamless infinite scrolling */}
            <span className="inline-flex items-center gap-10 pr-10" aria-hidden="true">
              <span>{textToRepeat}</span>
              <span className="text-teal-400">✦</span>
              <span>{textToRepeat}</span>
              <span className="text-teal-400">✦</span>
            </span>
          </div>
        </div>
      </div>
    );
  };

  if (layoutType === 'main-sidebar') {
    return (
      <div className="w-full h-full flex flex-row overflow-hidden bg-black relative">
        <div className="w-3/4 h-full relative overflow-hidden">
          {children}
        </div>
        <div className="w-1/4 h-full">
          {renderSidebar()}
        </div>
      </div>
    );
  }

  if (layoutType === 'main-footer') {
    return (
      <div className="w-full h-full flex flex-col overflow-hidden bg-black relative">
        <div className="flex-1 relative overflow-hidden">
          {children}
        </div>
        <div className="h-[10%] min-h-[35px] max-h-[50px]">
          {renderTicker()}
        </div>
      </div>
    );
  }

  if (layoutType === 'traditional-3split') {
    return (
      <div className="w-full h-full flex flex-col overflow-hidden bg-black relative">
        {/* Top split row */}
        <div className="flex-1 flex flex-row overflow-hidden">
          <div className="w-3/4 h-full relative overflow-hidden">
            {children}
          </div>
          <div className="w-1/4 h-full">
            {renderSidebar()}
          </div>
        </div>
        {/* Bottom ticker row */}
        <div className="h-[10%] min-h-[35px] max-h-[50px]">
          {renderTicker()}
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
