/** Default showcase monitor — first id in PUBLIC_SHOWCASE_MONITOR_IDS (prod allowlist). */
export const DEFAULT_SHOWCASE_MONITOR_ID = 'd7ff842a-3a68-44e2-9f85-e9bb377b390f';

/** Small label above the URL in the monitor detail header. */
export const MONITOR_DETAIL_EYEBROW = 'Tracking monitor';

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
