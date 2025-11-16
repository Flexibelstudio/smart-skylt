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
  ChatMessage,
  VideoOperation,
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
// FINAL FIX: This is the most robust way to ensure data is clean for Firestore.
// It strips out undefined, functions, classes, etc.
// NOTE: This should NOT be used on objects containing Firestore FieldValues (e.g., serverTimestamp()).
function sanitizeData<T>(data: T): T {
  if (data === undefined || data === null) {
    return data;
  }
  try {
    return JSON.parse(JSON.stringify(data));
  } catch (e) {
    console.error("Failed to sanitize data, returning as-is. This may cause Firestore errors.", e, data);
    return data;
  }
}

const offlineWarning = (op: string) => {
  console.warn(`OFFLINE MODE: "${op}" skickades inte till servern.`);
  return Promise.resolve();
};

// FIX: type guard för notifikationstyp
function isNotificationType(type: any): type is AppNotification['type'] {
  return ['info', 'warning', 'success', 'suggestion', 'error'].includes(type);
}

// ---------------------------------------------------------------------------
// Cloud Functions
// ---------------------------------------------------------------------------

export const callTestFunction = async (): Promise<any> => {
  if (isOffline || !functions) {
    await offlineWarning('callTestFunction');
    return {
      message: 'Detta är ett offline-svar från callTestFunction.',
      timestamp: new Date().toISOString(),
    };
  }

  try {
    const testFunction = functions.httpsCallable('testFunction');
    const result = await testFunction();
    return result.data;
  } catch (error) {
    console.error("Fel vid anrop av Cloud Function 'testFunction':", error);
    throw error;
  }
};

export const getVoiceServerConfig = async (): Promise<{ url: string }> => {
  if (isOffline || !functions) {
    await offlineWarning('getVoiceServerConfig');
    return { url: 'ws://localhost:8080' };
  }

  try {
    const getConfigFunction = functions.httpsCallable('getVoiceServerConfig');
    const result = await getConfigFunction();
    return result.data as { url: string };
  } catch (error) {
    console.error("Error calling Cloud Function 'getVoiceServerConfig':", error);
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
      message: 'Detta är ett offline-svar från migreringen.',
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
    if (email === MOCK_SYSTEM_OWNER.email)
      return Promise.resolve({
        uid: MOCK_SYSTEM_OWNER.uid,
        isAnonymous: false,
      } as firebase.User);
    if (email === MOCK_ORG_ADMIN.email)
      return Promise.resolve({
        uid: MOCK_ORG_ADMIN.uid,
        isAnonymous: false,
      } as firebase.User);
    return Promise.reject(new Error('Offline mode: Cannot sign in.'));
  }
  return auth
    .signInWithEmailAndPassword(email, password)
    .then((uc) => uc.user as firebase.User);
};

export const signInAsScreen = (): Promise<firebase.User> => {
  if (isOffline || !auth)
    return Promise.resolve({
      uid: 'offline_studio_uid',
      isAnonymous: true,
    } as firebase.User);
  return auth.signInAnonymously().then((uc) => uc.user as firebase.User);
};

export const signOut = (): Promise<void> => {
  if (isOffline || !auth) return Promise.resolve();
  return auth.signOut();
};

export const requestPasswordReset = (email: string): Promise<void> => {
  if (isOffline || !auth) {
    console.log(`(Offline) Password reset requested for: ${email}`);
    return new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return auth.sendPasswordResetEmail(email);
};

export const verifyPasswordResetToken = async (token: string): Promise<string> => {
  if (isOffline || !auth) {
    if (token === 'VALID_OFFLINE_TOKEN') {
      return Promise.resolve(MOCK_ORG_ADMIN.email);
    }
    return Promise.reject(new Error('Invalid offline token'));
  }
  return auth.verifyPasswordResetCode(token);
};

export const confirmPasswordReset = async (
  token: string,
  newPassword: string
): Promise<void> => {
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

export const getOrganizationById = async (
  organizationId: string
): Promise<Organization | null> => {
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

export const createOrganization = async (
  orgData: Pick<Organization, 'name' | 'email'>
): Promise<Organization> => {
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
  if (!(await q.get()).empty)
    throw new Error('Kunde inte skapa unik subdomän, försök igen.');

  const newOrg: Organization = {
    id: `org_${subdomain}`,
    name,
    subdomain,
    customPages: [],
    email,
    mediaLibrary: [],
  };
  await db.collection('organizations').doc(newOrg.id).set(sanitizeData(newOrg));
  return newOrg;
};

export const updateOrganization = async (
  organizationId: string,
  data: Partial<Organization>
): Promise<void> => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganization');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) Object.assign(org, sanitizeData(data));
    return;
  }

  await db
    .collection('organizations')
    .doc(organizationId)
    .update(sanitizeData(data));
};

export const deleteOrganization = async (organizationId: string): Promise<void> => {
  if (isOffline || !functions) {
    await offlineWarning('deleteOrganization');
    const i = MOCK_ORGANIZATIONS.findIndex((o) => o.id === organizationId);
    if (i > -1) MOCK_ORGANIZATIONS.splice(i, 1);
    return;
  }
  try {
    const deleteOrgFn = functions.httpsCallable('deleteOrganization');
    await deleteOrgFn({ organizationId });
  } catch (error) {
    console.error('Error calling deleteOrganization function:', error);
    throw error;
  }
};

export const updateOrganizationLogos = async (
  organizationId: string,
  logos: { light?: string; dark?: string }
): Promise<void> => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganizationLogos');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) {
      org.logoUrlLight = logos.light;
      org.logoUrlDark = logos.dark;
    }
    return;
  }
  // This object is simple enough that it doesn't need full sanitization,
  // but we ensure undefined isn't passed.
  const updateData: { logoUrlLight?: string; logoUrlDark?: string } = {};
  if (logos.light !== undefined) updateData.logoUrlLight = logos.light;
  if (logos.dark !== undefined) updateData.logoUrlDark = logos.dark;
  
  await db
    .collection('organizations')
    .doc(organizationId)
    .update(updateData);
};

export const updateOrganizationPrimaryColor = async (
  organizationId: string,
  primaryColor: string
) => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganizationPrimaryColor');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) org.primaryColor = primaryColor;
    return getUpdatedOrg(organizationId);
  }
  await db
    .collection('organizations')
    .doc(organizationId)
    .update({ primaryColor });
  return getUpdatedOrg(organizationId);
};

export const updateOrganizationCustomPages = async (
  organizationId: string,
  customPages: CustomPage[]
) => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganizationCustomPages');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) org.customPages = customPages;
    return getUpdatedOrg(organizationId);
  }
  await db
    .collection('organizations')
    .doc(organizationId)
    .update({ customPages: sanitizeData(customPages) });
  return getUpdatedOrg(organizationId);
};

export const updateOrganizationInfoCarousel = async (
  organizationId: string,
  infoCarousel: InfoCarousel
) => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganizationInfoCarousel');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) org.infoCarousel = infoCarousel;
    return getUpdatedOrg(organizationId);
  }
  await db
    .collection('organizations')
    .doc(organizationId)
    .update({ infoCarousel: sanitizeData(infoCarousel) });
  return getUpdatedOrg(organizationId);
};

export const updateOrganizationTags = async (
  organizationId: string,
  tags: Tag[]
): Promise<void> => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganizationTags');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) org.tags = tags;
    return;
  }
  await db
    .collection('organizations')
    .doc(organizationId)
    .update({ tags: sanitizeData(tags) });
};

export const updateOrganizationPostTemplates = async (
  organizationId: string,
  postTemplates: PostTemplate[]
): Promise<void> => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganizationPostTemplates');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) org.postTemplates = postTemplates;
    return;
  }
  await db
    .collection('organizations')
    .doc(organizationId)
    .update({ postTemplates: sanitizeData(postTemplates) });
};

// ---------------------------------------------------------------------------
// Display Screens (Subcollection)
// ---------------------------------------------------------------------------
export const listenToDisplayScreens = (
  organizationId: string,
  onUpdate: (screens: DisplayScreen[]) => void
): (() => void) => {
  if (isOffline || !db) {
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    setTimeout(() => onUpdate(org?.displayScreens || []), 0);
    return () => {};
  }
  const ref = db
    .collection('organizations')
    .doc(organizationId)
    .collection('displayScreens');
  return ref.onSnapshot(
    (snap) => {
      const screens = snap.docs.map((d) => d.data() as DisplayScreen);
      onUpdate(screens);
    },
    (err) => {
      console.error(
        `Error listening to displayScreens for org ${organizationId}:`,
        err
      );
      onUpdate([]);
    }
  );
};

export const addDisplayScreen = async (
  organizationId: string,
  screenData: DisplayScreen
): Promise<void> => {
  if (isOffline || !db) {
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) {
      if (!org.displayScreens) org.displayScreens = [];
      org.displayScreens.push(screenData);
    }
    return offlineWarning('addDisplayScreen');
  }
  const ref = db
    .collection('organizations')
    .doc(organizationId)
    .collection('displayScreens')
    .doc(screenData.id);
  await ref.set(sanitizeData(screenData));
};

export const updateDisplayScreen = async (
  organizationId: string,
  screenId: string,
  data: Partial<DisplayScreen>
): Promise<void> => {
  if (isOffline || !db) {
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    const screen = org?.displayScreens?.find((s) => s.id === screenId);
    if (screen) {
      Object.assign(screen, sanitizeData(data));
    }
    return offlineWarning('updateDisplayScreen');
  }

  const ref = db
    .collection('organizations')
    .doc(organizationId)
    .collection('displayScreens')
    .doc(screenId);
  
  await ref.update(sanitizeData(data));
};

export const deleteDisplayScreen = async (
  organizationId: string,
  screenId: string
): Promise<void> => {
  if (isOffline || !db) {
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) {
      org.displayScreens = (org.displayScreens || []).filter(
        (s) => s.id !== screenId
      );
    }
    return offlineWarning('deleteDisplayScreen');
  }
  const ref = db
    .collection('organizations')
    .doc(organizationId)
    .collection('displayScreens')
    .doc(screenId);
  await ref.delete();
};

// ---------------------------------------------------------------------------
// AI Suggested Posts (Subcollection)
// ---------------------------------------------------------------------------
export const listenToSuggestedPosts = (
  organizationId: string,
  onUpdate: (posts: SuggestedPost[]) => void
): (() => void) => {
  if (isOffline || !db) {
    setTimeout(() => onUpdate([]), 0);
    return () => {};
  }
  const ref = db
    .collection('organizations')
    .doc(organizationId)
    .collection('suggestedPosts');
  const q = ref.orderBy('createdAt', 'desc').limit(50);

  return q.onSnapshot(
    (snap) => {
      const posts = snap.docs.map((d) => d.data() as SuggestedPost);
      onUpdate(posts);
    },
    (err) => {
      console.error(
        `Error listening to suggestedPosts for org ${organizationId}:`,
        err
      );
      onUpdate([]);
    }
  );
};

export const getSuggestedPostById = async (
  organizationId: string,
  suggestionId: string
): Promise<SuggestedPost | null> => {
  if (isOffline || !db) {
    return null;
  }
  const ref = db
    .collection('organizations')
    .doc(organizationId)
    .collection('suggestedPosts')
    .doc(suggestionId);
  const doc = await ref.get();
  return doc.exists ? (doc.data() as SuggestedPost) : null;
};

export const updateSuggestedPost = async (
  organizationId: string,
  suggestionId: string,
  data: Partial<Omit<SuggestedPost, 'id'>>
): Promise<void> => {
  if (isOffline || !db) {
    return offlineWarning('updateSuggestedPost');
  }
  const ref = db
    .collection('organizations')
    .doc(organizationId)
    .collection('suggestedPosts')
    .doc(suggestionId);
  await ref.update(sanitizeData(data));
};

export const deleteSuggestedPost = async (
  organizationId: string,
  suggestionId: string
): Promise<void> => {
  if (isOffline || !db) {
    return offlineWarning('deleteSuggestedPost');
  }
  const ref = db
    .collection('organizations')
    .doc(organizationId)
    .collection('suggestedPosts')
    .doc(suggestionId);
  await ref.delete();
};

// ---------------------------------------------------------------------------
// System Settings
// ---------------------------------------------------------------------------
export const getSystemSettings = async (): Promise<SystemSettings> => {
  if (isOffline || !db) return Promise.resolve(MOCK_SYSTEM_SETTINGS);
  const ref = db.collection('system_settings').doc('main');
  const snap = await ref.get();
  return snap.exists
    ? (snap.data() as SystemSettings)
    : ({ id: 'main' } as SystemSettings);
};

export const updateSystemSettings = async (
  settings: Partial<SystemSettings>
): Promise<void> => {
  if (isOffline || !db) {
    if (MOCK_SYSTEM_SETTINGS) Object.assign(MOCK_SYSTEM_SETTINGS, settings);
    return offlineWarning('updateSystemSettings');
  }
  await db
    .collection('system_settings')
    .doc('main')
    .set(sanitizeData(settings), { merge: true });
};

// ---------------------------------------------------------------------------
// System Announcements & User Notifications
// ---------------------------------------------------------------------------
export const createSystemAnnouncement = async (
  title: string,
  message: string
): Promise<void> => {
  if (isOffline || !db) {
    console.log(
      `[OFFLINE] System Announcement Sent: Title="${title}", Message="${message}"`
    );
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

export const deleteSystemAnnouncement = async (
  announcementId: string
): Promise<void> => {
  if (isOffline || !db) {
    console.log(
      `[OFFLINE] System Announcement Deleted: ID="${announcementId}"`
    );
    return offlineWarning('deleteSystemAnnouncement');
  }

  if (!announcementId.startsWith('sys-')) {
    throw new Error('Invalid system announcement ID format.');
  }
  const docId = announcementId.substring(4);

  const docRef = db.collection('systemAnnouncements').doc(docId);
  await docRef.delete();
};

export const updateSystemAnnouncement = async (
  announcementId: string,
  data: { title: string; message: string }
): Promise<void> => {
  if (isOffline || !db) {
    console.log(
      `[OFFLINE] System Announcement Updated: ID="${announcementId}", Data="${JSON.stringify(
        data
      )}"`
    );
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

export const listenToSystemAnnouncements = (
  onUpdate: (announcements: AppNotification[]) => void
): (() => void) => {
  if (isOffline || !db) {
    const mockUnsorted: AppNotification[] = [
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
    ];
    const mockData = mockUnsorted.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setTimeout(() => onUpdate(mockData), 0);
    return () => {};
  }

  const ref = db
    .collection('systemAnnouncements')
    .orderBy('createdAt', 'desc')
    .limit(20);

  return ref.onSnapshot(
    (snapshot) => {
      const announcements: AppNotification[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        const type: AppNotification['type'] = isNotificationType(data.type)
          ? data.type
          : 'info';
        return {
          id: `sys-${doc.id}`,
          title: data.title,
          message: data.message,
          type: type,
          createdAt:
            (data.createdAt as firebase.firestore.Timestamp)
              ?.toDate()
              .toISOString() || new Date().toISOString(),
          isRead: false,
        };
      });
      onUpdate(announcements);
    },
    (error) => {
      console.error('Error listening to system announcements:', error);
      onUpdate([]);
    }
  );
};

export const listenToUserNotifications = (
  userId: string,
  onUpdate: (notifications: AppNotification[]) => void
): (() => void) => {
  if (isOffline || !db) {
    const mock: AppNotification[] = [
      {
        id: 'user-mock-1',
        createdAt: new Date().toISOString(),
        type: 'success',
        title: 'Din video är klar (offline)',
        message: 'En video har genererats i bakgrunden.',
        isRead: false,
      },
    ];
    setTimeout(() => onUpdate(mock), 0);
    return () => {};
  }
  const ref = db
    .collection('users')
    .doc(userId)
    .collection('notifications')
    .orderBy('createdAt', 'desc')
    .limit(20);
  return ref.onSnapshot(
    (snap) => {
      const notifs = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt:
            (data.createdAt as firebase.firestore.Timestamp)
              ?.toDate()
              .toISOString() || new Date().toISOString(),
        } as AppNotification;
      });
      onUpdate(notifs);
    },
    (error) => {
      console.error('Error listening to user notifications:', error);
      onUpdate([]);
    }
  );
};

export const markUserNotificationAsRead = async (
  userId: string,
  notificationId: string
): Promise<void> => {
  if (isOffline || !db) return;
  await db
    .collection('users')
    .doc(userId)
    .collection('notifications')
    .doc(notificationId)
    .update({ isRead: true });
};

export const markAllUserNotificationsAsRead = async (
  userId: string,
  notificationIds: string[]
): Promise<void> => {
  if (isOffline || !db || notificationIds.length === 0) return;
  const batch = db.batch();
  notificationIds.forEach((id) => {
    const ref = db
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .doc(id);
    batch.update(ref, { isRead: true });
  });
  await batch.commit();
};

// ---------------------------------------------------------------------------
// Admin helpers
// ---------------------------------------------------------------------------
export const getAdminsForOrganization = async (
  organizationId: string
): Promise<UserData[]> => {
  if (isOffline || !db) {
    return Promise.resolve([
      MOCK_ORG_ADMIN,
      {
        uid: 'offline_admin_2',
        email: 'admin2@flexibel.app',
        role: 'organizationadmin',
        adminRole: 'admin',
        organizationId: 'org_flexibel_mock',
      } as any,
    ]);
  }
  const usersRef = db.collection('users');
  const q = usersRef
    .where('organizationId', '==', organizationId)
    .where('role', '==', 'organizationadmin');
  const qs = await q.get();
  return qs.empty
    ? []
    : qs.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserData);
};

export const setAdminRole = async (
  uid: string,
  adminRole: 'superadmin' | 'admin'
): Promise<void> => {
  if (isOffline || !db) return offlineWarning('setAdminRole');
  await db.collection('users').doc(uid).update({ adminRole });
};

export const setUserScreenPin = async (
  uid: string,
  pin: string
): Promise<void> => {
  if (isOffline || !db) return offlineWarning('setUserScreenPin');
  await db.collection('users').doc(uid).update({ screenPin: pin });
};

export const inviteUser = async (
  organizationId: string,
  email: string
): Promise<{ success: boolean; message: string; link?: string }> => {
  if (isOffline) {
    await offlineWarning('inviteUser');

    const existingAdmins = [
      MOCK_ORG_ADMIN,
      {
        uid: 'offline_admin_2',
        email: 'admin2@flexibel.app',
        role: 'organizationadmin',
        adminRole: 'admin',
        organizationId: 'org_flexibel_mock',
      } as any,
    ];

    if (existingAdmins.some((admin) => admin.email === email)) {
      return { success: false, message: 'Denna administratör finns redan.' };
    }

    return { success: true, message: 'Administratören har lagts till.' };
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
  for (let i = 0; i < 6; i++)
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
};

export const createPairingCode = async (): Promise<string> => {
  if (isOffline || !db) return Promise.resolve('ABC123');

  const codesRef = db.collection('screenPairingCodes');
  let code = '',
    exists = true;
  while (exists) {
    code = generateCode();
    const snap = await codesRef.doc(code).get();
    exists = snap.exists;
  }
  const doc: Omit<
    ScreenPairingCode,
    'organizationId' | 'pairedByUid' | 'pairedAt' | 'assignedDisplayScreenId'
  > = {
    code,
    createdAt: firebaseApp.firestore.FieldValue.serverTimestamp() as any,
    status: 'pending',
  };
  await codesRef.doc(code).set(doc as any);
  return code;
};

export const listenToPairingCode = (
  code: string,
  onUpdate: (data: ScreenPairingCode) => void
): (() => void) => {
  if (isOffline || !db) return () => {};
  const ref = db.collection('screenPairingCodes').doc(code);
  return ref.onSnapshot((s) => s.exists && onUpdate(s.data() as ScreenPairingCode));
};

export const listenToPairingCodeByDeviceId = (
  deviceId: string,
  onUpdate: (data: ScreenPairingCode | null) => void
): (() => void) => {
  if (isOffline || !db) {
    const found =
      MOCK_PAIRING_CODES.find(
        (c) => (c as any).pairedDeviceId === deviceId
      ) || null;
    setTimeout(() => onUpdate(found as any), 0);
    return () => {};
  }
  const q = db
    .collection('screenPairingCodes')
    .where('pairedDeviceId', '==', deviceId)
    .limit(1);
  return q.onSnapshot((snap) => {
    if (snap.empty) onUpdate(null);
    else onUpdate(snap.docs[0].data() as ScreenPairingCode);
  });
};

export const getPairingCode = async (
  code: string
): Promise<ScreenPairingCode | null> => {
  if (isOffline || !db) {
    const found = MOCK_PAIRING_CODES.find(
      (c) => c.code === code && c.status === 'pending'
    );
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
      () =>
        onUpdate({
          deviceId,
          organizationId: 'offline',
          displayScreenId: 'offline',
          forceDisconnect: false,
        }),
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
  await ref.set(
    { ...session, updatedAt: firebaseApp.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
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
      physicalScreens: firebaseApp.firestore.FieldValue.arrayUnion(sanitizeData(newScreen)),
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

export const unpairPhysicalScreen = async (
  organizationId: string,
  physicalScreenId: string
): Promise<void> => {
  if (isOffline) {
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org)
      org.physicalScreens = (org.physicalScreens || []).filter(
        (s) => s.id !== physicalScreenId
      );
    const codeIdx = MOCK_PAIRING_CODES.findIndex(
      (c) => (c as any).pairedDeviceId === physicalScreenId
    );
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
    const updatedScreens = currentScreens.filter(
      (s) => s.id !== physicalScreenId
    );

    tr.update(orgRef, { physicalScreens: updatedScreens });

    const pairingSnap = await pairingCodesRef
      .where('pairedDeviceId', '==', physicalScreenId)
      .limit(1)
      .get();
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
// Instagram Stories
// ---------------------------------------------------------------------------
export const listenToInstagramStories = (
  organizationId: string,
  onUpdate: (stories: InstagramStory[]) => void
): (() => void) => {
  if (isOffline || !db) {
    const mock: InstagramStory[] = [
      {
        id: '1',
        mediaUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxu...',
        mediaType: 'IMAGE',
        timestamp: new Date().toISOString(),
      },
      {
        id: '2',
        mediaUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxu...',
        mediaType: 'IMAGE',
        timestamp: new Date().toISOString(),
      },
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
// Workouts
// ---------------------------------------------------------------------------
export const getWorkoutsForOrganization = async (
  organizationId: string
): Promise<Workout[]> => {
  if (isOffline || !db) {
    if (!(window as any).mockWorkouts) (window as any).mockWorkouts = [];
    return Promise.resolve(
      ((window as any).mockWorkouts as Workout[])
        .filter((w) => w.organizationId === organizationId)
        .sort((a, b) => (a.title > b.title ? 1 : -1))
    );
  }
  const q = db
    .collection('workouts')
    .where('organizationId', '==', organizationId);
  const qs = await q.get();
  return qs.docs
    .map((doc) => doc.data() as Workout)
    .sort((a, b) => (a.title > b.title ? 1 : -1));
};

export const saveWorkout = async (workout: Workout): Promise<void> => {
  if (isOffline || !db) {
    if (!(window as any).mockWorkouts) (window as any).mockWorkouts = [];
    const workouts: Workout[] = (window as any).mockWorkouts;
    const ix = workouts.findIndex((w) => w.id === workout.id);
    if (ix > -1) workouts[ix] = workout;
    else workouts.unshift(workout);
    (window as any).mockWorkouts = workouts;
    return offlineWarning('saveWorkout');
  }
  await db
    .collection('workouts')
    .doc(workout.id)
    .set(sanitizeData(workout), { merge: true });
};

export const deleteWorkout = async (workoutId: string): Promise<void> => {
  if (isOffline || !db) {
    if ((window as any).mockWorkouts) {
      (window as any).mockWorkouts = (
        (window as any).mockWorkouts as Workout[]
      ).filter((w) => w.id !== workoutId);
    }
    return offlineWarning('deleteWorkout');
  }
  await db.collection('workouts').doc(workoutId).delete();
};

// ---------------------------------------------------------------------------
// Storage & Video Operations
// ---------------------------------------------------------------------------
const uploadMediaFileInternal = (
  organizationId: string,
  file: File,
  mediaType: 'images' | 'videos',
  onProgress: (progress: number) => void
): Promise<string> =>
  new Promise((resolve, reject) => {
    if (isOffline || !storage) {
      reject(new Error('Offline mode: Cannot upload to Firebase Storage.'));
      return;
    }
    const path = `organizations/${organizationId}/${mediaType}/${Date.now()}-${
      file.name
    }`;
    const sref = storage.ref(path);
    const task = sref.put(file);
    task.on(
      'state_changed',
      (snap) =>
        onProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      (err) => {
        console.error(`${mediaType} upload failed:`, err);
        reject(
          new Error(
            `Uppladdningen av ${
              mediaType === 'videos' ? 'videon' : 'bilden'
            } misslyckades.`
          )
        );
      },
      () => task.snapshot.ref.getDownloadURL().then(resolve).catch(reject)
    );
  });

export const uploadVideo = (
  organizationId: string,
  file: File,
  onProgress: (p: number) => void
) => uploadMediaFileInternal(organizationId, file, 'videos', onProgress);

export const uploadMediaForGallery = (
  organizationId: string,
  file: File,
  onProgress: (p: number) => void
) => {
  const type = file.type.startsWith('video/') ? 'videos' : 'images';
  return uploadMediaFileInternal(organizationId, file, type, onProgress).then(
    (url) => ({
      url,
      type: type === 'videos' ? 'video' : 'image',
      size: file.size,
    })
  );
};

export const uploadPostAsset = (
  organizationId: string,
  postId: string,
  file: File,
  onProgress: (progress: number) => void
): Promise<string> =>
  new Promise((resolve, reject) => {
    if (isOffline || !storage) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }
    const path = `organizations/${organizationId}/post_assets/${postId}/${Date.now()}-${
      file.name
    }`;
    const sref = storage.ref(path);
    const task = sref.put(file);
    task.on(
      'state_changed',
      (snap) =>
        onProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      (err) => {
        console.error(`Post asset upload failed:`, err);
        reject(new Error(`Uppladdningen av post-media misslyckades.`));
      },
      () => task.snapshot.ref.getDownloadURL().then(resolve).catch(reject)
    );
  });

export const deleteMediaFromStorage = async (
  fileUrl: string
): Promise<void> => {
  if (isOffline || !storage || !fileUrl.includes('firebasestorage.googleapis.com'))
    return offlineWarning('deleteMediaFromStorage');
  try {
    const ref = storage.refFromURL(fileUrl);
    await ref.delete();
  } catch (e: any) {
    if (e.code === 'storage/object-not-found')
      console.warn(`File not found: ${fileUrl}`);
    else {
      console.error(`Error deleting file: ${fileUrl}`, e);
      throw new Error('Kunde inte ta bort mediefilen från lagringen.');
    }
  }
};

export const updateOrganizationMediaLibrary = async (
  organizationId: string,
  mediaLibrary: MediaItem[]
) => {
  if (isOffline || !db) {
    await offlineWarning('updateOrganizationMediaLibrary');
    const org = MOCK_ORGANIZATIONS.find((o) => o.id === organizationId);
    if (org) org.mediaLibrary = mediaLibrary;
    return getUpdatedOrg(organizationId);
  }

  await db
    .collection('organizations')
    .doc(organizationId)
    .update({ mediaLibrary: sanitizeData(mediaLibrary) });

  return getUpdatedOrg(organizationId);
};

export const listenToVideoOperationForPost = (
  orgId: string,
  postId: string,
  onUpdate: (op: VideoOperation | null) => void
): (() => void) => {
  if (isOffline || !db) return () => {};
  const q = db
    .collection('videoOperations')
    .where('orgId', '==', orgId)
    .where('postId', '==', postId)
    .orderBy('createdAt', 'desc')
    .limit(1);

  return q.onSnapshot((snap) => {
    if (snap.empty) {
      onUpdate(null);
    } else {
      const doc = snap.docs[0];
      onUpdate({ id: doc.id, ...doc.data() } as VideoOperation);
    }
  });
};
