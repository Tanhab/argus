import { query } from '../pool.js';

interface HeartbeatRow {
  checker_id: string;
  recorded_at: Date;
}

export async function insert(checkerId: string): Promise<void> {
  await query('INSERT INTO checker_heartbeats (checker_id) VALUES ($1)', [checkerId]);
}

export async function getHeartbeatsInRange(
  from: Date,
  to: Date,
): Promise<{ checkerId: string; recordedAt: Date }[]> {
  const rows = await query<HeartbeatRow>(
    `SELECT checker_id, recorded_at
     FROM checker_heartbeats
     WHERE recorded_at >= $1 AND recorded_at < $2
     ORDER BY recorded_at ASC`,
    [from, to],
  );

  return rows.map((r) => ({
    checkerId: r.checker_id,
    recordedAt: r.recorded_at,
  }));
}
