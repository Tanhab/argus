import { query } from '../pool.js';
import type { CheckResult, NewCheckResult } from '../types.js';

interface CheckResultRow {
  id: number;
  monitor_id: string;
  checker_id: string;
  status_code: number | null;
  duration_ms: number | null;
  is_up: boolean;
  error_type: string | null;
  checked_at: Date;
}

function toCheckResult(r: CheckResultRow): CheckResult {
  return {
    id: r.id,
    monitorId: r.monitor_id,
    checkerId: r.checker_id,
    statusCode: r.status_code,
    durationMs: r.duration_ms,
    isUp: r.is_up,
    errorType: r.error_type as CheckResult['errorType'],
    checkedAt: r.checked_at,
  };
}

export async function insertCheckResult(c: NewCheckResult): Promise<void> {
  await query<CheckResultRow>(
    `INSERT INTO check_results (monitor_id, checker_id, status_code, duration_ms, is_up, error_type)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [c.monitorId, c.checkerId, c.statusCode, c.durationMs, c.isUp, c.errorType],
  );
}

export async function getRecentResults(monitorId: string, limit: number): Promise<CheckResult[]> {
  const rows = await query<CheckResultRow>(
    `SELECT * FROM check_results WHERE monitor_id =
        $1 ORDER BY checked_at DESC LIMIT $2`,
    [monitorId, limit],
  );

  return rows.map(toCheckResult);
}
