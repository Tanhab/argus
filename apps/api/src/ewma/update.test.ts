import { describe, expect, test } from 'vitest';
import type { EwmaParams } from './constants.js';
import { type EwmaResult, updateEwma } from './update.js';

function fold(readings: number[], params?: EwmaParams) {
  let ewma: number | null = null;
  let variance: number | null = null;
  let count = 0;
  const results: EwmaResult[] = [];
  for (const r of readings) {
    const result = updateEwma(r, ewma, variance, count, params);
    results.push(result);
    ewma = result.newEwma;
    variance = result.newVariance;
    count = result.newSampleCount;
  }
  return { final: results.at(-1), results };
}

const warmParams: EwmaParams = { alpha: 0.15, minSamples: 30, zThreshold: 3.0 };

describe('updateEwma', () => {
  test('null baseline sets the first sample, no anomaly', () => {
    const r = updateEwma(100, null, null, 0);
    expect(r.newSampleCount).toBe(1);
    expect(r.newEwma).toBe(100);
    expect(r.isAnomaly).toBe(false);
    expect(r.zScore).toBeNull();
  });

  test('30 readings at 100±5 stay quiet through warm-up', () => {
    const readings = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
    const { results } = fold(readings, warmParams);
    expect(results.every((r) => !r.isAnomaly)).toBe(true);
    expect(results.at(-1)?.newSampleCount).toBe(30);
  });

  test("post-warmup step up (baseline ~100, new 300) flags 'slower'", () => {
    const baseline = Array.from({ length: 35 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
    const { final: warmed } = fold(baseline, warmParams);
    const spike = updateEwma(
      300,
      warmed?.newEwma ?? null,
      warmed?.newVariance ?? null,
      warmed?.newSampleCount ?? 0,
      warmParams,
    );
    expect(spike.isAnomaly).toBe(true);
    expect(spike.direction).toBe('slower');
    expect(spike.zScore).toBeGreaterThan(3);
  });

  test("post-warmup step down (baseline ~200, new 5) flags 'faster'", () => {
    const baseline = Array.from({ length: 35 }, (_, i) => 200 + (i % 2 === 0 ? 10 : -10));
    const { final: warmed } = fold(baseline, warmParams);
    const drop = updateEwma(
      5,
      warmed?.newEwma ?? null,
      warmed?.newVariance ?? null,
      warmed?.newSampleCount ?? 0,
      warmParams,
    );
    expect(drop.isAnomaly).toBe(true);
    expect(drop.direction).toBe('faster');
  });

  test('normal jitter (baseline ~100, new 110) does not flag', () => {
    const baseline = Array.from({ length: 35 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
    const { final: warmed } = fold(baseline, warmParams);
    const jitter = updateEwma(
      110,
      warmed?.newEwma ?? null,
      warmed?.newVariance ?? null,
      warmed?.newSampleCount ?? 0,
      warmParams,
    );
    expect(jitter.isAnomaly).toBe(false);
  });

  test('gradual drift (+2ms × 50) never flags — documented limitation', () => {
    const readings = Array.from({ length: 50 }, (_, i) => 100 + i * 2);
    const { results } = fold(readings, { ...warmParams, minSamples: 5 });
    expect(results.every((r) => !r.isAnomaly)).toBe(true);
  });

  test('spike z-score is taken against the old baseline, not the post-update mean', () => {
    const baseline = Array.from({ length: 35 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
    const { final: warmed } = fold(baseline, warmParams);
    const prevEwma = warmed?.newEwma ?? 0;
    const prevVariance = warmed?.newVariance ?? 0;
    const prevStdDev = Math.sqrt(prevVariance);
    const spike = updateEwma(300, prevEwma, prevVariance, warmed?.newSampleCount ?? 0, warmParams);
    expect(spike.zScore).toBeCloseTo(Math.abs(300 - prevEwma) / prevStdDev, 5);
  });

  test('recovery: spike flags once, baseline returns to normal within ~20 cycles', () => {
    const baseline = Array.from({ length: 35 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
    const { final: warmed } = fold(baseline, warmParams);
    const spike = updateEwma(
      300,
      warmed?.newEwma ?? null,
      warmed?.newVariance ?? null,
      warmed?.newSampleCount ?? 0,
      warmParams,
    );
    expect(spike.isAnomaly).toBe(true);

    let ewma = spike.newEwma;
    let variance = spike.newVariance;
    let count = spike.newSampleCount;
    const afterSpike: EwmaResult[] = [];
    for (let i = 0; i < 20; i++) {
      const r = updateEwma(100, ewma, variance, count, warmParams);
      afterSpike.push(r);
      ewma = r.newEwma;
      variance = r.newVariance;
      count = r.newSampleCount;
    }
    expect(afterSpike.every((r) => !r.isAnomaly)).toBe(true);
    expect(ewma).toBeLessThan(150);
  });

  test('flat baseline then spike does not divide by zero', () => {
    const flat = Array.from({ length: 35 }, () => 100);
    const { final: warmed } = fold(flat, warmParams);
    const spike = updateEwma(
      200,
      warmed?.newEwma ?? null,
      warmed?.newVariance ?? null,
      warmed?.newSampleCount ?? 0,
      warmParams,
    );
    expect(Number.isFinite(spike.zScore)).toBe(true);
    expect(spike.isAnomaly).toBe(false);
  });

  test('alpha and threshold are honored from params', () => {
    const baseline = Array.from({ length: 35 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
    const { final: warmed } = fold(baseline, warmParams);
    const strict = updateEwma(
      150,
      warmed?.newEwma ?? null,
      warmed?.newVariance ?? null,
      warmed?.newSampleCount ?? 0,
      { alpha: 0.15, minSamples: 30, zThreshold: 10 },
    );
    const loose = updateEwma(
      150,
      warmed?.newEwma ?? null,
      warmed?.newVariance ?? null,
      warmed?.newSampleCount ?? 0,
      { alpha: 0.15, minSamples: 30, zThreshold: 1 },
    );
    expect(strict.isAnomaly).toBe(false);
    expect(loose.isAnomaly).toBe(true);
  });
});
