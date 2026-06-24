import type { CheckResult } from '../api/types';
import { CHECKER_ORDER } from './checker-labels';

/** Latest check per checker from a newest-first result list. */
export function latestResultPerChecker(results: CheckResult[]): CheckResult[] {
  const byChecker = new Map<string, CheckResult>();
  for (const row of results) {
    if (!byChecker.has(row.checkerId)) {
      byChecker.set(row.checkerId, row);
    }
  }
  return CHECKER_ORDER.flatMap((id) => {
    const row = byChecker.get(id);
    return row ? [row] : [];
  });
}

export function countUpVotes(results: CheckResult[]): number {
  return results.filter((r) => r.isUp).length;
}
