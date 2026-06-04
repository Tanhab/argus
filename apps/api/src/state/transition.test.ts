import { fileURLToPath } from 'node:url';
import { monitors, pool, query, resetPool } from '@argus/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { evaluateConsensus } from '../consensus/evaluate.js';
import { applyStateTransition } from './transition.js';

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
  await query('TRUNCATE monitors, check_results, checker_heartbeats, status_events CASCADE');
});

const testMonitor = {
  userId: 'test-user',
  url: 'https://example.com',
  intervalSeconds: 60,
};

const ALL_CHECKERS = ['checker-eu', 'checker-ap', 'checker-us'];

async function seedHeartbeats(checkerIds: string[]): Promise<void> {
  for (const id of checkerIds) {
    await query('INSERT INTO checker_heartbeats (checker_id, recorded_at) VALUES ($1, NOW())', [
      id,
    ]);
  }
}

/**
 * Replaces the window with a fresh unanimous vote from all three checkers, then runs one
 * evaluation. Each call clears prior results so consensus reads exactly this vote — the
 * way back-to-back real evaluations see only the latest cycle's results.
 */
async function evalWith(monitorId: string, isUp: boolean) {
  await query('DELETE FROM check_results WHERE monitor_id = $1', [monitorId]);
  for (const id of ALL_CHECKERS) {
    await query(
      `INSERT INTO check_results (monitor_id, checker_id, is_up, duration_ms, checked_at)
       VALUES ($1, $2, $3, 100, NOW())`,
      [monitorId, id, isUp],
    );
  }
  return evaluateConsensus(monitorId);
}

async function statusEventRows(monitorId: string) {
  return query<{ from_status: string; to_status: string }>(
    'SELECT from_status, to_status FROM status_events WHERE monitor_id = $1 ORDER BY occurred_at, id',
    [monitorId],
  );
}

describe('applyStateTransition via evaluateConsensus', () => {
  test('up to degraded writes a status_events row and advances the failure counter', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await seedHeartbeats(ALL_CHECKERS);

    const result = await evalWith(m.id, false);

    expect(result?.transition.transitioned).toBe(true);
    expect(result?.transition.toStatus).toBe('degraded');
    expect(result?.transition.alertReason).toBeNull();

    const fetched = await monitors.getMonitor(m.id, testMonitor.userId);
    expect(fetched?.status).toBe('degraded');
    expect(fetched?.consecutiveFailures).toBe(1);

    // A fresh monitor starts at the schema default 'pending', so the first transition is
    // pending -> degraded, not up -> degraded.
    const events = await statusEventRows(m.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ from_status: 'pending', to_status: 'degraded' });
  });

  test('reaches down on the third consecutive down and surfaces the down alert', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await seedHeartbeats(ALL_CHECKERS);

    await evalWith(m.id, false); // up -> degraded (fails 1)
    await evalWith(m.id, false); // degraded (fails 2)
    const third = await evalWith(m.id, false); // degraded -> down (fails 3)

    expect(third?.transition.toStatus).toBe('down');
    expect(third?.transition.alertReason).toBe('down_declared');

    const fetched = await monitors.getMonitor(m.id, testMonitor.userId);
    expect(fetched?.status).toBe('down');
    expect(fetched?.consecutiveFailures).toBe(3);

    // up->degraded and degraded->down: two real transitions, the middle eval is counter-only.
    const events = await statusEventRows(m.id);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ from_status: 'degraded', to_status: 'down' });
  });

  test('walks down to recovering to up and surfaces exactly one recovery alert', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await seedHeartbeats(ALL_CHECKERS);

    // Drive to down first.
    await evalWith(m.id, false);
    await evalWith(m.id, false);
    await evalWith(m.id, false);

    const first = await evalWith(m.id, true); // down -> recovering (succs 1)
    expect(first?.transition.toStatus).toBe('recovering');
    expect(first?.transition.alertReason).toBeNull();

    const second = await evalWith(m.id, true); // recovering -> up (succs 2 = threshold)
    expect(second?.transition.toStatus).toBe('up');
    expect(second?.transition.alertReason).toBe('recovered_declared');

    const fetched = await monitors.getMonitor(m.id, testMonitor.userId);
    expect(fetched?.status).toBe('up');

    // A further up is steady-state: no transition, no second recovery alert.
    const third = await evalWith(m.id, true);
    expect(third?.transition.transitioned).toBe(false);
    expect(third?.transition.alertReason).toBeNull();
  });

  test('optimistic guard rejects a write whose expected status is stale', async () => {
    // Tested directly against applyStateTransition: evaluateConsensus reads the monitor
    // fresh inside the lock, so the in-memory status can never drift from the DB within a
    // single call. To exercise the guard we hand it a monitor claiming status 'up' while
    // the DB row has already moved to 'down' out of band.
    const m = await monitors.createMonitor(testMonitor);
    await query("UPDATE monitors SET status = 'down' WHERE id = $1", [m.id]);

    const staleMonitor = { ...m, status: 'up' as const, consecutiveFailures: 0 };
    const downOutcome = {
      verdict: 'down' as const,
      n: 3,
      confidence: 'high' as const,
      medianDurationMs: null,
    };

    const client = await pool.connect();
    try {
      const result = await applyStateTransition(client, staleMonitor, downOutcome);
      expect(result.transitioned).toBe(false);
    } finally {
      client.release();
    }

    // DB untouched by the rejected write, and no event row written.
    const fetched = await monitors.getMonitor(m.id, testMonitor.userId);
    expect(fetched?.status).toBe('down');
    expect(await statusEventRows(m.id)).toHaveLength(0);
  });

  test('evaluation lock-skips when the per-monitor lock is already held', async () => {
    const m = await monitors.createMonitor(testMonitor);
    await seedHeartbeats(ALL_CHECKERS);
    await query('DELETE FROM check_results WHERE monitor_id = $1', [m.id]);
    for (const id of ALL_CHECKERS) {
      await query(
        `INSERT INTO check_results (monitor_id, checker_id, is_up, duration_ms, checked_at)
         VALUES ($1, $2, false, 100, NOW())`,
        [m.id, id],
      );
    }

    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [m.id]);

      // The lock is held elsewhere: this evaluation must skip, transition nothing, write
      // no event row.
      const result = await evaluateConsensus(m.id);
      expect(result).toBeNull();
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }

    const fetched = await monitors.getMonitor(m.id, testMonitor.userId);
    expect(fetched?.status).toBe('pending');
    expect(await statusEventRows(m.id)).toHaveLength(0);
  });

  test("consensus 'degraded' (1/1 split) holds state and writes no event", async () => {
    const m = await monitors.createMonitor(testMonitor);
    // Pre-set a mid-count degraded monitor.
    await query("UPDATE monitors SET status = 'degraded', consecutive_failures = 2 WHERE id = $1", [
      m.id,
    ]);
    // Two active checkers split 1/1 -> consensus verdict 'degraded'.
    await seedHeartbeats(['checker-eu', 'checker-ap']);
    await query(
      `INSERT INTO check_results (monitor_id, checker_id, is_up, duration_ms, checked_at)
       VALUES ($1, 'checker-eu', true, 100, NOW()), ($1, 'checker-ap', false, 100, NOW())`,
      [m.id],
    );

    const result = await evaluateConsensus(m.id);

    expect(result?.outcome.verdict).toBe('degraded');
    expect(result?.transition.transitioned).toBe(false);

    const fetched = await monitors.getMonitor(m.id, testMonitor.userId);
    expect(fetched?.status).toBe('degraded');
    expect(fetched?.consecutiveFailures).toBe(2);
    expect(await statusEventRows(m.id)).toHaveLength(0);
  });

  test('identical-to-checker payload drives the full chain', async () => {
    // Mirrors the exact body shape apps/checker/src/index.ts POSTs: every field present,
    // including errorType. The Phase 3 bug hid behind a minimal test body; do not repeat it.
    const m = await monitors.createMonitor(testMonitor);
    await seedHeartbeats(ALL_CHECKERS);
    for (const id of ALL_CHECKERS) {
      await query(
        `INSERT INTO check_results
           (monitor_id, checker_id, status_code, duration_ms, is_up, error_type, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [m.id, id, 503, 100, false, 'http_error'],
      );
    }

    const result = await evaluateConsensus(m.id);

    expect(result?.outcome.verdict).toBe('down');
    expect(result?.transition.toStatus).toBe('degraded');
    expect(await statusEventRows(m.id)).toHaveLength(1);
  });
});
