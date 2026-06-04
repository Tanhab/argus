import { type Monitor, monitors as monitorsQ, statusEvents } from '@argus/db';
import { createLogger } from '@argus/logger';
import type { PoolClient } from 'pg';
import type { ConsensusOutcome } from '../consensus/types.js';
import { decideTransition } from './decide.js';
import type { AlertReason } from './types.js';

const log = createLogger('api');

export interface TransitionResult {
  /** true when monitors.status changed (and a status_events row was written). */
  transitioned: boolean;
  fromStatus: Monitor['status'];
  toStatus: Monitor['status'];
  alertReason: AlertReason | null;
}

export async function applyStateTransition(
  tx: PoolClient,
  monitor: Monitor,
  consensus: ConsensusOutcome,
): Promise<TransitionResult> {
  const decision = decideTransition(monitor, consensus);

  const transitioning = decision.newStatus !== monitor.status;
  const countersChanged =
    decision.newConsecutiveFailures !== monitor.consecutiveFailures ||
    decision.newConsecutiveSuccesses !== monitor.consecutiveSuccesses;

  // Most evaluations are steady-state (up, still up, counters already zero): skip the
  // DB entirely so status_events only ever logs real changes.
  if (!transitioning && !countersChanged) {
    return {
      transitioned: false,
      fromStatus: monitor.status,
      toStatus: monitor.status,
      alertReason: null,
    };
  }

  // expectedStatus is the optimistic guard; statusChanged tells the SQL whether to stamp
  // status_changed_at. Fires on counter-only changes too, so a mid-count failure persists.
  const updated = await monitorsQ.updateMonitorState(tx, {
    id: monitor.id,
    expectedStatus: monitor.status,
    newStatus: decision.newStatus,
    newConsecutiveFailures: decision.newConsecutiveFailures,
    newConsecutiveSuccesses: decision.newConsecutiveSuccesses,
    statusChanged: transitioning,
  });

  // Guard matched zero rows: status changed out of band, which the advisory lock should
  // prevent. Recoverable contention skip — warn, write nothing, the next result retries.
  if (!updated) {
    log.warn(
      {
        monitorId: monitor.id,
        expectedStatus: monitor.status,
        attemptedStatus: decision.newStatus,
      },
      'state transition skipped: optimistic guard failed',
    );
    return {
      transitioned: false,
      fromStatus: monitor.status,
      toStatus: monitor.status,
      alertReason: null,
    };
  }

  // Append the audit row only on a real status change; counter-only updates skip it.
  if (transitioning) {
    await statusEvents.insertStatusEvent(tx, {
      monitorId: monitor.id,
      fromStatus: monitor.status,
      toStatus: decision.newStatus,
    });
  }

  return {
    transitioned: transitioning,
    fromStatus: monitor.status,
    toStatus: decision.newStatus,
    alertReason: decision.alertReason,
  };
}
