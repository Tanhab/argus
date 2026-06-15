import { describe, expect, test } from 'vitest';
import type { Interval } from './intervals.js';
import { buildDownIntervals, getStatusAtTime, type StatusTransition } from './timeline.js';

const WINDOW_FROM = '2026-06-01T10:00:00Z';
const WINDOW_TO = '2026-06-01T12:00:00Z';

function iv(start: string, end: string): Interval {
  return { start: new Date(start), end: new Date(end) };
}

function tr(
  at: string,
  fromStatus: StatusTransition['fromStatus'],
  toStatus: StatusTransition['toStatus'],
): StatusTransition {
  return { occurredAt: new Date(at), fromStatus, toStatus };
}

function expectIntervals(actual: Interval[], expected: Interval[]): void {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]?.start.getTime()).toBe(expected[i]?.start.getTime());
    expect(actual[i]?.end.getTime()).toBe(expected[i]?.end.getTime());
  }
}

function down(
  initialStatus: StatusTransition['fromStatus'],
  transitions: StatusTransition[],
): Interval[] {
  return buildDownIntervals(initialStatus, transitions, new Date(WINDOW_FROM), new Date(WINDOW_TO));
}

describe('getStatusAtTime', () => {
  test('returns fallback when no transition is at or before the query time', () => {
    const transitions = [tr('2026-06-01T11:00:00Z', 'up', 'down')];
    expect(getStatusAtTime(new Date('2026-06-01T10:30:00Z'), transitions, 'up')).toBe('up');
  });

  test('returns the last toStatus at or before the query time', () => {
    const transitions = [
      tr('2026-06-01T10:00:00Z', 'up', 'down'),
      tr('2026-06-01T11:00:00Z', 'down', 'up'),
    ];
    expect(getStatusAtTime(new Date('2026-06-01T10:30:00Z'), transitions, 'pending')).toBe('down');
  });

  test('sorts unsorted transitions before evaluating', () => {
    const transitions = [
      tr('2026-06-01T11:00:00Z', 'down', 'up'),
      tr('2026-06-01T10:00:00Z', 'up', 'down'),
    ];
    expect(getStatusAtTime(new Date('2026-06-01T10:30:00Z'), transitions, 'pending')).toBe('down');
  });
});

describe('buildDownIntervals', () => {
  test('returns no down intervals when initial status is up and there are no transitions', () => {
    expect(down('up', [])).toEqual([]);
  });

  test('returns one down interval covering the full window when initial status is down', () => {
    expectIntervals(down('down', []), [iv(WINDOW_FROM, WINDOW_TO)]);
  });

  test('returns one down interval between up to down to up transitions mid-window', () => {
    const result = down('up', [
      tr('2026-06-01T10:30:00Z', 'up', 'down'),
      tr('2026-06-01T11:00:00Z', 'down', 'up'),
    ]);
    expectIntervals(result, [iv('2026-06-01T10:30:00Z', '2026-06-01T11:00:00Z')]);
  });

  test('clips an outage that starts before the window to windowFrom', () => {
    const result = down('up', [
      tr('2026-06-01T09:00:00Z', 'up', 'down'),
      tr('2026-06-01T11:00:00Z', 'down', 'up'),
    ]);
    expectIntervals(result, [iv(WINDOW_FROM, '2026-06-01T11:00:00Z')]);
  });

  test('clips an outage that ends after the window to windowTo', () => {
    const result = down('up', [tr('2026-06-01T09:00:00Z', 'up', 'down')]);
    expectIntervals(result, [iv(WINDOW_FROM, WINDOW_TO)]);
  });

  test('does not count degraded time as downtime', () => {
    const result = down('up', [
      tr('2026-06-01T10:30:00Z', 'up', 'down'),
      tr('2026-06-01T10:45:00Z', 'down', 'degraded'),
      tr('2026-06-01T11:00:00Z', 'degraded', 'up'),
    ]);
    expectIntervals(result, [iv('2026-06-01T10:30:00Z', '2026-06-01T10:45:00Z')]);
  });

  test('returns multiple separate down intervals', () => {
    const result = down('up', [
      tr('2026-06-01T10:30:00Z', 'up', 'down'),
      tr('2026-06-01T10:45:00Z', 'down', 'up'),
      tr('2026-06-01T11:00:00Z', 'up', 'down'),
      tr('2026-06-01T11:15:00Z', 'down', 'up'),
    ]);
    expectIntervals(result, [
      iv('2026-06-01T10:30:00Z', '2026-06-01T10:45:00Z'),
      iv('2026-06-01T11:00:00Z', '2026-06-01T11:15:00Z'),
    ]);
  });
});
