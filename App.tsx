import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useLocation } from './context/StudioContext';
import { getAppMode } from './utils/appMode';
import { ResetPasswordScreen } from './components/ResetPasswordScreen';
import { AdminApp } from './apps/AdminApp';
import { DisplayApp } from './apps/DisplayApp';

// Lazy load the display window for embedding
const DisplayWindowScreen = lazy(() => import('./components/DisplayWindowScreen').then(module => ({ default: module.DisplayWindowScreen })));

// --- EMBED ROUTER WRAPPER ---
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
                }
                // Context handles loading screens, wait for it implicitly or relying on prop updates
                selectDisplayScreenById(screenId);
            } catch (err) {
                console.error("Embed fetch error:", err);
                setError(err instanceof Error ? err.message : "Ett okänt fel inträffade.");
            } finally {
                setLoading(false);
            }
        };
        fetchAndSetData();
    // selectOrganization and selectDisplayScreenById are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [organizationId, screenId, allOrganizations]);

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

    // 1. Handle Display Mode (skylt.* domain)
    if (appMode === 'display') {
        return <DisplayApp />;
    }
    
    // 2. Handle Password Reset
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');
    if (mode === 'resetPassword' && oobCode) {
        return <ResetPasswordScreen oobCode={oobCode} />;
    }

    // 3. Handle Embeds
    const embedMatch = path.match(/^\/embed\/org\/([^/]+)\/screen\/([^/]+)/);
    if (embedMatch) {
        const [, organizationId, screenId] = embedMatch;
        return <EmbedWrapper organizationId={organizationId} screenId={screenId} />;
    }

    // 4. Default: Admin App (CMS)
    return <AdminApp />;
}
