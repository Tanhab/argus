import { describe, expect, test } from 'vitest';
import {
  buildCheckerOnlineIntervals,
  CHECKER_STALE_MS,
  detectCoverageGaps,
  type HeartbeatPoint,
} from './coverage.js';
import type { Interval } from './intervals.js';

function hb(checkerId: string, iso: string): HeartbeatPoint {
  return { checkerId, recordedAt: new Date(iso) };
}

function expectIntervals(actual: Interval[], expected: Interval[]): void {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]?.start.getTime()).toBe(expected[i]?.start.getTime());
    expect(actual[i]?.end.getTime()).toBe(expected[i]?.end.getTime());
  }
}

describe('buildCheckerOnlineIntervals', () => {
  test('extends online window CHECKER_STALE_MS past the last beat in a chain', () => {
    const t0 = new Date('2026-06-01T10:00:00Z');
    const t1 = new Date(t0.getTime() + 30_000);
    const windowFrom = new Date('2026-06-01T09:00:00Z');
    const windowTo = new Date('2026-06-01T12:00:00Z');

    const intervals = buildCheckerOnlineIntervals(
      'checker-eu',
      [hb('checker-eu', t0.toISOString()), hb('checker-eu', t1.toISOString())],
      windowFrom,
      windowTo,
    );

    expectIntervals(intervals, [{ start: t0, end: new Date(t1.getTime() + CHECKER_STALE_MS) }]);
  });

  test('splits into two intervals when beats are farther apart than CHECKER_STALE_MS', () => {
    const t0 = new Date('2026-06-01T10:00:00Z');
    const t1 = new Date('2026-06-01T10:05:00Z');
    const windowFrom = new Date('2026-06-01T09:00:00Z');
    const windowTo = new Date('2026-06-01T12:00:00Z');

    const intervals = buildCheckerOnlineIntervals(
      'checker-eu',
      [hb('checker-eu', t0.toISOString()), hb('checker-eu', t1.toISOString())],
      windowFrom,
      windowTo,
    );

    expectIntervals(intervals, [
      { start: t0, end: new Date(t0.getTime() + CHECKER_STALE_MS) },
      { start: t1, end: new Date(t1.getTime() + CHECKER_STALE_MS) },
    ]);
  });

  test('filters heartbeats to the requested checker only', () => {
    const t0 = new Date('2026-06-01T10:00:00Z');
    const windowFrom = new Date('2026-06-01T09:00:00Z');
    const windowTo = new Date('2026-06-01T12:00:00Z');

    const intervals = buildCheckerOnlineIntervals(
      'checker-eu',
      [hb('checker-eu', t0.toISOString()), hb('checker-ap', t0.toISOString())],
      windowFrom,
      windowTo,
    );

    expect(intervals).toHaveLength(1);
    expect(intervals[0]?.start).toEqual(t0);
  });
});

describe('detectCoverageGaps', () => {
  const ALL = ['checker-eu', 'checker-ap', 'checker-us'];

  test('returns the full window when there are no heartbeats', () => {
    const windowFrom = new Date('2026-06-01T10:00:00Z');
    const windowTo = new Date('2026-06-01T11:00:00Z');

    const gaps = detectCoverageGaps(ALL, [], windowFrom, windowTo);

    expectIntervals(gaps, [{ start: windowFrom, end: windowTo }]);
  });

  test('returns the full window when only one checker is ever online', () => {
    const windowFrom = new Date('2026-06-01T10:00:00Z');
    const windowTo = new Date('2026-06-01T11:00:00Z');

    const gaps = detectCoverageGaps(
      ALL,
      [hb('checker-eu', '2026-06-01T10:00:00Z')],
      windowFrom,
      windowTo,
    );

    expectIntervals(gaps, [{ start: windowFrom, end: windowTo }]);
  });

  test('emits a gap after two checkers go stale while the third never heartbeats', () => {
    const windowFrom = new Date('2026-06-01T10:00:00Z');
    const windowTo = new Date('2026-06-01T11:00:00Z');
    const beat = '2026-06-01T10:00:00Z';

    const gaps = detectCoverageGaps(
      ALL,
      [hb('checker-eu', beat), hb('checker-ap', beat)],
      windowFrom,
      windowTo,
    );

    const staleEnd = new Date(new Date(beat).getTime() + CHECKER_STALE_MS);
    expectIntervals(gaps, [
      { start: windowFrom, end: new Date(beat) },
      { start: staleEnd, end: windowTo },
    ]);
  });

  test('closes a trailing gap at windowTo, not at the last event time', () => {
    const windowFrom = new Date('2026-06-01T10:00:00Z');
    const windowTo = new Date('2026-06-01T11:00:00Z');
    const beat = '2026-06-01T10:00:00Z';

    const gaps = detectCoverageGaps(ALL, [hb('checker-eu', beat)], windowFrom, windowTo);

    expect(gaps[0]?.end.getTime()).toBe(windowTo.getTime());
  });
});
