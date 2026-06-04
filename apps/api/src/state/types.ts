import type { MonitorStatus } from '@argus/db';

export type { MonitorStatus } from '@argus/db';

export type AlertReason =
  | 'down_declared' // degraded -> down: real outage
  | 'recovered_declared'; // recovering -> up: confirmed recovery

// Note: degraded -> up does NOT alert (we never told anyone it was down).
//       down -> recovering does NOT alert (not confirmed yet; fire on the up edge).

export interface Decision {
  newStatus: MonitorStatus;
  newConsecutiveFailures: number;
  newConsecutiveSuccesses: number;
  alertReason: AlertReason | null;
}
