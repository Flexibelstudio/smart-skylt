// config.js
(function () {
  const host = location.hostname;

  // Staging detection: staging subdomains on smartskylt.se and Netlify staging sites.
  // Unknown hostnames (localhost, previews, branch deploys) fall back to staging via !IS_PROD.
  const IS_STAGING = host.endsWith('staging.smartskylt.se')
                  || host.endsWith('-staging.netlify.app')
                  || host === 'smartskylt-staging.netlify.app';

  const IS_PROD = !IS_STAGING
               && (host.endsWith('smartskylt.se') || host === 'smartskylt.netlify.app');

  // ------------------ FYLL I DINA UPPGIFTER HÄR ------------------

  // ✅ PRODUKTION
  const FIREBASE_PROD = {
    apiKey: "AIzaSyCB3k8j4IGQqJpLJbxWp-MFwLHnaAgoM6c",
    authDomain: "smart-skylt.firebaseapp.com",
    projectId: "smart-skylt",
    storageBucket: "smart-skylt.firebasestorage.app",
    messagingSenderId: "493221313303",
    appId: "1:493221313303:web:d68f03e336faaf204ad552"
  };

  // ✅ STAGING
  const FIREBASE_STAGING = {
    apiKey: "AIzaSyAN3vSHl_VTC1ARuxy9lxLky7RTxCKmsWI",
    authDomain: "smart-skylt-staging.firebaseapp.com",
    projectId: "smart-skylt-staging",
    storageBucket: "smart-skylt-staging.firebasestorage.app",
    messagingSenderId: "247050694323",
    appId: "1:247050694323:web:a176aded9f11354423cac6"
  };
  
  // --------------------------------------------------------------------

  const finalFirebaseConfig = IS_PROD ? FIREBASE_PROD : FIREBASE_STAGING;

  // Om apiKey saknas/fel → gå i "offline" för säkerhets skull
  const appEnv = finalFirebaseConfig.apiKey?.startsWith('AIza')
    ? (IS_PROD ? 'production' : 'staging')
    : 'offline';

  if (appEnv === 'offline') {
    console.error("Firebase config saknas eller är ogiltig i config.js. Appen startar i offline-läge.");
  }

  window.RUNTIME_CONFIG = {
    appEnv,
    firebaseConfig: appEnv === 'offline' ? {} : finalFirebaseConfig,
  };

  console.log(`Runtime environment configured as: ${window.RUNTIME_CONFIG.appEnv.toUpperCase()}`);
})();