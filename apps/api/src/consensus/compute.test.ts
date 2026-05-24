import type { WindowResult } from '@argus/db';
import { describe, expect, test } from 'vitest';
import { computeConsensus } from './compute.js';

function r(checkerId: string, isUp: boolean, durationMs: number | null = 100): WindowResult {
  return { checkerId, isUp, durationMs, errorType: null, checkedAt: new Date() };
}

const allActive = new Set(['checker-eu', 'checker-ap', 'checker-us']);

describe('computeConsensus', () => {
  test('returns up with high confidence when 3 checkers agree up', () => {
    const out = computeConsensus(
      [r('checker-eu', true), r('checker-ap', true), r('checker-us', true)],
      allActive,
    );
    expect(out).toEqual({ verdict: 'up', n: 3, confidence: 'high', medianDurationMs: 100 });
  });

  test('returns down with high confidence when 3 checkers agree down', () => {
    const out = computeConsensus(
      [r('checker-eu', false), r('checker-ap', false), r('checker-us', false)],
      allActive,
    );
    expect(out).toEqual({ verdict: 'down', n: 3, confidence: 'high', medianDurationMs: null });
  });

  test('returns down with high confidence when 2 of 3 checkers say down', () => {
    const out = computeConsensus(
      [r('checker-eu', false), r('checker-ap', false), r('checker-us', true)],
      allActive,
    );
    expect(out).toEqual({ verdict: 'down', n: 3, confidence: 'high', medianDurationMs: null });
  });

  test('returns up with high confidence when 2 of 3 checkers say up (no false positive)', () => {
    const out = computeConsensus(
      [r('checker-eu', true, 100), r('checker-ap', true, 200), r('checker-us', false)],
      allActive,
    );
    expect(out).toEqual({ verdict: 'up', n: 3, confidence: 'high', medianDurationMs: 150 });
  });

  test('returns up with medium confidence when 2 checkers unanimously say up', () => {
    const out = computeConsensus([r('checker-eu', true), r('checker-ap', true)], allActive);
    expect(out).toEqual({ verdict: 'up', n: 2, confidence: 'medium', medianDurationMs: 100 });
  });

  test('returns down with medium confidence when 2 checkers unanimously say down', () => {
    const out = computeConsensus([r('checker-eu', false), r('checker-ap', false)], allActive);
    expect(out).toEqual({ verdict: 'down', n: 2, confidence: 'medium', medianDurationMs: null });
  });

  test('returns degraded with low confidence on a 2-checker split', () => {
    const out = computeConsensus([r('checker-eu', true), r('checker-ap', false)], allActive);
    expect(out).toEqual({ verdict: 'degraded', n: 2, confidence: 'low', medianDurationMs: null });
  });

  test('returns up with low confidence when only one checker votes up', () => {
    const out = computeConsensus([r('checker-eu', true, 250)], allActive);
    expect(out).toEqual({ verdict: 'up', n: 1, confidence: 'low', medianDurationMs: 250 });
  });

  test('returns down with low confidence when only one checker votes down', () => {
    const out = computeConsensus([r('checker-eu', false)], allActive);
    expect(out).toEqual({ verdict: 'down', n: 1, confidence: 'low', medianDurationMs: null });
  });

  test('drops votes from checkers not in the active set', () => {
    const out = computeConsensus(
      [r('checker-eu', false), r('checker-ap', false), r('checker-us', true)],
      new Set(['checker-us']),
    );
    expect(out).toEqual({ verdict: 'up', n: 1, confidence: 'low', medianDurationMs: 100 });
  });

  test('returns insufficient_data when no results are passed', () => {
    const out = computeConsensus([], allActive);
    expect(out).toEqual({
      verdict: 'insufficient_data',
      n: 0,
      confidence: 'none',
      medianDurationMs: null,
    });
  });

  test('returns insufficient_data when every result is from a dead checker', () => {
    const out = computeConsensus(
      [r('checker-eu', true), r('checker-ap', true)],
      new Set(['checker-us']),
    );
    expect(out).toEqual({
      verdict: 'insufficient_data',
      n: 0,
      confidence: 'none',
      medianDurationMs: null,
    });
  });

  test('median of an odd number of up votes is the middle duration', () => {
    const out = computeConsensus(
      [r('checker-eu', true, 100), r('checker-ap', true, 200), r('checker-us', true, 300)],
      allActive,
    );
    expect(out.medianDurationMs).toBe(200);
  });

  test('median of an even number of up votes is the rounded mean of the two middle durations', () => {
    const out = computeConsensus(
      [r('checker-eu', true, 100), r('checker-ap', true, 200)],
      allActive,
    );
    expect(out.medianDurationMs).toBe(150);
  });

  test('median ignores null durations', () => {
    const out = computeConsensus(
      [r('checker-eu', true, 100), r('checker-ap', true, null), r('checker-us', true, 300)],
      allActive,
    );
    expect(out.medianDurationMs).toBe(200);
  });
});
