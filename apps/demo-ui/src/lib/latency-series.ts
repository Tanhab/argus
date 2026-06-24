import type { BucketedLatencyPoint } from '../api/types';
import { CHECKER_ORDER } from './checker-labels';

/** Align sparse per-checker buckets into one shared x-axis for uPlot. */
export function bucketedLatencyToUplot(
  rows: BucketedLatencyPoint[],
): [number[], ...(number | null)[][]] {
  const bucketMs = new Set<number>();
  const byChecker = new Map<string, Map<number, number | null>>();

  for (const row of rows) {
    const t = new Date(row.bucket).getTime();
    bucketMs.add(t);
    let checkerBuckets = byChecker.get(row.checkerId);
    if (!checkerBuckets) {
      checkerBuckets = new Map();
      byChecker.set(row.checkerId, checkerBuckets);
    }
    checkerBuckets.set(t, row.avgMs);
  }

  const times = [...bucketMs].sort((a, b) => a - b);
  const x = times.map((t) => t / 1000);

  const series = CHECKER_ORDER.map((checkerId) =>
    times.map((t) => byChecker.get(checkerId)?.get(t) ?? null),
  );

  return [x, ...series];
}
