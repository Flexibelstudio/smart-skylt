
// services/firebaseInit.ts
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';
import 'firebase/compat/storage';

export type Env = 'offline' | 'staging' | 'production';

// The configuration is injected into the window object by config.js
// We cast to any to access RUNTIME_CONFIG without TypeScript errors.
const w = window as any;
const cfg = w.RUNTIME_CONFIG;

let app: firebase.app.App | null = null;
let auth: firebase.auth.Auth | null = null;
let db: firebase.firestore.Firestore | null = null;
let storage: firebase.storage.Storage | null = null;
let functions: firebase.functions.Functions | null = null;
let resolvedEnv: Env = 'offline';

// --- DEBUG MODE LOGIC ---
// Check URL params or localStorage for debug override
const urlParams = new URLSearchParams(window.location.search);
const isDebug = urlParams.get('debug') === 'true' || localStorage.getItem('debugMode') === 'true';
if (isDebug) {
    w.DEBUG_MODE = true;
    console.log("%cDEBUG MODE ACTIVATED", "color: yellow; font-weight: bold; background: black; padding: 2px 4px;");
}

// --- INITIALIZATION ---
// Check if the runtime config is available. If not, default to offline mode cleanly.
if (!cfg || !cfg.firebaseConfig || !cfg.firebaseConfig.apiKey) {
    resolvedEnv = 'offline';
    // If we are in a dev environment without config, we likely want Mock Data.
    if (!w.DEBUG_MODE) console.warn("App starting in OFFLINE mode (Missing config). Using Mock Data.");
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
            
            // Enable offline persistence
            db.enablePersistence({ synchronizeTabs: true })
                .catch((err) => {
                    if (err.code == 'failed-precondition') {
                        console.warn('Persistence failed: Multiple tabs open');
                    } else if (err.code == 'unimplemented') {
                        console.warn('Persistence failed: Browser not supported');
                    }
                });
            
            // Apply settings to improve connection stability
            try {
              db.settings({
                ignoreUndefinedProperties: true,
                experimentalAutoDetectLongPolling: true,
              } as any);

              if (w.DEBUG_MODE) {
                  firebase.firestore.setLogLevel('debug');
              }
            } catch (settingsError) {
              console.warn("Could not apply Firestore settings:", settingsError);
            }

            storage = firebase.storage();
            functions = app.functions('us-central1');
            
            console.log(`%cFirebase initialized for ${resolvedEnv.toUpperCase()}.`, "color: green; font-weight: bold;");
        } else {
            console.warn("Firebase configured as OFFLINE in config.js. Using Mock Data.");
        }
    } catch (error) {
        console.error("Firebase initialization failed:", error);
        resolvedEnv = 'offline'; // Fallback to offline on any unexpected error
        app = null;
        auth = null;
        db = null;
        storage = null;
        functions = null;
    }
}

export const env = resolvedEnv;
// Explicit boolean for easier checks elsewhere
export const isOffline = env === 'offline';
export const isFirebaseActive = !!app;

// Export the initialized services (or null if offline/failed)
export { app, auth, db, storage, functions, firebase };
