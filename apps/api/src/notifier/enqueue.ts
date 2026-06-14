import type { AnomalyDirection } from '@argus/db';
import type { PgBoss } from 'pg-boss';
import type { AlertReason } from '../state/types.js';
import { ALERTS_QUEUE } from './boss.js';

export interface TransitionAlertJob {
  kind: 'transition';
  monitorId: string;
  monitorUrl: string;
  reason: AlertReason;
  occurredAt: string;
  n: number;
}

export interface AnomalyAlertJob {
  kind: 'anomaly';
  monitorId: string;
  monitorUrl: string;
  direction: AnomalyDirection;
  zScore: number;
  durationMs: number;
  baselineEwma: number;
  occurredAt: string;
}

export type AlertJob = TransitionAlertJob | AnomalyAlertJob;

const SEND_OPTS = {
  retryLimit: 5,
  retryBackoff: true,
  expireInSeconds: 600,
} as const;

export async function enqueueAlert(
  boss: PgBoss,
  job: Omit<TransitionAlertJob, 'kind'>,
): Promise<void> {
  await boss.send(ALERTS_QUEUE, { kind: 'transition', ...job }, SEND_OPTS);
}

export async function enqueueAnomalyAlert(
  boss: PgBoss,
  job: Omit<AnomalyAlertJob, 'kind'>,
): Promise<void> {
  await boss.send(ALERTS_QUEUE, { kind: 'anomaly', ...job }, SEND_OPTS);
}
