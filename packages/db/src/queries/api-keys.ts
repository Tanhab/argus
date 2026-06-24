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
  expires_at: Date | null;
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
    expiresAt: r.expires_at,
  };
}

export async function findByHash(hash: string): Promise<ApiKey | null> {
  const rows = await query<ApiKeyRow>(
    `SELECT * FROM api_keys
     WHERE key_hash = $1
       AND is_active = true
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [hash],
  );
  return rows[0] ? toApiKey(rows[0]) : null;
}

export async function revokeApiKey(id: string): Promise<void> {
  await query('UPDATE api_keys SET is_active = false, revoked_at = NOW() WHERE id = $1', [id]);
}

export async function createDemoKey(input: {
  keyHash: string;
  keyPrefix: string;
  owner: string;
  expiresAt: Date;
}): Promise<ApiKey> {
  const rows = await query<ApiKeyRow>(
    `INSERT INTO api_keys (key_hash, key_prefix, owner, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.keyHash, input.keyPrefix, input.owner, ['demo:write'], input.expiresAt],
  );
  const row = rows[0];
  if (!row) throw new Error('INSERT returned no rows');
  return toApiKey(row);
}

export async function countActiveDemoKeys(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM api_keys
     WHERE owner LIKE 'demo:%'
       AND is_active = true
       AND expires_at > NOW()`,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function findActiveDemoKeyForOwner(owner: string): Promise<ApiKey | null> {
  const rows = await query<ApiKeyRow>(
    `SELECT * FROM api_keys
     WHERE owner = $1
       AND is_active = true
       AND expires_at > NOW()`,
    [owner],
  );
  return rows[0] ? toApiKey(rows[0]) : null;
}
