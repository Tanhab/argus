import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { query, resetPool } from '../pool.js';
import { cleanupExpiredDemo, rolloverPartitions } from './maintenance-jobs.js';
import { createMonitor } from './monitors.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

let container: StartedPostgreSqlContainer;

function checkResultsPartitionName(monthOffset: 0 | 1): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + monthOffset);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `check_results_${year}_${month}`;
}

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
  await query('TRUNCATE api_keys, monitors CASCADE');
});

describe('maintenance jobs', () => {
  test('rolloverPartitions creates the current-month check_results partition', async () => {
    const partName = checkResultsPartitionName(0);
    await query(`DROP TABLE IF EXISTS ${partName}`);

    await rolloverPartitions();

    const rows = await query<{ relname: string }>(
      `SELECT relname FROM pg_class WHERE relname = $1`,
      [partName],
    );
    expect(rows).toHaveLength(1);
  });

  test('rolloverPartitions creates the next-month check_results partition', async () => {
    const partName = checkResultsPartitionName(1);
    await query(`DROP TABLE IF EXISTS ${partName}`);

    await rolloverPartitions();

    const rows = await query<{ relname: string }>(
      `SELECT relname FROM pg_class WHERE relname = $1`,
      [partName],
    );
    expect(rows).toHaveLength(1);
  });

  test('rolloverPartitions is idempotent', async () => {
    await rolloverPartitions();
    await expect(rolloverPartitions()).resolves.toBeUndefined();
  });

  test('cleanupExpiredDemo removes expired demo data and keeps live rows', async () => {
    await query(
      `INSERT INTO api_keys (key_hash, key_prefix, owner, scopes, expires_at)
       VALUES ('dead', 'demo_dead', 'demo:expired', '{demo:write}', NOW() - interval '1 hour')`,
    );
    await query(
      `INSERT INTO api_keys (key_hash, key_prefix, owner, scopes, expires_at)
       VALUES ('live', 'demo_live', 'demo:live', '{demo:write}', NOW() + interval '1 hour')`,
    );

    const expiredMonitor = await createMonitor({
      userId: 'demo:expired',
      url: 'https://expired.example.com',
      intervalSeconds: 60,
    });
    const liveMonitor = await createMonitor({
      userId: 'demo:live',
      url: 'https://live.example.com',
      intervalSeconds: 60,
    });
    const realMonitor = await createMonitor({
      userId: 'user_1',
      url: 'https://real.example.com',
      intervalSeconds: 60,
    });

    await cleanupExpiredDemo();

    const monitors = await query<{ id: string }>('SELECT id FROM monitors');
    expect(monitors.map((r) => r.id).sort()).toEqual([liveMonitor.id, realMonitor.id].sort());

    const keys = await query<{ owner: string }>('SELECT owner FROM api_keys ORDER BY owner');
    expect(keys.map((r) => r.owner)).toEqual(['demo:live']);

    const gone = await query('SELECT id FROM monitors WHERE id = $1', [expiredMonitor.id]);
    expect(gone).toHaveLength(0);
  });
});
