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

describe('maintenance routes', () => {
  async function createMonitor() {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/monitors',
      payload: { url: 'https://example.com' },
    });
    return res.json() as { id: string };
  }

  test('POST /v1/monitors/:id/maintenance returns 201', async () => {
    const monitor = await createMonitor();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/monitors/${monitor.id}/maintenance`,
      payload: {
        startsAt: '2026-06-01T10:00:00.000Z',
        endsAt: '2026-06-01T11:00:00.000Z',
        label: 'patch',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.monitorId).toBe(monitor.id);
    expect(body.label).toBe('patch');
  });

  test('POST returns 400 when endsAt is not after startsAt', async () => {
    const monitor = await createMonitor();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/monitors/${monitor.id}/maintenance`,
      payload: {
        startsAt: '2026-06-01T11:00:00.000Z',
        endsAt: '2026-06-01T10:00:00.000Z',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  test('POST returns 404 for unknown monitor', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/monitors/missing/maintenance',
      payload: {
        startsAt: '2026-06-01T10:00:00.000Z',
        endsAt: '2026-06-01T11:00:00.000Z',
      },
    });

    expect(res.statusCode).toBe(404);
  });

  test('GET /v1/monitors/:id/maintenance lists windows', async () => {
    const monitor = await createMonitor();
    await app.inject({
      method: 'POST',
      url: `/v1/monitors/${monitor.id}/maintenance`,
      payload: {
        startsAt: '2026-06-01T10:00:00.000Z',
        endsAt: '2026-06-01T11:00:00.000Z',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/monitors/${monitor.id}/maintenance`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  test('DELETE /v1/monitors/:id/maintenance/:windowId returns 204', async () => {
    const monitor = await createMonitor();
    const created = await app.inject({
      method: 'POST',
      url: `/v1/monitors/${monitor.id}/maintenance`,
      payload: {
        startsAt: '2026-06-01T10:00:00.000Z',
        endsAt: '2026-06-01T11:00:00.000Z',
      },
    });
    const windowId = (created.json() as { id: string }).id;

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/monitors/${monitor.id}/maintenance/${windowId}`,
    });

    expect(res.statusCode).toBe(204);

    const list = await app.inject({
      method: 'GET',
      url: `/v1/monitors/${monitor.id}/maintenance`,
    });
    expect(list.json()).toHaveLength(0);
  });

  test('DELETE returns 404 for unknown window', async () => {
    const monitor = await createMonitor();
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/monitors/${monitor.id}/maintenance/missing-window`,
    });

    expect(res.statusCode).toBe(404);
  });
});
