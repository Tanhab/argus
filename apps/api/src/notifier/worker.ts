import type { FastifyBaseLogger } from 'fastify';
import type { PgBoss } from 'pg-boss';
import type { AlertJob } from './alert-job.js';
import { ALERTS_QUEUE } from './boss.js';
import { deliverAlertJob } from './deliver.js';

/** Drains legacy pg-boss alert jobs. New alerts go through alert_outbox. */
export async function registerAlertWorker(boss: PgBoss, log: FastifyBaseLogger): Promise<void> {
  await boss.work<AlertJob>(ALERTS_QUEUE, async (jobs) => {
    for (const job of jobs) {
      try {
        await deliverAlertJob(job.data, log);
      } catch (err) {
        log.warn({ err, jobId: job.id }, 'legacy alert job delivery failed');
        throw err;
      }
    }
  });
}
