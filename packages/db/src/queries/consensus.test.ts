import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { query, resetPool } from '../pool.js';
import { withTransaction } from '../transaction.js';
import { getActiveCheckers, getResultsInWindow, updateLastConsensus } from './consensus.js';
import { createMonitor, getMonitor } from './monitors.js';

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
  await query('TRUNCATE monitors, check_results, checker_heartbeats CASCADE');
});

const testMonitor = {
  userId: 'test-user',
  url: 'https://example.com',
  intervalSeconds: 30,
};

describe('consensus queries', () => {
  test('getResultsInWindow excludes results older than the consensus window', async () => {
    const m = await createMonitor(testMonitor);

    await query(
      `INSERT INTO check_results (monitor_id, checker_id, is_up, duration_ms, checked_at)
       VALUES ($1, 'checker-eu', true, 100, NOW() - INTERVAL '5 minutes')`,
      [m.id],
    );
    await query(
      `INSERT INTO check_results (monitor_id, checker_id, is_up, duration_ms, checked_at)
       VALUES ($1, 'checker-ap', true, 120, NOW() - INTERVAL '30 seconds')`,
      [m.id],
    );

    const results = await withTransaction((tx) => getResultsInWindow(tx, m.id));

    expect(results).toHaveLength(1);
    expect(results[0]?.checkerId).toBe('checker-ap');
  });

  test('getResultsInWindow returns the most-recent result per checker', async () => {
    const m = await createMonitor(testMonitor);

    await query(
      `INSERT INTO check_results (monitor_id, checker_id, is_up, duration_ms, checked_at)
       VALUES ($1, 'checker-eu', false, 200, NOW() - INTERVAL '60 seconds')`,
      [m.id],
    );
    await query(
      `INSERT INTO check_results (monitor_id, checker_id, is_up, duration_ms, checked_at)
       VALUES ($1, 'checker-eu', true, 100, NOW() - INTERVAL '20 seconds')`,
      [m.id],
    );

    const results = await withTransaction((tx) => getResultsInWindow(tx, m.id));

    expect(results).toHaveLength(1);
    expect(results[0]?.isUp).toBe(true);
    expect(results[0]?.durationMs).toBe(100);
  });

  test('getActiveCheckers excludes checkers whose latest heartbeat is too old', async () => {
    await query(
      `INSERT INTO checker_heartbeats (checker_id, recorded_at) VALUES ('checker-eu', NOW())`,
    );
    await query(
      `INSERT INTO checker_heartbeats (checker_id, recorded_at)
       VALUES ('checker-ap', NOW() - INTERVAL '5 minutes')`,
    );

    const active = await withTransaction((tx) => getActiveCheckers(tx));

    expect(active.has('checker-eu')).toBe(true);
    expect(active.has('checker-ap')).toBe(false);
  });

  test('updateLastConsensus writes both columns and getMonitor reads them back', async () => {
    const m = await createMonitor(testMonitor);
    expect(m.lastConsensus).toBeNull();
    expect(m.lastConsensusAt).toBeNull();

    await withTransaction((tx) => updateLastConsensus(tx, m.id, 'up'));

    const fetched = await getMonitor(m.id, testMonitor.userId);
    expect(fetched?.lastConsensus).toBe('up');
    expect(fetched?.lastConsensusAt).toBeInstanceOf(Date);
  });
});
