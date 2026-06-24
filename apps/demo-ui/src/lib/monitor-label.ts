/** Default showcase monitor — live Vercel dev-site (matches PUBLIC_SHOWCASE_MONITOR_IDS order in prod). */
export const DEFAULT_SHOWCASE_MONITOR_ID = 'd7ff842a-3a68-44e2-9f85-e9bb377b390f';

export function monitorLabel(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.includes('vercel.app')) return 'Live dev-site';
    return host;
  } catch {
    return url;
  }
}

export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname;
    return `${u.hostname}${path}`;
  } catch {
    return url;
  }
}
