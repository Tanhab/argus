import { createHash, randomBytes } from 'node:crypto';
import { query } from '@argus/db';
import { OWNER_SCOPE } from '../auth/resolve-user.js';

/** Inserts an api key row and returns the raw key to send as `x-api-key`. */
export async function seedApiKey(owner: string, scope: string = OWNER_SCOPE): Promise<string> {
  const rawKey = `argus_test_${randomBytes(16).toString('base64url')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');

  await query(
    'INSERT INTO api_keys (key_hash, key_prefix, owner, scopes) VALUES ($1, $2, $3, $4)',
    [keyHash, rawKey.slice(0, 14), owner, [scope]],
  );

  return rawKey;
}
