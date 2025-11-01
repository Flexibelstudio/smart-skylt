// components/PairingScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/StudioContext';
import { createPairingCode, listenToPairingCode, getOrganizationById } from '../services/firebaseService';
import { ScreenPairingCode, Organization, DisplayScreen } from '../types';

// Nycklar för localStorage
const GLOBAL_DEVICE_KEY = 'smart-skylt-physical-screen-id';
const getLocalStoragePhysicalScreenKey = (uid: string) => `smart-skylt-physical-screen-id_${uid}`;

// Hjälpare: skriv deviceId till både global och UID-scopad nyckel
const writeDeviceId = (uid: string | undefined | null, deviceId: string) => {
  if (uid) localStorage.setItem(getLocalStoragePhysicalScreenKey(uid), deviceId);
  localStorage.setItem(GLOBAL_DEVICE_KEY, deviceId);
};

// Format kod, t.ex. ABC123 -> ABC-123
const formatCode = (c: string | null) => (!c ? '' : `${c.substring(0, 3)}-${c.substring(3, 6)}`);

export const PairingScreen: React.FC = () => {
  const { allOrganizations, selectOrganization, selectDisplayScreen, displayScreens } = useLocation();
  const { currentUser } = useAuth();

  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pendingScreenId, setPendingScreenId] = useState<string | null>(null);

  const handledOnceRef = useRef(false);
  const mountedRef = useRef(true);

  // NEW EFFECT: When screens load into the context, find and select the one we're waiting for.
  useEffect(() => {
    if (pendingScreenId && displayScreens.length > 0) {
      const screen = displayScreens.find(s => s.id === pendingScreenId);
      if (screen) {
        selectDisplayScreen(screen);
        // The component will unmount on success, so no need to reset state.
      } else {
        // The screens loaded, but the one we need wasn't there.
        setError('Konfigurationen som mottogs var ogiltig. Kontakta support.');
        setPendingScreenId(null); // Stop trying.
      }
    }
  }, [pendingScreenId, displayScreens, selectDisplayScreen]);

  useEffect(() => {
    mountedRef.current = true;
    let unsubscribe: (() => void) | null = null;

    const setupPairing = async () => {
      try {
        const newCode = await createPairingCode();
        if (!mountedRef.current) return;
        setCode(newCode);

        unsubscribe = listenToPairingCode(newCode, async (pairingData: ScreenPairingCode) => {
          try {
            if (handledOnceRef.current) return;

            const isReady =
              pairingData?.status === 'paired' &&
              pairingData.organizationId &&
              pairingData.assignedDisplayScreenId;

            if (!isReady) return;
            
            handledOnceRef.current = true; // Prevent multiple triggers

            if (pairingData.pairedDeviceId) {
              writeDeviceId(currentUser?.uid, pairingData.pairedDeviceId);
            }

            let org: Organization | undefined =
              allOrganizations.find(o => o.id === pairingData.organizationId) || undefined;

            if (!org) {
              const fetched = await getOrganizationById(pairingData.organizationId!);
              if (fetched) org = fetched;
            }
            if (!org) {
              setError('Organisationen kunde inte hittas. Kontakta support.');
              return;
            }

            // --- REFACTORED LOGIC ---
            // 1. Select the organization in the context. This will trigger the context to
            //    fetch the `displayScreens` from the subcollection.
            selectOrganization(org);

            // 2. Set a pending state with the screen ID we need to select.
            setPendingScreenId(pairingData.assignedDisplayScreenId!);
            // The new useEffect above will now handle selecting the screen once it's loaded.

            if (unsubscribe) {
              unsubscribe();
              unsubscribe = null;
            }
          } catch (cbErr) {
            console.error('Pairing callback error:', cbErr);
            if (mountedRef.current) {
              setError('Ett fel uppstod vid anslutningen. Försök igen.');
            }
          }
        });
      } catch (err) {
        console.error('Failed to create pairing code:', err);
        if (mountedRef.current) {
          setError('Kunde inte skapa anslutningskod. Kontrollera din internetanslutning.');
        }
      }
    };

    setupPairing();

    return () => {
      mountedRef.current = false;
      if (unsubscribe) unsubscribe();
    };
  }, [allOrganizations, selectOrganization, currentUser?.uid]);

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
            <svg
              className="animate-spin h-8 w-8 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Genererar kod...</span>
          </div>
        )}
        {error && <p className="text-red-400 mt-4">{error}</p>}
      </div>

      <p className="text-gray-500 mt-16 text-sm">Skärmen uppdateras automatiskt när den har anslutits.</p>
    </div>
  );
};

export default PairingScreen;
