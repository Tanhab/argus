import { query } from '../pool.js';
import type { CheckResult, NewCheckResult } from '../types.js';

export interface BucketedLatencyRow {
  bucket: Date;
  checkerId: string;
  avgMs: number | null;
  p95Ms: number | null;
  downCount: number;
  total: number;
}

interface BucketedLatencyRowDb {
  bucket: Date;
  checker_id: string;
  avg_ms: string | null;
  p95_ms: string | null;
  down_count: string;
  total: string;
}

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

function toBucketedLatencyRow(r: BucketedLatencyRowDb): BucketedLatencyRow {
  return {
    bucket: r.bucket,
    checkerId: r.checker_id,
    avgMs: r.avg_ms === null ? null : Number(r.avg_ms),
    p95Ms: r.p95_ms === null ? null : Number(r.p95_ms),
    downCount: Number(r.down_count),
    total: Number(r.total),
  };
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

export async function getBucketedResults(
  monitorId: string,
  bucketInterval: string,
  from: Date,
  to: Date,
  origin: Date,
): Promise<BucketedLatencyRow[]> {
  const rows = await query<BucketedLatencyRowDb>(
    `SELECT date_bin($2::interval, checked_at, $3::timestamptz) AS bucket,
            checker_id,
            avg(duration_ms) FILTER (WHERE is_up) AS avg_ms,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
              FILTER (WHERE is_up) AS p95_ms,
            count(*) FILTER (WHERE NOT is_up) AS down_count,
            count(*) AS total
     FROM check_results
     WHERE monitor_id = $1 AND checked_at >= $4 AND checked_at < $5
     GROUP BY bucket, checker_id
     ORDER BY bucket, checker_id`,
    [monitorId, bucketInterval, origin, from, to],
  );

  return rows.map(toBucketedLatencyRow);
}
