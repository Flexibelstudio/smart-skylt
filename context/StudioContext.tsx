// context/StudioContext.tsx
import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { Organization, DisplayScreen } from '../types';
import {
  getOrganizations,
  listenToOrganizationChanges,
  getOrganizationById,
  listenToPairingCodeByDeviceId,
  listenToScreenSession,
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
  selectDisplayScreen: (screen: DisplayScreen | null) => void;
  selectDisplayScreenById: (screenId: string | null) => void;

  addDisplayScreen: (newScreen: Omit<DisplayScreen, 'id'>) => Promise<void>;
  updateDisplayScreen: (screenId: string, data: Partial<DisplayScreen>) => Promise<void>;
  deleteDisplayScreen: (screenId: string) => Promise<void>;

  updateSelectedOrganization: (data: Partial<Organization>) => void;
  clearSelection: () => void;
  locationLoading: boolean;
  syncStatus: SyncStatus;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

// --- Persistence keys / helpers (återinförda för skärmläge & “remember selection”) ---
const LOCAL_STORAGE_ORG_KEY = 'smart-skylt-selected-org';
const GLOBAL_DEVICE_KEY = 'smart-skylt-physical-screen-id';
const getLocalStorageDisplayScreenKey = (uid: string) =>
  `smart-skylt-selected-display-screen_${uid}`;
const getLocalStoragePhysicalScreenKey = (uid: string) =>
  `smart-skylt-physical-screen-id_${uid}`;

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

export const LocationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Viktigt: vi använder currentUser/isScreenMode/authLoading (inte userData) för att få skärmlägesbeteende.
  const { currentUser, isScreenMode, authLoading } = useAuth();

  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);

  // Vi lyssnar på subcollection och slår ihop med ev. äldre arrayfält
  const [screensFromSubcollection, setScreensFromSubcollection] = useState<DisplayScreen[]>([]);
  const [selectedDisplayScreen, setSelectedDisplayScreen] = useState<DisplayScreen | null>(null);

  const [locationLoading, setLocationLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(isOffline ? 'offline' : 'synced');

  // Refs för att undvika stale closures i realtidslyssnare
  const allOrganizationsRef = useRef(allOrganizations);
  useEffect(() => {
    allOrganizationsRef.current = allOrganizations;
  }, [allOrganizations]);

  const selectedOrganizationRef = useRef(selectedOrganization);
  useEffect(() => {
    selectedOrganizationRef.current = selectedOrganization;
  }, [selectedOrganization]);

  // Slå ihop gamla array-baserade skärmar med subcollection (subcollection vinner)
  const displayScreens = useMemo(() => {
    const fromArray = selectedOrganization?.displayScreens || [];
    const byId = new Map<string, DisplayScreen>();
    fromArray.forEach((s) => s?.id && byId.set(s.id, s));
    screensFromSubcollection.forEach((s) => s?.id && byId.set(s.id, s));
    return Array.from(byId.values());
  }, [selectedOrganization, screensFromSubcollection]);

  // Hård reset för skärmläge (när parkoppling/session säger “koppla ner”)
  const hardReset = useCallback(() => {
    try {
      removeDeviceId(currentUser?.uid);
    } catch (e) {
      console.error('[hardReset] Failed to clear device ID:', e);
    } finally {
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
          // Skärmläge: försök återuppta tidigare org
          const storedOrg = localStorage.getItem(LOCAL_STORAGE_ORG_KEY);
          if (storedOrg) {
            const parsed = JSON.parse(storedOrg);
            orgToUse = fetched.find((o) => o.id === parsed.id) || null;
          } else if (fetched.length > 0) {
            orgToUse = fetched[0];
          }

          if (orgToUse) {
            const deviceId = readDeviceId(currentUser?.uid);
            if (deviceId) {
              const still = orgToUse.physicalScreens?.some((ps) => ps.id === deviceId);
              if (!still) {
                console.log('[Init] Skärm frånkopplad → hardReset');
                hardReset();
                setSelectedOrganization(orgToUse);
                setLocationLoading(false);
                return;
              }
            }
            setSelectedOrganization(orgToUse);
          }
        } else {
          // Admin/ägare: välj inte auto här – UI hanterar
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

  // Realtidslyssnare för org & skärmar
  useEffect(() => {
    if (authLoading || !selectedOrganization?.id) {
      setScreensFromSubcollection([]);
      return;
    }

    const unsubOrg = listenToOrganizationChanges(
      selectedOrganization.id,
      (snapshot: firebase.firestore.DocumentSnapshot) => {
        const updated = snapshot.data() as Organization;
        const hasPendingWrites = snapshot.metadata.hasPendingWrites;

        if (isOffline) setSyncStatus('offline');
        else if (hasPendingWrites) setSyncStatus('syncing');
        else setSyncStatus('synced');

        setSelectedOrganization(updated);
        setAllOrganizations((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      }
    );

    const unsubScreens = listenToDisplayScreens(selectedOrganization.id, (screens) => {
      setScreensFromSubcollection(screens);
      setSelectedDisplayScreen((prev) => {
        if (!prev) return null;
        const updated = screens.find((s) => s.id === prev.id);
        return updated || null;
      });
    });

    return () => {
      unsubOrg();
      unsubScreens();
    };
  }, [selectedOrganization?.id, authLoading]);

  // Pairing Code via deviceId (skärmläge)
  useEffect(() => {
    if (!isScreenMode) return;
    const deviceId = readDeviceId(currentUser?.uid);
    if (!deviceId) return;

    const unsub = listenToPairingCodeByDeviceId(deviceId, (codeDoc) => {
      if (
        !codeDoc ||
        codeDoc.status !== 'paired' ||
        !codeDoc.organizationId ||
        !codeDoc.assignedDisplayScreenId
      ) {
        return;
      }

      const { organizationId } = codeDoc;
      const currentSelectedOrg = selectedOrganizationRef.current;
      const currentAllOrgs = allOrganizationsRef.current;

      if (!currentSelectedOrg || currentSelectedOrg.id !== organizationId) {
        const target = currentAllOrgs.find((o) => o.id === organizationId);
        if (target) {
          localStorage.setItem(
            LOCAL_STORAGE_ORG_KEY,
            JSON.stringify({ id: target.id, name: target.name })
          );
          setSelectedOrganization(target);
        }
      }
      // Själva skärmen väljs av displayScreens-lyssnaren.
    });

    return () => unsub();
  }, [isScreenMode, currentUser]);

  // Session-lyssnare (PRIMARY kill-switch för skärmläge)
  useEffect(() => {
    if (!isScreenMode) return;
    const deviceId = readDeviceId(currentUser?.uid);
    if (!deviceId) return;

    const unsub = listenToScreenSession(deviceId, (doc) => {
      if (!doc || doc.forceDisconnect) {
        console.log('[Session] forceDisconnect eller saknas → reset');
        hardReset();
        return;
      }
    });

    return () => unsub();
  }, [isScreenMode, currentUser, hardReset]);

  // Heartbeat (sista skyddsnät)
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
            const still = currentOrg.physicalScreens?.some((ps) => ps.id === deviceId);
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

  // --- Actions ---
  const selectOrganization = useCallback(
    (organization: Organization | null) => {
      setSelectedOrganization(organization);
      if (organization) {
        localStorage.setItem(
          LOCAL_STORAGE_ORG_KEY,
          JSON.stringify({ id: organization.id, name: organization.name })
        );
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
    },
    [currentUser, isScreenMode]
  );

  const selectDisplayScreen = useCallback(
    (screen: DisplayScreen | null) => {
      setSelectedDisplayScreen(screen);
      if (screen && currentUser && isScreenMode) {
        localStorage.setItem(getLocalStorageDisplayScreenKey(currentUser.uid), JSON.stringify(screen));
      }
    },
    [currentUser, isScreenMode]
  );

  const selectDisplayScreenById = useCallback(
    (screenId: string | null) => {
      if (!screenId) {
        setSelectedDisplayScreen(null);
        return;
      }
      const screen = displayScreens.find((s) => s.id === screenId);
      if (screen) setSelectedDisplayScreen(screen);
    },
    [displayScreens]
  );

  const updateSelectedOrganization = useCallback(
    (data: Partial<Organization>) => {
      if (selectedOrganization) {
        const updatedOrg = { ...selectedOrganization, ...data };
        setSelectedOrganization(updatedOrg);
        setAllOrganizations((prev) => prev.map((o) => (o.id === updatedOrg.id ? updatedOrg : o)));
      }
    },
    [selectedOrganization]
  );

  // Hjälpare för att sätta syncStatus runt asynka serveranrop (din preview-fix)
  const withSyncStatus = useCallback(
    async <T extends any[]>(fn: (...args: T) => Promise<any>, ...args: T) => {
      if (!selectedOrganization) throw new Error('No organization selected');
      if (isOffline) {
        console.warn(`OFFLINE MODE: "${fn.name}" was not sent to server.`);
        return;
      }
      setSyncStatus('syncing');
      try {
        await fn(...args);
        setTimeout(() => setSyncStatus('synced'), 1000);
      } catch (e) {
        setSyncStatus('offline');
        console.error('Operation failed', e);
        throw e;
      }
    },
    [selectedOrganization]
  );

  // CRUD för DisplayScreen (optimistiska uppdateringar)
  const addDisplayScreen = useCallback(
    async (newScreenData: Omit<DisplayScreen, 'id'>) => {
      if (!selectedOrganization) throw new Error('No organization selected.');
      // Om servern normalt sätter id – skicka utan id. Om inte, behåll enkel klient-id:
      const newScreen: DisplayScreen = { ...newScreenData, id: `screen-${Date.now()}` };
      setScreensFromSubcollection((prev) => [...prev, newScreen]); // optimistic
      try {
        await withSyncStatus(fbAddDisplayScreen, selectedOrganization.id, newScreen);
      } catch (e) {
        setScreensFromSubcollection((prev) => prev.filter((s) => s.id !== newScreen.id));
        throw e;
      }
    },
    [selectedOrganization, withSyncStatus]
  );

  const updateDisplayScreen = useCallback(
    async (screenId: string, data: Partial<DisplayScreen>) => {
      if (!selectedOrganization) throw new Error('No organization selected.');
      const original = screensFromSubcollection;
      const updated = original.map((s) => (s.id === screenId ? { ...s, ...data } : s));
      setScreensFromSubcollection(updated); // optimistic
      try {
        await withSyncStatus(fbUpdateDisplayScreen, selectedOrganization.id, screenId, data);
      } catch (e) {
        setScreensFromSubcollection(original);
        throw e;
      }
    },
    [selectedOrganization, screensFromSubcollection, withSyncStatus]
  );

  const deleteDisplayScreen = useCallback(
    async (screenId: string) => {
      if (!selectedOrganization) throw new Error('No organization selected.');
      const original = screensFromSubcollection;
      setScreensFromSubcollection((prev) => prev.filter((s) => s.id !== screenId)); // optimistic
      try {
        await withSyncStatus(fbDeleteDisplayScreen, selectedOrganization.id, screenId);
      } catch (e) {
        setScreensFromSubcollection(original);
        throw e;
      }
    },
    [selectedOrganization, screensFromSubcollection, withSyncStatus]
  );

  const value = useMemo(
    () => ({
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
    }),
    [
      selectedOrganization,
      allOrganizations,
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
    ]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

export const useLocation = (): LocationContextType => {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within a LocationProvider');
  return ctx;
};
