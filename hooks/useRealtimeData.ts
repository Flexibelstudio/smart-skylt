// hooks/useRealtimeData.ts
import { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Organization, DisplayScreen, ScreenPairingCode } from '../types';
import { 
  getOrganizations, 
  listenToOrganizationChanges, 
  listenToDisplayScreens,
  listenToPairingCodeByDeviceId,
  listenToScreenSession,
  getOrganizationById
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
  const queryResult = useQuery({
    queryKey: ['organization', orgId],
    queryFn: () => (orgId ? getOrganizationById(orgId) : Promise.resolve(null)),
    enabled: !!orgId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!orgId) return;

    const unsubscribe = listenToOrganizationChanges(orgId, (snapshot: any) => {
      let data: Organization | null = null;

      if (snapshot?.exists) {
        const raw = typeof snapshot.data === 'function' ? snapshot.data() : snapshot.data;
        if (raw) {
          data = { ...raw, id: snapshot.id } as Organization;
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

  const queryResult = useQuery({
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

  const queryResult = useQuery({
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

export function useScreenSessionListener(
  deviceId: string | null,
  isScreenMode: boolean,
  onForceDisconnect: () => void
) {
  // Grace period: ge tid för session-dokumentet att dyka upp.
  const [isGracePeriod, setIsGracePeriod] = useState(true);

  // Har vi någonsin sett en giltig session?
  // Om ja → ignorera tillfälliga "null"-snapshots, så vi inte kastar ut skärmen i onödan.
  const hasSeenValidSessionRef = useRef(false);

  useEffect(() => {
    if (!isScreenMode) return;

    // Ny session-start → nollställ state
    hasSeenValidSessionRef.current = false;
    setIsGracePeriod(true);

    const timer = setTimeout(() => {
      setIsGracePeriod(false);
    }, 30000); // 30 sek grace

    return () => clearTimeout(timer);
  }, [isScreenMode, deviceId]);

  useEffect(() => {
    if (!isScreenMode || !deviceId) return;

    const unsubscribe = listenToScreenSession(deviceId, (doc) => {
      console.log('[Session] snapshot', {
        doc,
        isGracePeriod,
        hasSeenValid: hasSeenValidSessionRef.current,
      });

      // 1. Giltig session, ingen forceDisconnect → allt är bra
      if (doc && !doc.forceDisconnect) {
        if (!hasSeenValidSessionRef.current) {
          console.log('[Session] First valid session seen → keep screen connected');
        }
        hasSeenValidSessionRef.current = true;
        return;
      }

      // 2. Explicit forceDisconnect → alltid koppla ner direkt
      if (doc && doc.forceDisconnect) {
        console.log('[Session] forceDisconnect flag set → reset to pairing');
        hasSeenValidSessionRef.current = false;
        onForceDisconnect();
        return;
      }

      // 3. doc saknas (null)
      if (!doc) {
        // Om vi aldrig sett en giltig session och grace-perioden är slut → antag att sessionen inte finns
        if (!isGracePeriod && !hasSeenValidSessionRef.current) {
          console.log(
            '[Session] No session doc after grace & never had a valid one → reset to pairing'
          );
          onForceDisconnect();
        } else {
          // Antingen är vi fortfarande i grace, eller så har vi redan haft en giltig session.
          // I båda fallen ignorerar vi detta för att undvika onödiga disconnects.
          console.log(
            '[Session] No doc, but in grace or had valid session before → ignoring transient state'
          );
        }
      }
    });

    return () => unsubscribe();
  }, [deviceId, isScreenMode, isGracePeriod, onForceDisconnect]);
}
