// services/firebaseService.ts
import type firebase from 'firebase/compat/app';
import { env, app, auth, db, storage, functions, firebase as firebaseApp } from './firebaseInit';

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
} from '../types';

import {
  MOCK_ORGANIZATIONS,
  MOCK_SYSTEM_OWNER,
  MOCK_ORG_ADMIN,
  MOCK_SYSTEM_SETTINGS,
  MOCK_PAIRING_CODES,
} from '../data/mockData';

// ---------------------------------------------------------------------------
// Offline-läge
// ---------------------------------------------------------------------------
export const isOffline = env === 'offline';

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
// REPLACED: The old implementation incorrectly converted Timestamps and Dates to strings.
// This new version correctly handles Firestore data types, converts JS Dates to Timestamps,
// sanitizes undefined values, and handles other unsupported data to prevent "400 Bad Request" errors on writes.
function removeUndefinedValues<T = any>(input: T): T {
  // OFFLINE/ONLINE FIX: Conditionally access Firestore-specific types only when online to prevent crashes in AI Studio.
  const firestoreTypes = !isOffline && firebaseApp.firestore
    ? {
        Timestamp: firebaseApp.firestore.Timestamp,
        GeoPoint: firebaseApp.firestore.GeoPoint,
        FieldValue: firebaseApp.firestore.FieldValue,
        DocumentReference: firebaseApp.firestore.DocumentReference,
      }
    : null;

  const isFieldValue = (v: any): v is firebase.firestore.FieldValue => {
    // Check if FieldValue type exists and if v is an instance of it.
    return !!(firestoreTypes?.FieldValue && v instanceof firestoreTypes.FieldValue);
  }
  
  const walk = (v: any, inArray = false): any => {
    if (v === undefined) {
      // In an array, undefined must be converted to null.
      // In an object, it will be stripped by the object handler returning undefined.
      return inArray ? null : undefined;
    }
    if (v === null) return null;

    const t = typeof v;

    if (t === 'number') return Number.isFinite(v) ? v : null; // Convert NaN/Infinity to null
    if (t === 'string' || t === 'boolean') return v;
    
    // OFFLINE/ONLINE FIX: Conditionally handle Firestore native types.
    if (firestoreTypes) {
        if (v instanceof firestoreTypes.Timestamp || v instanceof firestoreTypes.GeoPoint || v instanceof Uint8Array || v instanceof firestoreTypes.DocumentReference) {
            return v;
        }
    }
    
    // Convert JS Date.
    if (v instanceof Date) {
        if (firestoreTypes) {
            // ONLINE: Convert JS Date to Firestore Timestamp for server compatibility.
            return firestoreTypes.Timestamp.fromDate(v);
        } else {
            // OFFLINE (AI Studio): Convert JS Date to ISO string to avoid crashes and keep data readable.
            return v.toISOString();
        }
    }
    
    // Preserve FieldValue (e.g., serverTimestamp(), arrayUnion())
    if (isFieldValue(v)) return v;

    // Recursively handle arrays
    if (Array.isArray(v)) {
      return v.map(x => walk(x, true));
    }

    // Recursively handle plain objects
    if (t === 'object') {
      if (Object.prototype.toString.call(v) !== '[object Object]') {
        // For other complex objects we don't support, return null as a safeguard.
        return null;
      }

      const out: Record<string, any> = {};
      for (const k of Object.keys(v)) {
        const nv = walk(v[k], false);
        if (nv !== undefined) {
          out[k] = nv;
        }
      }
      return out;
    }

    // Fallback for any other type (should be rare)
    return null;
  };

  return walk(input);
}


const offlineWarning = (op: string) => {
  console.warn(`OFFLINE MODE: "${op}" skickades inte till servern.`);
  return Promise.resolve();
};

// ---------------------------------------------------------------------------
// Cloud Functions (NYTT)
// ---------------------------------------------------------------------------

export const callTestFunction = async (): Promise<any> => {
  if (isOffline || !functions) {
    await offlineWarning('callTestFunction');
    return {
      message: "Detta är ett offline-svar från callTestFunction.",
      timestamp: new Date().toISOString(),
    };
  }

  try {
    const testFunction = functions.httpsCallable('testFunction');
    const result = await testFunction();
    return result.data;
  } catch (error) {
    console.error("Fel vid anrop av Cloud Function 'testFunction':", error);
    // Kasta om felet så att den anropande koden kan hantera det (t.ex. visa ett felmeddelande)
    throw error;
  }
};

export const runOrgCollectionsMigration = async (payload: {
  dryRun?: boolean;
  orgId?: string;
  migrateChannels?: boolean;
}): Promise<any> => {
  if (isOffline || !functions) {
    await offlineWarning('runOrgCollectionsMigration');
    return {
      dryRun: payload.dryRun,
      message: "Detta är ett offline-svar från migreringen.",
    };
  }

  try {
    const migrateFunction = functions.httpsCallable('migrateOrgCollections');
    const result = await migrateFunction(payload);
    return result.data;
  } catch (error) {
    console.error("Fel vid anrop av Cloud Function 'migrateOrgCollections':", error);
    throw error;
  }
};


// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const onAuthChange = (cb: (user: firebase.User | null) => void) => {
  if (isOffline || !auth) {
    cb({ uid: 'offline_owner_uid', isAnonymous: false } as firebase.User);
    return () => {};
  }
  return auth.onAuthStateChanged(cb);
};

export const signIn = (email: string, password: string): Promise<firebase.User> => {
  if (isOffline || !auth) {
    if (email === MOCK_SYSTEM_OWNER.email) return Promise.resolve({ uid: MOCK_SYSTEM_OWNER.uid, isAnonymous: false } as firebase.User);
    if (email === MOCK_ORG_ADMIN.email)  return Promise.resolve({ uid: MOCK_ORG_ADMIN.uid,  isAnonymous: false } as firebase.User);
    return Promise.reject(new Error('Offline mode: Cannot sign in.'));
  }
  return auth.signInWithEmailAndPassword(email, password).then((uc) => uc.user as firebase.User);
};

export const signInAsScreen = (): Promise<firebase.User> => {
  if (isOffline || !auth) return Promise.resolve({ uid: 'offline_studio_uid', isAnonymous: true } as firebase.User);
  return auth.signInAnonymously().then((uc) => uc.user as firebase.User);
};

export const signOut = (): Promise<void> => {
  if (isOffline || !auth) return Promise.resolve();
  return auth.signOut();
};

export const requestPasswordReset = (email: string): Promise<void> => {
    if (isOffline || !auth) {
        console.log(`(Offline) Password reset requested for: ${email}`);
        return new Promise(resolve => setTimeout(resolve, 1000));
    }
    return auth.sendPasswordResetEmail(email);
};

export const verifyPasswordResetToken = async (token: string): Promise<string> => {
    if (isOffline || !auth) {
        if (token === 'VALID_OFFLINE_TOKEN') {
            return Promise.resolve(MOCK_ORG_ADMIN.email);
        }
        return Promise.reject(new Error("Invalid offline token"));
    }
    return auth.verifyPasswordResetCode(token);
};

export const confirmPasswordReset = async (token: string, newPassword: string): Promise<void> => {
    if (isOffline || !auth) {
        console.log(`(Offline) Password reset confirmed for token ${token}`);
        return Promise.resolve();
    }
    return auth.confirmPasswordReset(token, newPassword);
};

export const getUserData = async (uid: string): Promise<UserData | null> => {
  if (isOffline || !db) {
    if (uid === 'offline_owner_uid') return Promise.resolve(MOCK_SYSTEM_OWNER);
    if (uid === 'offline_admin_uid') return Promise.resolve(MOCK_ORG_ADMIN);
    return Promise.resolve(null);
  }
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  return snap.exists ? ({ uid, ...snap.data() } as UserData) : null;
};

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------
export const getOrganizations = async (): Promise<Organization[]> => {
  if (isOffline || !db) return Promise.resolve([...MOCK_ORGANIZATIONS]);
  const qs = await db.collection('organizations').get();
  return qs.docs.map((d) => d.data() as Organization);
};

export const getOrganizationById = async (organizationId: string): Promise<Organization | null> => {
  if (isOffline || !db) {
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    return Promise.resolve(org || null);
  }
  const ref = db.collection('organizations').doc(organizationId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as Organization;
};

export const listenToOrganizationChanges = (
  organizationId: string,
  onUpdate: (snapshot: firebase.firestore.DocumentSnapshot) => void
): (() => void) => {
  if (isOffline || !db) return () => {};
  const ref = db.collection('organizations').doc(organizationId);
  return ref.onSnapshot(
    { includeMetadataChanges: true },
    (s) => {
      if (s.exists) {
        onUpdate(s);
      }
    },
    (e) => console.error(`Error listening to organization ${organizationId}:`, e)
  );
};

const getUpdatedOrg = async (organizationId: string): Promise<Organization> => {
  if (isOffline || !db) {
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    return Promise.resolve(org ? { ...org } : (null as any));
  }
  const snap = await db.collection('organizations').doc(organizationId).get();
  if (!snap.exists) throw new Error('Organisationen försvann.');
  return snap.data() as Organization;
};

export const createOrganization = async (orgData: Pick<Organization, 'name' | 'email'>): Promise<Organization> => {
  const { name, email } = orgData;
  const sanitized = name.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const subdomain = `${sanitized}-${Date.now()}`;

  if (isOffline || !db) {
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

  const q = db.collection('organizations').where('subdomain', '==', subdomain);
  if (!(await q.get()).empty) throw new Error('Kunde inte skapa unik subdomän, försök igen.');

  const newOrg: Organization = {
    id: `org_${subdomain}`,
    name,
    subdomain,
    customPages: [],
    email,
    mediaLibrary: [],
  };
  await db.collection('organizations').doc(newOrg.id).set(newOrg);
  return newOrg;
};

export const updateOrganization = async (organizationId: string, data: Partial<Organization>): Promise<void> => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganization');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) Object.assign(org, removeUndefinedValues(data));
    return;
  }
  await db.collection('organizations').doc(organizationId).update(removeUndefinedValues(data));
};

export const deleteOrganization = async (organizationId: string): Promise<void> => {
  if (isOffline || !functions) {
    await offlineWarning('deleteOrganization');
    const i = MOCK_ORGANIZATIONS.findIndex((o) => o.id === organizationId);
    if (i > -1) MOCK_ORGANIZATIONS.splice(i, 1);
    return;
  }
  // NEW: Call the cloud function
  try {
      const deleteOrgFn = functions.httpsCallable('deleteOrganization');
      await deleteOrgFn({ organizationId });
  } catch (error) {
      console.error("Error calling deleteOrganization function:", error);
      // Re-throw the error so the UI layer can catch it and show a toast
      throw error;
  }
};

export const updateOrganizationLogos = async (organizationId: string, logos: { light?: string; dark?: string }): Promise<void> => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganizationLogos');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) {
      org.logoUrlLight = logos.light;
      org.logoUrlDark = logos.dark;
    }
    return;
  }
  await db.collection('organizations').doc(organizationId).update(
    removeUndefinedValues({
      logoUrlLight: logos.light,
      logoUrlDark: logos.dark,
    })
  );
};

export const updateOrganizationPrimaryColor = async (organizationId: string, primaryColor: string) => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganizationPrimaryColor');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) org.primaryColor = primaryColor;
    return getUpdatedOrg(organizationId);
  }
  await db.collection('organizations').doc(organizationId).update({ primaryColor });
  return getUpdatedOrg(organizationId);
};

export const updateOrganizationCustomPages = async (organizationId: string, customPages: CustomPage[]) => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganizationCustomPages');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) org.customPages = customPages;
    return getUpdatedOrg(organizationId);
  }
  await db.collection('organizations').doc(organizationId).update({ customPages: removeUndefinedValues(customPages) });
  return getUpdatedOrg(organizationId);
};

export const updateOrganizationInfoCarousel = async (organizationId: string, infoCarousel: InfoCarousel) => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganizationInfoCarousel');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) org.infoCarousel = infoCarousel;
    return getUpdatedOrg(organizationId);
  }
  await db.collection('organizations').doc(organizationId).update({ infoCarousel: removeUndefinedValues(infoCarousel) });
  return getUpdatedOrg(organizationId);
};

export const updateOrganizationTags = async (organizationId: string, tags: Tag[]): Promise<void> => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganizationTags');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) org.tags = tags;
    return;
  }
  await db.collection('organizations').doc(organizationId).update({ tags: removeUndefinedValues(tags) });
};

export const updateOrganizationPostTemplates = async (organizationId: string, postTemplates: PostTemplate[]): Promise<void> => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganizationPostTemplates');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) org.postTemplates = postTemplates;
    return;
  }
  await db.collection('organizations').doc(organizationId).update({ postTemplates: removeUndefinedValues(postTemplates) });
};

// ---------------------------------------------------------------------------
// Display Screens (Subcollection)
// ---------------------------------------------------------------------------

export const listenToDisplayScreens = (
  organizationId: string,
  onUpdate: (screens: DisplayScreen[]) => void
): (() => void) => {
  if (isOffline || !db) {
    const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
    setTimeout(() => onUpdate(org?.displayScreens || []), 0);
    return () => {};
  }
  const ref = db.collection('organizations').doc(organizationId).collection('displayScreens');
  return ref.onSnapshot(
    (snap) => {
      const screens = snap.docs.map(d => d.data() as DisplayScreen);
      onUpdate(screens);
    },
    (err) => {
      console.error(`Error listening to displayScreens for org ${organizationId}:`, err);
      onUpdate([]);
    }
  );
};

export const addDisplayScreen = async (organizationId: string, screenData: DisplayScreen): Promise<void> => {
    if (isOffline || !db) {
        const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
        if (org) {
            if (!org.displayScreens) org.displayScreens = [];
            org.displayScreens.push(screenData);
        }
        return offlineWarning('addDisplayScreen');
    }
    const ref = db.collection('organizations').doc(organizationId).collection('displayScreens').doc(screenData.id);
    await ref.set(removeUndefinedValues(screenData));
};

export const updateDisplayScreen = async (organizationId: string, screenId: string, data: Partial<DisplayScreen>): Promise<void> => {
    if (isOffline || !db) {
        const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
        const screen = org?.displayScreens?.find(s => s.id === screenId);
        if (screen) {
            Object.assign(screen, data);
        }
        return offlineWarning('updateDisplayScreen');
    }
    const ref = db.collection('organizations').doc(organizationId).collection('displayScreens').doc(screenId);
    await ref.update(removeUndefinedValues(data));
};

export const deleteDisplayScreen = async (organizationId: string, screenId: string): Promise<void> => {
    if (isOffline || !db) {
        const org = MOCK_ORGANIZATIONS.find(o => o.id === organizationId);
        if (org) {
            org.displayScreens = (org.displayScreens || []).filter(s => s.id !== screenId);
        }
        return offlineWarning('deleteDisplayScreen');
    }
    const ref = db.collection('organizations').doc(organizationId).collection('displayScreens').doc(screenId);
    await ref.delete();
};

// ---------------------------------------------------------------------------
// AI Suggested Posts (Subcollection) - NYTT
// ---------------------------------------------------------------------------

export const listenToSuggestedPosts = (
  organizationId: string,
  onUpdate: (posts: SuggestedPost[]) => void
): (() => void) => {
  if (isOffline || !db) {
    setTimeout(() => onUpdate([]), 0);
    return () => {};
  }
  const ref = db.collection('organizations').doc(organizationId).collection('suggestedPosts');
  const q = ref.orderBy('createdAt', 'desc').limit(50);

  return q.onSnapshot(
    (snap) => {
      const posts = snap.docs.map(d => d.data() as SuggestedPost);
      onUpdate(posts);
    },
    (err) => {
      console.error(`Error listening to suggestedPosts for org ${organizationId}:`, err);
      onUpdate([]);
    }
  );
};

export const getSuggestedPostById = async (organizationId: string, suggestionId: string): Promise<SuggestedPost | null> => {
    if (isOffline || !db) {
        // Mock implementation for offline mode can be added if needed, but for now returning null is fine
        // as this is a non-critical learning feature.
        return null; 
    }
    const ref = db.collection('organizations').doc(organizationId).collection('suggestedPosts').doc(suggestionId);
    const doc = await ref.get();
    return doc.exists ? (doc.data() as SuggestedPost) : null;
};

export const updateSuggestedPost = async (organizationId: string, suggestionId: string, data: Partial<Omit<SuggestedPost, 'id'>>): Promise<void> => {
  if (isOffline || !db) {
    return offlineWarning('updateSuggestedPost');
  }
  const ref = db.collection('organizations').doc(organizationId).collection('suggestedPosts').doc(suggestionId);
  await ref.update(removeUndefinedValues(data));
};

export const deleteSuggestedPost = async (organizationId: string, suggestionId: string): Promise<void> => {
  if (isOffline || !db) {
    return offlineWarning('deleteSuggestedPost');
  }
  const ref = db.collection('organizations').doc(organizationId).collection('suggestedPosts').doc(suggestionId);
  await ref.delete();
};


// ---------------------------------------------------------------------------
// System Settings
// ---------------------------------------------------------------------------
export const getSystemSettings = async (): Promise<SystemSettings> => {
  if (isOffline || !db) return Promise.resolve(MOCK_SYSTEM_SETTINGS);
  const ref = db.collection('system_settings').doc('main');
  const snap = await ref.get();
  return snap.exists ? (snap.data() as SystemSettings) : ({ id: 'main' } as SystemSettings);
};

export const updateSystemSettings = async (settings: Partial<SystemSettings>): Promise<void> => {
  if (isOffline || !db) {
    if (MOCK_SYSTEM_SETTINGS) Object.assign(MOCK_SYSTEM_SETTINGS, settings);
    return offlineWarning('updateSystemSettings');
  }
  await db.collection('system_settings').doc('main').set(removeUndefinedValues(settings), { merge: true });
};

// ---------------------------------------------------------------------------
// System Announcements (behövs av SystemOwnerScreen)
// ---------------------------------------------------------------------------
export const createSystemAnnouncement = async (title: string, message: string): Promise<void> => {
  if (isOffline || !db) {
    console.log(`[OFFLINE] System Announcement Sent: Title="${title}", Message="${message}"`);
    return offlineWarning('createSystemAnnouncement');
  }

  const docRef = db.collection('systemAnnouncements').doc();
  await docRef.set({
    title,
    message,
    type: 'info',
    createdAt: firebaseApp.firestore.FieldValue.serverTimestamp(),
  });
};

export const deleteSystemAnnouncement = async (announcementId: string): Promise<void> => {
  if (isOffline || !db) {
    console.log(`[OFFLINE] System Announcement Deleted: ID="${announcementId}"`);
    return offlineWarning('deleteSystemAnnouncement');
  }
  
  if (!announcementId.startsWith('sys-')) {
    throw new Error('Invalid system announcement ID format.');
  }
  const docId = announcementId.substring(4);

  const docRef = db.collection('systemAnnouncements').doc(docId);
  await docRef.delete();
};

export const updateSystemAnnouncement = async (announcementId: string, data: { title: string; message:string }): Promise<void> => {
  if (isOffline || !db) {
    console.log(`[OFFLINE] System Announcement Updated: ID="${announcementId}", Data="${JSON.stringify(data)}"`);
    return offlineWarning('updateSystemAnnouncement');
  }
  
  if (!announcementId.startsWith('sys-')) {
    throw new Error('Invalid system announcement ID format.');
  }
  const docId = announcementId.substring(4);

  const docRef = db.collection('systemAnnouncements').doc(docId);
  await docRef.update({
    ...data,
    updatedAt: firebaseApp.firestore.FieldValue.serverTimestamp(),
  });
};

export const getSystemAnnouncements = async (): Promise<AppNotification[]> => {
  if (isOffline || !db) {
    const mockData: AppNotification[] = [
      {
        id: 'sys-mock-1',
        createdAt: new Date().toISOString(),
        type: 'info',
        title: 'Offline-läge aktivt',
        message: 'Detta är ett exempel på ett systemmeddelande.',
        isRead: false,
      },
    ];
    return Promise.resolve(mockData);
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fromTs = firebaseApp.firestore.Timestamp.fromDate(thirtyDaysAgo);

  const snap = await db
    .collection('systemAnnouncements')
    .where('createdAt', '>=', fromTs)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    // FIX: Validated `data.type` to ensure it matches the `AppNotification['type']` union type, resolving a type incompatibility error.
    const type: AppNotification['type'] = (['info', 'warning', 'success', 'suggestion'] as const).find(t => t === data.type) || 'info';
    return {
      id: `sys-${doc.id}`,
      title: data.title,
      message: data.message,
      type: type,
      createdAt: (data.createdAt as firebase.firestore.Timestamp)?.toDate().toISOString() || new Date().toISOString(),
      isRead: false,
    };
  });
};

export const listenToSystemAnnouncements = (
  onUpdate: (announcements: AppNotification[]) => void
): (() => void) => {
  if (isOffline || !db) {
    const mockData: AppNotification[] = [
      {
        id: 'sys-mock-1',
        createdAt: new Date().toISOString(),
        type: 'info',
        title: 'Offline-läge aktivt',
        message: 'Detta är ett exempel på ett systemmeddelande.',
        isRead: false,
      },
      {
        id: 'sys-mock-2',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        type: 'info',
        title: 'Gårdagens meddelande',
        message: 'Ett annat meddelande från igår.',
        isRead: true,
      },
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setTimeout(() => onUpdate(mockData), 0);
    return () => {};
  }

  const ref = db.collection('systemAnnouncements').orderBy('createdAt', 'desc');

  return ref.onSnapshot(
    (snapshot) => {
      const announcements: AppNotification[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        // FIX: Validated `data.type` to ensure it conforms to the `AppNotification['type']` union, resolving a type error.
        const type: AppNotification['type'] = (['info', 'warning', 'success', 'suggestion'] as const).find(t => t === data.type) || 'info';
        return {
          id: `sys-${doc.id}`,
          title: data.title,
          message: data.message,
          type: type,
          createdAt: (data.createdAt as firebase.firestore.Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          isRead: false,
        };
      });
      onUpdate(announcements);
    },
    (error) => {
      console.error("Error listening to system announcements:", error);
      onUpdate([]);
    }
  );
};


// ---------------------------------------------------------------------------
// Admin helpers
// ---------------------------------------------------------------------------
export const getAdminsForOrganization = async (organizationId: string): Promise<UserData[]> => {
  if (isOffline || !db) {
    return Promise.resolve([
      MOCK_ORG_ADMIN,
      { uid: 'offline_admin_2', email: 'admin2@flexibel.app', role: 'organizationadmin', adminRole: 'admin', organizationId: 'org_flexibel_mock' } as any,
    ]);
  }
  const usersRef = db.collection('users');
  const q = usersRef.where('organizationId', '==', organizationId).where('role', '==', 'organizationadmin');
  const qs = await q.get();
  return qs.empty ? [] : qs.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserData);
};

export const setAdminRole = async (uid: string, adminRole: 'superadmin' | 'admin'): Promise<void> => {
  if (isOffline || !db) return offlineWarning('setAdminRole');
  await db.collection('users').doc(uid).update({ adminRole });
};

export const setUserScreenPin = async (uid: string, pin: string): Promise<void> => {
  if (isOffline || !db) return offlineWarning('setUserScreenPin');
  await db.collection('users').doc(uid).update({ screenPin: pin });
};

export const inviteUser = async (
  organizationId: string,
  email: string
): Promise<{ success: boolean; message: string; link?: string }> => {
  if (isOffline) {
    await offlineWarning('inviteUser');
    
    // Simulate checking for existing user in offline mode
    const existingAdmins = [
      MOCK_ORG_ADMIN,
      { uid: 'offline_admin_2', email: 'admin2@flexibel.app', role: 'organizationadmin', adminRole: 'admin', organizationId: 'org_flexibel_mock' } as any,
    ];

    if (existingAdmins.some(admin => admin.email === email)) {
        return { success: false, message: "Denna administratör finns redan." };
    }
    
    // The user list won't update because it's hardcoded, but we can return the correct success message.
    return { success: true, message: "Administratören har lagts till." };
  }
  try {
    if (!functions) throw new Error('Firebase Functions är inte initialiserat.');
    const fn = functions.httpsCallable('inviteUser');
    const res = await fn({ organizationId, email });
    return res.data as any;
  } catch (e: any) {
    const message = e?.message || 'Ett okänt serverfel inträffade.';
    return { success: false, message };
  }
};

// ---------------------------------------------------------------------------
// SCREEN PAIRING + SESSIONS
// ---------------------------------------------------------------------------
const generateCode = () => {
  const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
};

export const createPairingCode = async (): Promise<string> => {
  if (isOffline || !db) return Promise.resolve('ABC123');

  const codesRef = db.collection('screenPairingCodes');
  let code = '', exists = true;
  while (exists) {
    code = generateCode();
    const snap = await codesRef.doc(code).get();
    exists = snap.exists;
  }
  const doc: Omit<ScreenPairingCode, 'organizationId' | 'pairedByUid' | 'pairedAt' | 'assignedDisplayScreenId'> = {
    code,
    createdAt: firebaseApp.firestore.FieldValue.serverTimestamp() as any,
    status: 'pending',
  };
  await codesRef.doc(code).set(doc as any);
  return code;
};

export const listenToPairingCode = (code: string, onUpdate: (data: ScreenPairingCode) => void): (() => void) => {
  if (isOffline || !db) return () => {};
  const ref = db.collection('screenPairingCodes').doc(code);
  return ref.onSnapshot((s) => s.exists && onUpdate(s.data() as ScreenPairingCode));
};

export const listenToPairingCodeByDeviceId = (
  deviceId: string,
  onUpdate: (data: ScreenPairingCode | null) => void
): (() => void) => {
  if (isOffline || !db) {
    const found = MOCK_PAIRING_CODES.find((c) => (c as any).pairedDeviceId === deviceId) || null;
    setTimeout(() => onUpdate(found as any), 0);
    return () => {};
  }
  const q = db.collection('screenPairingCodes').where('pairedDeviceId', '==', deviceId).limit(1);
  return q.onSnapshot((snap) => {
    if (snap.empty) onUpdate(null);
    else onUpdate(snap.docs[0].data() as ScreenPairingCode);
  });
};

export const getPairingCode = async (code: string): Promise<ScreenPairingCode | null> => {
  if (isOffline || !db) {
    const found = MOCK_PAIRING_CODES.find((c) => c.code === code && c.status === 'pending');
    return Promise.resolve(found || null);
  }
  const ref = db.collection('screenPairingCodes').doc(code);
  const snap = await ref.get();
  return snap.exists ? (snap.data() as ScreenPairingCode) : null;
};

// --- Screen Sessions (för force disconnect i realtid)
type ScreenSessionDoc = {
  deviceId: string;
  organizationId?: string;
  displayScreenId?: string;
  forceDisconnect?: boolean;
  updatedAt?: any;
};

export const listenToScreenSession = (
  deviceId: string,
  onUpdate: (doc: ScreenSessionDoc | null) => void
): (() => void) => {
  if (isOffline || !db) {
    setTimeout(
      () => onUpdate({ deviceId, organizationId: 'offline', displayScreenId: 'offline', forceDisconnect: false }),
      0
    );
    return () => {};
  }
  const ref = db.collection('screenSessions').doc(deviceId);
  return ref.onSnapshot(
    (s) => onUpdate(s.exists ? ({ ...(s.data() as any) }) : null),
    (e) => {
      console.error('listenToScreenSession error:', e);
      onUpdate(null);
    }
  );
};

const upsertScreenSession = async (session: ScreenSessionDoc) => {
  if (isOffline || !db) return offlineWarning('upsertScreenSession');
  const ref = db.collection('screenSessions').doc(session.deviceId);
  await ref.set({ ...session, updatedAt: firebaseApp.firestore.FieldValue.serverTimestamp() }, { merge: true });
};

const deleteScreenSession = async (deviceId: string) => {
  if (isOffline || !db) return offlineWarning('deleteScreenSession');
  const ref = db.collection('screenSessions').doc(deviceId);
  await ref.delete();
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
    organizationId,
    displayScreenId: details.displayScreenId,
    pairedAt: new Date().toISOString(),
    pairedByUid: adminUid,
  };

  if (isOffline || !db) {
    const idx = MOCK_PAIRING_CODES.findIndex((c) => c.code === code);
    if (idx !== -1) {
      MOCK_PAIRING_CODES[idx] = {
        ...MOCK_PAIRING_CODES[idx],
        status: 'paired',
        organizationId,
        assignedDisplayScreenId: details.displayScreenId,
        pairedByUid: adminUid,
        pairedDeviceId: deviceId,
      } as any;
    }
    return Promise.resolve(newScreen);
  }

  const pairingRef = db.collection('screenPairingCodes').doc(code);
  const orgRef = db.collection('organizations').doc(organizationId);

  await db.runTransaction(async (tr) => {
    tr.update(pairingRef, {
      status: 'paired',
      organizationId,
      assignedDisplayScreenId: details.displayScreenId,
      pairedByUid: adminUid,
      pairedAt: firebaseApp.firestore.FieldValue.serverTimestamp(),
      pairedDeviceId: deviceId,
    });
    tr.update(orgRef, {
      physicalScreens: firebaseApp.firestore.FieldValue.arrayUnion(newScreen as any),
    });
  });

  await upsertScreenSession({
    deviceId,
    organizationId,
    displayScreenId: details.displayScreenId,
    forceDisconnect: false,
  });

  return newScreen;
};

export const unpairPhysicalScreen = async (organizationId: string, physicalScreenId: string): Promise<void> => {
  if (isOffline) {
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) org.physicalScreens = (org.physicalScreens || []).filter((s) => s.id !== physicalScreenId);
    const codeIdx = MOCK_PAIRING_CODES.findIndex((c) => (c as any).pairedDeviceId === physicalScreenId);
    if (codeIdx > -1) {
      (MOCK_PAIRING_CODES[codeIdx] as any).status = 'pending';
      delete (MOCK_PAIRING_CODES[codeIdx] as any).pairedDeviceId;
    }
    return offlineWarning('unpairPhysicalScreen');
  }

  const orgRef = db.collection('organizations').doc(organizationId);
  const pairingCodesRef = db.collection('screenPairingCodes');

  await db.runTransaction(async (tr) => {
    const orgDoc = await tr.get(orgRef);
    if (!orgDoc.exists) throw new Error('Organisationen kunde inte hittas.');
    const org = orgDoc.data() as Organization;

    const currentScreens = org.physicalScreens || [];
    const updatedScreens = currentScreens.filter(s => s.id !== physicalScreenId);
    
    tr.update(orgRef, { physicalScreens: updatedScreens });

    const pairingSnap = await pairingCodesRef.where('pairedDeviceId', '==', physicalScreenId).limit(1).get();
    if (!pairingSnap.empty) {
      const pairingRef = pairingSnap.docs[0].ref;
      tr.update(pairingRef, {
        status: 'pending',
        organizationId: firebaseApp.firestore.FieldValue.delete(),
        assignedDisplayScreenId: firebaseApp.firestore.FieldValue.delete(),
        pairedByUid: firebaseApp.firestore.FieldValue.delete(),
        pairedAt: firebaseApp.firestore.FieldValue.delete(),
        pairedDeviceId: firebaseApp.firestore.FieldValue.delete(),
      });
    }
  });

  await deleteScreenSession(physicalScreenId);
};


// ---------------------------------------------------------------------------
// Instagram Stories (behövs av InstagramStoryPost)
// ---------------------------------------------------------------------------
export const listenToInstagramStories = (
  organizationId: string,
  onUpdate: (stories: InstagramStory[]) => void
): (() => void) => {
  if (isOffline || !db) {
    const mock: InstagramStory[] = [
      { id: '1', mediaUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxu...', mediaType: 'IMAGE', timestamp: new Date().toISOString() },
      { id: '2', mediaUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxu...', mediaType: 'IMAGE', timestamp: new Date().toISOString() },
    ];
    setTimeout(() => onUpdate(mock), 0);
    return () => {};
  }

  const ref = db
    .collection('organizations')
    .doc(organizationId)
    .collection('instagramStories')
    .orderBy('timestamp', 'desc');

  return ref.onSnapshot(
    (snap) => onUpdate(snap.docs.map((d) => d.data() as InstagramStory)),
    (err) => {
      console.error('Error listening to Instagram stories:', err);
      onUpdate([]);
    }
  );
};

// ---------------------------------------------------------------------------
// Workouts (behövs om ni använder träningsflödet)
// ---------------------------------------------------------------------------
export const getWorkoutsForOrganization = async (organizationId: string): Promise<Workout[]> => {
  if (isOffline || !db) {
    if (!(window as any).mockWorkouts) (window as any).mockWorkouts = [];
    return Promise.resolve(((window as any).mockWorkouts as Workout[])
      .filter((w) => w.organizationId === organizationId)
      .sort((a, b) => (a.title > b.title ? 1 : -1)));
  }
  const q = db.collection('workouts').where('organizationId', '==', organizationId);
  const qs = await q.get();
  return qs.docs.map((doc) => doc.data() as Workout).sort((a, b) => (a.title > b.title ? 1 : -1));
};

export const saveWorkout = async (workout: Workout): Promise<void> => {
  if (isOffline || !db) {
    if (!(window as any).mockWorkouts) (window as any).mockWorkouts = [];
    const workouts: Workout[] = (window as any).mockWorkouts;
    const ix = workouts.findIndex((w) => w.id === workout.id);
    if (ix > -1) workouts[ix] = workout; else workouts.unshift(workout);
    (window as any).mockWorkouts = workouts;
    return offlineWarning('saveWorkout');
  }
  await db.collection('workouts').doc(workout.id).set(removeUndefinedValues(workout), { merge: true });
};

export const deleteWorkout = async (workoutId: string): Promise<void> => {
  if (isOffline || !db) {
    if ((window as any).mockWorkouts) {
      (window as any).mockWorkouts = ((window as any).mockWorkouts as Workout[]).filter((w) => w.id !== workoutId);
    }
    return offlineWarning('deleteWorkout');
  }
  await db.collection('workouts').doc(workoutId).delete();
};

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
const uploadMediaFileInternal = (
  organizationId: string,
  file: File,
  mediaType: 'images' | 'videos',
  onProgress: (progress: number) => void
): Promise<string> =>
  new Promise((resolve, reject) => {
    if (isOffline || !storage) {
      // Reject when offline so the caller can handle it, e.g., by saving a data URI.
      reject(new Error("Offline mode: Cannot upload to Firebase Storage."));
      return;
    }
    const path = `organizations/${organizationId}/${mediaType}/${Date.now()}-${file.name}`;
    const sref = storage.ref(path);
    const task = sref.put(file);
    task.on(
      'state_changed',
      (snap) => onProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      (err) => {
        console.error(`${mediaType} upload failed:`, err);
        reject(new Error(`Uppladdningen av ${mediaType === 'videos' ? 'videon' : 'bilden'} misslyckades.`));
      },
      () => task.snapshot.ref.getDownloadURL().then(resolve).catch(reject)
    );
  });

export const uploadVideo = (organizationId: string, file: File, onProgress: (p: number) => void) =>
  uploadMediaFileInternal(organizationId, file, 'videos', onProgress);

export const uploadMediaForGallery = (organizationId: string, file: File, onProgress: (p: number) => void) => {
  const type = file.type.startsWith('video/') ? 'videos' : 'images';
  return uploadMediaFileInternal(organizationId, file, type, onProgress).then((url) => ({
    url,
    type: type === 'videos' ? 'video' : 'image',
    size: file.size,
  }));
};

export const deleteMediaFromStorage = async (fileUrl: string): Promise<void> => {
  if (isOffline || !storage || !fileUrl.includes('firebasestorage.googleapis.com')) return offlineWarning('deleteMediaFromStorage');
  try {
    const ref = storage.refFromURL(fileUrl);
    await ref.delete();
  } catch (e: any) {
    if (e.code === 'storage/object-not-found') console.warn(`File not found: ${fileUrl}`);
    else {
      console.error(`Error deleting file: ${fileUrl}`, e);
      throw new Error('Kunde inte ta bort mediefilen från lagringen.');
    }
  }
};

export const updateOrganizationMediaLibrary = async (organizationId: string, mediaLibrary: MediaItem[]) => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganizationMediaLibrary');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) org.mediaLibrary = mediaLibrary;
    return getUpdatedOrg(organizationId);
  }
  await db.collection('organizations').doc(organizationId).update({ mediaLibrary: removeUndefinedValues(mediaLibrary) });
  return getUpdatedOrg(organizationId);
};