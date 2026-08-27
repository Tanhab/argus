import { fileURLToPath } from 'node:url';
import { query, resetPool } from '@argus/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { buildApp } from '../app.js';
import { seedApiKey } from '../testing/seed-api-key.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

let container: StartedPostgreSqlContainer;
let app: Awaited<ReturnType<typeof buildApp>>;
let ownerKey: string;

const USER = 'test-user';

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const connUri = container.getConnectionUri();
  process.env.DATABASE_URL = connUri;
  process.env.NTFY_TOPIC_URL = 'https://ntfy.sh/test';
  resetPool(connUri);
  const { runner } = await import('node-pg-migrate');
  await runner({
    databaseUrl: connUri,
    migrationsTable: 'pgmigrations',
    direction: 'up',
    dir: `${repoRoot}/migrations`,
    verbose: false,
  });
  app = await buildApp();
  ownerKey = await seedApiKey('test-user');
});

afterAll(async () => {
  await app.close();
  await container.stop();
});

beforeEach(async () => {
  await query('TRUNCATE monitors, status_events, checker_heartbeats, maintenance_windows CASCADE');
});

// Fixed one-hour analysis window, inside the June 2026 partitions.
const WINDOW_FROM = '2026-06-10T10:00:00.000Z';
const WINDOW_TO = '2026-06-10T11:00:00.000Z';

async function seedMonitor(id: string, createdAt = '2026-06-01T00:00:00.000Z'): Promise<void> {
  await query('INSERT INTO monitors (id, user_id, url, created_at) VALUES ($1, $2, $3, $4)', [
    id,
    USER,
    'https://example.com',
    createdAt,
  ]);
}

async function seedTransition(
  monitorId: string,
  fromStatus: string,
  toStatus: string,
  occurredAt: string,
): Promise<void> {
  await query(
    'INSERT INTO status_events (monitor_id, from_status, to_status, occurred_at) VALUES ($1, $2, $3, $4)',
    [monitorId, fromStatus, toStatus, occurredAt],
  );
}

// Two checkers beating every 2 minutes keeps coverage continuous across [from, to).
async function seedFullCoverage(from: string, to: string): Promise<void> {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  for (let t = fromMs; t < toMs; t += 120_000) {
    const at = new Date(t).toISOString();
    await query('INSERT INTO checker_heartbeats (checker_id, recorded_at) VALUES ($1, $2)', [
      'checker-eu',
      at,
    ]);
    await query('INSERT INTO checker_heartbeats (checker_id, recorded_at) VALUES ($1, $2)', [
      'checker-ap',
      at,
    ]);
  }
}

async function seedMaintenance(monitorId: string, startsAt: string, endsAt: string): Promise<void> {
  await query(
    'INSERT INTO maintenance_windows (monitor_id, starts_at, ends_at) VALUES ($1, $2, $3)',
    [monitorId, startsAt, endsAt],
  );
}

function getSla(monitorId: string, params: Record<string, string | number>) {
  return app.inject({
    headers: { 'x-api-key': ownerKey },
    method: 'GET',
    url: `/v1/monitors/${monitorId}/sla`,
    query: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
}

describe('GET /v1/monitors/:id/sla', () => {
  test('returns 404 for an unknown monitor', async () => {
    const res = await getSla('missing', { from: WINDOW_FROM, to: WINDOW_TO });
    expect(res.statusCode).toBe(404);
  });

  test('returns 400 when from is not before to', async () => {
    await seedMonitor('mon-1');
    const res = await getSla('mon-1', { from: WINDOW_TO, to: WINDOW_FROM });
    expect(res.statusCode).toBe(400);
  });

  test('returns 400 for an out-of-range slo target', async () => {
    await seedMonitor('mon-1');
    const res = await getSla('mon-1', { from: WINDOW_FROM, to: WINDOW_TO, slo: 100 });
    expect(res.statusCode).toBe(400);
  });

  test('reports 100% uptime with no incidents when always up under full coverage', async () => {
    await seedMonitor('mon-1');
    await seedFullCoverage(WINDOW_FROM, WINDOW_TO);

    const res = await getSla('mon-1', { from: WINDOW_FROM, to: WINDOW_TO });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.sli.totalMinutes).toBeCloseTo(60);
    expect(body.sli.monitoredMinutes).toBeCloseTo(60);
    expect(body.sli.downtimeMinutes).toBeCloseTo(0);
    expect(body.sli.uptimePercent).toBeCloseTo(100);
    expect(body.sli.lowConfidence).toBe(false);
    expect(body.incidents).toHaveLength(0);
  });

  test('counts a down interval against monitored time', async () => {
    await seedMonitor('mon-1');
    await seedFullCoverage(WINDOW_FROM, WINDOW_TO);
    await seedTransition('mon-1', 'up', 'down', '2026-06-10T10:15:00.000Z');
    await seedTransition('mon-1', 'down', 'up', '2026-06-10T10:30:00.000Z');

    const res = await getSla('mon-1', { from: WINDOW_FROM, to: WINDOW_TO });
    const body = res.json();

    expect(body.sli.downtimeMinutes).toBeCloseTo(15);
    expect(body.sli.uptimePercent).toBeCloseTo(75);
    expect(body.incidents).toHaveLength(1);
    expect(body.incidents[0].minutes).toBeCloseTo(15);
    expect(body.incidents[0].from).toBe('2026-06-10T10:15:00.000Z');
    expect(body.incidents[0].to).toBe('2026-06-10T10:30:00.000Z');
  });

  test('excludes downtime overlapping a maintenance window', async () => {
    await seedMonitor('mon-1');
    await seedFullCoverage(WINDOW_FROM, WINDOW_TO);
    await seedTransition('mon-1', 'up', 'down', '2026-06-10T10:15:00.000Z');
    await seedTransition('mon-1', 'down', 'up', '2026-06-10T10:30:00.000Z');
    await seedMaintenance('mon-1', '2026-06-10T10:15:00.000Z', '2026-06-10T10:30:00.000Z');

    const res = await getSla('mon-1', { from: WINDOW_FROM, to: WINDOW_TO });
    const body = res.json();

    expect(body.sli.maintenanceMinutes).toBeCloseTo(15);
    expect(body.sli.monitoredMinutes).toBeCloseTo(45);
    expect(body.sli.downtimeMinutes).toBeCloseTo(0);
    expect(body.sli.uptimePercent).toBeCloseTo(100);
    expect(body.incidents).toHaveLength(0);
  });

  test('flags low confidence and zero monitored time when coverage is missing', async () => {
    await seedMonitor('mon-1');
    await seedTransition('mon-1', 'up', 'down', '2026-06-10T10:15:00.000Z');
    await seedTransition('mon-1', 'down', 'up', '2026-06-10T10:30:00.000Z');

    const res = await getSla('mon-1', { from: WINDOW_FROM, to: WINDOW_TO });
    const body = res.json();

    expect(body.sli.coverageGapMinutes).toBeCloseTo(60);
    expect(body.sli.monitoredMinutes).toBeCloseTo(0);
    expect(body.sli.uptimePercent).toBeNull();
    expect(body.sli.lowConfidence).toBe(true);
  });

  test('clips the effective window to the monitor creation time', async () => {
    await seedMonitor('mon-1', '2026-06-10T10:30:00.000Z');
    await seedFullCoverage(WINDOW_FROM, WINDOW_TO);

    const res = await getSla('mon-1', { from: WINDOW_FROM, to: WINDOW_TO });
    const body = res.json();

    expect(body.window.effectiveFrom).toBe('2026-06-10T10:30:00.000Z');
    expect(body.sli.totalMinutes).toBeCloseTo(30);
    expect(body.sli.uptimePercent).toBeCloseTo(100);
  });

  test('includes an error budget that is breached when slo is unmet', async () => {
    await seedMonitor('mon-1');
    await seedFullCoverage(WINDOW_FROM, WINDOW_TO);
    await seedTransition('mon-1', 'up', 'down', '2026-06-10T10:15:00.000Z');
    await seedTransition('mon-1', 'down', 'up', '2026-06-10T10:30:00.000Z');

    const res = await getSla('mon-1', { from: WINDOW_FROM, to: WINDOW_TO, slo: 99 });
    const body = res.json();

    expect(body.slo.target).toBe(99);
    expect(body.slo.met).toBe(false);
    expect(body.slo.errorBudget.remainingMinutes).toBeCloseTo(0);
  });

  test('reports the slo as met when uptime clears the target', async () => {
    await seedMonitor('mon-1');
    await seedFullCoverage(WINDOW_FROM, WINDOW_TO);
    await seedTransition('mon-1', 'up', 'down', '2026-06-10T10:15:00.000Z');
    await seedTransition('mon-1', 'down', 'up', '2026-06-10T10:30:00.000Z');

    const res = await getSla('mon-1', { from: WINDOW_FROM, to: WINDOW_TO, slo: 50 });
    const body = res.json();

    expect(body.slo.met).toBe(true);
    expect(body.slo.errorBudget.remainingMinutes).toBeGreaterThan(0);
  });

  test('returns an empty window rather than 400 when the monitor was never active in range', async () => {
    await seedMonitor('mon-1', '2026-06-01T00:00:00.000Z');
    await query('UPDATE monitors SET is_active = false, deactivated_at = $2 WHERE id = $1', [
      'mon-1',
      '2026-06-05T00:00:00.000Z',
    ]);

    const res = await getSla('mon-1', { from: WINDOW_FROM, to: WINDOW_TO });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.sli.totalMinutes).toBe(0);
    expect(body.sli.monitoredMinutes).toBe(0);
    expect(body.sli.uptimePercent).toBeNull();
    expect(body.sli.lowConfidence).toBe(false);
    expect(body.incidents).toEqual([]);
    expect(body.window.effectiveFrom).toBe(body.window.effectiveTo);
  });
});
