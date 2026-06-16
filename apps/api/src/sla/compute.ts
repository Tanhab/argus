import { heartbeats, maintenanceWindows, monitors, statusEvents } from '@argus/db';
import {
  buildDownIntervals,
  clipInterval,
  detectCoverageGaps,
  type Interval,
  mergeIntervals,
  subtractIntervals,
  sumDurationMinutes,
} from '@argus/sla';
import { ValidationError } from '../errors.js';
import type { SlaIncident, SlaResponse } from './types.js';

const KNOWN_CHECKERS = ['checker-eu', 'checker-ap', 'checker-us'];
const LOW_CONFIDENCE_THRESHOLD = 0.05;

export async function computeSla(
  monitorId: string,
  userId: string,
  from: Date,
  to: Date,
  sloTarget?: number,
): Promise<SlaResponse | null> {
  const monitor = await monitors.getMonitor(monitorId, userId);
  if (!monitor) return null;

  const effectiveFrom = from.getTime() > monitor.createdAt.getTime() ? from : monitor.createdAt;
  const effectiveTo = monitor.deactivatedAt
    ? to.getTime() < monitor.deactivatedAt.getTime()
      ? to
      : monitor.deactivatedAt
    : to;

  if (effectiveFrom >= effectiveTo) {
    throw new ValidationError('effective SLA window is empty');
  }

  const totalMinutes = (effectiveTo.getTime() - effectiveFrom.getTime()) / 60_000;

  const [lastBefore, events, maintenanceRows, beats] = await Promise.all([
    statusEvents.getLastTransitionBefore(monitorId, effectiveFrom),
    statusEvents.getStatusEventsInRange(monitorId, effectiveFrom, effectiveTo),
    maintenanceWindows.getMaintenanceWindowsInRange(monitorId, effectiveFrom, effectiveTo),
    heartbeats.getHeartbeatsInRange(effectiveFrom, effectiveTo),
  ]);

  const initialStatus = lastBefore?.toStatus ?? 'up';
  const downIntervals = buildDownIntervals(initialStatus, events, effectiveFrom, effectiveTo);

  const maintenance = maintenanceRows
    .map((window) => ({ start: window.startsAt, end: window.endsAt }))
    .map((window) => clipInterval(window, effectiveFrom, effectiveTo))
    .filter((interval): interval is Interval => interval !== null);

  const gaps = detectCoverageGaps(KNOWN_CHECKERS, beats, effectiveFrom, effectiveTo);
  const excluded = mergeIntervals([...maintenance, ...gaps]);

  const monitoredMinutes = totalMinutes - sumDurationMinutes(excluded);
  const countedDown = subtractIntervals(downIntervals, excluded);
  const downtimeMinutes = sumDurationMinutes(countedDown);
  const maintenanceMinutes = sumDurationMinutes(maintenance);
  const coverageGapMinutes = sumDurationMinutes(gaps);
  const uptimePercent =
    monitoredMinutes > 0 ? ((monitoredMinutes - downtimeMinutes) / monitoredMinutes) * 100 : 0;
  const lowConfidence = coverageGapMinutes / totalMinutes > LOW_CONFIDENCE_THRESHOLD;

  const incidents: SlaIncident[] = countedDown.map((interval) => ({
    from: interval.start.toISOString(),
    to: interval.end.toISOString(),
    minutes: (interval.end.getTime() - interval.start.getTime()) / 60_000,
  }));

  const response: SlaResponse = {
    monitorId,
    window: {
      from: from.toISOString(),
      to: to.toISOString(),
      effectiveFrom: effectiveFrom.toISOString(),
      effectiveTo: effectiveTo.toISOString(),
    },
    sli: {
      totalMinutes,
      maintenanceMinutes,
      coverageGapMinutes,
      monitoredMinutes,
      downtimeMinutes,
      uptimePercent,
      lowConfidence,
    },
    incidents,
  };

  if (sloTarget !== undefined) {
    const budgetTotal = monitoredMinutes * (1 - sloTarget / 100);
    const remaining = Math.max(0, budgetTotal - downtimeMinutes);
    response.slo = {
      target: sloTarget,
      met: uptimePercent >= sloTarget,
      errorBudget: {
        totalMinutes: budgetTotal,
        consumedMinutes: downtimeMinutes,
        remainingMinutes: remaining,
        remainingPercent: budgetTotal > 0 ? (remaining / budgetTotal) * 100 : 100,
      },
    };
  }

  return response;
}
