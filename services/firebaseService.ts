// services/firebaseService.ts
import type firebase from 'firebase/compat/app';
import { auth, db, storage, functions, firebase as firebaseApp, isOffline } from './firebaseInit';

import {
  Organization,
  CustomPage,
  UserData,
  Workout,
  InfoCarousel,
  DisplayScreen,
  Tag,
  SystemSettings,
  ScreenPairingCode,
  PostTemplate,
  PhysicalScreen,
  AppNotification,
  MediaItem,
  InstagramStory,
  SuggestedPost,
  VideoOperation,
} from '../types';

import {
  MOCK_ORGANIZATIONS,
  MOCK_SYSTEM_OWNER,
  MOCK_ORG_ADMIN,
  MOCK_SYSTEM_SETTINGS,
  MOCK_PAIRING_CODES,
} from '../data/mockData';

// Export isOffline for use in components (though they should prefer Context/Hooks)
export { isOffline };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Strips undefined values to prevent Firestore errors
function sanitizeData<T>(data: T): T {
  if (data === undefined || data === null) return data;
  try {
    return JSON.parse(JSON.stringify(data));
  } catch (e) {
    console.error("Failed to sanitize data:", e);
    return data;
  }
}

// Log warning for offline actions that don't persist
const offlineWarning = (op: string) => {
  console.warn(`OFFLINE MODE: "${op}" simulerades men sparas inte permanent.`);
  return Promise.resolve();
};

// Type guard
function isNotificationType(type: any): type is AppNotification['type'] {
  return ['info', 'warning', 'success', 'suggestion', 'error'].includes(type);
}

// ---------------------------------------------------------------------------
// Mock Backend Implementation
// ---------------------------------------------------------------------------

// Registry for mock listeners to simulate realtime updates
const mockOrgListeners: Record<string, ((snap: any) => void)[]> = {};

const MockBackend = {
  // --- Auth ---
  onAuthChange: (cb: (user: firebase.User | null) => void) => {
     // Simulate a user being logged in immediately in offline mode
     const mockUser = { uid: 'offline_owner_uid', isAnonymous: false, email: MOCK_SYSTEM_OWNER.email } as firebase.User;
     cb(mockUser);
     return () => {};
  },
  signIn: (email: string, _password: string) => {
     if (email === MOCK_SYSTEM_OWNER.email) return Promise.resolve({ uid: MOCK_SYSTEM_OWNER.uid, isAnonymous: false } as firebase.User);
     if (email === MOCK_ORG_ADMIN.email) return Promise.resolve({ uid: MOCK_ORG_ADMIN.uid, isAnonymous: false } as firebase.User);
     return Promise.reject(new Error('Offline mode: User not found in mock data.'));
  },
  signInAsScreen: () => Promise.resolve({ uid: 'offline_studio_uid', isAnonymous: true } as firebase.User),
  signOut: () => Promise.resolve(),
  requestPasswordReset: (email: string) => { console.log(`(Offline) Reset for ${email}`); return Promise.resolve(); },
  verifyPasswordResetToken: () => Promise.resolve(MOCK_ORG_ADMIN.email),
  confirmPasswordReset: () => Promise.resolve(),
  getUserData: (uid: string) => {
      if (uid === MOCK_SYSTEM_OWNER.uid) return Promise.resolve(MOCK_SYSTEM_OWNER);
      if (uid === MOCK_ORG_ADMIN.uid) return Promise.resolve(MOCK_ORG_ADMIN);
      return Promise.resolve(null);
  },

  // --- Organizations ---
  getOrganizations: () => Promise.resolve([...MOCK_ORGANIZATIONS]),
  getOrganizationById: (id: string) => {
      // Check localStorage first for potential multi-tab sync in mock mode
      const storedOrgs = localStorage.getItem('mock_organizations');
      if (storedOrgs) {
          const parsedOrgs = JSON.parse(storedOrgs);
          const org = parsedOrgs.find((o: any) => o.id === id);
          if (org) return Promise.resolve(org);
      }
      return Promise.resolve(MOCK_ORGANIZATIONS.find(o => o.id === id) || null);
  },
  
  listenToOrganizationChanges: (id: string, onUpdate: (snap: any) => void) => {
      if (!mockOrgListeners[id]) mockOrgListeners[id] = [];
      mockOrgListeners[id].push(onUpdate);

      const getOrgData = () => {
           const storedOrgs = localStorage.getItem('mock_organizations');
           if (storedOrgs) {
                return JSON.parse(storedOrgs).find((o: any) => o.id === id);
           }
           return MOCK_ORGANIZATIONS.find(o => o.id === id);
      }

      // Simulate a snapshot object for the UI immediately
      const org = getOrgData();
      // Clone object to simulate a fresh snapshot
      const snapshotData = org ? JSON.parse(JSON.stringify(org)) : null;
      setTimeout(() => onUpdate({ exists: !!org, data: () => snapshotData, id, metadata: { hasPendingWrites: false } }), 0);
      
      // Poll localStorage for changes in offline mode
      const interval = setInterval(() => {
           const currentOrg = getOrgData();
           if (currentOrg) {
               // In a real app we'd diff, but here we just send updates occasionally
               const snap = JSON.parse(JSON.stringify(currentOrg));
               onUpdate({ exists: true, data: () => snap, id, metadata: { hasPendingWrites: false } });
           }
      }, 1000);

      return () => {
          clearInterval(interval);
          mockOrgListeners[id] = mockOrgListeners[id].filter(l => l !== onUpdate);
      };
  },
  
  createOrganization: (data: any) => {
      const newOrg = { id: `offline_org_${Date.now()}`, ...data, subdomain: `offline-${Date.now()}`, customPages: [], mediaLibrary: [] };
      MOCK_ORGANIZATIONS.push(newOrg);
      return Promise.resolve(newOrg);
  },
  
  updateOrganization: (id: string, data: any) => {
      const org = MOCK_ORGANIZATIONS.find(o => o.id === id);
      if (org) {
          Object.assign(org, sanitizeData(data));
          // Sync to localstorage for cross-tab visibility
          localStorage.setItem('mock_organizations', JSON.stringify(MOCK_ORGANIZATIONS));

          // Notify listeners
          if (mockOrgListeners[id]) {
              const snapshotData = JSON.parse(JSON.stringify(org));
              mockOrgListeners[id].forEach(cb => cb({ exists: true, data: () => snapshotData, id, metadata: { hasPendingWrites: false } }));
          }
      }
      return Promise.resolve();
  },
  
  deleteOrganization: (id: string) => {
      const idx = MOCK_ORGANIZATIONS.findIndex(o => o.id === id);
      if (idx > -1) MOCK_ORGANIZATIONS.splice(idx, 1);
      return Promise.resolve();
  },
  
  // --- Screens & Content ---
  listenToDisplayScreens: (orgId: string, onUpdate: (screens: DisplayScreen[]) => void) => {
      const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
      setTimeout(() => onUpdate(org?.displayScreens || []), 0);
      return () => {};
  },
  addDisplayScreen: (orgId: string, screen: DisplayScreen) => {
      const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
      if (org) {
          org.displayScreens = [...(org.displayScreens || []), screen];
      }
      return Promise.resolve();
  },
  updateDisplayScreen: (orgId: string, screenId: string, data: Partial<DisplayScreen>) => {
       const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
       const screen = org?.displayScreens?.find(s => s.id === screenId);
       if (screen) Object.assign(screen, sanitizeData(data));
       return Promise.resolve();
  },
  deleteDisplayScreen: (orgId: string, screenId: string) => {
      const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
      if (org) org.displayScreens = (org.displayScreens || []).filter(s => s.id !== screenId);
      return Promise.resolve();
  },

  // --- Media/Storage ---
  uploadMedia: (file: File) => new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
  }),

  // --- AI & Automation ---
  listenToSuggestedPosts: (_orgId: string, onUpdate: (posts: SuggestedPost[]) => void) => {
      setTimeout(() => onUpdate([]), 0); // Empty mock for now
      return () => {};
  },
  
  // --- Pairing (Updated to use localStorage for tab-to-tab communication) ---
  createPairingCode: () => {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const existingCodes = JSON.parse(localStorage.getItem('mock_pairing_codes') || '[]');
      existingCodes.push({ 
          code, 
          status: 'pending', 
          createdAt: new Date().toISOString() 
      });
      localStorage.setItem('mock_pairing_codes', JSON.stringify(existingCodes));
      return Promise.resolve(code);
  },
  listenToPairingCode: (code: string, onUpdate: (data: ScreenPairingCode) => void) => {
       // Poll localStorage to detect changes from other tabs
       const check = () => {
           const codes = JSON.parse(localStorage.getItem('mock_pairing_codes') || '[]');
           const found = codes.find((c: any) => c.code === code);
           if (found) onUpdate(found);
       };
       check();
       const interval = setInterval(check, 1000);
       return () => clearInterval(interval);
  },
  getPairingCode: (code: string) => {
      const codes = JSON.parse(localStorage.getItem('mock_pairing_codes') || '[]');
      const found = codes.find((c: any) => c.code === code);
      // Fallback to static mock data if not found in LS
      const staticFound = MOCK_PAIRING_CODES.find(c => c.code === code);
      return Promise.resolve(found || staticFound || null);
  },
  pairScreen: (code: string, orgId: string, uid: string, details: any) => {
       const codes = JSON.parse(localStorage.getItem('mock_pairing_codes') || '[]');
       // Ensure we match case insensitive or stripped, but for mock exact match is fine if generated correctly
       const idx = codes.findIndex((c: any) => c.code === code);
       const pairedDeviceId = `phys_mock_${Date.now()}`;
       
       // Sync organization to localstorage so the other tab sees the new physical screen
       // In mock mode, MOCK_ORGANIZATIONS is the source of truth
       const targetOrg = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
       if (targetOrg) {
            const newScreen: PhysicalScreen = {
                id: pairedDeviceId,
                name: details.name,
                organizationId: orgId,
                displayScreenId: details.displayScreenId,
                pairedAt: new Date().toISOString(),
                pairedByUid: uid,
            };
            targetOrg.physicalScreens = [...(targetOrg.physicalScreens || []), newScreen];
            localStorage.setItem('mock_organizations', JSON.stringify(MOCK_ORGANIZATIONS));
       }

       if (idx > -1) {
           codes[idx].status = 'paired';
           codes[idx].organizationId = orgId;
           codes[idx].assignedDisplayScreenId = details.displayScreenId;
           codes[idx].pairedDeviceId = pairedDeviceId;
           codes[idx].pairedAt = new Date().toISOString();
           localStorage.setItem('mock_pairing_codes', JSON.stringify(codes));
       }
       
       return Promise.resolve({
           id: pairedDeviceId,
           name: details.name,
           organizationId: orgId,
           displayScreenId: details.displayScreenId,
           pairedAt: new Date().toISOString(),
           pairedByUid: uid
       });
  }
};

// ---------------------------------------------------------------------------
// Main Service Exports (The "Traffic Controller")
// ---------------------------------------------------------------------------

// --- Auth ---
export const onAuthChange = (cb: (user: firebase.User | null) => void) => 
    isOffline ? MockBackend.onAuthChange(cb) : auth!.onAuthStateChanged(cb);

export const signIn = (e: string, p: string) => 
    isOffline ? MockBackend.signIn(e, p) : auth!.signInWithEmailAndPassword(e, p).then(c => c.user as firebase.User);

export const signInAsScreen = () => 
    isOffline ? MockBackend.signInAsScreen() : auth!.signInAnonymously().then(c => c.user as firebase.User);

export const signOut = () => 
    isOffline ? MockBackend.signOut() : auth!.signOut();

export const requestPasswordReset = (e: string) => 
    isOffline ? MockBackend.requestPasswordReset(e) : auth!.sendPasswordResetEmail(e);

export const verifyPasswordResetToken = (t: string) => 
    isOffline ? MockBackend.verifyPasswordResetToken() : auth!.verifyPasswordResetCode(t);

export const confirmPasswordReset = (t: string, p: string) => 
    isOffline ? MockBackend.confirmPasswordReset() : auth!.confirmPasswordReset(t, p);

export const getUserData = async (uid: string): Promise<UserData | null> => {
    if (isOffline) return MockBackend.getUserData(uid);
    const snap = await db!.collection('users').doc(uid).get();
    return snap.exists ? ({ uid, ...snap.data() } as UserData) : null;
};

// --- Organizations ---
export const getOrganizations = async (): Promise<Organization[]> => {
    if (isOffline) return MockBackend.getOrganizations();
    const qs = await db!.collection('organizations').get();
    return qs.docs.map(d => d.data() as Organization);
};

export const getOrganizationById = async (id: string): Promise<Organization | null> => {
    if (isOffline) return MockBackend.getOrganizationById(id);
    const snap = await db!.collection('organizations').doc(id).get();
    return snap.exists ? (snap.data() as Organization) : null;
};

export const listenToOrganizationChanges = (id: string, onUpdate: (snap: any) => void) => {
    if (isOffline) return MockBackend.listenToOrganizationChanges(id, onUpdate);
    return db!.collection('organizations').doc(id).onSnapshot(
        { includeMetadataChanges: true },
        s => s.exists && onUpdate(s),
        e => console.error(`Org listener error:`, e)
    );
};

export const createOrganization = async (data: Pick<Organization, 'name' | 'email'>): Promise<Organization> => {
    if (isOffline) return MockBackend.createOrganization(data);
    
    const sanitized = data.name.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const subdomain = `${sanitized}-${Date.now()}`;
    
    // Check for uniqueness (online only)
    const q = db!.collection('organizations').where('subdomain', '==', subdomain);
    if (!(await q.get()).empty) throw new Error('Kunde inte skapa unik subdomän, försök igen.');

    const newOrg: Organization = {
        id: `org_${subdomain}`,
        name: data.name,
        subdomain,
        customPages: [],
        email: data.email,
        mediaLibrary: [],
    };
    await db!.collection('organizations').doc(newOrg.id).set(sanitizeData(newOrg));
    return newOrg;
};

export const updateOrganization = async (id: string, data: Partial<Organization>) => {
    if (isOffline) return MockBackend.updateOrganization(id, data);
    await db!.collection('organizations').doc(id).update(sanitizeData(data));
};

export const deleteOrganization = async (organizationId: string): Promise<void> => {
    if (isOffline) return MockBackend.deleteOrganization(organizationId);
    const deleteOrgFn = functions!.httpsCallable('deleteOrganization');
    await deleteOrgFn({ organizationId });
};

// --- Display Screens ---
export const listenToDisplayScreens = (orgId: string, onUpdate: (screens: DisplayScreen[]) => void) => {
    if (isOffline) return MockBackend.listenToDisplayScreens(orgId, onUpdate);
    return db!.collection('organizations').doc(orgId).collection('displayScreens').onSnapshot(
        snap => onUpdate(snap.docs.map(d => d.data() as DisplayScreen)),
        err => { console.error("Screens listener error:", err); onUpdate([]); }
    );
};

export const addDisplayScreen = async (orgId: string, screen: DisplayScreen) => {
    if (isOffline) return MockBackend.addDisplayScreen(orgId, screen);
    await db!.collection('organizations').doc(orgId).collection('displayScreens').doc(screen.id).set(sanitizeData(screen));
};

export const updateDisplayScreen = async (orgId: string, screenId: string, data: Partial<DisplayScreen>) => {
    if (isOffline) return MockBackend.updateDisplayScreen(orgId, screenId, data);
    await db!.collection('organizations').doc(orgId).collection('displayScreens').doc(screenId).update(sanitizeData(data));
};

export const deleteDisplayScreen = async (orgId: string, screenId: string) => {
    if (isOffline) return MockBackend.deleteDisplayScreen(orgId, screenId);
    await db!.collection('organizations').doc(orgId).collection('displayScreens').doc(screenId).delete();
};

// --- Specific Updates (Syntactic Sugar) ---
export const updateOrganizationLogos = (id: string, logos: any) => updateOrganization(id, { logoUrlLight: logos.light, logoUrlDark: logos.dark });
export const updateOrganizationTags = (id: string, tags: Tag[]) => updateOrganization(id, { tags });
export const updateOrganizationPostTemplates = (id: string, tpls: PostTemplate[]) => updateOrganization(id, { postTemplates: tpls });
export const updateOrganizationMediaLibrary = (id: string, lib: MediaItem[]) => updateOrganization(id, { mediaLibrary: lib });

// --- Media Upload ---
const uploadFileGeneric = (orgId: string, file: File, pathStart: string, onProgress: (n: number) => void): Promise<string> => {
    if (isOffline) {
        onProgress(100);
        return MockBackend.uploadMedia(file);
    }
    return new Promise((resolve, reject) => {
        const path = `organizations/${orgId}/${pathStart}/${Date.now()}-${file.name}`;
        const task = storage!.ref(path).put(file);
        task.on('state_changed', 
            s => onProgress((s.bytesTransferred / s.totalBytes) * 100),
            e => reject(e),
            () => task.snapshot.ref.getDownloadURL().then(resolve).catch(reject)
        );
    });
};

export const uploadVideo = (orgId: string, file: File, onP: (n: number) => void) => uploadFileGeneric(orgId, file, 'videos', onP);
export const uploadPostAsset = (orgId: string, postId: string, file: File, onP: (n: number) => void) => uploadFileGeneric(orgId, file, `post_assets/${postId}`, onP);

export const uploadMediaForGallery = (orgId: string, file: File, onP: (n: number) => void) => {
    const type = file.type.startsWith('video/') ? 'videos' : 'images';
    return uploadFileGeneric(orgId, file, type, onP).then(url => ({
        url, type: type === 'videos' ? 'video' : 'image', size: file.size
    } as const));
};

export const deleteMediaFromStorage = async (url: string) => {
    if (isOffline || !url.includes('firebasestorage')) return offlineWarning('deleteMedia');
    try { await storage!.refFromURL(url).delete(); } 
    catch (e: any) { if (e.code !== 'storage/object-not-found') throw e; }
};

// --- Suggested Posts (AI) ---
export const listenToSuggestedPosts = (orgId: string, onUpdate: (posts: SuggestedPost[]) => void) => {
    if (isOffline) return MockBackend.listenToSuggestedPosts(orgId, onUpdate);
    return db!.collection('organizations').doc(orgId).collection('suggestedPosts')
        .orderBy('createdAt', 'desc').limit(50)
        .onSnapshot(
            s => onUpdate(s.docs.map(d => d.data() as SuggestedPost)),
            e => { console.error("Suggestions listener error:", e); onUpdate([]); }
        );
};

export const getSuggestedPostById = async (orgId: string, suggId: string): Promise<SuggestedPost | null> => {
    if (isOffline) return null;
    const snap = await db!.collection('organizations').doc(orgId).collection('suggestedPosts').doc(suggId).get();
    return snap.exists ? (snap.data() as SuggestedPost) : null;
};

export const updateSuggestedPost = async (orgId: string, suggId: string, data: Partial<SuggestedPost>) => {
    if (isOffline) return offlineWarning('updateSuggestedPost');
    await db!.collection('organizations').doc(orgId).collection('suggestedPosts').doc(suggId).update(sanitizeData(data));
};

export const deleteSuggestedPost = async (orgId: string, suggId: string) => {
    if (isOffline) return offlineWarning('deleteSuggestedPost');
    await db!.collection('organizations').doc(orgId).collection('suggestedPosts').doc(suggId).delete();
};

// --- System Settings ---
export const getSystemSettings = async (): Promise<SystemSettings> => {
    if (isOffline) return MOCK_SYSTEM_SETTINGS;
    const snap = await db!.collection('system_settings').doc('main').get();
    return snap.exists ? (snap.data() as SystemSettings) : { id: 'main' };
};

export const updateSystemSettings = async (data: Partial<SystemSettings>) => {
    if (isOffline) { Object.assign(MOCK_SYSTEM_SETTINGS, data); return; }
    await db!.collection('system_settings').doc('main').set(sanitizeData(data), { merge: true });
};

// --- Notifications ---
export const createSystemAnnouncement = async (title: string, message: string) => {
    if (isOffline) return offlineWarning('createAnnouncement');
    await db!.collection('systemAnnouncements').add({
        title, message, type: 'info', createdAt: firebaseApp.firestore.FieldValue.serverTimestamp()
    });
};

export const listenToSystemAnnouncements = (onUpdate: (items: AppNotification[]) => void) => {
    if (isOffline) { setTimeout(() => onUpdate([]), 0); return () => {}; }
    return db!.collection('systemAnnouncements').orderBy('createdAt', 'desc').limit(20).onSnapshot(
        s => onUpdate(s.docs.map(d => ({ id: `sys-${d.id}`, ...d.data() } as any))),
        () => onUpdate([])
    );
};

export const updateSystemAnnouncement = async (id: string, data: any) => {
    if (isOffline) return offlineWarning('updateAnnouncement');
    await db!.collection('systemAnnouncements').doc(id.replace('sys-', '')).update(data);
};

export const deleteSystemAnnouncement = async (id: string) => {
    if (isOffline) return offlineWarning('deleteAnnouncement');
    await db!.collection('systemAnnouncements').doc(id.replace('sys-', '')).delete();
};

export const listenToUserNotifications = (uid: string, onUpdate: (items: AppNotification[]) => void) => {
    if (isOffline) { setTimeout(() => onUpdate([]), 0); return () => {}; }
    return db!.collection('users').doc(uid).collection('notifications').orderBy('createdAt', 'desc').limit(20).onSnapshot(
        s => onUpdate(s.docs.map(d => ({ id: d.id, ...d.data() } as any))),
        () => onUpdate([])
    );
};

export const markUserNotificationAsRead = async (uid: string, nid: string) => {
    if (isOffline) return;
    await db!.collection('users').doc(uid).collection('notifications').doc(nid).update({ isRead: true });
};

export const markAllUserNotificationsAsRead = async (uid: string, nids: string[]) => {
    if (isOffline) return;
    const batch = db!.batch();
    nids.forEach(id => batch.update(db!.collection('users').doc(uid).collection('notifications').doc(id), { isRead: true }));
    await batch.commit();
};

// --- Pairing ---
export const createPairingCode = async () => {
    if (isOffline) return MockBackend.createPairingCode();

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const currentUser = auth!.currentUser;
    
    // Use .set() on a doc with the ID equal to the code, so we can find it easily by code later.
    // Save the createdByUid so we know who owns the session initially (the screen)
    await db!.collection('screenPairingCodes').doc(code).set({
        code,
        status: 'pending',
        createdByUid: currentUser ? currentUser.uid : null,
        createdAt: firebaseApp.firestore.FieldValue.serverTimestamp()
    });
    return code;
};

export const listenToPairingCode = (code: string, cb: (data: ScreenPairingCode) => void) => {
    if (isOffline) return MockBackend.listenToPairingCode(code, cb);
    return db!.collection('screenPairingCodes').doc(code).onSnapshot(s => s.exists && cb(s.data() as ScreenPairingCode));
};

export const listenToPairingCodeByDeviceId = (deviceId: string, cb: (data: ScreenPairingCode | null) => void) => {
    if (isOffline) { 
        // Offline mode logic for reading localStorage
        const check = () => {
             const codes = JSON.parse(localStorage.getItem('mock_pairing_codes') || '[]');
             const found = codes.find((c: any) => c.pairedDeviceId === deviceId);
             if (found) cb(found);
             else cb(null);
        };
        check();
        const interval = setInterval(check, 2000);
        return () => clearInterval(interval);
    }
    return db!.collection('screenPairingCodes').where('pairedDeviceId', '==', deviceId).limit(1).onSnapshot(
        s => cb(s.empty ? null : s.docs[0].data() as ScreenPairingCode)
    );
};

export const getPairingCode = async (code: string): Promise<ScreenPairingCode | null> => {
    if (isOffline) return MockBackend.getPairingCode(code);
    const snap = await db!.collection('screenPairingCodes').doc(code).get();
    return snap.exists ? snap.data() as ScreenPairingCode : null;
};

export const pairAndActivateScreen = async (code: string, orgId: string, uid: string, details: {name: string, displayScreenId: string}) => {
    if (isOffline) return MockBackend.pairScreen(code, orgId, uid, details);
    
    // Retrieve the screen's anonymous UID from the code doc
    const codeDoc = await db!.collection('screenPairingCodes').doc(code).get();
    const screenUid = codeDoc.data()?.createdByUid;

    const deviceId = `phys_${Date.now()}`;
    const newScreen: PhysicalScreen = {
        id: deviceId,
        name: details.name,
        organizationId: orgId,
        displayScreenId: details.displayScreenId,
        pairedAt: new Date().toISOString(),
        pairedByUid: uid,
    };

    const batch = db!.batch();
    // Update the pairing code doc.
    batch.update(db!.collection('screenPairingCodes').doc(code), {
        status: 'paired', organizationId: orgId, assignedDisplayScreenId: details.displayScreenId,
        pairedByUid: uid, pairedAt: firebaseApp.firestore.FieldValue.serverTimestamp(), pairedDeviceId: deviceId
    });
    batch.update(db!.collection('organizations').doc(orgId), {
        physicalScreens: firebaseApp.firestore.FieldValue.arrayUnion(sanitizeData(newScreen))
    });
    
    // Create the session document. Crucially, include the screen's UID to allow it access via security rules.
    batch.set(db!.collection('screenSessions').doc(deviceId), {
        deviceId, 
        organizationId: orgId, 
        displayScreenId: details.displayScreenId, 
        forceDisconnect: false, 
        updatedAt: firebaseApp.firestore.FieldValue.serverTimestamp(),
        screenUid: screenUid || null // Link session to specific auth user
    }, { merge: true });

    await batch.commit();
    return newScreen;
};

export const unpairPhysicalScreen = async (orgId: string, screenId: string) => {
    if (isOffline) {
        const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId);
        if (org) org.physicalScreens = (org.physicalScreens || []).filter(s => s.id !== screenId);
        return offlineWarning('unpairScreen');
    }
    await db!.collection('organizations').doc(orgId).update({
        physicalScreens: firebaseApp.firestore.FieldValue.arrayRemove({ id: screenId } as any)
    });
    await db!.collection('screenSessions').doc(screenId).delete();
};

export const listenToScreenSession = (deviceId: string, cb: (doc: any) => void) => {
    if (isOffline) { setTimeout(() => cb({ deviceId }), 0); return () => {}; }
    return db!.collection('screenSessions').doc(deviceId).onSnapshot(
        s => cb(s.exists ? s.data() : null),
        e => { 
            console.error("Session listener error:", e); 
            // In case of permission denied or other errors, we usually don't want to instantly disconnect
            // unless we are sure. However, the lack of callback might hang the loading state.
            // For safety, we log it. The consumer hook handles the 'grace period'.
        }
    );
};

// --- Cloud Functions Wrappers ---
export const callTestFunction = async () => {
    if (isOffline) return { message: 'Offline test response' };
    return (await functions!.httpsCallable('testFunction')()).data;
};

export const getVoiceServerConfig = async () => {
    if (isOffline) return { url: 'ws://localhost:8080' };
    return (await functions!.httpsCallable('getVoiceServerConfig')()).data as { url: string };
};

export const runOrgCollectionsMigration = async (payload: any) => {
    if (isOffline) return { message: 'Offline migration simulated.' };
    return (await functions!.httpsCallable('migrateOrgCollections')(payload)).data;
};

export const inviteUser = async (orgId: string, email: string) => {
    if (isOffline) return { success: true, message: 'Offline invite simulated.' };
    return (await functions!.httpsCallable('inviteUser')({ organizationId: orgId, email })).data as any;
};

export const listenToVideoOperationForPost = (orgId: string, postId: string, onUpdate: (op: VideoOperation | null) => void) => {
    if (isOffline) return () => {};
    return db!.collection('videoOperations')
        .where('orgId', '==', orgId).where('postId', '==', postId)
        .orderBy('createdAt', 'desc').limit(1)
        .onSnapshot(s => onUpdate(s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() } as VideoOperation));
};

// --- Misc ---
export const listenToInstagramStories = (orgId: string, onUpdate: (stories: InstagramStory[]) => void) => {
    if (isOffline) { setTimeout(() => onUpdate([]), 0); return () => {}; }
    return db!.collection('organizations').doc(orgId).collection('instagramStories').orderBy('timestamp', 'desc').onSnapshot(
        s => onUpdate(s.docs.map(d => d.data() as InstagramStory))
    );
};

export const getAdminsForOrganization = async (orgId: string): Promise<UserData[]> => {
    if (isOffline) return [MOCK_ORG_ADMIN];
    const qs = await db!.collection('users').where('organizationId', '==', orgId).where('role', '==', 'organizationadmin').get();
    return qs.docs.map(d => ({ uid: d.id, ...d.data() } as UserData));
};

export const setAdminRole = async (uid: string, role: 'superadmin' | 'admin') => {
    if (isOffline) return offlineWarning('setAdminRole');
    await db!.collection('users').doc(uid).update({ adminRole: role });
};