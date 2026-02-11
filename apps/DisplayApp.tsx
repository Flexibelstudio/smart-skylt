import React, { useEffect, Suspense, lazy } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/StudioContext';
import { PairingScreen } from '../components/PairingScreen';

// Lazy load the heavy display component
const DisplayWindowScreen = lazy(() => import('../components/DisplayWindowScreen').then(module => ({ default: module.DisplayWindowScreen })));

const DisplayApp: React.FC = () => {
    const { currentUser, authLoading, signInAsScreen } = useAuth();
    const { selectedDisplayScreen, locationLoading } = useLocation();

    useEffect(() => {
        // Automatically sign in as an anonymous screen user if not logged in.
        if (!currentUser && !authLoading) {
            signInAsScreen().catch(err => {
                console.error("Automatic screen sign-in failed:", err);
            });
        }
    }, [currentUser, authLoading, signInAsScreen]);
    
    // Show a loading screen while auth, location data, or user object is being prepared.
    if (authLoading || locationLoading || !currentUser) {
        return <div className="bg-slate-900 text-white min-h-screen flex items-center justify-center">Startar skyltfönster...</div>;
    }

    // If a display screen is configured for this device, show it.
    if (selectedDisplayScreen) {
        // onBack is not used in this context, so we provide an empty function.
        return (
            <Suspense fallback={<div className="bg-black text-white min-h-screen flex items-center justify-center">Laddar...</div>}>
                <DisplayWindowScreen onBack={() => {}} />
            </Suspense>
        );
    }

    // Otherwise, show the pairing screen to connect it to a channel.
    return (
        <div className="bg-slate-900 text-white min-h-screen">
            <PairingScreen />
        </div>
    );
};

export default DisplayApp;