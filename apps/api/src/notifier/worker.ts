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
      const d = job.data;

      if (d.kind === 'anomaly') {
        await sendNtfy(
          `SLOW: ${d.monitorUrl}`,
          `responding ${d.direction} than baseline — ${Math.round(d.durationMs)}ms vs ~${Math.round(d.baselineEwma)}ms (z=${d.zScore.toFixed(1)})`,
          d.direction === 'slower' ? 'high' : 'default',
          ['turtle'],
        );
        log.info(
          { jobId: job.id, kind: d.kind, monitorUrl: d.monitorUrl, zScore: d.zScore },
          'anomaly alert delivered',
        );
        continue;
      }

      if ('reason' in d) {
        const { reason, monitorUrl, n } = d;
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
        log.info(
          { jobId: job.id, kind: 'kind' in d ? d.kind : 'transition', reason, monitorUrl },
          'alert delivered',
        );
        continue;
      }

      log.warn({ jobId: job.id }, 'unknown alert job kind, skipping');
    }
  });
}
