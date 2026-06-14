import { fileURLToPath } from 'node:url';
import { anomalyEvents, monitors, pool, query, resetPool } from '@argus/db';
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
  await query('TRUNCATE monitors, check_results, checker_heartbeats, anomaly_events CASCADE');
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
  durationMs = 100,
): Promise<void> {
  await query(
    `INSERT INTO check_results (monitor_id, checker_id, is_up, duration_ms, checked_at)
     VALUES ($1, $2, $3, $4, NOW() - ($5 || ' seconds')::interval)`,
    [monitorId, checkerId, isUp, durationMs, ageSeconds],
  );
}

describe('evaluateConsensus', () => {
  test('window excludes results older than 90 seconds', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await seedHeartbeats(['checker-eu', 'checker-ap', 'checker-us']);
    await seedResult(m.id, 'checker-eu', false, 300);
    await seedResult(m.id, 'checker-ap', true, 30);
    await seedResult(m.id, 'checker-us', true, 30);

    const result = await evaluateConsensus(m.id);

    expect(result).not.toBeNull();
    expect(result?.outcome.verdict).toBe('up');
    expect(result?.outcome.n).toBe(2);
  });

  test('inactive checker is dropped from the vote', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await seedHeartbeats(['checker-eu', 'checker-ap']);
    await seedResult(m.id, 'checker-eu', true, 30);
    await seedResult(m.id, 'checker-ap', true, 30);
    await seedResult(m.id, 'checker-us', false, 30);

    const result = await evaluateConsensus(m.id);

    expect(result?.outcome.verdict).toBe('up');
    expect(result?.outcome.n).toBe(2);
    expect(result?.outcome.confidence).toBe('medium');
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

    const result = await evaluateConsensus(m.id);

    expect(result?.outcome.verdict).toBe('insufficient_data');
    const fetched = await monitors.getMonitor(m.id, testMonitor.userId);
    expect(fetched?.lastConsensus).toBe('insufficient_data');
  });

  test('first evaluation returns previousVerdict null', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await seedHeartbeats(['checker-eu', 'checker-ap', 'checker-us']);
    await seedResult(m.id, 'checker-eu', true, 30);
    await seedResult(m.id, 'checker-ap', true, 30);
    await seedResult(m.id, 'checker-us', true, 30);

    const result = await evaluateConsensus(m.id);

    expect(result?.previousVerdict).toBeNull();
    expect(result?.outcome.verdict).toBe('up');
  });

  test('second evaluation returns the prior verdict', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await seedHeartbeats(['checker-eu', 'checker-ap', 'checker-us']);
    await seedResult(m.id, 'checker-eu', true, 30);
    await seedResult(m.id, 'checker-ap', true, 30);
    await seedResult(m.id, 'checker-us', true, 30);

    await evaluateConsensus(m.id);
    const second = await evaluateConsensus(m.id);

    expect(second?.previousVerdict).toBe('up');
    expect(second?.outcome.verdict).toBe('up');
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
      const result = await evaluateConsensus(m.id);
      const elapsed = Date.now() - start;

      expect(result).toBeNull();
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

      const result = await evaluateConsensus(b.id);

      expect(result).not.toBeNull();
      expect(result?.outcome.verdict).toBe('up');
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
  });
});

describe('evaluateConsensus EWMA', () => {
  async function seedUpConsensus(m: { id: string }, durationMs: number): Promise<void> {
    await seedHeartbeats(['checker-eu', 'checker-ap', 'checker-us']);
    await seedResult(m.id, 'checker-eu', true, 30, durationMs);
    await seedResult(m.id, 'checker-ap', true, 30, durationMs);
    await seedResult(m.id, 'checker-us', true, 30, durationMs);
  }

  test('cold start sets ewma_sample_count to 1 on first up result', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await seedUpConsensus(m, 100);

    await evaluateConsensus(m.id);

    const fetched = await monitors.getMonitor(m.id, testMonitor.userId);
    expect(fetched?.ewmaSampleCount).toBe(1);
    expect(fetched?.ewmaDurationMs).toBe(100);
    expect(await anomalyEvents.countAnomalyEvents(m.id)).toBe(0);
  });

  test('null median skips ewma update when consensus is down', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await seedUpConsensus(m, 100);
    await evaluateConsensus(m.id);

    await query(
      `UPDATE monitors SET ewma_duration_ms = 100, ewma_variance = 25, ewma_sample_count = 50 WHERE id = $1`,
      [m.id],
    );

    await seedHeartbeats(['checker-eu', 'checker-ap', 'checker-us']);
    await seedResult(m.id, 'checker-eu', false, 30, 100);
    await seedResult(m.id, 'checker-ap', false, 30, 100);
    await seedResult(m.id, 'checker-us', false, 30, 100);

    await evaluateConsensus(m.id);

    const fetched = await monitors.getMonitor(m.id, testMonitor.userId);
    expect(fetched?.ewmaSampleCount).toBe(50);
    expect(fetched?.ewmaDurationMs).toBe(100);
    expect(await anomalyEvents.countAnomalyEvents(m.id)).toBe(0);
  });

  test('step change inserts an anomaly_events row with pre-reading baseline', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await query(
      `UPDATE monitors SET ewma_duration_ms = 100, ewma_variance = 25, ewma_sample_count = 50 WHERE id = $1`,
      [m.id],
    );

    await seedUpConsensus(m, 400);

    const result = await evaluateConsensus(m.id);

    expect(result?.anomaly?.direction).toBe('slower');
    expect(result?.anomaly?.zScore).toBeGreaterThan(3);
    expect(result?.anomaly?.baselineEwma).toBeCloseTo(100, 0);

    const events = await anomalyEvents.getRecentAnomalies(m.id, 1);
    expect(events).toHaveLength(1);
    expect(events[0]?.direction).toBe('slower');
    expect(events[0]?.baselineEwma).toBeCloseTo(100, 0);
  });

  test('anomaly does not change monitors.status', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await query(
      `UPDATE monitors SET ewma_duration_ms = 100, ewma_variance = 25, ewma_sample_count = 50 WHERE id = $1`,
      [m.id],
    );
    await seedUpConsensus(m, 400);

    await evaluateConsensus(m.id);

    const fetched = await monitors.getMonitor(m.id, testMonitor.userId);
    expect(fetched?.status).toBe('up');
  });
});
