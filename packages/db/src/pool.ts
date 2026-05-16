import { Pool } from 'pg';
import { env } from './env.js';

export const pool = new Pool({ connectionString: env.DATABASE_URL });

// pg.Pool emits 'error' events when idle/pooled connections fail
// (e.g., DB restart, network blip). Without a listener, Node treats
// this as an unhandled error and crashes the process.
// Query-level errors still propagate to callers via rejected promises.
pool.on('error', () => {});

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export async function ping(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
