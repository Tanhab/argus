import type { PoolClient } from 'pg';
import { query } from '../pool.js';
import type { AlertOutboxKind, AlertOutboxRow, NewAlertOutboxRow } from '../types.js';

export const MAX_OUTBOX_ATTEMPTS = 10;

export interface DeliveredAlert {
  id: number;
  monitorId: string;
  kind: AlertOutboxKind;
  createdAt: Date;
  sentAt: Date;
}

interface DeliveredAlertRowDb {
  id: number;
  monitor_id: string;
  kind: string;
  created_at: Date;
  sent_at: Date;
}

interface AlertOutboxRowDb {
  id: number;
  monitor_id: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: Date;
  sent_at: Date | null;
  attempts: number;
  last_error: string | null;
}

function toDeliveredAlert(r: DeliveredAlertRowDb): DeliveredAlert {
  return {
    id: r.id,
    monitorId: r.monitor_id,
    kind: r.kind as AlertOutboxKind,
    createdAt: r.created_at,
    sentAt: r.sent_at,
  };
}

function toAlertOutboxRow(r: AlertOutboxRowDb): AlertOutboxRow {
  return {
    id: r.id,
    monitorId: r.monitor_id,
    kind: r.kind as AlertOutboxKind,
    payload: r.payload,
    createdAt: r.created_at,
    sentAt: r.sent_at,
    attempts: r.attempts,
    lastError: r.last_error,
  };
}

export async function insertAlertOutbox(tx: PoolClient, row: NewAlertOutboxRow): Promise<void> {
  await tx.query(
    `INSERT INTO alert_outbox (monitor_id, kind, payload)
     VALUES ($1, $2, $3)`,
    [row.monitorId, row.kind, row.payload],
  );
}

export async function claimPendingOutbox(tx: PoolClient, limit: number): Promise<AlertOutboxRow[]> {
  const { rows } = await tx.query<AlertOutboxRowDb>(
    `SELECT id, monitor_id, kind, payload, created_at, sent_at, attempts, last_error
     FROM alert_outbox
     WHERE sent_at IS NULL AND attempts < $2
     ORDER BY created_at
     FOR UPDATE SKIP LOCKED
     LIMIT $1`,
    [limit, MAX_OUTBOX_ATTEMPTS],
  );
  return rows.map(toAlertOutboxRow);
}

export async function markOutboxSent(tx: PoolClient, id: number): Promise<void> {
  await tx.query(`UPDATE alert_outbox SET sent_at = NOW() WHERE id = $1`, [id]);
}

export async function markOutboxFailed(tx: PoolClient, id: number, error: string): Promise<void> {
  await tx.query(
    `UPDATE alert_outbox
     SET attempts = attempts + 1, last_error = $2
     WHERE id = $1`,
    [id, error],
  );
}

export async function getRecentDeliveredAlerts(
  monitorId: string,
  limit: number,
): Promise<DeliveredAlert[]> {
  const rows = await query<DeliveredAlertRowDb>(
    `SELECT id, monitor_id, kind, created_at, sent_at
     FROM alert_outbox
     WHERE monitor_id = $1 AND sent_at IS NOT NULL
     ORDER BY sent_at DESC, id DESC
     LIMIT $2`,
    [monitorId, limit],
  );

  return rows.map(toDeliveredAlert);
}
