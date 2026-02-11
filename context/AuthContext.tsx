import React, { createContext, useState, useContext, useEffect, useMemo, useCallback } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { onAuthChange, signOut as firebaseSignOut, signIn, signInAsScreen, getUserData, isOffline } from '../services/firebaseService';
import { UserData, UserRole } from '../types';
import { MOCK_SYSTEM_OWNER, MOCK_ORG_ADMIN } from '../data/mockData';

type FirebaseUser = firebase.User;
type SimulatedUserType = 'systemowner' | 'organizationadmin' | 'screen';

interface AuthContextType {
    currentUser: FirebaseUser | null;
    userData: UserData | null;
    role: UserRole;
    isScreenMode: boolean;
    authLoading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signInAsScreen: () => Promise<void>;
    signOut: () => Promise<void>;
    reauthenticate: (password: string) => Promise<void>;
    // For developer toolbar in offline mode
    switchSimulatedUser?: (userType: SimulatedUserType) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    const handleAuthChange = useCallback(async (user: FirebaseUser | null) => {
        setCurrentUser(user);
        if (user && !user.isAnonymous) {
            const fetchedUserData = await getUserData(user.uid);
            setUserData(fetchedUserData);
        } else {
            setUserData(null);
        }
        setAuthLoading(false);
    }, []);

    // Effect for handling real authentication state changes
    useEffect(() => {
        if (isOffline) {
            // In offline mode, we don't listen to real auth changes.
            // The simulation logic below will handle it.
            return;
        }
        const unsubscribe = onAuthChange(handleAuthChange);
        return () => unsubscribe();
    }, [handleAuthChange]);


    // --- OFFLINE SIMULATION LOGIC ---
    const [simulatedUserType, setSimulatedUserType] = useState<SimulatedUserType>('systemowner');

    useEffect(() => {
        if (!isOffline) return;

        const simulateUser = async () => {
            setAuthLoading(true);
            let simulatedFirebaseUser: FirebaseUser | null = null;
            let simulatedUserData: UserData | null = null;

            if (simulatedUserType === 'systemowner') {
                simulatedFirebaseUser = { uid: MOCK_SYSTEM_OWNER.uid, isAnonymous: false } as FirebaseUser;
                simulatedUserData = MOCK_SYSTEM_OWNER;
            } else if (simulatedUserType === 'organizationadmin') {
                simulatedFirebaseUser = { uid: MOCK_ORG_ADMIN.uid, isAnonymous: false } as FirebaseUser;
                simulatedUserData = MOCK_ORG_ADMIN;
            } else if (simulatedUserType === 'screen') {
                simulatedFirebaseUser = { uid: 'offline_studio_uid', isAnonymous: true } as FirebaseUser;
                simulatedUserData = null;
            }
            
            setCurrentUser(simulatedFirebaseUser);
            setUserData(simulatedUserData);
            setAuthLoading(false);
        };

        simulateUser();
    }, [isOffline, simulatedUserType]);
    
    const switchSimulatedUser = useCallback((userType: SimulatedUserType) => {
        if (isOffline) {
            setSimulatedUserType(userType);
        } else {
            console.warn("Cannot switch simulated user when online.");
        }
    }, []);
    // --- END OFFLINE SIMULATION LOGIC ---

    const handleSignIn = useCallback(async (email: string, password: string) => {
        await signIn(email, password);
    }, []);
    
    const handleSignInAsScreen = useCallback(async () => {
        await signInAsScreen();
    }, []);

    const handleSignOut = useCallback(async () => {
        await firebaseSignOut();
        setCurrentUser(null);
        setUserData(null);
    }, []);
    
    const reauthenticate = useCallback(async (password: string): Promise<void> => {
        if (isOffline) {
            // In offline mode, assume success since we can't truly re-authenticate.
            return Promise.resolve();
        }

        if (!currentUser || !currentUser.email) {
            throw new Error("Ingen användare inloggad för återautentisering.");
        }
        
        const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, password);
        await currentUser.reauthenticateWithCredential(credential);
    }, [currentUser]);

    const { role, isScreenMode } = useMemo(() => {
        if (!currentUser) {
            return { role: 'member' as UserRole, isScreenMode: false };
        }
        if (currentUser.isAnonymous) {
            return { role: 'member' as UserRole, isScreenMode: true };
        }
        if (userData) {
            return { role: userData.role as UserRole, isScreenMode: false };
        }
        return { role: 'member' as UserRole, isScreenMode: false };
    }, [currentUser, userData]);

    // FIX: Added explicit type `AuthContextType` to the value and removed trailing comma to resolve TS inference error.
    const value: AuthContextType = useMemo(() => ({
        currentUser,
        userData,
        role,
        isScreenMode,
        authLoading,
        signIn: handleSignIn,
        signInAsScreen: handleSignInAsScreen,
        signOut: handleSignOut,
        reauthenticate,
        switchSimulatedUser: isOffline ? switchSimulatedUser : undefined
    }), [currentUser, userData, role, isScreenMode, authLoading, handleSignIn, handleSignInAsScreen, handleSignOut, reauthenticate, switchSimulatedUser]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};