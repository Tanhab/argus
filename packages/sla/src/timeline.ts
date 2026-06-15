import type { MonitorStatus } from '@argus/db';

import type { Interval } from './intervals.js';

export interface StatusTransition {
  occurredAt: Date;
  fromStatus: MonitorStatus;
  toStatus: MonitorStatus;
}

export function getStatusAtTime(
  at: Date,
  transitions: StatusTransition[],
  fallbackStatus: MonitorStatus,
): MonitorStatus {
  let last: MonitorStatus | null = null;
  const sorted = transitions.toSorted((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  for (const transition of sorted) {
    if (transition.occurredAt <= at) last = transition.toStatus;
  }

  return last ? last : fallbackStatus;
}

export function buildDownIntervals(
  initialStatus: MonitorStatus,
  transitions: StatusTransition[],
  windowFrom: Date,
  windowTo: Date,
): Interval[] {
  const sorted = transitions.toSorted((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  let status = getStatusAtTime(windowFrom, sorted, initialStatus);
  let segmentStart = windowFrom;
  const segments: { start: Date; end: Date; status: MonitorStatus }[] = [];

  for (const t of sorted) {
    if (
      t.occurredAt.getTime() > windowFrom.getTime() &&
      t.occurredAt.getTime() < windowTo.getTime()
    ) {
      segments.push({ start: segmentStart, end: t.occurredAt, status });
      segmentStart = t.occurredAt;
      status = t.toStatus;
    }
  }

  segments.push({ start: segmentStart, end: windowTo, status });

  return segments.filter((s) => s.status === 'down').map((s) => ({ start: s.start, end: s.end }));
}
