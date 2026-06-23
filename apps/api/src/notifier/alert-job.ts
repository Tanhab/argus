import type { AnomalyDirection } from '@argus/db';
import type { AlertReason } from '../state/types.js';

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
