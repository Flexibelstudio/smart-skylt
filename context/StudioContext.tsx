import React, { createContext, useState, useContext, useEffect, useMemo, useCallback, useRef } from 'react';
import { Organization, DisplayScreen } from '../types';
import {
  getOrganizations,
  listenToOrganizationChanges,
  getOrganizationById,
  listenToDisplayScreenEmbedded,
  listenToPairingCodeByDeviceId,
  listenToScreenSession, // NYTT
  isOffline,
} from '../services/firebaseService';
import { useAuth } from './AuthContext';
import type firebase from 'firebase/compat/app';

type SyncStatus = 'synced' | 'syncing' | 'offline';

interface LocationContextType {
  selectedOrganization: Organization | null;
  allOrganizations: Organization[];
  selectOrganization: (organization: Organization | null) => void;
  setAllOrganizations: React.Dispatch<React.SetStateAction<Organization[]>>;
  selectedDisplayScreen: DisplayScreen | null;
  selectDisplayScreen: (screen: DisplayScreen) => void;
  // FIX: Added selectDisplayScreenById to the context type.
  selectDisplayScreenById: (screenId: string) => void;
  updateSelectedOrganization: (data: Partial<Organization>) => void;
  clearSelection: () => void;
  locationLoading: boolean;
  syncStatus: SyncStatus;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

const LOCAL_STORAGE_ORG_KEY = 'smart-skylt-selected-org';
const GLOBAL_DEVICE_KEY = 'smart-skylt-physical-screen-id';
const getLocalStorageDisplayScreenKey = (uid: string) => `smart-skylt-selected-display-screen_${uid}`;
const getLocalStoragePhysicalScreenKey = (uid: string) => `smart-skylt-physical-screen-id_${uid}`;

const readDeviceId = (uid?: string | null) => {
  const a = uid ? localStorage.getItem(getLocalStoragePhysicalScreenKey(uid)) : null;
  const b = localStorage.getItem(GLOBAL_DEVICE_KEY);
  return a || b || null;
};
const writeDeviceId = (uid: string, deviceId: string) => {
  localStorage.setItem(getLocalStoragePhysicalScreenKey(uid), deviceId);
  localStorage.setItem(GLOBAL_DEVICE_KEY, deviceId);
};
const removeDeviceId = (uid?: string | null) => {
  if (uid) localStorage.removeItem(getLocalStoragePhysicalScreenKey(uid));
  localStorage.removeItem(GLOBAL_DEVICE_KEY);
};

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isScreenMode, authLoading } = useAuth();
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [selectedDisplayScreen, setSelectedDisplayScreen] = useState<DisplayScreen | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  
  // Refs to hold the latest state without causing dependency-based re-renders of listeners.
  const allOrganizationsRef = useRef(allOrganizations);
  useEffect(() => { allOrganizationsRef.current = allOrganizations; }, [allOrganizations]);

  const selectedOrganizationRef = useRef(selectedOrganization);
  useEffect(() => { selectedOrganizationRef.current = selectedOrganization; }, [selectedOrganization]);


  const hardReset = useCallback(() => {
    console.log('[hardReset] Performing hard reset...');
    // Hård reset: Rensa först localStorage för att säkerställa att ingen gammal state finns kvar.
    try {
      removeDeviceId(currentUser?.uid);
    } catch (e) {
      console.error("Error clearing device ID from localStorage during hard reset:", e);
    } finally {
      // Tvinga fram en fullständig omladdning av sidan från roten.
      // Detta är det mest robusta sättet att säkerställa att all state och alla lyssnare rensas helt.
      // .replace() undviker att skapa en ny post i webbläsarens historik.
      window.location.replace('/');
    }
  }, [currentUser]);

  const clearSelection = useCallback(() => {
    setSelectedDisplayScreen(null);
    if (currentUser && isScreenMode) {
      localStorage.removeItem(getLocalStorageDisplayScreenKey(currentUser.uid));
      removeDeviceId(currentUser.uid);
    } else {
      removeDeviceId();
    }
  }, [currentUser, isScreenMode]);

  // Initial load
  useEffect(() => {
    const load = async () => {
      if (authLoading) return;
      setLocationLoading(true);
      try {
        const fetched = await getOrganizations();
        setAllOrganizations(fetched);

        let orgToUse: Organization | null = null;

        if (isScreenMode) {
          const storedOrg = localStorage.getItem(LOCAL_STORAGE_ORG_KEY);
          if (storedOrg) {
            const parsed = JSON.parse(storedOrg);
            orgToUse = fetched.find(o => o.id === parsed.id) || null;
          } else if (fetched.length > 0) {
            orgToUse = fetched[0];
          }

          if (orgToUse) {
            const deviceId = readDeviceId(currentUser?.uid);
            if (deviceId) {
              const still = orgToUse.physicalScreens?.some(ps => ps.id === deviceId);
              if (!still) {
                console.log('[Init] Skärm är frånkopplad. Hård reset.');
                hardReset();
                setSelectedOrganization(orgToUse);
                setLocationLoading(false);
                return;
              }
            }
            setSelectedOrganization(orgToUse);

            if (currentUser) {
              const key = getLocalStorageDisplayScreenKey(currentUser.uid);
              const stored = localStorage.getItem(key);
              if (stored) {
                const parsed = JSON.parse(stored);
                const matching = orgToUse.displayScreens?.find(s => s.id === parsed.id) || null;
                if (matching) setSelectedDisplayScreen(matching);
                else localStorage.removeItem(key);
              }
            }
          }
        } else {
          // For admin/owner, DON'T pre-select an organization here.
          // The AuthenticatedApp component will handle this logic based on userData.
          // We just ensure the display screen is cleared.
          setSelectedDisplayScreen(null);
        }
      } catch (e) {
        console.error('Failed to load initial data', e);
      } finally {
        setLocationLoading(false);
      }
    };
    load();
  }, [authLoading, currentUser, isScreenMode, hardReset]);

  // Org realtid
  useEffect(() => {
    if (authLoading || !selectedOrganization?.id) return;

    const unsub = listenToOrganizationChanges(selectedOrganization.id, (snapshot: firebase.firestore.DocumentSnapshot) => {
      const updated = snapshot.data() as Organization;
      const hasPendingWrites = snapshot.metadata.hasPendingWrites;

      if (isOffline) {
          setSyncStatus('offline');
      } else if (hasPendingWrites) {
          setSyncStatus('syncing');
      } else {
          setSyncStatus('synced');
      }
      console.log(`[Sync Status] changed to: ${isOffline ? 'offline' : hasPendingWrites ? 'syncing' : 'synced'}`);

      console.log('Real-time update received for organization:', updated.name);

      setSelectedOrganization(updated);
      setAllOrganizations(prev => prev.map(o => (o.id === updated.id ? updated : o)));
    });

    return () => unsub();
  }, [selectedOrganization?.id, authLoading]);

  // Skärm realtid
  useEffect(() => {
    if (!selectedOrganization?.id || !selectedDisplayScreen?.id) return;
    const orgId = selectedOrganization.id;
    const screenId = selectedDisplayScreen.id;

    const unsub = listenToDisplayScreenEmbedded(orgId, screenId, (screen) => {
      if (!screen) {
        console.log(`[Screen] Skärmen ${screenId} togs bort. Reset.`);
        clearSelection();
        return;
      }
      setSelectedDisplayScreen(screen);
    });

    return () => unsub();
  }, [selectedOrganization?.id, selectedDisplayScreen?.id, clearSelection]);

  // PairingCode via deviceId (fallback/bekräftelse)
  useEffect(() => {
    if (!isScreenMode) return;
    const deviceId = readDeviceId(currentUser?.uid);
    if (!deviceId) return;

    const unsub = listenToPairingCodeByDeviceId(deviceId, (codeDoc) => {
      if (!codeDoc || codeDoc.status !== 'paired' || !codeDoc.organizationId || !codeDoc.assignedDisplayScreenId) {
        // This might fire briefly during unpairing. The org listener should catch it first.
        // If it fires later, it's a good safety net.
        // We rely on the screenSession listener as the primary kill switch now.
        return;
      }
      // Pekar pairing till annan skärm/org?
      const { organizationId, assignedDisplayScreenId } = codeDoc;
      
      const currentSelectedOrg = selectedOrganizationRef.current;
      const currentAllOrgs = allOrganizationsRef.current;

      if (!currentSelectedOrg || currentSelectedOrg.id !== organizationId) {
          const target = currentAllOrgs.find(o => o.id === organizationId);
          if (target) {
            localStorage.setItem(LOCAL_STORAGE_ORG_KEY, JSON.stringify({ id: target.id, name: target.name }));
            setSelectedOrganization(target);
          }
      }
      
      const orgForScreenLookup = allOrganizationsRef.current.find(o => o.id === organizationId);

      if (orgForScreenLookup) {
        const scr = orgForScreenLookup.displayScreens?.find(s => s.id === assignedDisplayScreenId);
        if (scr) {
          setSelectedDisplayScreen(scr);
          if (isScreenMode && currentUser) {
            localStorage.setItem(getLocalStorageDisplayScreenKey(currentUser.uid), JSON.stringify(scr));
          }
        }
      }
    });

    return () => unsub();
  }, [isScreenMode, currentUser]); // Dependencies are stable now

  // NYTT: Session-lyssnare (en doc per deviceId) - fungerar nu som PRIMARY kill-switch
  useEffect(() => {
    if (!isScreenMode) return;
    const deviceId = readDeviceId(currentUser?.uid);
    if (!deviceId) return;

    const unsub = listenToScreenSession(deviceId, (doc) => {
      if (!doc || doc.forceDisconnect) {
        console.log('[Session] Dokument raderat eller forceDisconnect satt → reset');
        hardReset();
        return;
      }
    });

    return () => unsub();
  }, [isScreenMode, currentUser, hardReset]);

  // Hjärt-slag (sista skyddsnät)
  useEffect(() => {
    if (!isScreenMode || !currentUser) return;
    const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;

    const tick = async () => {
      const deviceId = readDeviceId(currentUser.uid);
      const storedOrgJSON = localStorage.getItem(LOCAL_STORAGE_ORG_KEY);
      const organizationId = storedOrgJSON ? JSON.parse(storedOrgJSON).id : null;
      if (deviceId && organizationId) {
        try {
          const currentOrg = await getOrganizationById(organizationId);
          if (currentOrg) {
            const still = currentOrg.physicalScreens?.some(ps => ps.id === deviceId);
            if (!still) {
              console.log('[Heartbeat] Frånkopplad → reset');
              hardReset();
            }
          }
        } catch (e) {
          console.error('[Heartbeat] Fel:', e);
        }
      }
    };

    const id = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isScreenMode, currentUser, hardReset]);

  // Actions
  const selectOrganization = useCallback((organization: Organization | null) => {
    setSelectedOrganization(organization);
    if (organization) {
      localStorage.setItem(LOCAL_STORAGE_ORG_KEY, JSON.stringify({ id: organization.id, name: organization.name }));
      if (isScreenMode && currentUser) {
        localStorage.removeItem(getLocalStorageDisplayScreenKey(currentUser.uid));
        removeDeviceId(currentUser.uid);
      } else {
        removeDeviceId();
      }
      setSelectedDisplayScreen(null);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_ORG_KEY);
      setSelectedDisplayScreen(null);
    }
  }, [currentUser, isScreenMode]);

  const selectDisplayScreen = useCallback((screen: DisplayScreen) => {
    setSelectedDisplayScreen(screen);
    if (currentUser && isScreenMode) {
      localStorage.setItem(getLocalStorageDisplayScreenKey(currentUser.uid), JSON.stringify(screen));
    }
  }, [currentUser, isScreenMode]);

  // FIX: Implemented selectDisplayScreenById to handle screen selection in embed mode.
  const selectDisplayScreenById = useCallback((screenId: string) => {
    const org = selectedOrganizationRef.current;
    if (org) {
        const screen = org.displayScreens?.find(s => s.id === screenId);
        if (screen) {
            setSelectedDisplayScreen(screen);
        }
    }
  }, []);
  
  const updateSelectedOrganization = useCallback((data: Partial<Organization>) => {
    if (selectedOrganization) {
        const updatedOrg = { ...selectedOrganization, ...data };
        setSelectedOrganization(updatedOrg);
        setAllOrganizations(prev => prev.map(o => (o.id === updatedOrg.id ? updatedOrg : o)));
    }
  }, [selectedOrganization]);

  const value = useMemo(() => ({
    selectedOrganization,
    allOrganizations,
    selectOrganization,
    setAllOrganizations,
    selectedDisplayScreen,
    selectDisplayScreen,
    selectDisplayScreenById,
    updateSelectedOrganization,
    clearSelection,
    locationLoading,
    syncStatus,
  }), [
    selectedOrganization,
    allOrganizations,
    selectOrganization,
    selectedDisplayScreen,
    selectDisplayScreen,
    selectDisplayScreenById,
    updateSelectedOrganization,
    clearSelection,
    locationLoading,
    syncStatus,
    setAllOrganizations
  ]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

export const useLocation = (): LocationContextType => {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within a LocationProvider');
  return ctx;
};