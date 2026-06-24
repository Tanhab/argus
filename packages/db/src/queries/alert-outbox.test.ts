import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { pool, query, resetPool } from '../pool.js';
import { withTransaction } from '../transaction.js';
import {
  claimPendingOutbox,
  getRecentDeliveredAlerts,
  insertAlertOutbox,
  markOutboxFailed,
  markOutboxSent,
} from './alert-outbox.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const connUri = container.getConnectionUri();
  process.env.DATABASE_URL = connUri;
  resetPool(connUri);
  const { runner } = await import('node-pg-migrate');
  await runner({
    databaseUrl: connUri,
    migrationsTable: 'pgmigrations',
    direction: 'up',
    dir: `${repoRoot}/migrations`,
    verbose: false,
  });
});

afterAll(async () => {
  await container.stop();
});

beforeEach(async () => {
  await query('TRUNCATE alert_outbox CASCADE');
});

describe('alert outbox queries', () => {
  test('rolled-back insert leaves no row', async () => {
    await expect(
      withTransaction(async (tx) => {
        await insertAlertOutbox(tx, {
          monitorId: 'm1',
          kind: 'transition',
          payload: { monitorUrl: 'https://example.com', reason: 'down_declared', n: 3 },
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    const rows = await query('SELECT COUNT(*)::text AS count FROM alert_outbox');
    expect(rows[0]?.count).toBe('0');
  });

  test('committed insert is claimable and markable sent', async () => {
    await withTransaction(async (tx) => {
      await insertAlertOutbox(tx, {
        monitorId: 'm1',
        kind: 'anomaly',
        payload: { monitorUrl: 'https://example.com', direction: 'slower' },
      });
    });

    await withTransaction(async (tx) => {
      const rows = await claimPendingOutbox(tx, 10);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.kind).toBe('anomaly');
      await markOutboxSent(tx, rows[0]?.id ?? 0);
    });

    const pending = await query(
      'SELECT COUNT(*)::text AS count FROM alert_outbox WHERE sent_at IS NULL',
    );
    expect(pending[0]?.count).toBe('0');
  });

  test('markOutboxFailed increments attempts and keeps row pending', async () => {
    await withTransaction(async (tx) => {
      await insertAlertOutbox(tx, {
        monitorId: 'm1',
        kind: 'transition',
        payload: { monitorUrl: 'https://example.com' },
      });
    });

    await withTransaction(async (tx) => {
      const [row] = await claimPendingOutbox(tx, 1);
      expect(row).toBeDefined();
      await markOutboxFailed(tx, row?.id ?? 0, 'ntfy down');
    });

    const rows = await query<{ attempts: number; last_error: string | null; sent_at: Date | null }>(
      'SELECT attempts, last_error, sent_at FROM alert_outbox',
    );
    expect(rows[0]?.attempts).toBe(1);
    expect(rows[0]?.last_error).toBe('ntfy down');
    expect(rows[0]?.sent_at).toBeNull();
  });

  test('concurrent claimers each get distinct rows', async () => {
    await withTransaction(async (tx) => {
      for (let i = 0; i < 4; i++) {
        await insertAlertOutbox(tx, {
          monitorId: `m${i}`,
          kind: 'transition',
          payload: { monitorUrl: `https://example.com/${i}` },
        });
      }
    });

    const claimHold = async () => {
      const client = await pool.connect();
      await client.query('BEGIN');
      const rows = await claimPendingOutbox(client, 2);
      return { client, ids: rows.map((r) => r.id) };
    };

    const first = await claimHold();
    const second = await claimHold();

    try {
      const claimed = [...first.ids, ...second.ids].sort((x, y) => x - y);
      expect(claimed).toHaveLength(4);
      expect(new Set(claimed).size).toBe(4);
    } finally {
      await first.client.query('ROLLBACK');
      await second.client.query('ROLLBACK');
      first.client.release();
      second.client.release();
    }
  });

  test('getRecentDeliveredAlerts returns newest sent alerts without payload', async () => {
    await query(
      `INSERT INTO alert_outbox (monitor_id, kind, payload, created_at, sent_at)
       VALUES
         ('m1', 'transition', '{"monitorUrl":"https://example.com"}', '2026-06-10T10:00:00Z', '2026-06-10T10:01:00Z'),
         ('m1', 'anomaly', '{"monitorUrl":"https://example.com","direction":"slower"}', '2026-06-10T11:00:00Z', '2026-06-10T11:01:00Z'),
         ('m1', 'transition', '{"monitorUrl":"https://example.com"}', '2026-06-10T12:00:00Z', NULL),
         ('m2', 'transition', '{"monitorUrl":"https://other.example"}', '2026-06-10T10:30:00Z', '2026-06-10T10:31:00Z')`,
    );

    const alerts = await getRecentDeliveredAlerts('m1', 10);

    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.kind)).toEqual(['anomaly', 'transition']);
    expect(alerts[0]?.sentAt).toEqual(new Date('2026-06-10T11:01:00Z'));
    expect(alerts[1]?.sentAt).toEqual(new Date('2026-06-10T10:01:00Z'));
    expect(alerts[0]).not.toHaveProperty('payload');
    expect(alerts[0]).not.toHaveProperty('attempts');
  });

  test('getRecentDeliveredAlerts respects limit and returns empty when none sent', async () => {
    await withTransaction(async (tx) => {
      await insertAlertOutbox(tx, {
        monitorId: 'm1',
        kind: 'transition',
        payload: { monitorUrl: 'https://example.com' },
      });
    });

    expect(await getRecentDeliveredAlerts('m1', 10)).toHaveLength(0);

    await query(
      `INSERT INTO alert_outbox (monitor_id, kind, payload, created_at, sent_at)
       VALUES
         ('m1', 'transition', '{}', '2026-06-10T10:00:00Z', '2026-06-10T10:01:00Z'),
         ('m1', 'anomaly', '{}', '2026-06-10T11:00:00Z', '2026-06-10T11:01:00Z'),
         ('m1', 'transition', '{}', '2026-06-10T12:00:00Z', '2026-06-10T12:01:00Z')`,
    );

    const alerts = await getRecentDeliveredAlerts('m1', 2);

    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.sentAt).toEqual(new Date('2026-06-10T12:01:00Z'));
  });
});
