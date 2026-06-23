import type { CheckerEwmaState } from '@argus/db';
import { describe, expect, test } from 'vitest';
import { classifyAnomalies, serviceWideThreshold } from './classify.js';

const CHECKERS = ['checker-eu', 'checker-ap', 'checker-us'] as const;
const allActive = new Set<string>(CHECKERS);

function baseline(checkerId: string, overrides: Partial<CheckerEwmaState> = {}): CheckerEwmaState {
  return {
    monitorId: 'm1',
    checkerId,
    ewmaDurationMs: 100,
    ewmaVariance: 25,
    ewmaSampleCount: 50,
    ...overrides,
  };
}

function warmedBaselines(): CheckerEwmaState[] {
  return CHECKERS.map((id) => baseline(id));
}

function readings(entries: Record<string, number | null>) {
  return Object.entries(entries).map(([checkerId, durationMs]) => ({ checkerId, durationMs }));
}

describe('serviceWideThreshold', () => {
  test('requires at least 2 regardless of active count', () => {
    expect(serviceWideThreshold(1)).toBe(2);
    expect(serviceWideThreshold(2)).toBe(2);
    expect(serviceWideThreshold(3)).toBe(2);
  });
});

describe('classifyAnomalies', () => {
  test('all three slow → service-wide slower, no regional', () => {
    const out = classifyAnomalies(
      readings({ 'checker-eu': 400, 'checker-ap': 400, 'checker-us': 400 }),
      warmedBaselines(),
      allActive,
    );

    expect(out.serviceWide).toEqual({
      isAnomaly: true,
      direction: 'slower',
      anomalousCount: 3,
      activeCount: 3,
    });
    expect(out.regional).toEqual([]);
    expect(out.perChecker).toHaveLength(3);
  });

  test('one slow checker → regional only, not service-wide', () => {
    const out = classifyAnomalies(
      readings({ 'checker-eu': 400, 'checker-ap': 100, 'checker-us': 100 }),
      warmedBaselines(),
      allActive,
    );

    expect(out.serviceWide.isAnomaly).toBe(false);
    expect(out.serviceWide.direction).toBeNull();
    expect(out.regional).toEqual([{ checkerId: 'checker-eu', direction: 'slower' }]);
  });

  test('two of three slow → service-wide with count 2', () => {
    const out = classifyAnomalies(
      readings({ 'checker-eu': 400, 'checker-ap': 400, 'checker-us': 100 }),
      warmedBaselines(),
      allActive,
    );

    expect(out.serviceWide).toMatchObject({
      isAnomaly: true,
      direction: 'slower',
      anomalousCount: 2,
    });
    expect(out.regional).toEqual([]);
  });

  test('split directions → not service-wide, both in regional', () => {
    const baselines = [
      baseline('checker-eu'),
      baseline('checker-ap', { ewmaDurationMs: 200, ewmaVariance: 400 }),
      baseline('checker-us'),
    ];
    const out = classifyAnomalies(
      readings({ 'checker-eu': 400, 'checker-ap': 5, 'checker-us': 100 }),
      baselines,
      allActive,
    );

    expect(out.serviceWide.isAnomaly).toBe(false);
    expect(out.regional).toEqual(
      expect.arrayContaining([
        { checkerId: 'checker-eu', direction: 'slower' },
        { checkerId: 'checker-ap', direction: 'faster' },
      ]),
    );
    expect(out.regional).toHaveLength(2);
  });

  test('single active checker slow → not service-wide (floor of 2)', () => {
    const out = classifyAnomalies(
      readings({ 'checker-eu': 400 }),
      [baseline('checker-eu')],
      new Set(['checker-eu']),
    );

    expect(out.serviceWide.isAnomaly).toBe(false);
    expect(out.regional).toEqual([{ checkerId: 'checker-eu', direction: 'slower' }]);
  });

  test('warm-up baseline does not flag an anomaly', () => {
    const out = classifyAnomalies(
      readings({ 'checker-eu': 400, 'checker-ap': 100, 'checker-us': 100 }),
      [baseline('checker-eu', { ewmaSampleCount: 5 }), ...warmedBaselines().slice(1)],
      allActive,
    );

    expect(out.serviceWide.isAnomaly).toBe(false);
    expect(out.regional).toEqual([]);
    expect(out.perChecker.find((c) => c.checkerId === 'checker-eu')?.result.isAnomaly).toBe(false);
  });

  test('cold start for a checker with no baseline row seeds without anomaly', () => {
    const out = classifyAnomalies(
      readings({ 'checker-eu': 100, 'checker-ap': 100, 'checker-us': 250 }),
      [baseline('checker-eu'), baseline('checker-ap')],
      allActive,
    );

    const us = out.perChecker.find((c) => c.checkerId === 'checker-us');
    expect(us?.result.newSampleCount).toBe(1);
    expect(us?.result.isAnomaly).toBe(false);
    expect(out.serviceWide.isAnomaly).toBe(false);
    expect(out.regional).toEqual([]);
  });

  test('skips active checkers with no reading this cycle', () => {
    const out = classifyAnomalies(readings({ 'checker-eu': 100 }), warmedBaselines(), allActive);

    expect(out.perChecker).toHaveLength(1);
    expect(out.perChecker[0]?.checkerId).toBe('checker-eu');
  });
});
