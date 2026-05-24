import { fileURLToPath } from 'node:url';
import { monitors, pool, query, resetPool } from '@argus/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { evaluateConsensus } from './evaluate.js';

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
  await query('TRUNCATE monitors, check_results, checker_heartbeats CASCADE');
});

const testMonitor = {
  userId: 'test-user',
  url: 'https://example.com',
  intervalSeconds: 60,
};

async function seedHeartbeats(checkerIds: string[]): Promise<void> {
  for (const id of checkerIds) {
    await query('INSERT INTO checker_heartbeats (checker_id, recorded_at) VALUES ($1, NOW())', [
      id,
    ]);
  }
}

async function seedResult(
  monitorId: string,
  checkerId: string,
  isUp: boolean,
  ageSeconds: number,
): Promise<void> {
  await query(
    `INSERT INTO check_results (monitor_id, checker_id, is_up, duration_ms, checked_at)
     VALUES ($1, $2, $3, 100, NOW() - ($4 || ' seconds')::interval)`,
    [monitorId, checkerId, isUp, ageSeconds],
  );
}

describe('evaluateConsensus', () => {
  test('window excludes results older than 90 seconds', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await seedHeartbeats(['checker-eu', 'checker-ap', 'checker-us']);
    await seedResult(m.id, 'checker-eu', false, 300);
    await seedResult(m.id, 'checker-ap', true, 30);
    await seedResult(m.id, 'checker-us', true, 30);

    const outcome = await evaluateConsensus(m.id);

    expect(outcome).not.toBeNull();
    expect(outcome?.verdict).toBe('up');
    expect(outcome?.n).toBe(2);
  });

  test('inactive checker is dropped from the vote', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await seedHeartbeats(['checker-eu', 'checker-ap']);
    await seedResult(m.id, 'checker-eu', true, 30);
    await seedResult(m.id, 'checker-ap', true, 30);
    await seedResult(m.id, 'checker-us', false, 30);

    const outcome = await evaluateConsensus(m.id);

    expect(outcome?.verdict).toBe('up');
    expect(outcome?.n).toBe(2);
    expect(outcome?.confidence).toBe('medium');
  });

  test('persists last_consensus and last_consensus_at on the monitor row', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await seedHeartbeats(['checker-eu', 'checker-ap', 'checker-us']);
    await seedResult(m.id, 'checker-eu', true, 30);
    await seedResult(m.id, 'checker-ap', true, 30);
    await seedResult(m.id, 'checker-us', true, 30);

    await evaluateConsensus(m.id);

    const fetched = await monitors.getMonitor(m.id, testMonitor.userId);
    expect(fetched?.lastConsensus).toBe('up');
    expect(fetched?.lastConsensusAt).toBeInstanceOf(Date);
  });

  test('persists insufficient_data when no checker contributes a vote', async () => {
    const m = await monitors.createMonitor(testMonitor);

    const outcome = await evaluateConsensus(m.id);

    expect(outcome?.verdict).toBe('insufficient_data');
    const fetched = await monitors.getMonitor(m.id, testMonitor.userId);
    expect(fetched?.lastConsensus).toBe('insufficient_data');
  });

  test('returns null and does not block when the per-monitor lock is held', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await seedHeartbeats(['checker-eu', 'checker-ap', 'checker-us']);
    await seedResult(m.id, 'checker-eu', true, 30);

    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [m.id]);

      const start = Date.now();
      const outcome = await evaluateConsensus(m.id);
      const elapsed = Date.now() - start;

      expect(outcome).toBeNull();
      expect(elapsed).toBeLessThan(500);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
  });

  test('different monitors do not contend on the lock', async () => {
    const a = await monitors.createMonitor(testMonitor);
    const b = await monitors.createMonitor(testMonitor);
    await seedHeartbeats(['checker-eu', 'checker-ap', 'checker-us']);
    await seedResult(b.id, 'checker-eu', true, 30);
    await seedResult(b.id, 'checker-ap', true, 30);
    await seedResult(b.id, 'checker-us', true, 30);

    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [a.id]);

      const outcome = await evaluateConsensus(b.id);

      expect(outcome).not.toBeNull();
      expect(outcome?.verdict).toBe('up');
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
  });
});
