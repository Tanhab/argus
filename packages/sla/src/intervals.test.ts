import { describe, expect, test } from 'vitest';
import {
  clipInterval,
  type Interval,
  mergeIntervals,
  subtractIntervals,
  sumDurationMinutes,
  sumDurationMs,
} from './intervals.js';

function iv(start: string, end: string): Interval {
  return { start: new Date(start), end: new Date(end) };
}

function expectIntervals(actual: Interval[], expected: Interval[]): void {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]?.start.getTime()).toBe(expected[i]?.start.getTime());
    expect(actual[i]?.end.getTime()).toBe(expected[i]?.end.getTime());
  }
}

describe('sumDurationMs', () => {
  test('empty input returns 0', () => {
    expect(sumDurationMs([])).toBe(0);
    expect(sumDurationMinutes([])).toBe(0);
  });

  test('sums one interval in milliseconds', () => {
    const intervals = [iv('2026-06-01T10:00:00Z', '2026-06-01T10:30:00Z')];
    expect(sumDurationMs(intervals)).toBe(30 * 60 * 1000);
    expect(sumDurationMinutes(intervals)).toBe(30);
  });
});

describe('clipInterval', () => {
  test('returns null when interval is fully outside the window', () => {
    const interval = iv('2026-06-01T10:00:00Z', '2026-06-01T11:00:00Z');
    expect(
      clipInterval(interval, new Date('2026-06-01T12:00:00Z'), new Date('2026-06-01T13:00:00Z')),
    ).toBeNull();
  });

  test('returns clipped segment on partial overlap', () => {
    const interval = iv('2026-06-01T10:00:00Z', '2026-06-01T12:00:00Z');
    const clipped = clipInterval(
      interval,
      new Date('2026-06-01T11:00:00Z'),
      new Date('2026-06-01T11:30:00Z'),
    );
    expectIntervals(clipped ? [clipped] : [], [iv('2026-06-01T11:00:00Z', '2026-06-01T11:30:00Z')]);
  });
});

describe('mergeIntervals', () => {
  test('empty input returns []', () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  test('single interval is unchanged', () => {
    const input = [iv('2026-06-01T10:00:00Z', '2026-06-01T10:30:00Z')];
    expectIntervals(mergeIntervals(input), input);
  });

  test('merges adjacent intervals', () => {
    const merged = mergeIntervals([
      iv('2026-06-01T10:00:00Z', '2026-06-01T10:30:00Z'),
      iv('2026-06-01T10:30:00Z', '2026-06-01T11:00:00Z'),
    ]);
    expectIntervals(merged, [iv('2026-06-01T10:00:00Z', '2026-06-01T11:00:00Z')]);
  });

  test('merges overlapping intervals', () => {
    const merged = mergeIntervals([
      iv('2026-06-01T10:00:00Z', '2026-06-01T10:45:00Z'),
      iv('2026-06-01T10:30:00Z', '2026-06-01T11:00:00Z'),
    ]);
    expectIntervals(merged, [iv('2026-06-01T10:00:00Z', '2026-06-01T11:00:00Z')]);
  });

  test('merges identical intervals into one', () => {
    const interval = iv('2026-06-01T10:00:00Z', '2026-06-01T11:00:00Z');
    expectIntervals(mergeIntervals([interval, interval]), [interval]);
  });
});

describe('subtractIntervals', () => {
  test('returns base unchanged when remove is disjoint', () => {
    const base = [iv('2026-06-01T10:00:00Z', '2026-06-01T11:00:00Z')];
    const remove = [iv('2026-06-01T12:00:00Z', '2026-06-01T13:00:00Z')];
    expectIntervals(subtractIntervals(base, remove), base);
  });

  test('returns [] when base is fully covered', () => {
    const base = [iv('2026-06-01T10:00:00Z', '2026-06-01T11:00:00Z')];
    const remove = [iv('2026-06-01T09:00:00Z', '2026-06-01T12:00:00Z')];
    expect(subtractIntervals(base, remove)).toEqual([]);
  });

  test('returns left and right remnants on partial overlap', () => {
    const result = subtractIntervals(
      [iv('2026-06-01T10:00:00Z', '2026-06-01T12:00:00Z')],
      [iv('2026-06-01T10:30:00Z', '2026-06-01T11:00:00Z')],
    );
    expectIntervals(result, [
      iv('2026-06-01T10:00:00Z', '2026-06-01T10:30:00Z'),
      iv('2026-06-01T11:00:00Z', '2026-06-01T12:00:00Z'),
    ]);
  });
});
