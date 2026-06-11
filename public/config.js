// config.js
(function () {
  const host = location.hostname;

  // Production is any domain ending in 'smartskylt.se' or the original Netlify domain.
  // Everything else (Netlify branch deploys, localhost) is considered staging.
  const IS_PROD = host.endsWith('smartskylt.se') || host === 'smartskylt.netlify.app';

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
    storageBucket: "smart-skylt-staging.appspot.com",
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