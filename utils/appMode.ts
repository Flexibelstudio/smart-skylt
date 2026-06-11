export type AppMode = 'admin' | 'display';

export function getAppMode(): AppMode {
  const hostname = window.location.hostname;

  // Rule 1: Om subdomänen börjar med 'skylt', är det alltid ett skyltfönster.
  // Detta täcker skylt.smartskylt.se, skylt.localhost, etc.
  if (hostname.startsWith('skylt.')) {
    return 'display';
  }
  
  // Regel 2 (Fallback): Allt annat är admin-vyn.
  // Detta täcker smartskylt.se, app.smartskylt.se, och localhost.
  return 'admin';
}
