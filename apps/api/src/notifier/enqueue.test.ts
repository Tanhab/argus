import { resetPool } from '@argus/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { ALERTS_QUEUE, startBoss, stopBoss } from './boss.js';
import { type AlertJob, enqueueAlert } from './enqueue.js';

let container: StartedPostgreSqlContainer;
let boss: PgBoss;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const connUri = container.getConnectionUri();
  resetPool(connUri);
  boss = await startBoss(connUri);
});

afterAll(async () => {
  await stopBoss(boss);
  await container.stop();
});

describe('enqueueAlert', () => {
  test('places a job on the alerts queue that fetch returns with the payload intact', async () => {
    const job: AlertJob = {
      monitorId: 'm1',
      monitorUrl: 'https://example.com',
      reason: 'down_declared',
      occurredAt: new Date().toISOString(),
      n: 3,
    };

    await enqueueAlert(boss, job);

    const fetched = await boss.fetch<AlertJob>(ALERTS_QUEUE);
    expect(fetched).toHaveLength(1);
    expect(fetched[0]?.data).toEqual(job);
  });
});
