import { resetPool } from '@argus/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { ALERTS_QUEUE, startBoss, stopBoss } from './boss.js';
import { enqueueAlert, enqueueAnomalyAlert } from './enqueue.js';

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
  test('places a transition job on the alerts queue with kind tag', async () => {
    await enqueueAlert(boss, {
      monitorId: 'm1',
      monitorUrl: 'https://example.com',
      reason: 'down_declared',
      occurredAt: new Date().toISOString(),
      n: 3,
    });

    const fetched = await boss.fetch(ALERTS_QUEUE);
    expect(fetched).toHaveLength(1);
    expect(fetched[0]?.data).toEqual({
      kind: 'transition',
      monitorId: 'm1',
      monitorUrl: 'https://example.com',
      reason: 'down_declared',
      occurredAt: expect.any(String),
      n: 3,
    });
  });
});

describe('enqueueAnomalyAlert', () => {
  test('places an anomaly job on the alerts queue with kind tag', async () => {
    const occurredAt = new Date().toISOString();
    await enqueueAnomalyAlert(boss, {
      monitorId: 'm1',
      monitorUrl: 'https://example.com',
      direction: 'slower',
      zScore: 4.2,
      durationMs: 400,
      baselineEwma: 100,
      occurredAt,
    });

    const fetched = await boss.fetch(ALERTS_QUEUE);
    expect(fetched).toHaveLength(1);
    expect(fetched[0]?.data).toEqual({
      kind: 'anomaly',
      monitorId: 'm1',
      monitorUrl: 'https://example.com',
      direction: 'slower',
      zScore: 4.2,
      durationMs: 400,
      baselineEwma: 100,
      occurredAt,
    });
  });
});
