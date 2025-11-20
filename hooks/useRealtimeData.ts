import { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Organization, DisplayScreen, ScreenPairingCode } from '../types';
import {
  getOrganizations,
  listenToOrganizationChanges,
  listenToDisplayScreens,
  listenToPairingCodeByDeviceId,
  listenToScreenSession,
  getOrganizationById,
} from '../services/firebaseService';

// --- Organizations ---

export function useAllOrganizations(isEnabled: boolean) {
  return useQuery({
    queryKey: ['allOrganizations'],
    queryFn: () => getOrganizations(),
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5, // 5 min
  });
}

export function useOrganizationDetails(orgId: string | undefined) {
  const queryClient = useQueryClient();

  // Initial fetch via useQuery
  const queryResult = useQuery<Organization | null>({
    queryKey: ['organization', orgId],
    queryFn: () => (orgId ? getOrganizationById(orgId) : Promise.resolve(null)),
    enabled: !!orgId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!orgId) return;

    const unsubscribe = listenToOrganizationChanges(orgId, (snapshot: any) => {
      let data: any = null;

      if (snapshot && snapshot.exists) {
        // Firestore: snapshot.data() är en funktion
        data = typeof snapshot.data === 'function' ? snapshot.data() : snapshot.data;
        if (data) {
          data = { ...data, id: snapshot.id };
        }
      }

      queryClient.setQueryData(['organization', orgId], data);
    });

    return () => unsubscribe();
  }, [orgId, queryClient]);

  return queryResult;
}

// --- Display Screens ---

export function useOrganizationScreens(orgId: string | undefined) {
  const queryClient = useQueryClient();

  const queryResult = useQuery<DisplayScreen[]>({
    queryKey: ['screens', orgId],
    queryFn: () => Promise.resolve([] as DisplayScreen[]),
    enabled: !!orgId,
  });

  useEffect(() => {
    if (!orgId) return;

    const unsubscribe = listenToDisplayScreens(orgId, (screens) => {
      queryClient.setQueryData(['screens', orgId], screens);
    });

    return () => unsubscribe();
  }, [orgId, queryClient]);

  return queryResult;
}

// --- Pairing ---

export function usePairingCodeListener(deviceId: string | null, isScreenMode: boolean) {
  const queryClient = useQueryClient();

  const queryResult = useQuery<ScreenPairingCode | null>({
    queryKey: ['pairingCode', deviceId],
    queryFn: () => Promise.resolve(null as ScreenPairingCode | null),
    enabled: !!deviceId && isScreenMode,
  });

  useEffect(() => {
    if (!isScreenMode || !deviceId) return;

    const unsubscribe = listenToPairingCodeByDeviceId(deviceId, (data) => {
      queryClient.setQueryData(['pairingCode', deviceId], data);
    });

    return () => unsubscribe();
  }, [deviceId, isScreenMode, queryClient]);

  return queryResult.data;
}

// --- Session ---

/**
 * Lyssnar på skärmens session-dokument.
 * - Har en "grace period" där vi INTE kastar ut skärmen om sessionen inte hittas direkt.
 * - Minns om vi NÅGON GÅNG haft en giltig session (hasValidSessionRef), så att en
 *   tillfällig null/permission-glitch inte direkt kastar tillbaka till parningsläget.
 */
export function useScreenSessionListener(
  deviceId: string | null,
  isScreenMode: boolean,
  onForceDisconnect: () => void
) {
  // Grace-period: under denna tid ignorerar vi att doc saknas.
  const [isGracePeriod, setIsGracePeriod] = useState(true);

  // Minns om vi någon gång hittat en giltig session under den här livstiden.
  const hasValidSessionRef = useRef(false);

  // Starta / nollställ grace-period när vi går in i screen mode
  useEffect(() => {
    if (!isScreenMode) {
      setIsGracePeriod(true);
      hasValidSessionRef.current = false;
      return;
    }

    setIsGracePeriod(true);
    hasValidSessionRef.current = false;

    const timer = window.setTimeout(() => {
      setIsGracePeriod(false);
      console.log('[Session] Grace period slut – om ingen session finns nu kan vi koppla ner.');
    }, 30000); // 30 sekunder

    return () => {
      window.clearTimeout(timer);
    };
  }, [isScreenMode, deviceId]);

  useEffect(() => {
    if (!isScreenMode || !deviceId) return;

    let isMounted = true;

    console.log('[Session] Startar session-listener för deviceId:', deviceId);

    const unsubscribe = listenToScreenSession(deviceId, (doc: any) => {
      if (!isMounted) return;

      // 1. Giltig session (finns, och INTE forceDisconnect)
      if (doc && !doc.forceDisconnect) {
        if (!hasValidSessionRef.current) {
          console.log('[Session] Giltig session hittad för den här skärmen:', doc);
        }
        hasValidSessionRef.current = true;

        // Vi kan vara defensiva och avsluta grace-perioden nu,
        // eftersom vi vet att sessionen faktiskt finns och funkar.
        if (isGracePeriod) {
          setIsGracePeriod(false);
        }
        return;
      }

      // 2. Explicit forceDisconnect från backend/admin
      if (doc && doc.forceDisconnect) {
        console.log('[Session] forceDisconnect flaggad i doc → kopplar ner skärmen');
        hasValidSessionRef.current = false;
        onForceDisconnect();
        return;
      }

      // 3. doc saknas (null / undefined)
      if (!doc) {
        // Under grace-period → gör ingenting, bara vänta.
        if (isGracePeriod && !hasValidSessionRef.current) {
          console.log('[Session] Ingen session ännu, men fortfarande grace-period → väntar...');
          return;
        }

        // Ingen grace, och vi har ALDRIG haft en giltig session → kasta ut.
        if (!hasValidSessionRef.current && !isGracePeriod) {
          console.log('[Session] Ingen session efter grace-period och aldrig haft en giltig → reset till pairing');
          onForceDisconnect();
          return;
        }

        // Ingen grace, men vi HAR haft en session tidigare:
        // Det här kan vara tillfälligt (lagg, rättighetsglitch, delay).
        // För att undvika flicker låter vi skärmen vara kvar.
        if (hasValidSessionRef.current && !isGracePeriod) {
          console.warn(
            '[Session] Session-dokumentet saknas plötsligt trots att vi haft en giltig session tidigare. ' +
              'Ignorerar detta för att undvika att kasta ut skärmen direkt.'
          );
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [deviceId, isScreenMode, isGracePeriod, onForceDisconnect]);
}
