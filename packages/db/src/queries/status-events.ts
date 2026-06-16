import type { PoolClient } from 'pg';
import { query } from '../pool.js';
import type { MonitorStatus } from '../types.js';

export interface NewStatusEvent {
  monitorId: string;
  fromStatus: MonitorStatus;
  toStatus: MonitorStatus;
}

export interface StatusEvent extends NewStatusEvent {
  id: number;
  occurredAt: Date;
}

export async function insertStatusEvent(tx: PoolClient, e: NewStatusEvent): Promise<void> {
  await tx.query(
    `INSERT INTO status_events (monitor_id, from_status, to_status)
   VALUES ($1, $2, $3)`,
    [e.monitorId, e.fromStatus, e.toStatus],
  );
}

interface StatusEventRow {
  id: number;
  monitor_id: string;
  from_status: MonitorStatus;
  to_status: MonitorStatus;
  occurred_at: Date;
}

function toStatusEvent(row: StatusEventRow): StatusEvent {
  return {
    id: row.id,
    monitorId: row.monitor_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    occurredAt: row.occurred_at,
  };
}

export async function getStatusEventsInRange(
  monitorId: string,
  from: Date,
  to: Date,
): Promise<StatusEvent[]> {
  const rows = await query<StatusEventRow>(
    'SELECT * FROM status_events where monitor_id = $1 AND occurred_at < $3 AND occurred_at >= $2 ORDER BY occurred_at ASC, id ASC',
    [monitorId, from, to],
  );

  return rows.map(toStatusEvent);
}

export async function getLastTransitionBefore(
  monitorId: string,
  at: Date,
): Promise<StatusEvent | null> {
  const rows = await query<StatusEventRow>(
    'SELECT * FROM status_events where monitor_id = $1 AND occurred_at < $2 ORDER BY occurred_at DESC, id DESC LIMIT 1',
    [monitorId, at],
  );
  if (!rows[0]) return null;

  return toStatusEvent(rows[0]);
}
