import type { FastifyBaseLogger } from 'fastify';
import type { PgBoss } from 'pg-boss';
import { sendNtfy } from '../alert.js';
import { ALERTS_QUEUE } from './boss.js';
import type { AlertJob } from './enqueue.js';

/**
 * Drains the alerts queue and delivers each job to ntfy. pg-boss v12 hands the handler an
 * array of jobs, so we iterate. Delivery failures inside sendNtfy are swallowed there and
 * logged at warn; pg-boss retries on a thrown error, which we leave to sendNtfy's own
 * timeout rather than re-throwing.
 */
export async function registerAlertWorker(boss: PgBoss, log: FastifyBaseLogger): Promise<void> {
  await boss.work<AlertJob>(ALERTS_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const { reason, monitorUrl, n } = job.data;
      if (reason === 'down_declared') {
        await sendNtfy(
          `DOWN: ${monitorUrl}`,
          `state machine declared down (${n} checkers)`,
          'high',
          ['rotating_light'],
        );
      } else {
        await sendNtfy(
          `RECOVERED: ${monitorUrl}`,
          `state machine declared recovered (${n} checkers)`,
          'default',
          ['white_check_mark'],
        );
      }
      log.info({ jobId: job.id, reason, monitorUrl }, 'alert delivered');
    }
  });
}
