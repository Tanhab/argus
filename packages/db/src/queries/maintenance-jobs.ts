import { query } from '../pool.js';

const PARTITIONED_TABLES = [
  'check_results',
  'checker_heartbeats',
  'status_events',
  'anomaly_events',
] as const;

export async function rolloverPartitions(): Promise<void> {
  for (const table of PARTITIONED_TABLES) {
    await query('SELECT ensure_next_partition($1::regclass)', [table]);
  }
}

export async function cleanupExpiredDemo(): Promise<void> {
  await query(`
    DELETE FROM monitor_checker_ewma
    WHERE monitor_id IN (
      SELECT m.id FROM monitors m
      INNER JOIN api_keys k ON k.owner = m.user_id
      WHERE k.owner LIKE 'demo:%' AND k.expires_at IS NOT NULL AND k.expires_at < NOW()
    )
  `);
  await query(`
    DELETE FROM maintenance_windows
    WHERE monitor_id IN (
      SELECT m.id FROM monitors m
      INNER JOIN api_keys k ON k.owner = m.user_id
      WHERE k.owner LIKE 'demo:%' AND k.expires_at IS NOT NULL AND k.expires_at < NOW()
    )
  `);
  await query(`
    DELETE FROM alert_outbox
    WHERE monitor_id IN (
      SELECT m.id FROM monitors m
      INNER JOIN api_keys k ON k.owner = m.user_id
      WHERE k.owner LIKE 'demo:%' AND k.expires_at IS NOT NULL AND k.expires_at < NOW()
    )
  `);
  await query(`
    DELETE FROM monitors
    WHERE user_id IN (
      SELECT owner FROM api_keys
      WHERE owner LIKE 'demo:%' AND expires_at IS NOT NULL AND expires_at < NOW()
    )
  `);
  await query(`
    DELETE FROM api_keys
    WHERE owner LIKE 'demo:%' AND expires_at IS NOT NULL AND expires_at < NOW()
  `);
}
