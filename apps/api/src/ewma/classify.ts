import type { AnomalyDirection, CheckerEwmaState } from '@argus/db';
import type { EwmaParams } from './constants.js';
import { DEFAULT_EWMA_PARAMS } from './constants.js';
import type { EwmaResult } from './update.js';
import { updateEwma } from './update.js';

export interface CheckerAnomaly {
  checkerId: string;
  durationMs: number;
  result: EwmaResult;
}

export interface RegionalAnomaly {
  checkerId: string;
  direction: AnomalyDirection;
}

export interface AnomalyClassification {
  perChecker: CheckerAnomaly[];
  serviceWide: {
    isAnomaly: boolean;
    direction: AnomalyDirection | null;
    anomalousCount: number;
    activeCount: number;
  };
  regional: RegionalAnomaly[];
}

/** Same bar as consensus: majority of active checkers, floor of 2. */
export function serviceWideThreshold(activeCount: number): number {
  return Math.max(2, Math.ceil(activeCount / 2));
}

function isAnomalous(
  entry: CheckerAnomaly,
): entry is CheckerAnomaly & { result: EwmaResult & { direction: AnomalyDirection } } {
  return entry.result.isAnomaly && entry.result.direction !== null;
}

export function classifyAnomalies(
  readings: { checkerId: string; durationMs: number | null }[],
  baselines: CheckerEwmaState[],
  activeCheckerIds: Set<string>,
  params: EwmaParams = DEFAULT_EWMA_PARAMS,
): AnomalyClassification {
  const baselineByChecker = new Map(baselines.map((b) => [b.checkerId, b]));
  const durationByChecker = new Map(readings.map((r) => [r.checkerId, r.durationMs]));

  const perChecker: CheckerAnomaly[] = [];

  for (const checkerId of activeCheckerIds) {
    const durationMs = durationByChecker.get(checkerId);
    if (durationMs == null) continue;

    const baseline = baselineByChecker.get(checkerId);
    const result = updateEwma(
      durationMs,
      baseline?.ewmaDurationMs ?? null,
      baseline?.ewmaVariance ?? null,
      baseline?.ewmaSampleCount ?? 0,
      params,
    );
    perChecker.push({ checkerId, durationMs, result });
  }

  const anomalies = perChecker.filter(isAnomalous);
  const slowerCount = anomalies.filter((c) => c.result.direction === 'slower').length;
  const fasterCount = anomalies.filter((c) => c.result.direction === 'faster').length;

  const activeCount = activeCheckerIds.size;
  const threshold = serviceWideThreshold(activeCount);

  let direction: AnomalyDirection | null = null;
  if (slowerCount >= threshold) direction = 'slower';
  else if (fasterCount >= threshold) direction = 'faster';

  const regional: RegionalAnomaly[] =
    direction === null
      ? anomalies.map((c) => ({ checkerId: c.checkerId, direction: c.result.direction }))
      : anomalies
          .filter((c) => c.result.direction !== direction)
          .map((c) => ({ checkerId: c.checkerId, direction: c.result.direction }));

  return {
    perChecker,
    serviceWide: {
      isAnomaly: direction !== null,
      direction,
      anomalousCount:
        direction === 'slower' ? slowerCount : direction === 'faster' ? fasterCount : 0,
      activeCount,
    },
    regional,
  };
}
