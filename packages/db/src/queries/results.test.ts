import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { query, resetPool } from '../pool.js';
import { createMonitor } from './monitors.js';
import { getRecentResults, insertCheckResult } from './results.js';

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
});
