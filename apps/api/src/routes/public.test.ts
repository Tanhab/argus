import { fileURLToPath } from 'node:url';
import { query, resetPool } from '@argus/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { buildApp } from '../app.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

const SHOWCASE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SHOWCASE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NOT_SHOWCASE = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

let container: StartedPostgreSqlContainer;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const connUri = container.getConnectionUri();
  process.env.DATABASE_URL = connUri;
  process.env.MONITOR_USER_ID = 'owner-user';
  process.env.NTFY_TOPIC_URL = 'https://ntfy.sh/test';
  process.env.PUBLIC_SHOWCASE_MONITOR_IDS = `${SHOWCASE_A},${SHOWCASE_B}`;
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
});

afterAll(async () => {
  await app.close();
  await container.stop();
});

beforeEach(async () => {
  await query('TRUNCATE anomaly_events, check_results, checker_heartbeats, monitors CASCADE');
});

const WINDOW_FROM = '2026-06-10T10:00:00.000Z';
const WINDOW_TO = '2026-06-10T11:00:00.000Z';

async function seedShowcase(id: string, url: string): Promise<void> {
  await query(
    `INSERT INTO monitors (id, user_id, url, status, created_at)
     VALUES ($1, $2, $3, 'up', '2026-06-01T00:00:00.000Z')`,
    [id, 'owner-user', url],
  );
}

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

describe('public showcase routes', () => {
  test('GET /v1/public/monitors returns allowlisted monitors without userId', async () => {
    await seedShowcase(SHOWCASE_A, 'https://showcase-a.example/');
    await seedShowcase(SHOWCASE_B, 'https://showcase-b.example/');
    await seedShowcase(NOT_SHOWCASE, 'https://private.example/');

    const res = await app.inject({ method: 'GET', url: '/v1/public/monitors' });
    expect(res.statusCode).toBe(200);

    const body = res.json() as { id: string; url: string; userId?: string }[];
    expect(body).toHaveLength(2);
    expect(body.map((m) => m.id).sort()).toEqual([SHOWCASE_A, SHOWCASE_B].sort());
    expect(body.every((m) => m.userId === undefined)).toBe(true);
  });

  test('GET /v1/public/monitors/:id returns 404 for non-allowlisted id', async () => {
    await seedShowcase(NOT_SHOWCASE, 'https://private.example/');

    const res = await app.inject({
      method: 'GET',
      url: `/v1/public/monitors/${NOT_SHOWCASE}`,
    });
    expect(res.statusCode).toBe(404);
  });

  test('GET /v1/public/monitors/:id returns public monitor shape', async () => {
    await seedShowcase(SHOWCASE_A, 'https://showcase-a.example/');

    const res = await app.inject({
      method: 'GET',
      url: `/v1/public/monitors/${SHOWCASE_A}`,
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as Record<string, unknown>;
    expect(body.id).toBe(SHOWCASE_A);
    expect(body.status).toBe('up');
    expect(body.userId).toBeUndefined();
    expect(body.ewmaDurationMs).toBeUndefined();
  });

  test('GET /v1/public/monitors/:id/anomalies returns scoped events', async () => {
    await seedShowcase(SHOWCASE_A, 'https://showcase-a.example/');
    await query(
      `INSERT INTO anomaly_events
         (monitor_id, direction, z_score, duration_ms, baseline_ewma, baseline_std_dev, checker_id, scope, occurred_at)
       VALUES ($1, 'slower', 4.2, 400, 100, 10, 'checker-eu', 'regional', NOW())`,
      [SHOWCASE_A],
    );

    const res = await app.inject({
      method: 'GET',
      url: `/v1/public/monitors/${SHOWCASE_A}/anomalies?limit=10`,
    });
    expect(res.statusCode).toBe(200);

    const rows = res.json() as { scope: string; checkerId: string | null }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.scope).toBe('regional');
    expect(rows[0]?.checkerId).toBe('checker-eu');
  });

  test('GET /v1/public/monitors/:id/sla does not require auth cookie', async () => {
    await seedShowcase(SHOWCASE_A, 'https://showcase-a.example/');
    await seedFullCoverage(WINDOW_FROM, WINDOW_TO);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/public/monitors/${SHOWCASE_A}/sla?from=${WINDOW_FROM}&to=${WINDOW_TO}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ monitorId: SHOWCASE_A });
  });
});
