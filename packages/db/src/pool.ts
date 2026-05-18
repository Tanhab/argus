import { Pool } from 'pg';
import { env } from './env.js';

let pool = new Pool({ connectionString: env.DATABASE_URL });
pool.on('error', () => {});

export { pool };

export function resetPool(connectionString: string): void {
  void pool.end();
  pool = new Pool({ connectionString });
  pool.on('error', () => {});
}

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
