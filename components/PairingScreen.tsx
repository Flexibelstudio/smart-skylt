import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/StudioContext';
import { createPairingCode, listenToPairingCode } from '../services/firebaseService';
import { ScreenPairingCode } from '../types';

const getLocalStoragePhysicalScreenKey = (uid: string) => `smart-skylt-physical-screen-id_${uid}`;

export const PairingScreen: React.FC = () => {
    const { allOrganizations, selectOrganization, selectDisplayScreen } = useLocation();
    const { currentUser } = useAuth();
    const [code, setCode] = useState<string | null>(null);
    const [error, setError] = useState('');

    // Format code for display, e.g., ABC123 -> ABC-123
    const formatCode = (c: string | null) => {
        if (!c) return '';
        return c.substring(0, 3) + '-' + c.substring(3, 6);
    };

    useEffect(() => {
        let unsubscribe: (() => void) | null = null;

        const setupPairing = async () => {
            try {
                const newCode = await createPairingCode();
                setCode(newCode);

                unsubscribe = listenToPairingCode(newCode, (pairingData: ScreenPairingCode) => {
                    if (pairingData.status === 'paired' && pairingData.organizationId && pairingData.assignedDisplayScreenId && currentUser) {
                        
                        // NEW: Store the physical device ID so the screen knows who it is.
                        if (pairingData.pairedDeviceId) {
                            const physicalScreenKey = getLocalStoragePhysicalScreenKey(currentUser.uid);
                            localStorage.setItem(physicalScreenKey, pairingData.pairedDeviceId);
                        }

                        const org = allOrganizations.find(o => o.id === pairingData.organizationId);
                        if (org) {
                            const screen = org.displayScreens?.find(s => s.id === pairingData.assignedDisplayScreenId);

                            if (screen) {
                                // This sequence updates the context and triggers the app to navigate to the display window.
                                selectOrganization(org);
                                selectDisplayScreen(screen);
                            } else {
                                setError('Konfigurationen som mottogs var ogiltig. Kontakta support.');
                            }
                        } else {
                             setError('Organisationen kunde inte hittas. Kontakta support.');
                        }
                    }
                });
            } catch (err) {
                console.error("Failed to create pairing code:", err);
                setError('Kunde inte skapa anslutningskod. Kontrollera din internetanslutning.');
            }
        };

        setupPairing();
        
        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [allOrganizations, selectDisplayScreen, selectOrganization, currentUser]);

    return (
        <div className="w-full h-screen flex flex-col items-center justify-center p-8 text-center bg-slate-900 text-white">
            <div className="mb-12">
                <h1 className="text-5xl font-bold text-white mb-2">Anslut denna skärm</h1>
                <p className="text-lg text-gray-400 max-w-2xl mx-auto">
                    Använd koden nedan i administrationspanelen på en annan enhet för att konfigurera vad som ska visas här.
                </p>
            </div>

            <div className="bg-black/30 rounded-2xl p-8 sm:p-12 border border-gray-700">
                {code ? (
                    <>
                        <p className="text-2xl text-gray-400 font-semibold">Din anslutningskod är:</p>
                        <p className="text-7xl sm:text-8xl font-mono font-bold tracking-[0.3em] my-4 text-primary animate-pulse">
                            {formatCode(code)}
                        </p>
                    </>
                ) : (
                    <div className="flex items-center gap-4 text-3xl">
                        <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Genererar kod...</span>
                    </div>
                )}
                 {error && <p className="text-red-400 mt-4">{error}</p>}
            </div>

             <p className="text-gray-500 mt-16 text-sm">Skärmen kommer att uppdateras automatiskt när den har anslutits.</p>
        </div>
    );
};