import { query } from '../pool.js';

export interface MaintenanceWindow {
  id: string;
  monitorId: string;
  startsAt: Date;
  endsAt: Date;
  label: string | null;
  createdAt: Date;
}

export interface NewMaintenanceWindow {
  monitorId: string;
  startsAt: Date;
  endsAt: Date;
  label?: string | null;
}

interface MaintenanceWindowRow {
  id: string;
  monitor_id: string;
  starts_at: Date;
  ends_at: Date;
  label: string | null;
  created_at: Date;
}

export function toMaintenanceWindow(row: MaintenanceWindowRow): MaintenanceWindow {
  return {
    id: row.id,
    monitorId: row.monitor_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    label: row.label,
    createdAt: row.created_at,
  };
}

export async function insertMaintenanceWindow(w: NewMaintenanceWindow): Promise<MaintenanceWindow> {
  const rows = await query<MaintenanceWindowRow>(
    `INSERT INTO maintenance_windows (monitor_id, starts_at, ends_at, label)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [w.monitorId, w.startsAt, w.endsAt, w.label ?? null],
  );
  const row = rows[0];
  if (!row) throw new Error('INSERT returned no rows');
  return toMaintenanceWindow(row);
}

export async function listMaintenanceWindows(monitorId: string): Promise<MaintenanceWindow[]> {
  const rows = await query<MaintenanceWindowRow>(
    'SELECT * FROM maintenance_windows where monitor_id = $1 ORDER BY created_at DESC',
    [monitorId],
  );

  return rows.map(toMaintenanceWindow);
}

export async function getMaintenanceWindowsInRange(
  monitorId: string,
  from: Date,
  to: Date,
): Promise<MaintenanceWindow[]> {
  const rows = await query<MaintenanceWindowRow>(
    'SELECT * FROM maintenance_windows where monitor_id = $1 AND starts_at < $3 AND ends_at > $2 ORDER BY starts_at DESC',
    [monitorId, from, to],
  );

  return rows.map(toMaintenanceWindow);
}

export async function deleteMaintenanceWindow(id: string, monitorId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM maintenance_windows
     WHERE id = $1 AND monitor_id = $2
     RETURNING id`,
    [id, monitorId],
  );
  return rows.length > 0;
}
