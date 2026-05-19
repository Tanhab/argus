import { query } from '../pool.js';
import type { ApiKey } from '../types.js';

interface ApiKeyRow {
  id: string;
  key_hash: string;
  key_prefix: string;
  owner: string;
  scopes: string[];
  is_active: boolean;
  created_at: Date;
  revoked_at: Date | null;
}

function toApiKey(r: ApiKeyRow): ApiKey {
  return {
    id: r.id,
    keyHash: r.key_hash,
    keyPrefix: r.key_prefix,
    owner: r.owner,
    scopes: r.scopes,
    isActive: r.is_active,
    createdAt: r.created_at,
    revokedAt: r.revoked_at,
  };
}

export async function findByHash(hash: string): Promise<ApiKey | null> {
  const rows = await query<ApiKeyRow>(
    'SELECT * FROM api_keys WHERE key_hash = $1 AND is_active = true',
    [hash],
  );
  return rows[0] ? toApiKey(rows[0]) : null;
}

export async function revokeApiKey(id: string): Promise<void> {
  await query('UPDATE api_keys SET is_active = false, revoked_at = NOW() WHERE id = $1', [id]);
}
