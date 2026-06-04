import type { Monitor } from '@argus/db';
import { describe, expect, test } from 'vitest';
import type { ConsensusOutcome } from '../consensus/types.js';
import { decideTransition } from './decide.js';
import type { MonitorStatus } from './types.js';

/**
 * Builds a Monitor with only the fields decideTransition reads. interval=60 with the
 * default thresholds gives checksToDown=3 (180/60) and checksToRecover=2 (120/60).
 */
function mon(
  status: MonitorStatus,
  consecutiveFailures = 0,
  consecutiveSuccesses = 0,
  overrides: Partial<Monitor> = {},
): Monitor {
  return {
    id: 'm1',
    userId: 'u1',
    url: 'https://example.test',
    intervalSeconds: 60,
    isActive: true,
    createdAt: new Date(),
    deactivatedAt: null,
    lastConsensus: null,
    lastConsensusAt: null,
    lastAlertableConsensus: null,
    lastAlertableConsensusAt: null,
    status,
    statusChangedAt: null,
    consecutiveFailures,
    consecutiveSuccesses,
    downThresholdSeconds: 180,
    recoveryThresholdSeconds: 120,
    ...overrides,
  };
}

function con(verdict: ConsensusOutcome['verdict']): ConsensusOutcome {
  return { verdict, n: 3, confidence: 'high', medianDurationMs: null };
}

describe('decideTransition', () => {
  test('pending + up consensus stays up with counters reset', () => {
    expect(decideTransition(mon('pending'), con('up'))).toEqual({
      newStatus: 'up',
      newConsecutiveFailures: 0,
      newConsecutiveSuccesses: 0,
      alertReason: null,
    });
  });

  test('pending + down consensus starts counting in degraded', () => {
    expect(decideTransition(mon('pending'), con('down'))).toEqual({
      newStatus: 'degraded',
      newConsecutiveFailures: 1,
      newConsecutiveSuccesses: 0,
      alertReason: null,
    });
  });

  test('up + down consensus moves to degraded with one failure, no alert', () => {
    expect(decideTransition(mon('up'), con('down'))).toEqual({
      newStatus: 'degraded',
      newConsecutiveFailures: 1,
      newConsecutiveSuccesses: 0,
      alertReason: null,
    });
  });

  test('degraded + down below threshold stays degraded, no alert', () => {
    // checksToDown=3; from fails=1 a second down reaches 2, still below 3.
    expect(decideTransition(mon('degraded', 1), con('down'))).toEqual({
      newStatus: 'degraded',
      newConsecutiveFailures: 2,
      newConsecutiveSuccesses: 0,
      alertReason: null,
    });
  });

  test('degraded + Nth down reaches threshold, declares down with alert', () => {
    // fails=2 + this down = 3 = checksToDown.
    expect(decideTransition(mon('degraded', 2), con('down'))).toEqual({
      newStatus: 'down',
      newConsecutiveFailures: 3,
      newConsecutiveSuccesses: 0,
      alertReason: 'down_declared',
    });
  });

  test('degraded + up returns to up silently, never declared down', () => {
    expect(decideTransition(mon('degraded', 2), con('up'))).toEqual({
      newStatus: 'up',
      newConsecutiveFailures: 0,
      newConsecutiveSuccesses: 0,
      alertReason: null,
    });
  });

  test('down + up enters recovering with one success, no alert', () => {
    expect(decideTransition(mon('down', 3), con('up'))).toEqual({
      newStatus: 'recovering',
      newConsecutiveFailures: 0,
      newConsecutiveSuccesses: 1,
      alertReason: null,
    });
  });

  test('down + down stays down, counters unchanged', () => {
    expect(decideTransition(mon('down', 3), con('down'))).toEqual({
      newStatus: 'down',
      newConsecutiveFailures: 3,
      newConsecutiveSuccesses: 0,
      alertReason: null,
    });
  });

  test('recovering + up below threshold stays recovering, no alert', () => {
    // checksToRecover=2; from succs=0 a single up reaches 1, still below 2.
    expect(decideTransition(mon('recovering', 0, 0), con('up'))).toEqual({
      newStatus: 'recovering',
      newConsecutiveFailures: 0,
      newConsecutiveSuccesses: 1,
      alertReason: null,
    });
  });

  test('recovering + Nth up reaches threshold, declares up with recovery alert', () => {
    // succs=1 + this up = 2 = checksToRecover.
    expect(decideTransition(mon('recovering', 0, 1), con('up'))).toEqual({
      newStatus: 'up',
      newConsecutiveFailures: 0,
      newConsecutiveSuccesses: 2,
      alertReason: 'recovered_declared',
    });
  });

  test('recovering + down bounces back to down with fresh failure count, no alert', () => {
    // We were counting successes; a failure restarts fails at 1, not succs+something.
    expect(decideTransition(mon('recovering', 0, 1), con('down'))).toEqual({
      newStatus: 'down',
      newConsecutiveFailures: 1,
      newConsecutiveSuccesses: 0,
      alertReason: null,
    });
  });

  test('threshold conversion: interval 60, down threshold 180 needs 3 downs to declare', () => {
    // Walk up -> degraded -> degraded -> down across three down consensus evaluations.
    let m = mon('up');
    const seen: MonitorStatus[] = [];
    for (let i = 0; i < 3; i++) {
      const d = decideTransition(m, con('down'));
      seen.push(d.newStatus);
      m = mon(d.newStatus, d.newConsecutiveFailures, d.newConsecutiveSuccesses);
    }
    expect(seen).toEqual(['degraded', 'degraded', 'down']);
  });

  test('threshold conversion: interval 300 larger than threshold declares down on first check', () => {
    // ceil(180/300) = 1, so one down consensus from up goes straight to down + alert.
    const m = mon('up', 0, 0, { intervalSeconds: 300 });
    expect(decideTransition(m, con('down'))).toEqual({
      newStatus: 'down',
      newConsecutiveFailures: 1,
      newConsecutiveSuccesses: 0,
      alertReason: 'down_declared',
    });
  });

  test('threshold conversion: interval 300 with recovery threshold 120 recovers on first up', () => {
    // ceil(120/300) = 1, so one up consensus from down confirms recovery immediately.
    const m = mon('down', 1, 0, { intervalSeconds: 300 });
    expect(decideTransition(m, con('up'))).toEqual({
      newStatus: 'up',
      newConsecutiveFailures: 0,
      newConsecutiveSuccesses: 1,
      alertReason: 'recovered_declared',
    });
  });

  test("consensus 'degraded' (1/1 split) is a hold, counters frozen", () => {
    expect(decideTransition(mon('up'), con('degraded'))).toEqual({
      newStatus: 'up',
      newConsecutiveFailures: 0,
      newConsecutiveSuccesses: 0,
      alertReason: null,
    });
  });

  test("consensus 'insufficient_data' is a hold, counters frozen", () => {
    // A degraded monitor mid-count must not advance toward down on insufficient_data.
    expect(decideTransition(mon('degraded', 2), con('insufficient_data'))).toEqual({
      newStatus: 'degraded',
      newConsecutiveFailures: 2,
      newConsecutiveSuccesses: 0,
      alertReason: null,
    });
  });

  // The DoD in miniature: a target that flaps but never sustains an outage past the
  // threshold must produce zero transitions and zero alerts. Each cycle drives
  // checksToDown-1 down evals (stays in degraded) then one up (slides back to up).
  test('flap reduction property: 100 sub-threshold flap cycles produce zero alerts', () => {
    const checksToDown = 3;
    let m = mon('up');
    let alerts = 0;
    let transitionsToTerminal = 0; // count any time we reach down or up-via-recovery

    for (let cycle = 0; cycle < 100; cycle++) {
      // Fail just short of the threshold.
      for (let i = 0; i < checksToDown - 1; i++) {
        const d = decideTransition(m, con('down'));
        if (d.alertReason) alerts++;
        if (d.newStatus === 'down') transitionsToTerminal++;
        m = mon(d.newStatus, d.newConsecutiveFailures, d.newConsecutiveSuccesses);
      }
      // Recover before the threshold trips.
      const d = decideTransition(m, con('up'));
      if (d.alertReason) alerts++;
      m = mon(d.newStatus, d.newConsecutiveFailures, d.newConsecutiveSuccesses);
    }

    expect(alerts).toBe(0);
    expect(transitionsToTerminal).toBe(0);
    expect(m.status).toBe('up');
  });
});
