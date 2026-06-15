import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { query, resetPool } from '../pool.js';
import {
  deleteMaintenanceWindow,
  getMaintenanceWindowsInRange,
  insertMaintenanceWindow,
  listMaintenanceWindows,
} from './maintenance-windows.js';
import { createMonitor } from './monitors.js';

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

describe('maintenance-windows queries', () => {
  async function seedMonitor() {
    return createMonitor({
      userId: 'test-user',
      url: 'https://example.com',
      intervalSeconds: 60,
    });
  }

  test('insertMaintenanceWindow inserts a row and returns it with an id', async () => {
    const monitor = await seedMonitor();
    const window = await insertMaintenanceWindow({
      monitorId: monitor.id,
      startsAt: new Date('2026-06-01T10:00:00Z'),
      endsAt: new Date('2026-06-01T11:00:00Z'),
      label: 'db patch',
    });

    expect(window.id).toBeDefined();
    expect(window.monitorId).toBe(monitor.id);
    expect(window.label).toBe('db patch');
  });

  test('listMaintenanceWindows returns all windows for the monitor', async () => {
    const monitor = await seedMonitor();
    await insertMaintenanceWindow({
      monitorId: monitor.id,
      startsAt: new Date('2026-06-01T10:00:00Z'),
      endsAt: new Date('2026-06-01T11:00:00Z'),
    });
    await insertMaintenanceWindow({
      monitorId: monitor.id,
      startsAt: new Date('2026-06-01T12:00:00Z'),
      endsAt: new Date('2026-06-01T13:00:00Z'),
    });

    const windows = await listMaintenanceWindows(monitor.id);

    expect(windows).toHaveLength(2);
    expect(windows.every((w) => w.monitorId === monitor.id)).toBe(true);
  });

  test('deleteMaintenanceWindow removes the row and returns true', async () => {
    const monitor = await seedMonitor();
    const window = await insertMaintenanceWindow({
      monitorId: monitor.id,
      startsAt: new Date('2026-06-01T10:00:00Z'),
      endsAt: new Date('2026-06-01T11:00:00Z'),
    });

    const deleted = await deleteMaintenanceWindow(window.id, monitor.id);
    const remaining = await listMaintenanceWindows(monitor.id);

    expect(deleted).toBe(true);
    expect(remaining).toHaveLength(0);
  });

  test('deleteMaintenanceWindow returns false for a non-existent id', async () => {
    const monitor = await seedMonitor();
    const deleted = await deleteMaintenanceWindow('missing-id', monitor.id);
    expect(deleted).toBe(false);
  });

  test('deleteMaintenanceWindow returns false when monitorId does not match', async () => {
    const monitor = await seedMonitor();
    const other = await seedMonitor();
    const window = await insertMaintenanceWindow({
      monitorId: monitor.id,
      startsAt: new Date('2026-06-01T10:00:00Z'),
      endsAt: new Date('2026-06-01T11:00:00Z'),
    });

    const deleted = await deleteMaintenanceWindow(window.id, other.id);
    const remaining = await listMaintenanceWindows(monitor.id);

    expect(deleted).toBe(false);
    expect(remaining).toHaveLength(1);
  });

  test('getMaintenanceWindowsInRange returns overlapping windows only', async () => {
    const monitor = await seedMonitor();
    const rangeFrom = new Date('2026-06-01T10:00:00Z');
    const rangeTo = new Date('2026-06-01T14:00:00Z');

    await insertMaintenanceWindow({
      monitorId: monitor.id,
      startsAt: new Date('2026-06-01T09:00:00Z'),
      endsAt: new Date('2026-06-01T11:00:00Z'),
      label: 'starts-before',
    });
    await insertMaintenanceWindow({
      monitorId: monitor.id,
      startsAt: new Date('2026-06-01T13:00:00Z'),
      endsAt: new Date('2026-06-01T15:00:00Z'),
      label: 'ends-after',
    });
    await insertMaintenanceWindow({
      monitorId: monitor.id,
      startsAt: new Date('2026-06-01T10:30:00Z'),
      endsAt: new Date('2026-06-01T11:30:00Z'),
      label: 'fully-inside',
    });
    await insertMaintenanceWindow({
      monitorId: monitor.id,
      startsAt: new Date('2026-06-01T15:00:00Z'),
      endsAt: new Date('2026-06-01T16:00:00Z'),
      label: 'outside',
    });

    const windows = await getMaintenanceWindowsInRange(monitor.id, rangeFrom, rangeTo);
    const labels = windows.map((w) => w.label).sort();

    expect(labels).toEqual(['ends-after', 'fully-inside', 'starts-before']);
  });
});
