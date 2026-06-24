import { createHash } from 'node:crypto';
import { apiKeys } from '@argus/db';
import type { preHandlerAsyncHookHandler } from 'fastify';
import { config } from '../config.js';
import { AuthError } from '../errors.js';

export interface MonitorUser {
  userId: string;
  isDemo: boolean;
}

function readDemoRawKey(req: {
  headers: Record<string, unknown>;
  cookies: Record<string, string | undefined>;
}): string | undefined {
  const header = req.headers['x-api-key'];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  return req.cookies[config.demoCookieName];
}

export async function resolveMonitorUser(req: {
  headers: Record<string, unknown>;
  cookies: Record<string, string | undefined>;
}): Promise<MonitorUser> {
  const rawKey = readDemoRawKey(req);
  if (!rawKey) {
    return { userId: config.monitorUserId, isDemo: false };
  }

  const hash = createHash('sha256').update(rawKey).digest('hex');
  const key = await apiKeys.findByHash(hash);
  if (!key?.scopes.includes('demo:write')) {
    throw new AuthError('invalid or expired demo token');
  }

  return { userId: key.owner, isDemo: true };
}

export const attachMonitorUser: preHandlerAsyncHookHandler = async (req) => {
  req.monitorUser = await resolveMonitorUser(req);
};

export function requireMonitorUser(req: { monitorUser?: MonitorUser }): MonitorUser {
  if (!req.monitorUser) {
    throw new Error('monitorUser not attached');
  }
  return req.monitorUser;
}
