import type { PgBoss } from 'pg-boss';
import type { AlertReason } from '../state/types.js';
import { ALERTS_QUEUE } from './boss.js';

export interface AlertJob {
  monitorId: string;
  monitorUrl: string;
  reason: AlertReason;
  occurredAt: string; // ISO string — pg-boss serialises the payload to JSON
  n: number; // checkers that voted in the consensus behind this transition
}

export async function enqueueAlert(boss: PgBoss, job: AlertJob): Promise<void> {
  await boss.send(ALERTS_QUEUE, job, {
    retryLimit: 5,
    retryBackoff: true,
    expireInSeconds: 600, // a 10-minute-old alert is no longer worth delivering
  });
}
