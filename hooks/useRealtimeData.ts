
import { useEffect, useState } from 'react';
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
  const [hasReceivedSnapshot, setHasReceivedSnapshot] = useState(false);

  const queryResult = useQuery({
    queryKey: ['screens', orgId],
    queryFn: () => Promise.resolve([] as DisplayScreen[]),
    enabled: !!orgId,
  });

  useEffect(() => {
    if (!orgId) return;
    setHasReceivedSnapshot(false);
    const unsubscribe = listenToDisplayScreens(orgId, (screens) => {
      queryClient.setQueryData(['screens', orgId], screens);
      setHasReceivedSnapshot(true);
    });

    return () => unsubscribe();
  }, [orgId, queryClient]);

  return { ...queryResult, hasReceivedSnapshot };
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

        // Note: We deliberately removed the "connection timeout" kill switch that was here previously.
        // A screen should NEVER disconnect itself just because the network is flaky.
        // It should only disconnect if the server explicitly tells it to (via document deletion).

        const unsubscribe = listenToScreenSession(deviceId, (doc) => {
            // If doc is undefined, it means network error or loading. Do nothing (keep playing).
            if (doc === undefined) {
                return;
            }

            // If doc is null, it means the session document was DELETED from the database.
            // This happens when the admin clicks "Koppla från". This is the only time we reset.
            if (doc === null) {
                console.log('[Session] Session document deleted by admin. Resetting.');
                onForceDisconnect();
                return;
            }

            // Check for explicit kill command inside the document
            if (doc.forceDisconnect) {
                console.log('[Session] Force disconnect signal received.');
                onForceDisconnect();
                return;
            }
        });

        return () => {
            unsubscribe();
        };
    }, [deviceId, isScreenMode, onForceDisconnect]);
}
