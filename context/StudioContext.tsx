
import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  ReactNode,
  useMemo
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Organization, DisplayScreen } from '../types';
import {
  addDisplayScreen as fbAddDisplayScreen,
  updateDisplayScreen as fbUpdateDisplayScreen,
  deleteDisplayScreen as fbDeleteDisplayScreen,
  updateOrganization as fbUpdateOrganization,
  getOrganizationById,
  isOffline
} from '../services/firebaseService';
import { useAuth } from './AuthContext';
import { 
  useAllOrganizations, 
  useOrganizationDetails, 
  useOrganizationScreens, 
  usePairingCodeListener, 
  useScreenSessionListener 
} from '../hooks/useRealtimeData';

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

// --- Persistence keys / helpers ---
const LOCAL_STORAGE_ORG_KEY = 'smart-skylt-selected-org';
const GLOBAL_DEVICE_KEY = 'smart-skylt-physical-screen-id';
const getLocalStorageDisplayScreenKey = (uid: string) => `smart-skylt-selected-display-screen_${uid}`;
const getLocalStoragePhysicalScreenKey = (uid: string) => `smart-skylt-physical-screen-id_${uid}`;

const readDeviceId = (uid?: string | null) => {
  const a = uid ? localStorage.getItem(getLocalStoragePhysicalScreenKey(uid)) : null;
  const b = localStorage.getItem(GLOBAL_DEVICE_KEY);
  return a || b || null;
};

const removeDeviceId = (uid?: string | null) => {
  if (uid) localStorage.removeItem(getLocalStoragePhysicalScreenKey(uid));
  localStorage.removeItem(GLOBAL_DEVICE_KEY);
};

export const LocationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser, isScreenMode, authLoading } = useAuth();
  const queryClient = useQueryClient();

  // 1. Fetch All Organizations (Initial List)
  const { data: allOrganizations = [], isLoading: orgsLoading } = useAllOrganizations(!authLoading);

  // 2. Manage Selected Organization ID
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  
  // 2b. Immediate Org State (Optimistic) - Fixes "Double Click" issue
  // Stores the full object immediately when clicked, serving as a fallback while the hook loads.
  const [immediateOrg, setImmediateOrg] = useState<Organization | null>(null);

  // 3. Fetch Selected Organization Details (Realtime via Hook)
  const { data: fetchedOrg, isLoading: detailsLoading } = useOrganizationDetails(selectedOrgId || undefined);

  // Derived Selected Organization: Prefer the live hook data, fall back to immediate local state if ID matches.
  const selectedOrganization = useMemo(() => {
      if (fetchedOrg) return fetchedOrg;
      if (immediateOrg && immediateOrg.id === selectedOrgId) return immediateOrg;
      return null;
  }, [fetchedOrg, immediateOrg, selectedOrgId]);

  // 4. Fetch Screens for Selected Organization (Realtime via Hook)
  const { data: displayScreens = [], isLoading: screensLoading } = useOrganizationScreens(selectedOrgId || undefined);

  // 5. Manage Selected Display Screen (Local State)
  const [selectedDisplayScreen, setSelectedDisplayScreen] = useState<DisplayScreen | null>(null);

  // Combined Loading State
  const locationLoading = orgsLoading || (!!selectedOrgId && (detailsLoading || screensLoading) && !selectedOrganization);

  // Update selectedDisplayScreen when data changes in the list
  useEffect(() => {
      if (selectedDisplayScreen) {
          const updated = displayScreens.find(s => s.id === selectedDisplayScreen.id);
          if (updated && JSON.stringify(updated) !== JSON.stringify(selectedDisplayScreen)) {
              setSelectedDisplayScreen(updated);
          }
      }
  }, [displayScreens, selectedDisplayScreen]);


  // --- Actions ---

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
    setSelectedOrgId(null);
    setImmediateOrg(null);
    if (currentUser && isScreenMode) {
      localStorage.removeItem(getLocalStorageDisplayScreenKey(currentUser.uid));
      removeDeviceId(currentUser.uid);
    } else {
      removeDeviceId();
    }
  }, [currentUser, isScreenMode]);

  const selectOrganization = useCallback((organization: Organization | null) => {
      if (organization) {
        // Pre-seed the React Query cache
        queryClient.setQueryData(['organization', organization.id], organization);
        
        // Set immediate state to allow synchronous UI updates (prevents flicker/double-click need)
        setImmediateOrg(organization);
        setSelectedOrgId(organization.id);
        
        localStorage.setItem(LOCAL_STORAGE_ORG_KEY, JSON.stringify({ id: organization.id, name: organization.name }));
        
        if (isScreenMode && currentUser) {
            localStorage.removeItem(getLocalStorageDisplayScreenKey(currentUser.uid));
            removeDeviceId(currentUser.uid);
        } else {
            removeDeviceId();
        }
        setSelectedDisplayScreen(null);
      } else {
          setSelectedOrgId(null);
          setImmediateOrg(null);
          localStorage.removeItem(LOCAL_STORAGE_ORG_KEY);
          setSelectedDisplayScreen(null);
      }
  }, [currentUser, isScreenMode, queryClient]);

  const selectDisplayScreen = useCallback((screen: DisplayScreen | null) => {
    setSelectedDisplayScreen(screen);
    if (screen && currentUser && isScreenMode) {
      localStorage.setItem(getLocalStorageDisplayScreenKey(currentUser.uid), JSON.stringify(screen));
    }
  }, [currentUser, isScreenMode]);

  const selectDisplayScreenById = useCallback((screenId: string | null) => {
      if (!screenId) {
          setSelectedDisplayScreen(null);
          return;
      }
      const screen = displayScreens.find(s => s.id === screenId);
      if (screen) setSelectedDisplayScreen(screen);
  }, [displayScreens]);

  const updateSelectedOrganization = useCallback(async (data: Partial<Organization>) => {
      if (selectedOrgId) {
          // We now rely on the hook to update the local state after the firebase write
          await fbUpdateOrganization(selectedOrgId, data);
      }
  }, [selectedOrgId]);


  // --- Screen Mode Specific Logic ---
  
  // 1. Initial Load / Restoration
  useEffect(() => {
      if (!authLoading && isScreenMode && !selectedOrgId) {
          const storedOrg = localStorage.getItem(LOCAL_STORAGE_ORG_KEY);
          if (storedOrg) {
              try {
                  const parsed = JSON.parse(storedOrg);
                  if (parsed.id) setSelectedOrgId(parsed.id);
              } catch (e) { console.error("Failed to parse stored org", e); }
          } else if (allOrganizations.length > 0) {
              // Auto-select first if nothing stored (fallback)
             setSelectedOrgId(allOrganizations[0].id);
          }
      }
  }, [authLoading, isScreenMode, selectedOrgId, allOrganizations]);

  // 2. Pairing Logic
  const deviceId = currentUser ? readDeviceId(currentUser.uid) : null;
  const pairingData = usePairingCodeListener(deviceId, isScreenMode);

  useEffect(() => {
      if (pairingData && pairingData.status === 'paired' && pairingData.organizationId) {
          if (selectedOrgId !== pairingData.organizationId) {
             // If the paired org is different, select it.
             // The hook will then take over loading the details.
             setSelectedOrgId(pairingData.organizationId);
          }
      }
  }, [pairingData, selectedOrgId]);

  // 3. Session Listener (Kill Switch)
  useScreenSessionListener(deviceId, isScreenMode, hardReset);


  // --- CRUD Helpers ---
  const addDisplayScreen = useCallback(async (newScreenData: Omit<DisplayScreen, 'id'>) => {
      if (!selectedOrgId) throw new Error('No organization selected.');
      const newScreen: DisplayScreen = { ...newScreenData, id: `screen-${Date.now()}` };
      // No optimistic update needed here for the list, the realtime listener hook will handle it
      await fbAddDisplayScreen(selectedOrgId, newScreen);
  }, [selectedOrgId]);

  const updateDisplayScreen = useCallback(async (screenId: string, data: Partial<DisplayScreen>) => {
      if (!selectedOrgId) throw new Error('No organization selected.');
      await fbUpdateDisplayScreen(selectedOrgId, screenId, data);
  }, [selectedOrgId]);

  const deleteDisplayScreen = useCallback(async (screenId: string) => {
      if (!selectedOrgId) throw new Error('No organization selected.');
      await fbDeleteDisplayScreen(selectedOrgId, screenId);
  }, [selectedOrgId]);


  const value = {
    selectedOrganization: selectedOrganization || null,
    allOrganizations,
    selectOrganization,
    setAllOrganizations: () => { console.warn("setAllOrganizations deprecated in React Query mode"); },

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
    syncStatus: (isOffline ? 'offline' : 'synced') as SyncStatus // Simplified for now
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

export const useLocation = (): LocationContextType => {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within a LocationProvider');
  return ctx;
};
