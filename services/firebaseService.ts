// services/firebaseService.ts
import firebase from 'firebase/compat/app';
// The individual service imports are kept for type definitions
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';
import 'firebase/compat/storage';
import { env, app, auth, db, storage, functions } from './firebaseInit';

import { Organization, CustomPage, UserData, Workout, InfoCarousel, DisplayScreen, Tag, SystemSettings, ScreenPairingCode, PostTemplate, PhysicalScreen, AppNotification, MediaItem, InstagramStory } from '../types';
import { MOCK_ORGANIZATIONS, MOCK_SYSTEM_OWNER, MOCK_ORG_ADMIN, MOCK_SYSTEM_SETTINGS, MOCK_PAIRING_CODES } from '../data/mockData';

// Re-export isOffline based on the new environment logic for compatibility with other components (like App.tsx).
export const isOffline = env === 'offline';

// --- Auth Functions ---
export const onAuthChange = (callback: (user: firebase.User | null) => void) => {
    if (isOffline || !auth) {
        // In offline mode, we simulate an authenticated system owner for testing.
        callback({ uid: 'offline_owner_uid', isAnonymous: false } as firebase.User);
        return () => {}; // Return an empty unsubscribe function
    }
    return auth.onAuthStateChanged(callback);
};

export const signIn = (email: string, password: string): Promise<firebase.User> => {
    if (isOffline || !auth) {
        if(email === MOCK_SYSTEM_OWNER.email) {
            return Promise.resolve({ uid: MOCK_SYSTEM_OWNER.uid, isAnonymous: false } as firebase.User);
        }
        if(email === MOCK_ORG_ADMIN.email) {
            return Promise.resolve({ uid: MOCK_ORG_ADMIN.uid, isAnonymous: false } as firebase.User);
        }
        return Promise.reject(new Error("Offline mode: Cannot sign in."));
    }
    return auth.signInWithEmailAndPassword(email, password).then(userCredential => userCredential.user as firebase.User);
};

export const signInAsScreen = (): Promise<firebase.User> => {
    if (isOffline || !auth) {
         return Promise.resolve({ uid: 'offline_studio_uid', isAnonymous: true } as firebase.User);
    }
    return auth.signInAnonymously().then(userCredential => userCredential.user as firebase.User);
};

export const signOut = (): Promise<void> => {
     if (isOffline || !auth) {
        return Promise.resolve();
    }
    return auth.signOut();
};

export const getUserData = async (uid: string): Promise<UserData | null> => {
    if (isOffline || !db) {
        if (uid === 'offline_owner_uid') {
             return Promise.resolve(MOCK_SYSTEM_OWNER);
        }
        if (uid === 'offline_admin_uid') {
            return Promise.resolve(MOCK_ORG_ADMIN);
        }
        return Promise.resolve(null);
    }
    const userDocRef = db.collection('users').doc(uid);
    const docSnap = await userDocRef.get();
    if (docSnap.exists) {
        return { uid, ...docSnap.data() } as UserData;
    }
    return null;
};

// --- Firestore Data Functions ---
const offlineWarning = (operation: string) => {
    console.warn(`OFFLINE MODE: Operation "${operation}" was not sent to the server.`);
    return Promise.resolve();
}

export const getOrganizations = async (): Promise<Organization[]> => {
    if (isOffline || !db) {
        return Promise.resolve([...MOCK_ORGANIZATIONS]);
    }
    const querySnapshot = await db.collection('organizations').get();
    if (querySnapshot.empty) {
      console.log("No organizations found in Firestore.");
      return [];
    }
    return querySnapshot.docs.map(d => d.data() as Organization);
};

// NEW: Function to get a single organization by ID, required for the embed feature.
// Note: This requires Firestore security rules to allow public reads on the organizations collection.
export const getOrganizationById = async (organizationId: string): Promise<Organization | null> => {
    if (isOffline || !db) {
        const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
        return Promise.resolve(org || null);
    }
    const docRef = db.collection('organizations').doc(organizationId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        return docSnap.data() as Organization;
    }
    return null;
};

// NEW: Real-time listener for a single organization.
export const listenToOrganizationChanges = (
    organizationId: string,
    onUpdate: (org: Organization) => void,
): (() => void) => {
    if (isOffline || !db) {
        // In offline mode, there are no real-time updates.
        return () => {}; // Return an empty unsubscribe function.
    }
    const docRef = db.collection('organizations').doc(organizationId);
    const unsubscribe = docRef.onSnapshot(
        (docSnap) => {
            if (docSnap.exists) {
                onUpdate(docSnap.data() as Organization);
            } else {
                console.warn(`Organization document with ID ${organizationId} does not exist.`);
            }
        },
        (error) => {
            console.error(`Error listening to organization ${organizationId}:`, error);
        }
    );
    return unsubscribe;
};


const getUpdatedOrg = async (organizationId: string): Promise<Organization> => {
    if(isOffline || !db) {
        const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
        // FIX: Return a shallow copy to ensure React state updates are triggered correctly.
        return Promise.resolve(org ? { ...org } : null!);
    }
    const updatedDoc = await db.collection('organizations').doc(organizationId).get();
    if (!updatedDoc.exists) throw new Error("Organisationen försvann.");
    return updatedDoc.data() as Organization;
};

export const createOrganization = async (orgData: Pick<Organization, 'name' | 'email'>): Promise<Organization> => {
    const { name, email } = orgData;
    const sanitizedName = name.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const subdomain = `${sanitizedName}-${Date.now()}`;

    if(isOffline || !db) {
        await offlineWarning('createOrganization');
        const newOrg: Organization = { 
            id: `offline_org_${Date.now()}`, 
            name, 
            subdomain, 
            customPages: [],
            email,
            mediaLibrary: [],
        };
        MOCK_ORGANIZATIONS.push(newOrg);
        return newOrg;
    }

    const q = db.collection('organizations').where("subdomain", "==", subdomain);
    if (!(await q.get()).empty) throw new Error(`Kunde inte skapa unik subdomän, försök igen.`);
    
    const newOrgId = `org_${subdomain}`;
    const newOrg: Organization = { 
        id: newOrgId, 
        name, 
        subdomain, 
        customPages: [],
        email,
        mediaLibrary: [],
    };
    await db.collection('organizations').doc(newOrg.id).set(newOrg);
    return newOrg;
};

export const updateOrganization = async (organizationId: string, data: Partial<Organization>): Promise<Organization> => {
    if(isOffline || !db) {
        await offlineWarning('updateOrganization');
        const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
        if (org) {
            // Simulate FieldValue.delete() for offline mode by deleting the key
            for (const key in data) {
                const typedKey = key as keyof Organization;
                if (data[typedKey] === undefined) {
                    delete org[typedKey];
                } else {
                    (org as any)[typedKey] = data[typedKey];
                }
            }
        }
        return getUpdatedOrg(organizationId);
    }
    
    // Create a new object to hold the cleaned data for Firestore.
    const cleanedData: { [key: string]: any } = {};
    for (const key in data) {
        const value = data[key as keyof Partial<Organization>];
        // If the value is explicitly undefined, we want to remove the field from Firestore.
        if (value === undefined) {
            cleanedData[key] = firebase.firestore.FieldValue.delete();
        } else {
            cleanedData[key] = value;
        }
    }

    await db.collection('organizations').doc(organizationId).update(cleanedData);
    return getUpdatedOrg(organizationId);
};

export const deleteOrganization = async (organizationId: string): Promise<void> => {
    if (isOffline || !db) {
        await offlineWarning('deleteOrganization');
        const index = MOCK_ORGANIZATIONS.findIndex(o => o.id === organizationId);
        if (index > -1) {
            MOCK_ORGANIZATIONS.splice(index, 1);
        }
        return;
    }
    await db.collection('organizations').doc(organizationId).delete();
};

export const updateOrganizationLogos = async (organizationId: string, logos: { light?: string, dark?: string }): Promise<Organization> => {
    if(isOffline || !db) {
        await offlineWarning('updateOrganizationLogos');
        const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
        if (org) {
            org.logoUrlLight = logos.light;
            org.logoUrlDark = logos.dark;
        }
        return getUpdatedOrg(organizationId);
    }
    await db.collection('organizations').doc(organizationId).update({ 
        logoUrlLight: logos.light,
        logoUrlDark: logos.dark
    });
    return getUpdatedOrg(organizationId);
};

export const updateOrganizationPrimaryColor = async (organizationId: string, primaryColor: string): Promise<Organization> => {
    if(isOffline || !db) {
        await offlineWarning('updateOrganizationPrimaryColor');
        const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
        if (org) {
            org.primaryColor = primaryColor;
        }
        return getUpdatedOrg(organizationId);
    }
    await db.collection('organizations').doc(organizationId).update({ primaryColor });
    return getUpdatedOrg(organizationId);
};

export const updateOrganizationCustomPages = async (organizationId: string, customPages: CustomPage[]): Promise<Organization> => {
    if(isOffline || !db) {
        await offlineWarning('updateOrganizationCustomPages');
        const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
        if (org) {
            org.customPages = customPages;
        }
        return getUpdatedOrg(organizationId);
    }
    await db.collection('organizations').doc(organizationId).update({ customPages });
    return getUpdatedOrg(organizationId);
};

export const updateOrganizationInfoCarousel = async (organizationId: string, infoCarousel: InfoCarousel): Promise<Organization> => {
    if(isOffline || !db) {
        await offlineWarning('updateOrganizationInfoCarousel');
        const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
        if (org) {
            org.infoCarousel = infoCarousel;
        }
        return getUpdatedOrg(organizationId);
    }
    await db.collection('organizations').doc(organizationId).update({ infoCarousel });
    return getUpdatedOrg(organizationId);
};

export const updateOrganizationDisplayScreens = async (organizationId: string, displayScreens: DisplayScreen[]): Promise<Organization> => {
    if(isOffline || !db) {
        await offlineWarning('updateOrganizationDisplayScreens');
        const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
        if (org) {
            org.displayScreens = displayScreens;
        }
        return getUpdatedOrg(organizationId);
    }
    await db.collection('organizations').doc(organizationId).update({ displayScreens });
    return getUpdatedOrg(organizationId);
};

export const updateOrganizationTags = async (organizationId: string, tags: Tag[]): Promise<Organization> => {
    if(isOffline || !db) {
        await offlineWarning('updateOrganizationTags');
        const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
        if (org) {
            org.tags = tags;
        }
        return getUpdatedOrg(organizationId);
    }
    await db.collection('organizations').doc(organizationId).update({ tags });
    return getUpdatedOrg(organizationId);
};

export const updateOrganizationPostTemplates = async (organizationId: string, postTemplates: PostTemplate[]): Promise<Organization> => {
    if(isOffline || !db) {
        await offlineWarning('updateOrganizationPostTemplates');
        const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
        if (org) {
            org.postTemplates = postTemplates;
        }
        return getUpdatedOrg(organizationId);
    }
    await db.collection('organizations').doc(organizationId).update({ postTemplates });
    return getUpdatedOrg(organizationId);
};

// --- System Settings ---
export const getSystemSettings = async (): Promise<SystemSettings> => {
    if (isOffline || !db) {
        return Promise.resolve(MOCK_SYSTEM_SETTINGS);
    }
    const docRef = db.collection('system_settings').doc('main');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        return docSnap.data() as SystemSettings;
    }
    // Return a default object if it doesn't exist
// FIX: Object literal may only specify known properties, and 'newScreenInfoText' does not exist in type 'SystemSettings'.
    return { id: 'main' };
};

export const updateSystemSettings = async (settings: Partial<SystemSettings>): Promise<void> => {
    if (isOffline || !db) {
// FIX: Property 'newScreenInfoText' does not exist on type 'Partial<SystemSettings>'.
// FIX: Property 'newScreenInfoText' does not exist on type 'SystemSettings'.
// FIX: Property 'newScreenInfoText' does not exist on type 'Partial<SystemSettings>'.
        if (MOCK_SYSTEM_SETTINGS) {
            Object.assign(MOCK_SYSTEM_SETTINGS, settings);
        }
        return offlineWarning('updateSystemSettings');
    }
    const docRef = db.collection('system_settings').doc('main');
    await docRef.set(settings, { merge: true });
};


export const getAdminsForOrganization = async (organizationId: string): Promise<UserData[]> => {
    if (isOffline || !db) {
        // Return mock admins for offline mode
        return Promise.resolve([
             MOCK_ORG_ADMIN, // This is a superadmin
             { uid: 'offline_admin_2', email: 'admin2@flexibel.app', role: 'organizationadmin', adminRole: 'admin', organizationId: 'org_flexibel_mock' }
        ]);
    }
    const usersRef = db.collection('users');
    const q = usersRef.where("organizationId", "==", organizationId).where("role", "==", "organizationadmin");
    
    const querySnapshot = await q.get();
    if (querySnapshot.empty) {
      return [];
    }
    return querySnapshot.docs.map(d => ({ uid: d.id, ...d.data() }) as UserData);
};

export const setAdminRole = async (uid: string, adminRole: 'superadmin' | 'admin'): Promise<void> => {
    if (isOffline || !db) {
        return offlineWarning('setAdminRole');
    }
    await db.collection('users').doc(uid).update({ adminRole });
};

export const setUserScreenPin = async (uid: string, pin: string): Promise<void> => {
    if (isOffline || !db) {
        console.log(`(Offline) Setting screen PIN for user ${uid} to ${pin}`);
        return offlineWarning('setUserScreenPin');
    }
    // For security, you might want to hash the PIN in a real app,
    // but for a simple PIN, storing it directly is often acceptable.
    await db.collection('users').doc(uid).update({ screenPin: pin });
};

export const inviteUser = async (organizationId: string, email: string): Promise<{success: boolean, message: string, link?: string}> => {
    if (isOffline) {
        await offlineWarning('inviteUser');
        console.log(`(Offline) Simulating invitation for ${email} with role admin for org ${organizationId}`);
        return { success: true, message: `(Offline) Inbjudan skickad till ${email}.` };
    }

    try {
        if (!functions) {
            throw new Error("Firebase Functions är inte initialiserat.");
        }
        const inviteUserFunction = functions.httpsCallable('inviteUser');
        
        const result = await inviteUserFunction({ organizationId, email, role: 'admin' }); // Role is now hardcoded
        return result.data as {success: boolean, message: string, link?: string};
    } catch (error) {
        console.error("Error calling inviteUser function:", error);
        const err = error as any;
        // The error object from httpsCallable has 'code' and 'message' properties
        const message = err.message || "Ett okänt serverfel inträffade.";
        // Check for specific Firebase functions error codes
        if (err.code === 'unauthenticated') {
            // FIX: Corrected typo "bjuna" to "bjuda".
            return { success: false, message: "Du måste vara inloggad för att kunna bjuda in." };
        }
        return { success: false, message: message };
    }
};

// --- SCREEN PAIRING ---
const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789'; // Omitted O and 0 for clarity
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

export const createPairingCode = async (): Promise<string> => {
    if (isOffline || !db) {
        return Promise.resolve('ABC123');
    }
    
    const codesRef = db.collection('screenPairingCodes');
    let code;
    let codeExists = true;
    while (codeExists) {
        code = generateCode();
        const doc = await codesRef.doc(code).get();
        if (!doc.exists) {
            codeExists = false;
        }
    }
    
    const newCodeDoc: Omit<ScreenPairingCode, 'organizationId' | 'pairedByUid' | 'pairedAt' | 'assignedDisplayScreenId'> = {
        code,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
    };

    await codesRef.doc(code).set(newCodeDoc);
    return code;
};

export const listenToPairingCode = (code: string, onUpdate: (data: ScreenPairingCode) => void): (() => void) => {
    if (isOffline || !db) {
        // In offline mode, we no longer auto-pair. We just wait for an admin to call assignPairingCode.
        // This function now correctly does nothing, just like the online version would while waiting.
        return () => {}; // Return empty unsubscribe function
    }
    const docRef = db.collection('screenPairingCodes').doc(code);
    return docRef.onSnapshot(doc => {
        if (doc.exists) {
            onUpdate(doc.data() as ScreenPairingCode);
        }
    });
};

export const getPairingCode = async (code: string): Promise<ScreenPairingCode | null> => {
    if (isOffline || !db) {
        const foundCode = MOCK_PAIRING_CODES.find(c => c.code === code && c.status === 'pending');
        return Promise.resolve(foundCode || null);
    }
    const docRef = db.collection('screenPairingCodes').doc(code);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        const data = docSnap.data() as ScreenPairingCode;
        // Optional: Check if code is expired (e.g., older than 15 minutes)
        // const fifteenMinutesAgo = firebase.firestore.Timestamp.now().toMillis() - 15 * 60 * 1000;
        // if (data.createdAt.toMillis() < fifteenMinutesAgo) {
        //     return null; // Code expired
        // }
        return data;
    }
    return null;
};

export const pairAndActivateScreen = async (
    code: string,
    organizationId: string,
    adminUid: string,
    details: { name: string; displayScreenId: string }
): Promise<PhysicalScreen> => {
    const deviceId = `phys_${Date.now()}`;
    const newScreen: PhysicalScreen = {
        id: deviceId,
        name: details.name,
        organizationId: organizationId,
        displayScreenId: details.displayScreenId,
        pairedAt: new Date().toISOString(),
        pairedByUid: adminUid
    };

    if (isOffline || !db) {
        // 1. Update pairing code status
        const codeIndex = MOCK_PAIRING_CODES.findIndex(c => c.code === code);
        if (codeIndex !== -1) {
            MOCK_PAIRING_CODES[codeIndex] = {
                ...MOCK_PAIRING_CODES[codeIndex],
                status: 'paired',
                organizationId,
                assignedDisplayScreenId: details.displayScreenId,
                pairedByUid: adminUid,
                pairedDeviceId: deviceId,
            };
        }
        
        console.log("(Offline) Paired and activated new screen:", newScreen);
        return Promise.resolve(newScreen);
    }
    
    const pairingCodeRef = db.collection('screenPairingCodes').doc(code);
    const orgRef = db.collection('organizations').doc(organizationId);

    await db.runTransaction(async (transaction) => {
        // 1. Update pairing code status
        transaction.update(pairingCodeRef, {
            status: 'paired',
            organizationId: organizationId,
            assignedDisplayScreenId: details.displayScreenId,
            pairedByUid: adminUid,
            pairedAt: firebase.firestore.FieldValue.serverTimestamp(),
            pairedDeviceId: deviceId,
        });

        // 2. Add the new physical screen to the organization's `physicalScreens` array
        transaction.update(orgRef, {
            physicalScreens: firebase.firestore.FieldValue.arrayUnion(newScreen)
        });
    });

    return newScreen;
};

// --- SYSTEM ANNOUNCEMENTS (NEW) ---
export const createSystemAnnouncement = async (title: string, message: string): Promise<void> => {
    if (isOffline || !db) {
        console.log(`[OFFLINE] System Announcement Sent: Title="${title}", Message="${message}"`);
        // In offline mode, we might add to a mock array if needed for testing, but for now, just log.
        return offlineWarning('createSystemAnnouncement');
    }
    
    const docRef = db.collection('systemAnnouncements').doc();
    await docRef.set({
        title,
        message,
        type: 'info',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
};

export const getSystemAnnouncements = async (): Promise<AppNotification[]> => {
    if (isOffline || !db) {
        // Return a mock announcement for offline testing
        return Promise.resolve([{
            id: 'sys-mock-1',
            createdAt: new Date().toISOString(),
            type: 'info',
            title: 'Offline-läge aktivt',
            message: 'Detta är ett exampel på ett systemmeddelande.',
            isRead: false,
        }]);
    }
    
    // Fetch announcements from the last 30 days to keep the payload reasonable
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoTimestamp = firebase.firestore.Timestamp.fromDate(thirtyDaysAgo);

    const querySnapshot = await db.collection('systemAnnouncements')
        .where('createdAt', '>=', thirtyDaysAgoTimestamp)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
    
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: `sys-${doc.id}`, // Prefix to distinguish from local notifications
            title: data.title,
            message: data.message,
            type: data.type,
            createdAt: (data.createdAt as firebase.firestore.Timestamp).toDate().toISOString(),
            isRead: false, // This will be determined by the client based on localStorage
        } as AppNotification;
    });
};


// --- WORKOUTS ---

export const getWorkoutsForOrganization = async (organizationId: string): Promise<Workout[]> => {
    if (isOffline || !db) {
        if (!(window as any).mockWorkouts) (window as any).mockWorkouts = [];
        return Promise.resolve(
            ((window as any).mockWorkouts as Workout[])
            .filter(w => w.organizationId === organizationId)
            .sort((a, b) => (a.title > b.title ? 1 : -1))
        );
    }
    const workoutsCol = db.collection('workouts');
    const q = workoutsCol.where("organizationId", "==", organizationId);
    const querySnapshot = await q.get();
    return querySnapshot.docs.map(doc => doc.data() as Workout).sort((a, b) => (a.title > b.title ? 1 : -1));
};

export const saveWorkout = async (workout: Workout): Promise<void> => {
    if (isOffline || !db) {
        if (!(window as any).mockWorkouts) (window as any).mockWorkouts = [];
        const workouts: Workout[] = (window as any).mockWorkouts;
        const existingIndex = workouts.findIndex((w: Workout) => w.id === workout.id);
        if (existingIndex > -1) {
            workouts[existingIndex] = workout;
        } else {
            workouts.unshift(workout);
        }
        (window as any).mockWorkouts = workouts;
        return offlineWarning('saveWorkout');
    }
    const workoutDocRef = db.collection('workouts').doc(workout.id);
    await workoutDocRef.set(workout, { merge: true });
};

export const deleteWorkout = async (workoutId: string): Promise<void> => {
    if (isOffline || !db) {
        if ((window as any).mockWorkouts) {
            (window as any).mockWorkouts = ((window as any).mockWorkouts as Workout[]).filter((w: Workout) => w.id !== workoutId);
        }
        return offlineWarning('deleteWorkout');
    }
    const workoutDocRef = db.collection('workouts').doc(workoutId);
    await workoutDocRef.delete();
};

// --- INSTAGRAM STORIES ---

export const listenToInstagramStories = (
    organizationId: string,
    onUpdate: (stories: InstagramStory[]) => void,
): (() => void) => {
    if (isOffline || !db) {
        // Return mock stories for offline mode
        const mockStories: InstagramStory[] = [
            { id: '1', mediaUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MCAxNjAiPjxyZWN0IHdpZHRoPSI5MCIgaGVpZ2h0PSIxNjAiIGZpbGw9IiMzNDk4ZGIiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2ZmZiIgZm9udC1zaXplPSIxMiI+U3RvcnkgMTwvdGV4dD48L3N2Zz4=', mediaType: 'IMAGE', timestamp: new Date().toISOString() },
            { id: '2', mediaUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MCAxNjAiPjxyZWN0IHdpZHRoPSI5MCIgaGVpZ2h0PSIxNjAiIGZpbGw9IiNlNzRjM2MiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2ZmZiIgZm9udC1zaXplPSIxMiI+U3RvcnkgMjwvdGV4dD48L3N2Zz4=', mediaType: 'IMAGE', timestamp: new Date().toISOString() }
        ];
        onUpdate(mockStories);
        return () => {};
    }

    const storiesRef = db.collection('organizations').doc(organizationId).collection('instagramStories').orderBy('timestamp', 'desc');

    const unsubscribe = storiesRef.onSnapshot(
        (snapshot) => {
            const stories = snapshot.docs.map(doc => doc.data() as InstagramStory);
            onUpdate(stories);
        },
        (error) => {
            console.error("Error listening to Instagram stories:", error);
            onUpdate([]);
        }
    );
    return unsubscribe;
};

// --- Storage Functions ---
const uploadMediaFileInternal = (
    organizationId: string,
    file: File,
    mediaType: 'images' | 'videos',
    onProgress: (progress: number) => void
): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (isOffline || !storage) {
            offlineWarning(`uploadMediaFileInternal (${mediaType})`);
            onProgress(0);
            setTimeout(() => onProgress(50), 500);
            setTimeout(() => {
                onProgress(100);
                const localUrl = URL.createObjectURL(file);
                resolve(localUrl);
            }, 1000);
            return;
        }

        const filePath = `organizations/${organizationId}/${mediaType}/${Date.now()}-${file.name}`;
        const storageRef = storage.ref(filePath);
        const uploadTask = storageRef.put(file);

        uploadTask.on(
            'state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                onProgress(progress);
            },
            (error) => {
                console.error(`${mediaType} upload failed:`, error);
                reject(new Error(`Uppladdningen av ${mediaType === 'videos' ? 'videon' : 'bilden'} misslyckades.`));
            },
            () => {
                uploadTask.snapshot.ref.getDownloadURL().then(resolve).catch(reject);
            }
        );
    });
};

export const uploadVideo = (
    organizationId: string,
    file: File,
    onProgress: (progress: number) => void
): Promise<string> => {
    return uploadMediaFileInternal(organizationId, file, 'videos', onProgress);
};

export const uploadMediaForGallery = (
    organizationId: string,
    file: File,
    onProgress: (progress: number) => void
): Promise<{ url: string; type: 'image' | 'video' }> => {
    const type = file.type.startsWith('video/') ? 'videos' : 'images';
    return uploadMediaFileInternal(organizationId, file, type, onProgress).then(url => ({
        url,
        type: type === 'videos' ? 'video' : 'image',
    }));
};

export const deleteMediaFromStorage = async (fileUrl: string): Promise<void> => {
    if (isOffline || !storage) {
        return offlineWarning('deleteMediaFromStorage');
    }
    try {
        const storageRef = storage.refFromURL(fileUrl);
        await storageRef.delete();
    } catch (error: any) {
        if (error.code === 'storage/object-not-found') {
            console.warn(`File not found, could not delete: ${fileUrl}`);
            // Don't throw an error if the file is already gone
        } else {
            console.error(`Error deleting file from storage: ${fileUrl}`, error);
            throw new Error("Kunde inte ta bort mediefilen från lagringen.");
        }
    }
};

export const updateOrganizationMediaLibrary = async (organizationId: string, mediaLibrary: MediaItem[]): Promise<Organization> => {
    if(isOffline || !db) {
        await offlineWarning('updateOrganizationMediaLibrary');
        const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
        if (org) {
            org.mediaLibrary = mediaLibrary;
        }
        return getUpdatedOrg(organizationId);
    }
    await db.collection('organizations').doc(organizationId).update({ mediaLibrary });
    return getUpdatedOrg(organizationId);
};