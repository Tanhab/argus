import { fileURLToPath } from 'node:url';
import { query, resetPool } from '@argus/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { buildApp } from '../app.js';

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
  await query('TRUNCATE monitors, check_results CASCADE');
});

describe('monitors routes', () => {
  test('POST /v1/monitors returns 201 with created monitor', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/monitors',
      payload: { url: 'https://example.com', intervalSeconds: 60 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.url).toBe('https://example.com');
  });

  test('POST /v1/monitors returns 400 for invalid url', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/monitors',
      payload: { url: 'not-a-url' },
    });
    expect(res.statusCode).toBe(400);
  });

  test('GET /v1/monitors returns list', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/monitors',
      payload: { url: 'https://example.com' },
    });
    const res = await app.inject({ method: 'GET', url: '/v1/monitors' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  test('GET /v1/monitors/:id returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/monitors/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });

  test('DELETE /v1/monitors/:id soft deletes and returns 204', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/monitors',
      payload: { url: 'https://example.com' },
    });
    const { id } = created.json();
    const res = await app.inject({ method: 'DELETE', url: `/v1/monitors/${id}` });
    expect(res.statusCode).toBe(204);
  });

  test('POST /v1/monitors returns 400 for private url', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/monitors',
      payload: { url: 'http://127.0.0.1' },
    });
    expect(res.statusCode).toBe(400);
  });
});
