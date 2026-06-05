import { PgBoss } from 'pg-boss';

/** The queue all alert jobs flow through. */
export const ALERTS_QUEUE = 'alerts';

/**
 * Starts a pg-boss instance and ensures the alerts queue exists. pg-boss v12 requires
 * queues to be created explicitly before send/work.
 *
 * Takes the connection string as an argument rather than reading config at import time:
 * config captures DATABASE_URL when the module first loads, but integration tests mutate
 * process.env.DATABASE_URL to the testcontainer URI only inside beforeAll. Passing it in
 * (the same reason packages/db exposes resetPool) lets the caller supply the live value.
 *
 * The instance's lifetime is owned by the Fastify app (see app.ts): started in buildApp,
 * stopped on onClose. Tests MUST `await app.close()` — otherwise pg-boss keeps its worker
 * connections open, the testcontainers Postgres never drains, and Vitest hangs on exit.
 */
export async function startBoss(connectionString: string): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString });
  await boss.start();
  await boss.createQueue(ALERTS_QUEUE);
  return boss;
}

export async function stopBoss(boss: PgBoss): Promise<void> {
  await boss.stop();
}
