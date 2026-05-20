import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { monitors, query, resetPool } from '@argus/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { buildApp } from '../../app.js';

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
let container: StartedPostgreSqlContainer;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const connUri = container.getConnectionUri();
  process.env.DATABASE_URL = connUri;
  process.env.MONITOR_USER_ID = 'test-user';
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
});

afterAll(async () => {
  await app.close();
  await container.stop();
});

const RAW_KEY = 'argus_chk_testkeythatislong1234';
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex');

beforeEach(async () => {
  await query('TRUNCATE monitors, check_results, checker_heartbeats, api_keys CASCADE');
  await query(
    `INSERT INTO api_keys (key_hash, key_prefix, owner, scopes)
     VALUES ($1, $2, $3, $4)`,
    [KEY_HASH, 'argus_chk_te', 'checker-eu', ['checker:write']],
  );
});

describe('internal routes — auth', () => {
  test('returns 401 when x-api-key header is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/checkers/checker-eu/monitors' });
    expect(res.statusCode).toBe(401);
  });

  test('returns 401 when x-api-key does not match any stored key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/checkers/checker-eu/monitors',
      headers: { 'x-api-key': 'argus_chk_completelywrongkey999' },
    });
    expect(res.statusCode).toBe(401);
  });

  test('returns 401 when url checkerId does not match the key owner', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/checkers/checker-ap/monitors',
      headers: { 'x-api-key': RAW_KEY },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('internal routes — monitors list', () => {
  test('returns 200 and empty list when no monitors are active', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/checkers/checker-eu/monitors',
      headers: { 'x-api-key': RAW_KEY },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ monitors: [] });
  });

  test('returns active monitors with only id, url, intervalSeconds', async () => {
    await monitors.createMonitor({
      userId: 'test-user',
      url: 'https://example.com',
      intervalSeconds: 60,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/internal/checkers/checker-eu/monitors',
      headers: { 'x-api-key': RAW_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ monitors: { id: string; url: string; intervalSeconds: number }[] }>();
    expect(body.monitors).toHaveLength(1);
    expect(body.monitors[0]).toMatchObject({ url: 'https://example.com', intervalSeconds: 60 });
    expect(body.monitors[0]).not.toHaveProperty('userId');
  });
});

describe('internal routes — heartbeat', () => {
  test('returns 204 and writes a row to checker_heartbeats', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/checkers/checker-eu/heartbeat',
      headers: { 'x-api-key': RAW_KEY },
    });
    expect(res.statusCode).toBe(204);
    const rows = await query<{ checker_id: string }>(
      'SELECT checker_id FROM checker_heartbeats WHERE checker_id = $1',
      ['checker-eu'],
    );
    expect(rows).toHaveLength(1);
  });
});

describe('internal routes — results', () => {
  test('returns 202 and writes result with checker_id from auth, not body', async () => {
    const m = await monitors.createMonitor({
      userId: 'test-user',
      url: 'https://example.com',
      intervalSeconds: 60,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/internal/results',
      headers: { 'x-api-key': RAW_KEY },
      payload: { monitorId: m.id, isUp: true, durationMs: 120 },
    });
    expect(res.statusCode).toBe(202);
    const rows = await query<{ checker_id: string; is_up: boolean }>(
      'SELECT checker_id, is_up FROM check_results WHERE monitor_id = $1',
      [m.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ checker_id: 'checker-eu', is_up: true });
  });

  test('returns 404 when monitor does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/results',
      headers: { 'x-api-key': RAW_KEY },
      payload: { monitorId: 'does-not-exist', isUp: true },
    });
    expect(res.statusCode).toBe(404);
  });
});
