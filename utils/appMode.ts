export type AppMode = 'admin' | 'display';

export function getAppMode(): AppMode {
  const hostname = window.location.hostname;
  if (hostname.startsWith('skylt.')) return 'display';
  // Reservväg för miljöer utan giltigt cert på skylt.*-subdomänen
  if (new URLSearchParams(window.location.search).has('skylt')) return 'display';
  return 'admin';
}

export function getDisplayHost(): string {
  const h = window.location.hostname;
  if (h.startsWith('skylt.')) return h;
  if (h.endsWith('smartskylt.se')) return `skylt.${h.replace(/^(app|www)\./, '')}`;
  return `${h}/?skylt`;
}

