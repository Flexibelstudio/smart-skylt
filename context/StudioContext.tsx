import React, { createContext, useState, useContext, useEffect, useMemo, useCallback, useRef } from 'react';
import { Organization, DisplayScreen } from '../types';
import {
  getOrganizations,
  listenToOrganizationChanges,
  getOrganizationById,
  listenToPairingCodeByDeviceId,
  listenToScreenSession, // NYTT
  isOffline,
  listenToDisplayScreens,
  addDisplayScreen as fbAddDisplayScreen,
  updateDisplayScreen as fbUpdateDisplayScreen,
  deleteDisplayScreen as fbDeleteDisplayScreen,
} from '../services/firebaseService';
import { useAuth } from './AuthContext';
import type firebase from 'firebase/compat/app';

type SyncStatus = 'synced' | 'syncing' | 'offline';

interface LocationContextType {
  selectedOrganization: Organization | null;
  allOrganizations: Organization[];
  selectOrganization: (organization: Organization | null) => void;
  setAllOrganizations: React.Dispatch<React.SetStateAction<Organization[]>>;
  
  displayScreens: DisplayScreen[];
  selectedDisplayScreen: DisplayScreen | null;
  selectDisplayScreen: (screen: DisplayScreen) => void;
  selectDisplayScreenById: (screenId: string) => void;
  
  addDisplayScreen: (newScreen: Omit<DisplayScreen, 'id'>) => Promise<void>;
  updateDisplayScreen: (screenId: string, data: Partial<DisplayScreen>) => Promise<void>;
  deleteDisplayScreen: (screenId: string) => Promise<void>;

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
  const [screensFromSubcollection, setScreensFromSubcollection] = useState<DisplayScreen[]>([]);
  const [selectedDisplayScreen, setSelectedDisplayScreen] = useState<DisplayScreen | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  
  // Refs to hold the latest state without causing dependency-based re-renders of listeners.
  const allOrganizationsRef = useRef(allOrganizations);
  useEffect(() => { allOrganizationsRef.current = allOrganizations; }, [allOrganizations]);

  const selectedOrganizationRef = useRef(selectedOrganization);
  useEffect(() => { selectedOrganizationRef.current = selectedOrganization; }, [selectedOrganization]);

  // Merge screens from old array and new subcollection
  const displayScreens = useMemo(() => {
    const fromArray = selectedOrganization?.displayScreens || [];
    const byId = new Map<string, DisplayScreen>();
    
    // Add screens from the old array first
    fromArray.forEach(s => { if (s?.id) byId.set(s.id, s); });
    // Then, overwrite/add screens from the new subcollection. This gives subcollection priority.
    screensFromSubcollection.forEach(s => { if (s?.id) byId.set(s.id, s); });

    return Array.from(byId.values());
  }, [selectedOrganization, screensFromSubcollection]);


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

            // Screen selection is now handled by listeners
          }
        } else {
          // For admin/owner, DON'T pre-select an organization here.
          // The AuthenticatedApp component will handle this logic based on userData.
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

  // Org & Screen realtid listeners
  useEffect(() => {
    if (authLoading || !selectedOrganization?.id) {
        setScreensFromSubcollection([]);
        return;
    };

    const unsubOrg = listenToOrganizationChanges(selectedOrganization.id, (snapshot: firebase.firestore.DocumentSnapshot) => {
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

    const unsubScreens = listenToDisplayScreens(selectedOrganization.id, (screens) => {
        setScreensFromSubcollection(screens);
        // If a screen is selected, make sure its data is kept up-to-date
        setSelectedDisplayScreen(prevScreen => {
            if (!prevScreen) return null;
            const updatedScreen = screens.find(s => s.id === prevScreen.id);
            return updatedScreen || null; // If deleted, it will become null
        });
    });

    return () => {
        unsubOrg();
        unsubScreens();
    };
  }, [selectedOrganization?.id, authLoading]);


  // PairingCode via deviceId (fallback/bekräftelse)
  useEffect(() => {
    if (!isScreenMode) return;
    const deviceId = readDeviceId(currentUser?.uid);
    if (!deviceId) return;

    const unsub = listenToPairingCodeByDeviceId(deviceId, (codeDoc) => {
      if (!codeDoc || codeDoc.status !== 'paired' || !codeDoc.organizationId || !codeDoc.assignedDisplayScreenId) {
        return;
      }
      
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
      // The screen will be selected by the main displayScreens listener once the org is set.
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

  const selectDisplayScreenById = useCallback((screenId: string) => {
    const screen = displayScreens.find(s => s.id === screenId);
    if (screen) {
        setSelectedDisplayScreen(screen);
    }
  }, [displayScreens]);
  
  const updateSelectedOrganization = useCallback((data: Partial<Organization>) => {
    if (selectedOrganization) {
        const updatedOrg = { ...selectedOrganization, ...data };
        setSelectedOrganization(updatedOrg);
        setAllOrganizations(prev => prev.map(o => (o.id === updatedOrg.id ? updatedOrg : o)));
    }
  }, [selectedOrganization]);

  // --- NEW CRUD functions for Display Screens with optimistic updates ---
    const addDisplayScreen = useCallback(async (newScreenData: Omit<DisplayScreen, 'id'>) => {
        if (!selectedOrganization) throw new Error("No organization selected.");
        const newScreen = { ...newScreenData, id: `screen-${Date.now()}` };
        
        setScreensFromSubcollection(prev => [...prev, newScreen]); // Optimistic update
        try {
            await fbAddDisplayScreen(selectedOrganization.id, newScreen);
        } catch (e) {
            console.error("Failed to add screen, rolling back", e);
            setScreensFromSubcollection(prev => prev.filter(s => s.id !== newScreen.id));
            throw e;
        }
    }, [selectedOrganization]);

    const updateDisplayScreen = useCallback(async (screenId: string, data: Partial<DisplayScreen>) => {
        if (!selectedOrganization) throw new Error("No organization selected.");
        
        const originalScreens = screensFromSubcollection;
        const updatedScreens = originalScreens.map(s => s.id === screenId ? { ...s, ...data } : s);
        setScreensFromSubcollection(updatedScreens); // Optimistic update
        
        try {
            await fbUpdateDisplayScreen(selectedOrganization.id, screenId, data);
        } catch(e) {
            console.error("Failed to update screen, rolling back", e);
            setScreensFromSubcollection(originalScreens);
            throw e;
        }
    }, [selectedOrganization, screensFromSubcollection]);

    const deleteDisplayScreen = useCallback(async (screenId: string) => {
        if (!selectedOrganization) throw new Error("No organization selected.");
        
        const originalScreens = screensFromSubcollection;
        setScreensFromSubcollection(prev => prev.filter(s => s.id !== screenId)); // Optimistic update
        try {
            await fbDeleteDisplayScreen(selectedOrganization.id, screenId);
        } catch (e) {
            console.error("Failed to delete screen, rolling back", e);
            setScreensFromSubcollection(originalScreens);
            throw e;
        }
    }, [selectedOrganization, screensFromSubcollection]);

  const value = useMemo(() => ({
    selectedOrganization,
    allOrganizations,
    selectOrganization,
    setAllOrganizations,
    displayScreens,
    selectedDisplayScreen,
    selectDisplayScreen,
    selectDisplayScreenById,
    addDisplayScreen,
    updateDisplayScreen,
    deleteDisplayScreen,
    updateSelectedOrganization,
    clearSelection,
    locationLoading,
    syncStatus,
  }), [
    selectedOrganization,
    allOrganizations,
    selectOrganization,
    displayScreens,
    selectedDisplayScreen,
    selectDisplayScreen,
    selectDisplayScreenById,
    addDisplayScreen,
    updateDisplayScreen,
    deleteDisplayScreen,
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