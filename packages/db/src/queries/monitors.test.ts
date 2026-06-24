import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { query, resetPool } from '../pool.js';
import {
  createMonitor,
  deactivateMonitor,
  getMonitor,
  getMonitorById,
  getMonitorsByIds,
  listMonitors,
} from './monitors.js';

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

describe('monitors queries', () => {
  const testMonitor1 = {
    userId: 'test-user1',
    url: 'https://github.com/Tanhab/argus',
    intervalSeconds: 30,
  };

  const testMonitor2 = {
    userId: 'test-user2',
    url: 'https://github.com/',
    intervalSeconds: 30,
  };

  test('createMonitor inserts a row and returns it with an id', async () => {
    const monitor = await createMonitor(testMonitor1);
    expect(monitor.id).toBeDefined();
    expect(monitor.url).toBe(testMonitor1.url);
  });

  test('listMonitors only returns monitor for the right user', async () => {
    await createMonitor(testMonitor1);
    await createMonitor(testMonitor2);

    const monitors = await listMonitors(testMonitor2.userId);

    expect(monitors).toHaveLength(1);
    expect(monitors[0]?.userId).toBe(testMonitor2.userId);
  });

  test('getMonitor returns the monitor for the right id and user', async () => {
    const m1 = await createMonitor(testMonitor1);

    const m2 = await getMonitor(m1.id, testMonitor1.userId);

    expect(m1).toEqual(m2);
  });

  test('getMonitor returns null for a non-existent id', async () => {
    const m = await getMonitor('nan', testMonitor1.userId);

    expect(m).toBeNull();
  });

  test('deactivateMonitor soft-deletes and returns true', async () => {
    const created = await createMonitor(testMonitor1);
    const result = await deactivateMonitor(created.id, testMonitor1.userId);
    const fetched = await getMonitor(created.id, testMonitor1.userId);

    expect(result).toBe(true);
    expect(fetched?.isActive).toBe(false);
  });

  test('deactivateMonitor returns false for a non-existent id', async () => {
    const result = await deactivateMonitor('does-not-exist', testMonitor1.userId);
    expect(result).toBe(false);
  });

  test('getMonitorById returns a row without user filter', async () => {
    const created = await createMonitor(testMonitor1);
    const fetched = await getMonitorById(created.id);
    expect(fetched?.id).toBe(created.id);
  });

  test('getMonitorsByIds returns only matching monitors', async () => {
    const a = await createMonitor(testMonitor1);
    const b = await createMonitor(testMonitor2);
    const rows = await getMonitorsByIds([a.id, b.id]);
    expect(rows).toHaveLength(2);
    expect(rows.map((m) => m.id).sort()).toEqual([a.id, b.id].sort());
  });
});
