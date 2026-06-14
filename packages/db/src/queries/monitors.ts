import type { PoolClient } from 'pg';
import { query } from '../pool.js';
import type { ConsensusVerdict, Monitor, MonitorStatus, NewMonitor } from '../types.js';

interface MonitorRow {
  id: string;
  user_id: string;
  url: string;
  interval_seconds: number;
  is_active: boolean;
  created_at: Date;
  deactivated_at: Date | null;
  last_consensus: string | null;
  last_consensus_at: Date | null;
  last_alertable_consensus: string | null;
  last_alertable_consensus_at: Date | null;
  status: string;
  status_changed_at: Date | null;
  consecutive_failures: number;
  consecutive_successes: number;
  down_threshold_seconds: number;
  recovery_threshold_seconds: number;
  ewma_duration_ms: number | null;
  ewma_variance: number | null;
  ewma_sample_count: number;
}

function toMonitor(r: MonitorRow): Monitor {
  return {
    id: r.id,
    userId: r.user_id,
    url: r.url,
    intervalSeconds: r.interval_seconds,
    isActive: r.is_active,
    createdAt: r.created_at,
    deactivatedAt: r.deactivated_at,
    lastConsensus: r.last_consensus as ConsensusVerdict | null,
    lastConsensusAt: r.last_consensus_at,
    lastAlertableConsensus: r.last_alertable_consensus as ConsensusVerdict | null,
    lastAlertableConsensusAt: r.last_alertable_consensus_at,
    status: r.status as MonitorStatus,
    statusChangedAt: r.status_changed_at,
    consecutiveFailures: r.consecutive_failures,
    consecutiveSuccesses: r.consecutive_successes,
    downThresholdSeconds: r.down_threshold_seconds,
    recoveryThresholdSeconds: r.recovery_threshold_seconds,
    ewmaDurationMs: r.ewma_duration_ms,
    ewmaVariance: r.ewma_variance,
    ewmaSampleCount: r.ewma_sample_count,
  };
}

export async function createMonitor(monitor: NewMonitor): Promise<Monitor> {
  const rows = await query<MonitorRow>(
    'INSERT INTO monitors (user_id, url, interval_seconds) VALUES ($1, $2, $3) RETURNING *',
    [monitor.userId, monitor.url, monitor.intervalSeconds],
  );
  const row = rows[0];
  if (!row) throw new Error('INSERT returned no rows');
  return toMonitor(row);
}

export async function listMonitors(userId: string): Promise<Monitor[]> {
  const rows = await query<MonitorRow>(
    'SELECT * FROM monitors where user_id = $1 ORDER BY created_at DESC',
    [userId],
  );

  return rows.map(toMonitor);
}

export async function getMonitor(id: string, userId: string): Promise<Monitor | null> {
  const rows = await query<MonitorRow>('SELECT * FROM monitors WHERE id = $1 AND user_id = $2 ', [
    id,
    userId,
  ]);
  return rows[0] ? toMonitor(rows[0]) : null;
}

export async function getActiveMonitors(): Promise<Monitor[]> {
  const rows = await query<MonitorRow>(
    'SELECT * FROM monitors where is_active = true ORDER BY created_at DESC',
  );

  return rows.map(toMonitor);
}

export async function getActiveMonitor(monitorId: string): Promise<Monitor | null> {
  const rows = await query<MonitorRow>(
    'SELECT * FROM monitors WHERE is_active = true AND id = $1',
    [monitorId],
  );
  return rows[0] ? toMonitor(rows[0]) : null;
}

export async function deactivateMonitor(id: string, userId: string): Promise<boolean> {
  const rows = await query<MonitorRow>(
    `UPDATE  monitors SET is_active = false, deactivated_at = NOW()
    WHERE id = $1 AND user_id = $2 AND is_active = true RETURNING *`,
    [id, userId],
  );
  return rows.length > 0;
}

export interface UpdateMonitorState {
  id: string;
  expectedStatus: MonitorStatus;
  newStatus: MonitorStatus;
  newConsecutiveFailures: number;
  newConsecutiveSuccesses: number;
  statusChanged: boolean;
}

export async function updateMonitorState(
  tx: PoolClient,
  args: UpdateMonitorState,
): Promise<boolean> {
  const { rowCount } = await tx.query(
    `UPDATE monitors SET
       status                 = $2,
       consecutive_failures   = $3,
       consecutive_successes  = $4,
       status_changed_at      = CASE WHEN $6 THEN NOW() ELSE status_changed_at END
     WHERE id = $1 AND status = $5`,
    [
      args.id,
      args.newStatus,
      args.newConsecutiveFailures,
      args.newConsecutiveSuccesses,
      args.expectedStatus,
      args.statusChanged,
    ],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Reads a monitor inside a transaction that has already acquired the per-monitor
 * advisory lock. The `ForUpdate` suffix is a signpost for that calling context —
 * it does NOT issue `SELECT ... FOR UPDATE`. The advisory lock already serialises
 * evaluations per monitor; a row lock on top would be redundant.
 */

export async function getMonitorByIdForUpdate(tx: PoolClient, id: string): Promise<Monitor | null> {
  const result = await tx.query<MonitorRow>(`SELECT * FROM monitors WHERE id = $1`, [id]);

  return result.rows[0] ? toMonitor(result.rows[0]) : null;
}

export interface UpdateEwmaState {
  id: string;
  ewmaDurationMs: number;
  ewmaVariance: number;
  ewmaSampleCount: number;
}

export async function updateEwmaState(tx: PoolClient, args: UpdateEwmaState): Promise<void> {
  await tx.query(
    `UPDATE monitors SET
       ewma_duration_ms  = $2,
       ewma_variance     = $3,
       ewma_sample_count = $4
     WHERE id = $1`,
    [args.id, args.ewmaDurationMs, args.ewmaVariance, args.ewmaSampleCount],
  );
}
