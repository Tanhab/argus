import { fileURLToPath } from 'node:url';
import { alertOutbox, query, resetPool, withTransaction } from '@argus/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AlertJob } from './alert-job.js';
import { processOutboxBatch } from './outbox-worker.js';

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

describe('processOutboxBatch', () => {
  test('delivers pending rows and marks them sent', async () => {
    await withTransaction(async (tx) => {
      await alertOutbox.insertAlertOutbox(tx, {
        monitorId: 'm1',
        kind: 'anomaly',
        payload: {
          monitorUrl: 'https://example.com',
          direction: 'slower',
          zScore: 4,
          durationMs: 400,
          baselineEwma: 100,
          occurredAt: new Date().toISOString(),
        },
      });
    });

    const deliver = vi.fn(async (_job: AlertJob) => {});

    const delivered = await processOutboxBatch(10, deliver);
    expect(delivered).toBe(1);
    expect(deliver).toHaveBeenCalledOnce();

    const rows = await query<{ sent_at: Date | null }>(
      'SELECT sent_at FROM alert_outbox WHERE monitor_id = $1',
      ['m1'],
    );
    expect(rows[0]?.sent_at).toBeInstanceOf(Date);
  });

  test('failed delivery increments attempts and leaves row pending', async () => {
    await withTransaction(async (tx) => {
      await alertOutbox.insertAlertOutbox(tx, {
        monitorId: 'm1',
        kind: 'transition',
        payload: {
          monitorUrl: 'https://example.com',
          reason: 'down_declared',
          occurredAt: new Date().toISOString(),
          n: 3,
        },
      });
    });

    const deliver = vi.fn(async () => {
      throw new Error('ntfy unavailable');
    });

    await processOutboxBatch(10, deliver);

    const rows = await query<{ attempts: number; sent_at: Date | null; last_error: string | null }>(
      'SELECT attempts, sent_at, last_error FROM alert_outbox',
    );
    expect(rows[0]?.attempts).toBe(1);
    expect(rows[0]?.sent_at).toBeNull();
    expect(rows[0]?.last_error).toBe('ntfy unavailable');
  });
});
