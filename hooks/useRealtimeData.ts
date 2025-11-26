import { useEffect } from 'react';
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

  // Return both data and loading state
  return { 
    data: queryResult.data, 
    isLoading: queryResult.isLoading && queryResult.fetchStatus !== 'idle' 
  };
}

// --- Session ---

export function useScreenSessionListener(deviceId: string | null, isScreenMode: boolean, onForceDisconnect: () => void) {
    useEffect(() => {
        if (!isScreenMode || !deviceId) return;

        let gracePeriodActive = true;
        let currentDoc: any = undefined; // undefined = haven't heard from DB yet

        // Check if we should disconnect based on current state
        const checkDisconnect = () => {
            // 1. If we have a doc and it explicitly says disconnect
            if (currentDoc && currentDoc.forceDisconnect) {
                console.log('[Session] Force disconnect signal received.');
                onForceDisconnect();
                return;
            }
            
            // 2. If we have received data (currentDoc is null or object), 
            // but it is null (missing), AND grace period is over.
            if (currentDoc === null && !gracePeriodActive) {
                console.log('[Session] Session missing after grace period. Resetting.');
                onForceDisconnect();
            }
        };

        // Give the system 30 seconds to sync permissions/data before killing the session
        const graceTimer = setTimeout(() => {
            console.log('[Session] Grace period ended.');
            gracePeriodActive = false;
            checkDisconnect();
        }, 30000);

        const unsubscribe = listenToScreenSession(deviceId, (doc) => {
            currentDoc = doc;
            // If doc is missing, we only log for now if grace period is active
            if (!doc && gracePeriodActive) {
                console.log('[Session] Session document missing, waiting (grace period active)...');
            }
            checkDisconnect();
        });

        return () => {
            clearTimeout(graceTimer);
            unsubscribe();
        };
    }, [deviceId, isScreenMode, onForceDisconnect]);
}