import React, { createContext, useState, useContext, useEffect, useMemo, useCallback } from 'react';
import { Organization, DisplayScreen } from '../types';
import { getOrganizations, listenToOrganizationChanges, getOrganizationById } from '../services/firebaseService';
import { useAuth } from './AuthContext'; // Import useAuth

interface LocationContextType {
    selectedOrganization: Organization | null;
    allOrganizations: Organization[];
    selectOrganization: (organization: Organization | null) => void;
    setAllOrganizations: React.Dispatch<React.SetStateAction<Organization[]>>;

    selectedDisplayScreen: DisplayScreen | null;
    selectDisplayScreen: (screen: DisplayScreen) => void;
    
    clearSelection: () => void;
    
    locationLoading: boolean;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

const LOCAL_STORAGE_ORG_KEY = 'smart-skylt-selected-org';
// Keys are now dynamic based on user ID to support multiple anonymous users on one device
const getLocalStorageDisplayScreenKey = (uid: string) => `smart-skylt-selected-display-screen_${uid}`;
const getLocalStoragePhysicalScreenKey = (uid: string) => `smart-skylt-physical-screen-id_${uid}`;


export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { currentUser, isScreenMode, authLoading } = useAuth(); // Use the auth context

    const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
    const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
    const [selectedDisplayScreen, setSelectedDisplayScreen] = useState<DisplayScreen | null>(null);
    const [locationLoading, setLocationLoading] = useState(true);

    const clearSelection = useCallback(() => {
        setSelectedDisplayScreen(null);
        if (currentUser && isScreenMode) {
            localStorage.removeItem(getLocalStorageDisplayScreenKey(currentUser.uid));
            // NEW: Clear the physical screen ID on disconnect
            localStorage.removeItem(getLocalStoragePhysicalScreenKey(currentUser.uid));
        }
    }, [currentUser, isScreenMode]);

    useEffect(() => {
        const loadInitialData = async () => {
            if (authLoading) return; // Wait for auth to be ready
            
            setLocationLoading(true);
            try {
                const fetchedOrgs = await getOrganizations();
                setAllOrganizations(fetchedOrgs);

                let orgToUse: Organization | null = null;
                
                if (isScreenMode) { // Anonymous screen user
                    const storedOrgJSON = localStorage.getItem(LOCAL_STORAGE_ORG_KEY);
                     if (storedOrgJSON) {
                        const storedOrg = JSON.parse(storedOrgJSON);
                        const correspondingOrg = fetchedOrgs.find(o => o.id === storedOrg.id);
                        if (correspondingOrg) {
                            orgToUse = correspondingOrg;
                        }
                    } else if (fetchedOrgs.length > 0) {
                        orgToUse = fetchedOrgs[0];
                    }

                    if (orgToUse && currentUser) {
                        // KONTROLL VID UPPSTART: Verifiera att skärmen fortfarande är ansluten innan den visas.
                        const physicalScreenKey = getLocalStoragePhysicalScreenKey(currentUser.uid);
                        const physicalScreenId = localStorage.getItem(physicalScreenKey);

                        if (physicalScreenId) {
                            const isStillPaired = orgToUse.physicalScreens?.some(ps => ps.id === physicalScreenId);
                            if (!isStillPaired) {
                                console.log(`[Kontroll vid uppstart] Skärm ${physicalScreenId} är frånkopplad. Rensar session.`);
                                clearSelection();
                                setLocationLoading(false);
                                return; // Avbryt vidare installation, kommer att visa parkopplingsskärmen.
                            }
                        }
                        
                        setSelectedOrganization(orgToUse);
                        // Load stored Display Screen
                        const displayScreenKey = getLocalStorageDisplayScreenKey(currentUser.uid);
                        const storedDisplayScreenJSON = localStorage.getItem(displayScreenKey);
                        if(storedDisplayScreenJSON) {
                            const storedScreen = JSON.parse(storedDisplayScreenJSON);
                            const correspondingScreen = orgToUse.displayScreens?.find(s => s.id === storedScreen.id);
                            if (correspondingScreen) {
                                setSelectedDisplayScreen(correspondingScreen);
                            } else {
                                localStorage.removeItem(displayScreenKey);
                            }
                        }
                    }
                } else { // Logged-in admin/owner
                    if (fetchedOrgs.length > 0) {
                        orgToUse = fetchedOrgs[0];
                        setSelectedOrganization(orgToUse);
                        setSelectedDisplayScreen(null);
                    }
                }
            } catch (error) {
                console.error("Failed to load initial data", error);
            } finally {
                setLocationLoading(false);
            }
        };
        loadInitialData();
    }, [authLoading, currentUser, isScreenMode, clearSelection]);
    
    // REALTIDS-LYSSNARE: Kopplar från skärmen direkt om den är online.
    useEffect(() => {
        if (authLoading || !selectedOrganization?.id) {
            return; // Don't listen if not ready or no org is selected
        }
        
        const physicalScreenKey = currentUser ? getLocalStoragePhysicalScreenKey(currentUser.uid) : null;
        const physicalScreenId = physicalScreenKey ? localStorage.getItem(physicalScreenKey) : null;

        const unsubscribe = listenToOrganizationChanges(selectedOrganization.id, (updatedOrg) => {
            console.log("Real-time update received for organization:", updatedOrg.name);

            // Kontrollera om denna fysiska skärm har blivit frånkopplad.
            if (isScreenMode && physicalScreenId) {
                const isStillPaired = updatedOrg.physicalScreens?.some(ps => ps.id === physicalScreenId);
                if (!isStillPaired) {
                    console.log(`Skärm ${physicalScreenId} blev frånkopplad. Rensar session.`);
                    clearSelection(); 
                    return; 
                }
            }
            
            // Update the selected organization state
            setSelectedOrganization(updatedOrg);
            
            // Update the list of all organizations to keep it in sync
            setAllOrganizations(prevOrgs => 
                prevOrgs.map(o => o.id === updatedOrg.id ? updatedOrg : o)
            );
        });

        // Cleanup the listener when the component unmounts or the org ID changes
        return () => unsubscribe();

    }, [selectedOrganization?.id, authLoading, isScreenMode, currentUser, clearSelection, setAllOrganizations]); // Re-run when the org ID changes or auth state settles

    // PERIODISK HJÄRTSLAGS-KONTROLL: Sista skyddsnätet för skärmar som körs 24/7.
    useEffect(() => {
        if (!isScreenMode || !currentUser) {
            return;
        }

        const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000; // 10 minuter

        const heartbeatCheck = async () => {
            const physicalScreenKey = getLocalStoragePhysicalScreenKey(currentUser.uid);
            const physicalScreenId = localStorage.getItem(physicalScreenKey);

            const storedOrgJSON = localStorage.getItem(LOCAL_STORAGE_ORG_KEY);
            const organizationId = storedOrgJSON ? JSON.parse(storedOrgJSON).id : null;

            // Kör bara kontrollen om vi vet vilken skärm och organisation det gäller.
            if (physicalScreenId && organizationId) {
                try {
                    console.log(`[Hjärtslag] Kontrollerar status för skärm ${physicalScreenId}...`);
                    const currentOrg = await getOrganizationById(organizationId);
                    if (currentOrg) {
                        const isStillPaired = currentOrg.physicalScreens?.some(ps => ps.id === physicalScreenId);
                        if (!isStillPaired) {
                            console.log(`[Hjärtslag] Skärm ${physicalScreenId} är frånkopplad. Rensar session.`);
                            clearSelection();
                        }
                    }
                } catch (error) {
                    console.error("[Hjärtslag] Fel vid kontroll av skärmstatus:", error);
                }
            }
        };

        const intervalId = setInterval(heartbeatCheck, HEARTBEAT_INTERVAL_MS);

        return () => clearInterval(intervalId);

    }, [isScreenMode, currentUser, clearSelection]);

    const selectOrganization = useCallback((organization: Organization | null) => {
        setSelectedOrganization(organization);
        if (organization) {
            localStorage.setItem(LOCAL_STORAGE_ORG_KEY, JSON.stringify({ id: organization.id, name: organization.name }));
            if (isScreenMode && currentUser) {
                 localStorage.removeItem(getLocalStorageDisplayScreenKey(currentUser.uid));
                 // NEW: Also clear physical ID when org changes (shouldn't happen, but good practice)
                 localStorage.removeItem(getLocalStoragePhysicalScreenKey(currentUser.uid));
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

    const value = useMemo(() => ({
        selectedOrganization,
        allOrganizations,
        selectOrganization,
        setAllOrganizations,
        selectedDisplayScreen,
        selectDisplayScreen,
        clearSelection,
        locationLoading
    }), [selectedOrganization, allOrganizations, selectOrganization, selectedDisplayScreen, selectDisplayScreen, clearSelection, locationLoading]);

    return (
        <LocationContext.Provider value={value}>
            {children}
        </LocationContext.Provider>
    );
};

export const useLocation = (): LocationContextType => {
    const context = useContext(LocationContext);
    if (context === undefined) {
        throw new Error('useLocation must be used within a LocationProvider');
    }
    return context;
};
