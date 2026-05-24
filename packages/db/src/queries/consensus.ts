import type { PoolClient } from 'pg';

export const CONSENSUS_WINDOW_SECONDS = 90;
const HEARTBEAT_WINDOW = '2 minutes';

interface WindowResultRow {
  checker_id: string;
  is_up: boolean;
  duration_ms: number | null;
  error_type: string | null;
  checked_at: Date;
}

export interface WindowResult {
  checkerId: string;
  isUp: boolean;
  durationMs: number | null;
  errorType: string | null;
  checkedAt: Date;
}

export async function getResultsInWindow(
  tx: PoolClient,
  monitorId: string,
): Promise<WindowResult[]> {
  const { rows } = await tx.query<WindowResultRow>(
    `SELECT DISTINCT ON (checker_id)
        checker_id, is_up, duration_ms, error_type, checked_at
     FROM check_results
     WHERE monitor_id = $1
       AND checked_at > NOW() - ($2 || ' seconds')::interval
     ORDER BY checker_id, checked_at DESC`,
    [monitorId, CONSENSUS_WINDOW_SECONDS],
  );
  return rows.map((r) => ({
    checkerId: r.checker_id,
    isUp: r.is_up,
    durationMs: r.duration_ms,
    errorType: r.error_type,
    checkedAt: r.checked_at,
  }));
}

export async function getActiveCheckers(tx: PoolClient): Promise<Set<string>> {
  const { rows } = await tx.query<{ checker_id: string }>(
    `SELECT DISTINCT checker_id
     FROM checker_heartbeats
     WHERE recorded_at > NOW() - $1::interval`,
    [HEARTBEAT_WINDOW],
  );
  return new Set(rows.map((r) => r.checker_id));
}

export async function updateLastConsensus(
  tx: PoolClient,
  monitorId: string,
  verdict: string,
): Promise<void> {
  await tx.query(
    `UPDATE monitors
        SET last_consensus = $2,
            last_consensus_at = NOW()
      WHERE id = $1`,
    [monitorId, verdict],
  );
}

export async function updateLastAlertableConsensus(
  tx: PoolClient,
  monitorId: string,
  verdict: string,
): Promise<void> {
  await tx.query(
    `UPDATE monitors
        SET last_alertable_consensus = $2,
            last_alertable_consensus_at = NOW()
      WHERE id = $1`,
    [monitorId, verdict],
  );
}
