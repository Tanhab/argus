import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { query, resetPool } from '@argus/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { buildApp } from '../app.js';
import { config } from '../config.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
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

beforeEach(async () => {
  await query('TRUNCATE api_keys, monitors, check_results CASCADE');
  delete process.env.DEMO_MAX_ACTIVE_TOKENS;
});

describe('demo routes', () => {
  test('POST /v1/demo/token mints key, sets cookie, returns expiresAt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/demo/token',
      remoteAddress: '198.51.100.1',
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.key).toMatch(/^argus_demo_/);
    expect(body.expiresAt).toBeDefined();
    expect(res.cookies.some((c) => c.name === config.demoCookieName)).toBe(true);
  });

  test('cookie-only request creates monitor scoped to demo owner', async () => {
    const minted = await app.inject({
      method: 'POST',
      url: '/v1/demo/token',
      remoteAddress: '198.51.100.2',
    });
    const { key } = minted.json() as { key: string };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/monitors',
      remoteAddress: '198.51.100.2',
      cookies: { [config.demoCookieName]: key },
      payload: { url: 'https://demo.example.com' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().userId).toMatch(/^demo:/);
  });

  test('expired demo token is rejected', async () => {
    const minted = await app.inject({
      method: 'POST',
      url: '/v1/demo/token',
      remoteAddress: '198.51.100.3',
    });
    const { key } = minted.json() as { key: string };
    const hash = createHash('sha256').update(key).digest('hex');
    await query(`UPDATE api_keys SET expires_at = NOW() - interval '1 hour' WHERE key_hash = $1`, [
      hash,
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/monitors',
      remoteAddress: '198.51.100.3',
      cookies: { [config.demoCookieName]: key },
      payload: { url: 'https://demo.example.com' },
    });

    expect(res.statusCode).toBe(401);
  });

  test('demo owner cannot create a fourth monitor', async () => {
    const clientIp = '198.51.100.4';
    const minted = await app.inject({
      method: 'POST',
      url: '/v1/demo/token',
      remoteAddress: clientIp,
    });
    const { key } = minted.json() as { key: string };
    const cookie = { [config.demoCookieName]: key };

    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/monitors',
        remoteAddress: clientIp,
        cookies: cookie,
        payload: { url: `https://quota-${i}.example.com` },
      });
      expect(res.statusCode).toBe(201);
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/v1/monitors',
      remoteAddress: clientIp,
      cookies: cookie,
      payload: { url: 'https://quota-4.example.com' },
    });
    expect(blocked.statusCode).toBe(409);
  });

  test('mint rejects when global demo cap is reached', async () => {
    process.env.DEMO_MAX_ACTIVE_TOKENS = '1';
    await query(
      `INSERT INTO api_keys (key_hash, key_prefix, owner, scopes, expires_at)
       VALUES ('occupied', 'argus_demo_occ', 'demo:occupied', '{demo:write}', NOW() + interval '1 hour')`,
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v1/demo/token',
      remoteAddress: '198.51.100.5',
    });
    expect(res.statusCode).toBe(409);
  });

  test('second mint from same client is rejected', async () => {
    const clientIp = '198.51.100.6';
    const first = await app.inject({
      method: 'POST',
      url: '/v1/demo/token',
      remoteAddress: clientIp,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/demo/token',
      remoteAddress: clientIp,
    });
    expect(second.statusCode).toBe(409);
  });

  test('demo user cannot create monitor for private url', async () => {
    const clientIp = '198.51.100.7';
    const minted = await app.inject({
      method: 'POST',
      url: '/v1/demo/token',
      remoteAddress: clientIp,
    });
    const { key } = minted.json() as { key: string };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/monitors',
      remoteAddress: clientIp,
      cookies: { [config.demoCookieName]: key },
      payload: { url: 'http://127.0.0.1' },
    });

    expect(res.statusCode).toBe(400);
  });
});
