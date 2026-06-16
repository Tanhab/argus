import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { query, resetPool } from '../pool.js';
import type { MonitorStatus } from '../types.js';
import { createMonitor } from './monitors.js';
import { getLastTransitionBefore, getStatusEventsInRange } from './status-events.js';

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
  await query('TRUNCATE monitors, status_events CASCADE');
});

async function seedMonitor() {
  return createMonitor({
    userId: 'test-user',
    url: 'https://example.com',
    intervalSeconds: 60,
  });
}

async function insertEventAt(
  monitorId: string,
  fromStatus: MonitorStatus,
  toStatus: MonitorStatus,
  occurredAt: Date,
): Promise<void> {
  await query(
    `INSERT INTO status_events (monitor_id, from_status, to_status, occurred_at)
     VALUES ($1, $2, $3, $4)`,
    [monitorId, fromStatus, toStatus, occurredAt],
  );
}

describe('status-events read queries', () => {
  test('getStatusEventsInRange returns events in ascending order within [from, to)', async () => {
    const monitor = await seedMonitor();
    const t1 = new Date('2026-06-10T10:00:00Z');
    const t2 = new Date('2026-06-10T11:00:00Z');
    const t3 = new Date('2026-06-10T12:00:00Z');

    await insertEventAt(monitor.id, 'up', 'degraded', t1);
    await insertEventAt(monitor.id, 'degraded', 'down', t2);
    await insertEventAt(monitor.id, 'down', 'recovering', t3);

    const events = await getStatusEventsInRange(
      monitor.id,
      new Date('2026-06-10T09:00:00Z'),
      new Date('2026-06-10T13:00:00Z'),
    );

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.toStatus)).toEqual(['degraded', 'down', 'recovering']);
    expect(events[0]?.occurredAt).toEqual(t1);
    expect(events[2]?.occurredAt).toEqual(t3);
  });

  test('getStatusEventsInRange excludes events before from and at or after to', async () => {
    const monitor = await seedMonitor();
    const inside = new Date('2026-06-10T11:00:00Z');

    await insertEventAt(monitor.id, 'up', 'degraded', new Date('2026-06-10T09:00:00Z'));
    await insertEventAt(monitor.id, 'degraded', 'down', inside);
    await insertEventAt(monitor.id, 'down', 'recovering', new Date('2026-06-10T13:00:00Z'));

    const events = await getStatusEventsInRange(
      monitor.id,
      new Date('2026-06-10T10:00:00Z'),
      new Date('2026-06-10T12:00:00Z'),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.toStatus).toBe('down');
    expect(events[0]?.occurredAt).toEqual(inside);
  });

  test('getStatusEventsInRange returns only events for the requested monitor', async () => {
    const a = await seedMonitor();
    const b = await seedMonitor();

    await insertEventAt(a.id, 'up', 'degraded', new Date('2026-06-10T10:00:00Z'));
    await insertEventAt(b.id, 'up', 'down', new Date('2026-06-10T10:00:00Z'));

    const events = await getStatusEventsInRange(
      a.id,
      new Date('2026-06-10T00:00:00Z'),
      new Date('2026-06-11T00:00:00Z'),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.monitorId).toBe(a.id);
    expect(events[0]?.toStatus).toBe('degraded');
  });

  test('getLastTransitionBefore returns the latest event strictly before at', async () => {
    const monitor = await seedMonitor();
    const first = new Date('2026-06-10T10:00:00Z');
    const second = new Date('2026-06-10T11:00:00Z');
    const at = new Date('2026-06-10T11:30:00Z');

    await insertEventAt(monitor.id, 'up', 'degraded', first);
    await insertEventAt(monitor.id, 'degraded', 'down', second);
    await insertEventAt(monitor.id, 'down', 'recovering', at);

    const last = await getLastTransitionBefore(monitor.id, at);

    expect(last?.toStatus).toBe('down');
    expect(last?.occurredAt).toEqual(second);
  });

  test('getLastTransitionBefore returns null when no prior transition exists', async () => {
    const monitor = await seedMonitor();
    await insertEventAt(monitor.id, 'up', 'degraded', new Date('2026-06-10T10:00:00Z'));

    const last = await getLastTransitionBefore(monitor.id, new Date('2026-06-10T09:00:00Z'));

    expect(last).toBeNull();
  });

  test('getStatusEventsInRange reads across the June 2026 partition boundary', async () => {
    const monitor = await seedMonitor();
    const endOfJune = new Date('2026-06-30T23:00:00Z');
    const startOfJuly = new Date('2026-07-01T01:00:00Z');

    await insertEventAt(monitor.id, 'up', 'degraded', endOfJune);
    await insertEventAt(monitor.id, 'degraded', 'up', startOfJuly);

    const events = await getStatusEventsInRange(
      monitor.id,
      new Date('2026-06-30T00:00:00Z'),
      new Date('2026-07-02T00:00:00Z'),
    );

    expect(events).toHaveLength(2);
    expect(events[0]?.occurredAt).toEqual(endOfJune);
    expect(events[1]?.occurredAt).toEqual(startOfJuly);
  });
});
