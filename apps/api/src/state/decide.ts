import type { Monitor } from '@argus/db';
import type { ConsensusOutcome } from '../consensus/types.js';
import type { Decision, MonitorStatus } from './types.js';

export function decideTransition(monitor: Monitor, consensus: ConsensusOutcome): Decision {
  const fails = monitor.consecutiveFailures;
  const succs = monitor.consecutiveSuccesses;
  const status = monitor.status;

  // Hold state on non-events. Consensus 'degraded' here is the 1/1 split case — the
  // same word as the FSM 'degraded' state below, but a different layer. Treat it as a
  // hold, exactly like 'insufficient_data'. Counters do NOT advance: a hung consensus
  // must never slowly walk a monitor toward DOWN.
  if (consensus.verdict === 'insufficient_data' || consensus.verdict === 'degraded') {
    return hold(status, fails, succs, null);
  }

  const checksToDown = Math.ceil(monitor.downThresholdSeconds / monitor.intervalSeconds);
  const checksToRecover = Math.ceil(monitor.recoveryThresholdSeconds / monitor.intervalSeconds);
  const isDown = consensus.verdict === 'down';

  switch (status) {
    // pending and up behave identically: pending is only the schema default until the
    // first evaluation lands, after which it never recurs.
    case 'pending':
    case 'up':
      if (!isDown) {
        return hold('up', 0, 0, null);
      }
      // First failure. When the interval is >= the threshold, checksToDown is 1 and a
      // single down declares DOWN immediately, skipping the degraded waiting room.
      return checksToDown <= 1 ? hold('down', 1, 0, 'down_declared') : hold('degraded', 1, 0, null);

    case 'degraded': {
      if (!isDown) {
        // Recovery before we ever declared DOWN — silent return to UP.
        return hold('up', 0, 0, null);
      }
      const newFails = fails + 1;
      return newFails >= checksToDown
        ? hold('down', newFails, 0, 'down_declared')
        : hold('degraded', newFails, 0, null);
    }

    case 'down':
      if (isDown) {
        return hold('down', fails, 0, null);
      }
      // First success. Mirror the up-case fast path: when checksToRecover is 1, a single
      // up confirms recovery immediately, skipping the recovering waiting room.
      return checksToRecover <= 1
        ? hold('up', 0, 1, 'recovered_declared')
        : hold('recovering', 0, 1, null);

    case 'recovering': {
      if (isDown) {
        // Bounced back to DOWN mid-recovery. We already alerted on the original
        // down_declared, so no alert. fails restarts at 1 — we were counting successes,
        // so the prior fails value is stale.
        return hold('down', 1, 0, null);
      }
      const newSuccs = succs + 1;
      return newSuccs >= checksToRecover
        ? hold('up', 0, newSuccs, 'recovered_declared')
        : hold('recovering', 0, newSuccs, null);
    }
  }
}

function hold(
  newStatus: MonitorStatus,
  newConsecutiveFailures: number,
  newConsecutiveSuccesses: number,
  alertReason: Decision['alertReason'],
): Decision {
  return { newStatus, newConsecutiveFailures, newConsecutiveSuccesses, alertReason };
}
