import { createHash } from 'node:crypto';
import { apiKeys } from '@argus/db';
import type { preHandlerAsyncHookHandler } from 'fastify';
import { AuthError } from '../../errors.js';

export const requireCheckerAuth: preHandlerAsyncHookHandler = async (req) => {
  const raw = req.headers['x-api-key'];
  if (typeof raw !== 'string' || raw.length < 20) {
    throw new AuthError('missing or malformed api key');
  }

  const hash = createHash('sha256').update(raw).digest('hex');
  const key = await apiKeys.findByHash(hash);

  if (!key) {
    throw new AuthError('invalid api key');
  }
  if (!key.scopes.includes('checker:write')) {
    throw new AuthError('insufficient scope');
  }

  const urlCheckerId = (req.params as Record<string, string | undefined>).checkerId;
  if (urlCheckerId !== undefined && urlCheckerId !== key.owner) {
    throw new AuthError('checker id mismatch');
  }

  req.checker = { id: key.owner, keyId: key.id };
};
