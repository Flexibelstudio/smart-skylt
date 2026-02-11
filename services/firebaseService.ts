import { db, auth, storage, functions, isOffline, firebase } from './firebaseInit';
import { Organization, UserData, SystemSettings, ScreenPairingCode, PhysicalScreen, DisplayScreen, AppNotification, SuggestedPost, VideoOperation, PostTemplate, Tag, DisplayPost, MediaItem, InstagramStory } from '../types';
import { MOCK_ORGANIZATIONS, MOCK_SYSTEM_SETTINGS, MOCK_PAIRING_CODES, MOCK_SYSTEM_OWNER, MOCK_ORG_ADMIN } from '../data/mockData';

// Re-export isOffline for use in other components
export { isOffline };

const offlineWarning = (action: string) => {
    console.warn(`[OFFLINE] ${action} performed locally (not persisted to cloud).`);
    return Promise.resolve();
};

const sanitizeForFirestore = <T>(data: T): T => {
    return JSON.parse(JSON.stringify(data));
};

// --- HELPER FOR OFFLINE REACTIVITY ---
const triggerMockScreenListener = (orgId: string) => {
    if (!isOffline) return;
    const listener = (window as any).mockScreenListeners?.[orgId];
    if (listener) {
        const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
        listener(org?.displayScreens || []);
    }
};

// --- AUTH ---

export const onAuthChange = (callback: (user: firebase.User | null) => void) => {
    if (isOffline || !auth) {
        // Offline auth handled in AuthContext via simulation
        return () => {};
    }
    return auth.onAuthStateChanged(callback);
};

export const signIn = async (email: string, password: string) => {
    if (isOffline || !auth) {
        console.log(`[OFFLINE] Signing in as ${email}`);
        // AuthContext handles the state simulation
        return Promise.resolve();
    }
    await auth.signInWithEmailAndPassword(email, password);
};

export const signInAsScreen = async () => {
    if (isOffline || !auth) return Promise.resolve();
    await auth.signInAnonymously();
};

export const signOut = async () => {
    if (isOffline || !auth) return Promise.resolve();
    await auth.signOut();
};

export const getUserData = async (uid: string): Promise<UserData | null> => {
    if (isOffline) {
        if (uid === MOCK_SYSTEM_OWNER.uid) return MOCK_SYSTEM_OWNER;
        if (uid === MOCK_ORG_ADMIN.uid) return MOCK_ORG_ADMIN;
        return null;
    }
    if (!db) return null;
    const doc = await db.collection('users').doc(uid).get();
    return doc.exists ? (doc.data() as UserData) : null;
};

export const requestPasswordReset = async (email: string) => {
    if (isOffline || !auth) return offlineWarning('requestPasswordReset');
    await auth.sendPasswordResetEmail(email);
};

export const verifyPasswordResetToken = async (oobCode: string): Promise<string> => {
    if (isOffline || !auth) return 'offline@test.com';
    return await auth.verifyPasswordResetCode(oobCode);
};

export const confirmPasswordReset = async (oobCode: string, newPassword: string) => {
    if (isOffline || !auth) return offlineWarning('confirmPasswordReset');
    await auth.confirmPasswordReset(oobCode, newPassword);
};

// --- ORGANIZATIONS ---

export const getOrganizations = async (): Promise<Organization[]> => {
    if (isOffline) return MOCK_ORGANIZATIONS;
    if (!db) return [];
    const snapshot = await db.collection('organizations').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Organization));
};

export const getOrganizationById = async (orgId: string): Promise<Organization | null> => {
    if (isOffline) return MOCK_ORGANIZATIONS.find(o => o.id === orgId) || null;
    if (!db) return null;
    const doc = await db.collection('organizations').doc(orgId).get();
    if (!doc.exists) return null;
    const data = doc.data() as Organization;
    return { ...data, id: doc.id };
};

export const createOrganization = async (orgData: Pick<Organization, 'name' | 'email'>): Promise<Organization> => {
    if (isOffline) {
        const newOrg: Organization = {
            id: `org_${Date.now()}`,
            ...orgData,
            subdomain: orgData.name.toLowerCase().replace(/\s+/g, '-'),
            displayScreens: [],
            mediaLibrary: [],
            tags: [],
            postTemplates: [],
        };
        MOCK_ORGANIZATIONS.push(newOrg);
        return newOrg;
    }
    if (!db) throw new Error("DB not initialized");
    const ref = await db.collection('organizations').add({
        ...orgData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return { id: ref.id, ...orgData } as Organization;
};

export const updateOrganization = async (orgId: string, data: Partial<Organization>) => {
    if (isOffline) {
        const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
        if (org) Object.assign(org, data);
        // Simulerar event listener
        const listener = (window as any).mockBackendListener;
        if (listener && listener.id === orgId) {
             listener.callback({ exists: true, data: () => org, id: orgId });
        }
        return offlineWarning('updateOrganization');
    }
    if (!db) return;
    await db.collection('organizations').doc(orgId).update(sanitizeForFirestore(data));
};

export const deleteOrganization = async (organizationId: string) => {
    if (isOffline) {
        const idx = MOCK_ORGANIZATIONS.findIndex(o => o.id === organizationId);
        if (idx > -1) MOCK_ORGANIZATIONS.splice(idx, 1);
        return offlineWarning('deleteOrganization');
    }
    // Call cloud function or perform complex delete
    if (!functions) return;
    const deleteFn = functions.httpsCallable('deleteOrganization');
    await deleteFn({ organizationId });
};

export const listenToOrganizationChanges = (orgId: string, callback: (snapshot: any) => void) => {
    if (isOffline) {
        // Mock simulation of realtime update
        const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
        callback({ exists: !!org, data: () => org, id: orgId });
        
        // Store listener globally for mock updates
        (window as any).mockBackendListener = { id: orgId, callback };
        
        return () => {
             if ((window as any).mockBackendListener?.id === orgId) {
                 (window as any).mockBackendListener = null;
             }
        };
    }
    if (!db) return () => {};
    return db.collection('organizations').doc(orgId).onSnapshot(callback);
};

export const updateOrganizationLogos = async (orgId: string, logos: { light: string; dark: string }) => {
    await updateOrganization(orgId, { logoUrlLight: logos.light, logoUrlDark: logos.dark });
};

export const updateOrganizationTags = async (orgId: string, tags: Tag[]) => {
    await updateOrganization(orgId, { tags });
};

export const updateOrganizationPostTemplates = async (orgId: string, templates: PostTemplate[]) => {
    await updateOrganization(orgId, { postTemplates: templates });
};

// --- DISPLAY SCREENS (SUBCOLLECTION) ---

export const listenToDisplayScreens = (orgId: string, callback: (screens: DisplayScreen[]) => void) => {
    if (isOffline) {
        const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
        callback(org?.displayScreens || []);

        // Register listener for mock updates
        if (!(window as any).mockScreenListeners) (window as any).mockScreenListeners = {};
        (window as any).mockScreenListeners[orgId] = callback;

        return () => {
            if ((window as any).mockScreenListeners) {
                delete (window as any).mockScreenListeners[orgId];
            }
        };
    }
    if (!db) return () => {};
    // Listen to subcollection
    return db.collection('organizations').doc(orgId).collection('displayScreens').onSnapshot(snapshot => {
        const screens = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DisplayScreen));
        callback(screens);
    });
};

export const addDisplayScreen = async (orgId: string, screen: DisplayScreen) => {
    if (isOffline) {
        const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
        if (org) {
             if (!org.displayScreens) org.displayScreens = [];
             org.displayScreens.push(screen);
             triggerMockScreenListener(orgId);
        }
        return offlineWarning('addDisplayScreen');
    }
    if (!db) return;
    await db.collection('organizations').doc(orgId).collection('displayScreens').doc(screen.id).set(sanitizeForFirestore(screen));
};

export const updateDisplayScreen = async (orgId: string, screenId: string, data: Partial<DisplayScreen>) => {
    if (isOffline) {
        const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
        const screen = org?.displayScreens?.find(s => s.id === screenId);
        if (screen) {
            Object.assign(screen, data);
            triggerMockScreenListener(orgId);
        }
        return offlineWarning('updateDisplayScreen');
    }
    if (!db) return;
    await db.collection('organizations').doc(orgId).collection('displayScreens').doc(screenId).update(sanitizeForFirestore(data));
};

export const deleteDisplayScreen = async (orgId: string, screenId: string) => {
    if (isOffline) {
        const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
        if (org && org.displayScreens) {
            org.displayScreens = org.displayScreens.filter(s => s.id !== screenId);
            triggerMockScreenListener(orgId);
        }
        return offlineWarning('deleteDisplayScreen');
    }
    if (!db) return;
    await db.collection('organizations').doc(orgId).collection('displayScreens').doc(screenId).delete();
};


// --- SYSTEM SETTINGS ---

export const getSystemSettings = async (): Promise<SystemSettings | null> => {
    if (isOffline) return MOCK_SYSTEM_SETTINGS;
    if (!db) return null;
    try {
        const doc = await db.collection('system').doc('settings').get();
        return doc.exists ? (doc.data() as SystemSettings) : null;
    } catch (error: any) {
        // Silent fallback for insufficient permissions, as regular users shouldn't see this warning
        if (error?.code === 'permission-denied') {
            return MOCK_SYSTEM_SETTINGS;
        }
        console.warn("Failed to fetch system settings, using default fallback.", error);
        return MOCK_SYSTEM_SETTINGS;
    }
};

export const updateSystemSettings = async (settings: SystemSettings) => {
    if (isOffline) {
        Object.assign(MOCK_SYSTEM_SETTINGS, settings);
        return offlineWarning('updateSystemSettings');
    }
    if (!db) return;
    await db.collection('system').doc('settings').set(settings, { merge: true });
};

// --- PAIRING ---

export const createPairingCode = async (createdByUid?: string): Promise<string> => {
    if (isOffline) {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const existingCodes = JSON.parse(localStorage.getItem('mock_pairing_codes') || '[]');
        existingCodes.push({
            code,
            createdAt: new Date().toISOString(),
            status: 'pending',
            createdByUid
        });
        localStorage.setItem('mock_pairing_codes', JSON.stringify(existingCodes));
        return code;
    }
    if (!db) throw new Error("DB not initialized");
    
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    // Use code as doc ID for easier lookup
    await db.collection('screenPairingCodes').doc(code).set({
        code,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
        createdByUid: createdByUid || null
    });
    return code;
};

export const getPairingCode = async (code: string): Promise<ScreenPairingCode | null> => {
    if (isOffline) {
        const codes = JSON.parse(localStorage.getItem('mock_pairing_codes') || '[]');
        return codes.find((c: any) => c.code === code) || null;
    }
    if (!db) return null;
    const doc = await db.collection('screenPairingCodes').doc(code).get();
    return doc.exists ? (doc.data() as ScreenPairingCode) : null;
};

export const listenToPairingCode = (code: string, callback: (data: ScreenPairingCode) => void) => {
    if (isOffline) {
         // Poll localStorage to detect changes from other tabs
       const check = () => {
           const codes = JSON.parse(localStorage.getItem('mock_pairing_codes') || '[]');
           const found = codes.find((c: any) => c.code === code);
           if (found) callback(found);
       };
       check();
       const interval = setInterval(check, 1000);
       return () => clearInterval(interval);
    }
    if (!db) return () => {};
    return db.collection('screenPairingCodes').doc(code).onSnapshot(doc => {
        if (doc.exists) callback(doc.data() as ScreenPairingCode);
    });
};

export const listenToPairingCodeByDeviceId = (deviceId: string, callback: (data: ScreenPairingCode | null) => void) => {
    if (isOffline) {
        // Mock implementation for listening by deviceId
        const check = () => {
           const codes = JSON.parse(localStorage.getItem('mock_pairing_codes') || '[]');
           const found = codes.find((c: any) => c.pairedDeviceId === deviceId);
           callback(found || null);
       };
       check();
       const interval = setInterval(check, 1000);
       return () => clearInterval(interval);
    }

    if (!db) return () => {};
    const query = db.collection('screenPairingCodes').where('pairedDeviceId', '==', deviceId).limit(1);
    return query.onSnapshot(snapshot => {
        if (!snapshot.empty) callback(snapshot.docs[0].data() as ScreenPairingCode);
        else callback(null);
    });
};

export const pairAndActivateScreen = async (code: string, orgId: string, uid: string, screenDetails: { name: string, displayScreenId: string }) => {
    const deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    if (isOffline) {
        const mockScreen: PhysicalScreen = {
            id: deviceId,
            organizationId: orgId,
            displayScreenId: screenDetails.displayScreenId,
            name: screenDetails.name,
            pairedAt: new Date().toISOString(),
            pairedByUid: uid
        };
        
        // Update Mock Pairing Code in LocalStorage
        const codes = JSON.parse(localStorage.getItem('mock_pairing_codes') || '[]');
        const idx = codes.findIndex((c: any) => c.code === code);
        if (idx > -1) {
            codes[idx] = {
                ...codes[idx],
                status: 'paired',
                organizationId: orgId,
                pairedByUid: uid,
                pairedAt: new Date().toISOString(),
                assignedDisplayScreenId: screenDetails.displayScreenId,
                pairedDeviceId: deviceId
            };
            localStorage.setItem('mock_pairing_codes', JSON.stringify(codes));
        }

        // Update Mock Org
        const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
        if (org) {
            if (!org.physicalScreens) org.physicalScreens = [];
            org.physicalScreens.push(mockScreen);
        }
        return mockScreen;
    }

    if (!db) throw new Error("DB not initialized");
    
    // Get the pairing code first to get createdByUid (the screen's anonymous UID)
    const codeRef = db.collection('screenPairingCodes').doc(code);
    const codeDoc = await codeRef.get();
    if (!codeDoc.exists) throw new Error("Pairing code not found");
    
    const codeData = codeDoc.data();
    const screenUid = codeData?.createdByUid;

    const batch = db.batch();
    
    // 1. Update Pairing Code
    batch.update(codeRef, {
        status: 'paired',
        organizationId: orgId,
        pairedByUid: uid,
        pairedAt: firebase.firestore.FieldValue.serverTimestamp(),
        assignedDisplayScreenId: screenDetails.displayScreenId,
        pairedDeviceId: deviceId
    });
    
    // 2. Create Physical Screen (returned for UI, actually saved via org update usually, but here we simulate return)
    const newScreen: PhysicalScreen = {
        id: deviceId,
        organizationId: orgId,
        displayScreenId: screenDetails.displayScreenId,
        name: screenDetails.name,
        pairedAt: new Date().toISOString(),
        pairedByUid: uid
    };
    
    // 3. Create Session
    const sessionRef = db.collection('screenSessions').doc(deviceId);
    const sessionData: any = {
        organizationId: orgId,
        displayScreenId: screenDetails.displayScreenId,
        lastHeartbeat: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'online'
    };
    // IMPORTANT: Link the session to the screen's anonymous UID so security rules allow reading
    if (screenUid) {
        sessionData.screenUid = screenUid;
    }

    batch.set(sessionRef, sessionData);

    await batch.commit();
    return newScreen;
};

export const unpairPhysicalScreen = async (orgId: string, screenId: string) => {
    if (isOffline) {
        const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
        if (org && org.physicalScreens) {
            org.physicalScreens = org.physicalScreens.filter(s => s.id !== screenId);
        }
        return offlineWarning('unpairPhysicalScreen');
    }
    if (!db) return;

    // 1. Find the pairing code document associated with this screen/device
    const codeQuery = await db.collection('screenPairingCodes')
        .where('pairedDeviceId', '==', screenId)
        .get();

    const orgRef = db.collection('organizations').doc(orgId);
    const sessionRef = db.collection('screenSessions').doc(screenId);

    await db.runTransaction(async (transaction) => {
        const orgDoc = await transaction.get(orgRef);
        if (!orgDoc.exists) throw new Error("Organization not found");

        const orgData = orgDoc.data() as Organization;
        const currentScreens = orgData.physicalScreens || [];
        const updatedScreens = currentScreens.filter(s => s.id !== screenId);

        // Only update if there was actually a change to save writes
        if (currentScreens.length !== updatedScreens.length) {
            transaction.update(orgRef, { physicalScreens: updatedScreens });
        }

        // Delete the session (disconnects the screen)
        transaction.delete(sessionRef);

        // Delete the pairing code document completely
        codeQuery.forEach(doc => {
            transaction.delete(doc.ref);
        });
    });
};

export const listenToScreenSession = (deviceId: string, callback: (data: any | null | undefined) => void) => {
    if (isOffline || !db) return () => {};
    return db.collection('screenSessions').doc(deviceId).onSnapshot(
        doc => {
            callback(doc.exists ? doc.data() : null);
        },
        error => {
            // NETWORK ERROR (e.g. offline): Return undefined to indicate uncertainty, not deletion.
            console.error("Session listener error (Network?):", error);
            callback(undefined); 
        }
    );
};

// --- ANNOUNCEMENTS & NOTIFICATIONS ---

export const listenToSystemAnnouncements = (callback: (announcements: AppNotification[]) => void) => {
    if (isOffline) return () => {}; // Mock if needed
    if (!db) return () => {};
    return db.collection('systemAnnouncements').orderBy('createdAt', 'desc').onSnapshot(snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
        callback(data);
    });
};

export const createSystemAnnouncement = async (title: string, message: string) => {
    if (isOffline) return offlineWarning('createAnnouncement');
    if (!db) return;
    await db.collection('systemAnnouncements').add({
        title,
        message,
        type: 'info',
        createdAt: new Date().toISOString(),
        isRead: false
    });
};

export const updateSystemAnnouncement = async (id: string, data: { title: string; message: string }) => {
    if (isOffline) return offlineWarning('updateAnnouncement');
    if (!db) return;
    await db.collection('systemAnnouncements').doc(id).update(data);
};

export const deleteSystemAnnouncement = async (id: string) => {
    if (isOffline) return offlineWarning('deleteAnnouncement');
    if (!db) return;
    await db.collection('systemAnnouncements').doc(id).delete();
};

export const listenToUserNotifications = (uid: string, callback: (notifications: AppNotification[]) => void) => {
    if (isOffline || !db) return () => {};
    return db.collection('users').doc(uid).collection('notifications').orderBy('createdAt', 'desc').onSnapshot(snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
        callback(data);
    });
};

export const markUserNotificationAsRead = async (uid: string, notificationId: string) => {
    if (isOffline || !db) return;
    await db.collection('users').doc(uid).collection('notifications').doc(notificationId).update({ isRead: true });
};

export const markAllUserNotificationsAsRead = async (uid: string, notificationIds: string[]) => {
    if (isOffline || !db) return;
    const batch = db.batch();
    notificationIds.forEach(id => {
        const ref = db.collection('users').doc(uid).collection('notifications').doc(id);
        batch.update(ref, { isRead: true });
    });
    await batch.commit();
};

// --- ASSETS & MEDIA ---

export const uploadPostAsset = async (orgId: string, postId: string, file: File, onProgress: (p: number) => void): Promise<string> => {
    if (isOffline) return URL.createObjectURL(file);
    if (!storage) throw new Error("Storage not initialized");
    
    const ref = storage.ref().child(`organizations/${orgId}/post_assets/${postId}/${file.name}`);
    const uploadTask = ref.put(file);
    
    return new Promise((resolve, reject) => {
        uploadTask.on('state_changed', 
            (snapshot) => onProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            (error) => reject(error),
            async () => {
                const url = await uploadTask.snapshot.ref.getDownloadURL();
                resolve(url);
            }
        );
    });
};

export const uploadMediaForGallery = async (orgId: string, file: File, onProgress: (p: number) => void): Promise<{ url: string }> => {
    if (isOffline) return { url: URL.createObjectURL(file) };
    if (!storage) throw new Error("Storage not initialized");

    const ref = storage.ref().child(`organizations/${orgId}/gallery/${Date.now()}_${file.name}`);
    const uploadTask = ref.put(file);
    
    return new Promise((resolve, reject) => {
        uploadTask.on('state_changed', 
            (snapshot) => onProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            (error) => reject(error),
            async () => {
                const url = await uploadTask.snapshot.ref.getDownloadURL();
                resolve({ url });
            }
        );
    });
};

export const addMediaItemsToLibrary = async (orgId: string, items: MediaItem[]) => {
    if (isOffline) {
        const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
        if (org) {
            org.mediaLibrary = [...(org.mediaLibrary || []), ...items];
        }
        return offlineWarning('addMediaItemsToLibrary');
    }
    if (!db) return;
    // Use arrayUnion to append without overwriting existing items that might have been added by backend
    await db.collection('organizations').doc(orgId).update({
        mediaLibrary: firebase.firestore.FieldValue.arrayUnion(...items)
    });
};

// --- SUGGESTIONS & AI ---

export const listenToSuggestedPosts = (orgId: string, callback: (posts: SuggestedPost[]) => void) => {
    if (isOffline) return () => {}; // Mock if needed
    if (!db) return () => {};
    return db.collection('organizations').doc(orgId).collection('suggestedPosts').onSnapshot(snap => {
        const posts = snap.docs.map(d => ({ id: d.id, ...d.data() } as SuggestedPost));
        callback(posts);
    });
};

export const getSuggestedPostById = async (orgId: string, suggestionId: string): Promise<SuggestedPost | null> => {
    if (isOffline || !db) return null;
    const doc = await db.collection('organizations').doc(orgId).collection('suggestedPosts').doc(suggestionId).get();
    return doc.exists ? ({ id: doc.id, ...doc.data() } as SuggestedPost) : null;
};

export const updateSuggestedPost = async (orgId: string, suggestionId: string, data: Partial<SuggestedPost>) => {
    if (isOffline) return offlineWarning('updateSuggestedPost');
    if (!db) return;
    await db.collection('organizations').doc(orgId).collection('suggestedPosts').doc(suggestionId).update(sanitizeForFirestore(data));
};

export const listenToVideoOperationForPost = (orgId: string, postId: string, callback: (op: VideoOperation | null) => void) => {
    if (isOffline || !db) return () => {};
    // Updated to listen to subcollection under organization
    return db.collection('organizations').doc(orgId).collection('videoOperations')
        .where('postId', '==', postId).orderBy('createdAt', 'desc').limit(1)
        .onSnapshot(snap => {
            if (!snap.empty) callback({ id: snap.docs[0].id, ...snap.docs[0].data() } as VideoOperation);
            else callback(null);
        });
};

export const createVideoOperation = async (orgId: string, screenId: string, postId: string, prompt: string, operationName: string) => {
    if (isOffline) return 'mock-op-id';
    if (!db) throw new Error("DB not initialized");
    if (!auth?.currentUser) throw new Error("User not authenticated");

    const opId = operationName.split('/').pop(); // Extract clean ID if it's a path
    // Updated to save under organization subcollection
    const docRef = db.collection('organizations').doc(orgId).collection('videoOperations').doc(opId || `op-${Date.now()}`);
    
    await docRef.set({
        operationName: operationName,
        orgId,
        screenId,
        postId,
        userId: auth.currentUser.uid,
        status: 'processing',
        model: 'veo-3.1-fast-generate-preview',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
};

export const listenToInstagramStories = (orgId: string, callback: (stories: InstagramStory[]) => void) => {
    if (isOffline) {
        return () => {};
    }
    if (!db) return () => {};
    return db.collection('organizations').doc(orgId).collection('instagramStories')
        .orderBy('timestamp', 'desc')
        .limit(10)
        .onSnapshot(snap => {
            const stories = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InstagramStory));
            callback(stories);
        });
};

// --- CLOUD FUNCTIONS ---

export const getVoiceServerConfig = async (): Promise<{ url: string }> => {
    if (isOffline) return { url: 'ws://localhost:8080' };
    if (!functions) throw new Error("Functions not initialized");
    const fn = functions.httpsCallable('getVoiceServerConfig');
    const result = await fn();
    return result.data as { url: string };
};

export const callTestFunction = async (): Promise<any> => {
    if (isOffline) return { message: 'Offline test' };
    if (!functions) return;
    const fn = functions.httpsCallable('testFunction');
    const result = await fn();
    return result.data;
};

export const runOrgCollectionsMigration = async (payload: any) => {
    if (isOffline) return { message: 'Migration simulated (Offline)' };
    if (!functions) throw new Error("Functions not initialized");
    const fn = functions.httpsCallable('runOrgCollectionsMigration');
    const result = await fn(payload);
    return result.data;
};