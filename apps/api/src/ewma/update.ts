import type { AnomalyDirection } from '@argus/db';
import { DEFAULT_EWMA_PARAMS, type EwmaParams } from './constants.js';

export interface EwmaResult {
  newEwma: number;
  newVariance: number;
  newSampleCount: number;
  isAnomaly: boolean;
  direction: AnomalyDirection | null;
  zScore: number | null;
}

export function updateEwma(
  durationMs: number,
  prevEwma: number | null,
  prevVariance: number | null,
  prevSampleCount: number,
  params: EwmaParams = DEFAULT_EWMA_PARAMS,
): EwmaResult {
  const { alpha, minSamples, zThreshold } = params;

  if (prevEwma === null || prevSampleCount === 0) {
    return {
      newEwma: durationMs,
      newVariance: 0,
      newSampleCount: 1,
      isAnomaly: false,
      direction: null,
      zScore: null,
    };
  }

  const diff = durationMs - prevEwma;
  const newEwma = alpha * durationMs + (1 - alpha) * prevEwma;
  const newVariance = alpha * diff * diff + (1 - alpha) * (prevVariance ?? 0);
  const newSampleCount = prevSampleCount + 1;

  if (newSampleCount <= minSamples) {
    return {
      newEwma,
      newVariance,
      newSampleCount,
      isAnomaly: false,
      direction: null,
      zScore: null,
    };
  }

  const prevStdDev = Math.sqrt(prevVariance ?? 0);
  const zScore = prevStdDev > 0 ? Math.abs(diff) / prevStdDev : 0;
  const isAnomaly = zScore > zThreshold;
  const direction: AnomalyDirection | null = isAnomaly ? (diff > 0 ? 'slower' : 'faster') : null;

  return {
    newEwma,
    newVariance,
    newSampleCount,
    isAnomaly,
    direction,
    zScore,
  };
}
