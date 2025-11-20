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
    queryFn: () => orgId ? getOrganizationById(orgId) : Promise.resolve(null),
    enabled: !!orgId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!orgId) return;

    const unsubscribe = listenToOrganizationChanges(orgId, (snapshot: any) => {
      // Handle both Firestore snapshot structure and potential mock structure
      let data = null;
      
      if (snapshot.exists) {
          // Check if snapshot.data is a function (Firestore) or object (Mock)
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

  // We use a query to manage the state, but the initial fetch is handled by the listener mostly,
  // or we could fetch once. For simplicity in this hybrid model, we rely on the listener to populate this.
  // But providing a queryFn makes it robust if the listener takes time or fails.
  const queryResult = useQuery({
    queryKey: ['screens', orgId],
    queryFn: () => Promise.resolve([] as DisplayScreen[]), // Initial empty state or could call getDisplayScreens if we had it
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

export function useScreenSessionListener(deviceId: string | null, isScreenMode: boolean, onForceDisconnect: () => void) {
    // Grace period state: true initially, turns false after 30 seconds.
    // This prevents the app from kicking the user out immediately if the session doc takes a moment to load.
    // Extended to 30s to be extra safe against slow permission propagation or network lag.
    const [isGracePeriod, setIsGracePeriod] = useState(true);

    useEffect(() => {
        if (!isScreenMode) return;
        
        const timer = setTimeout(() => {
            setIsGracePeriod(false);
        }, 30000); // 30 seconds grace period

        return () => clearTimeout(timer);
    }, [isScreenMode]);

    useEffect(() => {
        if (!isScreenMode || !deviceId) return;

        const unsubscribe = listenToScreenSession(deviceId, (doc) => {
            // If document exists, everything is fine.
            if (doc && !doc.forceDisconnect) {
                return;
            }

            // If document is missing or forceDisconnect is true:
            
            // 1. If it's an explicit force disconnect, act immediately.
            if (doc && doc.forceDisconnect) {
                console.log('[Session] forceDisconnect received → reset');
                onForceDisconnect();
                return;
            }

            // 2. If document is MISSING, only act if grace period is over.
            if (!doc && !isGracePeriod) {
                 console.log('[Session] Session document missing after grace period → reset');
                 onForceDisconnect();
            }
        });

        return () => unsubscribe();
    }, [deviceId, isScreenMode, isGracePeriod, onForceDisconnect]);
}