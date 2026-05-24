import type { WindowResult } from '@argus/db';
import type { ConsensusOutcome } from './types.js';

export function computeConsensus(
  results: WindowResult[],
  activeCheckers: Set<string>,
): ConsensusOutcome {
  const valid = results.filter((r) => activeCheckers.has(r.checkerId));
  const n = valid.length;

  if (n === 0) {
    return { verdict: 'insufficient_data', n: 0, confidence: 'none', medianDurationMs: null };
  }

  const upVotes = valid.filter((r) => r.isUp);
  const upCount = upVotes.length;
  const downCount = n - upCount;

  if (n >= 3) {
    return upCount > downCount
      ? { verdict: 'up', n, confidence: 'high', medianDurationMs: median(upVotes) }
      : { verdict: 'down', n, confidence: 'high', medianDurationMs: null };
  }

  if (n === 2) {
    if (upCount === 2) {
      return { verdict: 'up', n, confidence: 'medium', medianDurationMs: median(upVotes) };
    }
    if (downCount === 2) {
      return { verdict: 'down', n, confidence: 'medium', medianDurationMs: null };
    }
    return { verdict: 'degraded', n, confidence: 'low', medianDurationMs: null };
  }

  const [only] = valid;
  if (!only) {
    return { verdict: 'insufficient_data', n: 0, confidence: 'none', medianDurationMs: null };
  }

  return only.isUp
    ? { verdict: 'up', n, confidence: 'low', medianDurationMs: only.durationMs }
    : { verdict: 'down', n, confidence: 'low', medianDurationMs: null };
}

function median(results: WindowResult[]): number | null {
  const durations = results
    .map((r) => r.durationMs)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  if (durations.length === 0) return null;
  const mid = Math.floor(durations.length / 2);
  const hi = durations[mid];
  if (hi === undefined) return null;
  if (durations.length % 2 !== 0) return hi;
  const lo = durations[mid - 1];
  return lo === undefined ? hi : Math.round((lo + hi) / 2);
}
