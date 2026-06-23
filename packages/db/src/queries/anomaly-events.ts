import type { PoolClient } from 'pg';
import { query } from '../pool.js';
import type { AnomalyDirection, AnomalyEvent, AnomalyScope, NewAnomalyEvent } from '../types.js';

interface AnomalyEventRow {
  id: number;
  monitor_id: string;
  direction: string;
  z_score: number;
  duration_ms: number;
  baseline_ewma: number;
  baseline_std_dev: number;
  checker_id: string | null;
  scope: string;
  occurred_at: Date;
}

function toAnomalyEvent(r: AnomalyEventRow): AnomalyEvent {
  return {
    id: r.id,
    monitorId: r.monitor_id,
    direction: r.direction as AnomalyDirection,
    zScore: r.z_score,
    durationMs: r.duration_ms,
    baselineEwma: r.baseline_ewma,
    baselineStdDev: r.baseline_std_dev,
    checkerId: r.checker_id,
    scope: r.scope as AnomalyScope,
    occurredAt: r.occurred_at,
  };
}

export async function insertAnomalyEvent(tx: PoolClient, e: NewAnomalyEvent): Promise<void> {
  await tx.query(
    `INSERT INTO anomaly_events
       (monitor_id, direction, z_score, duration_ms, baseline_ewma, baseline_std_dev, checker_id, scope)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      e.monitorId,
      e.direction,
      e.zScore,
      e.durationMs,
      e.baselineEwma,
      e.baselineStdDev,
      e.checkerId ?? null,
      e.scope ?? 'service',
    ],
  );
}

export async function getRecentAnomalies(
  monitorId: string,
  limit: number,
): Promise<AnomalyEvent[]> {
  const rows = await query<AnomalyEventRow>(
    `SELECT * FROM anomaly_events
     WHERE monitor_id = $1
     ORDER BY occurred_at DESC
     LIMIT $2`,
    [monitorId, limit],
  );
  return rows.map(toAnomalyEvent);
}

export async function countAnomalyEvents(monitorId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM anomaly_events WHERE monitor_id = $1',
    [monitorId],
  );
  return Number(rows[0]?.count ?? 0);
}
