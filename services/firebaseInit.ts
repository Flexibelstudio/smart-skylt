// services/firebaseInit.ts
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';
import 'firebase/compat/storage';

export type Env = 'offline' | 'staging' | 'production';

// The configuration is now injected into the window object by config.js
// FIX: Cast window to any to access RUNTIME_CONFIG without TypeScript errors.
const cfg = (window as any).RUNTIME_CONFIG;

let app: firebase.app.App | null = null;
let auth: firebase.auth.Auth | null = null;
let db: firebase.firestore.Firestore | null = null;
let storage: firebase.storage.Storage | null = null;
let functions: firebase.functions.Functions | null = null;
let resolvedEnv: Env;

// Check if the runtime config is available. If not, default to offline mode cleanly.
if (!cfg || !cfg.firebaseConfig || !cfg.firebaseConfig.apiKey) {
    resolvedEnv = 'offline';
    console.warn("RUNTIME_CONFIG not found or is incomplete. Defaulting to OFFLINE mode. This is expected in environments like AI Studio where config.js is not present.");
} else {
    try {
        resolvedEnv = cfg.appEnv || 'offline';
        
        if (resolvedEnv !== 'offline') {
            if (!firebase.apps.length) {
                app = firebase.initializeApp(cfg.firebaseConfig);
            } else {
                app = firebase.app();
            }

            auth = firebase.auth();
            db = firebase.firestore();
            
            // NEW: Add settings to handle undefined properties gracefully and improve connection stability.
            try {
              db.settings({
                ignoreUndefinedProperties: true,
                experimentalAutoDetectLongPolling: true,
              } as any);
            } catch (settingsError) {
              console.warn("Could not apply Firestore settings:", settingsError);
            }

            storage = firebase.storage();
            functions = app.functions('us-central1');
            console.log(`%cFirebase initialized for ${resolvedEnv.toUpperCase()} environment.`, "color: green; font-weight: bold;");

        } else {
            console.warn("Firebase is in OFFLINE mode per config.js. Using mock data.");
        }
    } catch (error) {
        console.error("Firebase initialization failed unexpectedly:", error);
        resolvedEnv = 'offline'; // Fallback to offline on any unexpected error
        app = null;
        auth = null;
        db = null;
        storage = null;
        functions = null;
    }
}

export const env = resolvedEnv;
export const isFirebaseActive = !!app;

// Export the initialized services (or null if offline/failed)
export { app, auth, db, storage, functions, firebase };
