import { query } from '../pool.js';
import type { Monitor, NewMonitor } from '../types.js';

interface MonitorRow {
  id: string;
  user_id: string;
  url: string;
  interval_seconds: number;
  is_active: boolean;
  created_at: Date;
  deactivated_at: Date | null;
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
  const rows = await query<MonitorRow>('SELECT * FROM monitors where id = $1 AND user_id = $2 ', [
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
    WHERE id = $1 AND user_id = $2 AND is_active = true returning *`,
    [id, userId],
  );
  return rows.length > 0;
}
