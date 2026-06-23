import type { PoolClient } from 'pg';
import type { CheckerEwmaState } from '../types.js';

interface CheckerEwmaRow {
  monitor_id: string;
  checker_id: string;
  ewma_duration_ms: number | null;
  ewma_variance: number | null;
  ewma_sample_count: number;
}

function toCheckerEwmaState(r: CheckerEwmaRow): CheckerEwmaState {
  return {
    monitorId: r.monitor_id,
    checkerId: r.checker_id,
    ewmaDurationMs: r.ewma_duration_ms,
    ewmaVariance: r.ewma_variance,
    ewmaSampleCount: r.ewma_sample_count,
  };
}

export async function getCheckerEwmaStates(
  tx: PoolClient,
  monitorId: string,
): Promise<CheckerEwmaState[]> {
  const { rows } = await tx.query<CheckerEwmaRow>(
    `SELECT monitor_id, checker_id, ewma_duration_ms, ewma_variance, ewma_sample_count
     FROM monitor_checker_ewma
     WHERE monitor_id = $1`,
    [monitorId],
  );
  return rows.map(toCheckerEwmaState);
}

export async function upsertCheckerEwma(tx: PoolClient, state: CheckerEwmaState): Promise<void> {
  await tx.query(
    `INSERT INTO monitor_checker_ewma
       (monitor_id, checker_id, ewma_duration_ms, ewma_variance, ewma_sample_count, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (monitor_id, checker_id) DO UPDATE SET
       ewma_duration_ms  = EXCLUDED.ewma_duration_ms,
       ewma_variance     = EXCLUDED.ewma_variance,
       ewma_sample_count = EXCLUDED.ewma_sample_count,
       updated_at        = NOW()`,
    [
      state.monitorId,
      state.checkerId,
      state.ewmaDurationMs,
      state.ewmaVariance,
      state.ewmaSampleCount,
    ],
  );
}
