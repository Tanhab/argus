import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { query, resetPool } from '../pool.js';
import { createMonitor } from './monitors.js';
import { getBucketedResults, getRecentResults, insertCheckResult } from './results.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const connUri = container.getConnectionUri();
  process.env.DATABASE_URL = connUri;
  resetPool(connUri);
  const { runner } = await import('node-pg-migrate');
  await runner({
    databaseUrl: container.getConnectionUri(),
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
  await query('TRUNCATE monitors, check_results CASCADE');
});

describe('results', () => {
  const testMonitor1 = {
    userId: 'test-user1',
    url: 'https://github.com/Tanhab/argus',
    intervalSeconds: 30,
  };
  const testCR = {
    monitorId: '1',
    checkerId: 'ck-1',
    statusCode: 200,
    durationMs: 150,
    isUp: true,
    errorType: null,
  };

  test('insertCheckResult inserts a row and getRecentResults returns it', async () => {
    const m1 = await createMonitor(testMonitor1);

    await insertCheckResult({ ...testCR, monitorId: m1.id });

    const result = await getRecentResults(m1.id, 5);

    expect(result).toHaveLength(1);
    expect(result[0]?.monitorId).toEqual(m1.id);
  });
  test('getRecentResults returns empty array for a monitor with no results', async () => {
    const result = await getRecentResults('nan', 5);

    expect(result).toHaveLength(0);
  });

  test('getBucketedResults aggregates per checker per time bucket', async () => {
    const m1 = await createMonitor(testMonitor1);
    const from = new Date('2026-06-24T10:00:00.000Z');
    const to = new Date('2026-06-24T10:02:00.000Z');

    await query(
      `INSERT INTO check_results (monitor_id, checker_id, status_code, duration_ms, is_up, checked_at)
       VALUES
         ($1, 'ck-eu', 200, 100, true, '2026-06-24T10:00:15.000Z'),
         ($1, 'ck-ap', 200, 200, true, '2026-06-24T10:00:20.000Z'),
         ($1, 'ck-eu', 200, 300, true, '2026-06-24T10:00:45.000Z'),
         ($1, 'ck-ap', 503, NULL, false, '2026-06-24T10:00:50.000Z')`,
      [m1.id],
    );

    const rows = await getBucketedResults(m1.id, '30 seconds', from, to, from);

    expect(rows).toHaveLength(4);

    const firstBucketEu = rows.find(
      (r) => r.checkerId === 'ck-eu' && r.bucket.toISOString() === '2026-06-24T10:00:00.000Z',
    );
    expect(firstBucketEu).toMatchObject({
      avgMs: 100,
      p95Ms: 100,
      downCount: 0,
      total: 1,
    });

    const firstBucketAp = rows.find(
      (r) => r.checkerId === 'ck-ap' && r.bucket.toISOString() === '2026-06-24T10:00:00.000Z',
    );
    expect(firstBucketAp).toMatchObject({
      avgMs: 200,
      p95Ms: 200,
      downCount: 0,
      total: 1,
    });

    const secondBucketEu = rows.find(
      (r) => r.checkerId === 'ck-eu' && r.bucket.toISOString() === '2026-06-24T10:00:30.000Z',
    );
    expect(secondBucketEu).toMatchObject({
      avgMs: 300,
      p95Ms: 300,
      downCount: 0,
      total: 1,
    });

    const secondBucketAp = rows.find(
      (r) => r.checkerId === 'ck-ap' && r.bucket.toISOString() === '2026-06-24T10:00:30.000Z',
    );
    expect(secondBucketAp).toMatchObject({
      avgMs: null,
      p95Ms: null,
      downCount: 1,
      total: 1,
    });
  });

  test('getBucketedResults excludes rows outside the requested range', async () => {
    const m1 = await createMonitor(testMonitor1);
    const from = new Date('2026-06-24T10:00:00.000Z');
    const to = new Date('2026-06-24T10:01:00.000Z');

    await query(
      `INSERT INTO check_results (monitor_id, checker_id, status_code, duration_ms, is_up, checked_at)
       VALUES
         ($1, 'ck-eu', 200, 100, true, '2026-06-24T09:59:30.000Z'),
         ($1, 'ck-eu', 200, 150, true, '2026-06-24T10:00:15.000Z'),
         ($1, 'ck-eu', 200, 200, true, '2026-06-24T10:01:00.000Z')`,
      [m1.id],
    );

    const rows = await getBucketedResults(m1.id, '30 seconds', from, to, from);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      checkerId: 'ck-eu',
      avgMs: 150,
      total: 1,
    });
  });
});
