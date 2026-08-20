
import React, { useState, useEffect, Suspense } from 'react';
import { getAppMode } from './utils/appMode';
import { useLocation } from './context/StudioContext';

// Import the separated applications
import DisplayApp from './apps/DisplayApp';
import AdminApp from './apps/AdminApp';
import { ResetPasswordScreen } from './components/ResetPasswordScreen';

// Lazy load DisplayWindowScreen for the Embed Wrapper to avoid loading full admin bundle for viewers
const DisplayWindowScreen = React.lazy(() => import('./components/DisplayWindowScreen').then(module => ({ default: module.DisplayWindowScreen })));

// Lazy load LandingPage så att marknadsföringssidan inte tynger appbundeln
const LandingPage = React.lazy(() => import('./components/LandingPage').then(module => ({ default: module.LandingPage })));

// --- EMBED WRAPPER (Kept here for simplicity as a router sub-component) ---
const EmbedWrapper: React.FC<{ organizationId: string; screenId: string }> = ({ organizationId, screenId }) => {
    const { selectOrganization, selectDisplayScreenById, selectedDisplayScreen, allOrganizations } = useLocation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    useEffect(() => {
        const fetchAndSetData = async () => {
            try {
                const orgToSelect = allOrganizations.find(o => o.id === organizationId);
                if (orgToSelect) {
                  await selectOrganization(orgToSelect);
                } else {
                  // The context handles fetching if not present, assuming basic data is loaded.
                  // If not, we rely on the context to fetch individual org eventually.
                }

                // This relies on selectOrganization triggering the fetch of displayScreens
                selectDisplayScreenById(screenId);
            } catch (err) {
                console.error("Embed fetch error:", err);
                setError(err instanceof Error ? err.message : "Ett okänt fel inträffade.");
            } finally {
                setLoading(false);
            }
        };
        fetchAndSetData();
    }, [organizationId, screenId, allOrganizations, selectOrganization, selectDisplayScreenById]);

    if (loading) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center">Laddar...</div>;
    }

    if (error) {
         return <div className="bg-black text-white min-h-screen flex items-center justify-center">{error}</div>;
    }
    
    if (!selectedDisplayScreen) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center">Kunde inte ladda skyltfönster.</div>;
    }

    return (
        <Suspense fallback={<div className="bg-black text-white min-h-screen flex items-center justify-center">Laddar...</div>}>
            <DisplayWindowScreen onBack={() => {}} isEmbedded={true} />
        </Suspense>
    );
};

// Domäner som ska visa landningssidan i stället för adminappen.
// TOM TILLS VIDARE — smartskylt.se är fortfarande adminappen.
// När appen flyttat till app.smartskylt.se: lägg in
// ['smartskylt.se', 'www.smartskylt.se'] här.
const MARKNADSDOMANER: string[] = [];

// --- MAIN APP ROUTER ---
export default function App() {
    const appMode = getAppMode();
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');

    // 1. Display Mode (Subdomain: skylt.*)
    if (appMode === 'display') {
        return <DisplayApp />;
    }
    
    // 2. Password Reset Mode (Query Param)
    if (mode === 'resetPassword' && oobCode) {
        return <ResetPasswordScreen oobCode={oobCode} />;
    }

    // 3. Embed Mode (Path)
    const embedMatch = path.match(/^\/embed\/org\/([^/]+)\/screen\/([^/]+)/);
    if (embedMatch) {
        const [, organizationId, screenId] = embedMatch;
        return <EmbedWrapper organizationId={organizationId} screenId={screenId} />;
    }

    // 4. Marknadsföringsläge (domän eller ?marketing=true)
    // Skyltläget kollas ovan, så en skärm kan aldrig hamna här.
    const isMarknad =
        (MARKNADSDOMANER.includes(window.location.hostname) ||
            params.get('marketing') === 'true') &&
        params.get('app') !== 'true';

    if (isMarknad) {
        return (
            <Suspense fallback={<div className="min-h-screen bg-white" />}>
                <LandingPage
                    onLoginClick={() => {
                        const p = new URLSearchParams(window.location.search);
                        p.delete('marketing');
                        p.set('app', 'true');
                        window.location.search = p.toString();
                    }}
                />
            </Suspense>
        );
    }

    // 5. Admin/CMS Mode (Default)
    return <AdminApp />;
}
