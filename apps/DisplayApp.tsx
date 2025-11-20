import React, { Suspense, useEffect, useState, lazy } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/StudioContext';
import { PairingScreen } from '../components/PairingScreen';
import { LoadingSpinnerIcon } from '../components/icons';

const DisplayWindowScreen = lazy(() =>
  import('../components/DisplayWindowScreen').then(module => ({
    default: module.DisplayWindowScreen,
  }))
);

export const DisplayApp: React.FC = () => {
  const { currentUser, authLoading, signInAsScreen } = useAuth();
  const { selectedDisplayScreen, locationLoading } = useLocation();

  // 🔹 Nytt: vi håller reda på om skärmen är “parad” / har en aktiv session
  const [hasActiveSession, setHasActiveSession] = useState(false);

  // När vi väl har en displayScreen en gång, markera som aktiv session
  useEffect(() => {
    if (selectedDisplayScreen) {
      console.log('[DisplayApp] selectedDisplayScreen set → hasActiveSession = true');
      setHasActiveSession(true);
    }
  }, [selectedDisplayScreen]);

  useEffect(() => {
    // Automatiskt anonym inloggning för skärm om ingen användare finns.
    if (!currentUser && !authLoading) {
      signInAsScreen().catch(err => {
        console.error('Automatic screen sign-in failed:', err);
      });
    }
  }, [currentUser, authLoading, signInAsScreen]);

  // Debug-loggar för att se vad som händer
  useEffect(() => {
    console.log('[DisplayApp] authLoading', authLoading, 'locationLoading', locationLoading);
    console.log('[DisplayApp] currentUser', currentUser?.uid);
    console.log('[DisplayApp] selectedDisplayScreen', selectedDisplayScreen);
    console.log('[DisplayApp] hasActiveSession', hasActiveSession);
  }, [authLoading, locationLoading, currentUser, selectedDisplayScreen, hasActiveSession]);

  // Visa laddningsskärm medan auth/location håller på att laddas
  if (authLoading || locationLoading || !currentUser) {
    return (
      <div className="bg-slate-900 text-white min-h-screen flex items-center justify-center gap-3">
        <LoadingSpinnerIcon className="h-6 w-6" />
        <span>Startar skyltfönster...</span>
      </div>
    );
  }

  // 🔹 Ny logik:
  // Om vi någonsin har fått en aktiv session (hasActiveSession = true)
  // så visar vi DisplayWindowScreen även om selectedDisplayScreen tillfälligt blir null.
  if (hasActiveSession) {
    return (
      <Suspense
        fallback={
          <div className="bg-black text-white min-h-screen flex items-center justify-center">
            Laddar innehåll...
          </div>
        }
      >
        <DisplayWindowScreen
          // Nu kan vi faktiskt "koppla ur" skärmen manuellt
          onBack={() => {
            console.log('[DisplayApp] onBack → hasActiveSession = false');
            setHasActiveSession(false);
          }}
        />
      </Suspense>
    );
  }

  // Om vi INTE har aktiv session ännu → visa parningsskärm
  return (
    <div className="bg-slate-900 text-white min-h-screen">
      <PairingScreen />
    </div>
  );
};
