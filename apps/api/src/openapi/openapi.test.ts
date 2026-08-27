import { fileURLToPath } from 'node:url';
import { resetPool } from '@argus/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildApp } from '../app.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
let container: StartedPostgreSqlContainer;
let app: Awaited<ReturnType<typeof buildApp>>;

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
});

afterAll(async () => {
  await app.close();
  await container.stop();
});

describe('OpenAPI /docs', () => {
  test('GET /docs/json returns OpenAPI 3 spec with tagged routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);

    const spec = res.json() as {
      openapi: string;
      paths: Record<string, Record<string, { tags?: string[]; summary?: string }>>;
    };
    expect(spec.openapi).toMatch(/^3\.0\./);
    expect(spec.paths['/v1/monitors']?.post?.tags).toContain('monitors');
    expect(spec.paths['/v1/monitors']?.post?.summary).toBeTruthy();
    expect(spec.paths['/v1/demo/token']?.post?.tags).toContain('demo');
    expect(spec.paths['/v1/public/monitors']?.get?.tags).toContain('public');
    expect(spec.paths['/internal/results']?.post?.tags).toContain('internal');
  });
});
