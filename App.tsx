
import React, { useState, useEffect, Suspense } from 'react';
import { getAppMode } from './utils/appMode';
import { useLocation } from './context/StudioContext';

// Import the separated applications
import DisplayApp from './apps/DisplayApp';
import AdminApp from './apps/AdminApp';
import { ResetPasswordScreen } from './components/ResetPasswordScreen';

// Lazy load DisplayWindowScreen for the Embed Wrapper to avoid loading full admin bundle for viewers
const DisplayWindowScreen = React.lazy(() => import('./components/DisplayWindowScreen').then(module => ({ default: module.DisplayWindowScreen })));

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

    // 4. Admin/CMS Mode (Default)
    return <AdminApp />;
}
