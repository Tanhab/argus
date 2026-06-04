import type { PoolClient } from 'pg';
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
