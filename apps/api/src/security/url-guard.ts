import { isIP } from 'node:net';
import { ValidationError } from '../errors.js';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

/** True when the address must not be used as a monitor target. */
export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const octets = ip.split('.').map(Number);
    const [a, b] = octets;
    if (a === undefined || b === undefined) return true;

    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 169 && b === 254) return true; // link-local incl. metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    return false;
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1') return true;
    // unique-local fc00::/7
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    // link-local fe80::/10
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9')) return true;
    if (normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
    return false;
  }

  return false;
}

/**
 * Reject monitor targets that could reach private infrastructure (SSRF).
 * Hostnames are allowed without DNS lookup — rebinding at check time is a known gap.
 */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError('invalid url');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('url must use http or https');
  }

  if (url.username || url.password) {
    throw new ValidationError('url must not contain credentials');
  }

  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname === '169.254.169.254') {
    throw new ValidationError('url host is not allowed');
  }

  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new ValidationError('url host is not allowed');
    }
  }

  return url;
}
