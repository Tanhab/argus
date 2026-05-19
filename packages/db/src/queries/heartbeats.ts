import { query } from '../pool.js';

export async function insert(checkerId: string): Promise<void> {
  await query('INSERT INTO checker_heartbeats (checker_id) VALUES ($1)', [checkerId]);
}
