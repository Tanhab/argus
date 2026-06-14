import { anomalyEvents, consensus, monitors as monitorsQ, withTransaction } from '@argus/db';
import { createLogger } from '@argus/logger';
import { updateEwma } from '../ewma/update.js';
import { applyStateTransition } from '../state/transition.js';
import { computeConsensus } from './compute.js';
import type { AnomalyOutcome, ConsensusResult } from './types.js';

const log = createLogger('api');

export async function evaluateConsensus(monitorId: string): Promise<ConsensusResult | null> {
  return withTransaction(async (tx) => {
    const { rows: lockRows } = await tx.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired',
      [monitorId],
    );
    if (!lockRows[0]?.acquired) {
      log.debug({ monitorId }, 'consensus skipped: lock held');
      return null;
    }

    // Full monitor under the advisory lock: feeds the state machine (status, counters,
    // thresholds) and still carries last_alertable_consensus for the Phase 3 alert path.
    const monitor = await monitorsQ.getMonitorByIdForUpdate(tx, monitorId);
    if (!monitor) return null; // soft-deleted between insert and eval; harmless

    const previousVerdict = monitor.lastAlertableConsensus;

    const results = await consensus.getResultsInWindow(tx, monitorId);
    const activeCheckers = await consensus.getActiveCheckers(tx);
    const outcome = computeConsensus(results, activeCheckers);

    await consensus.updateLastConsensus(tx, monitorId, outcome.verdict);
    if (outcome.verdict === 'up' || outcome.verdict === 'down') {
      await consensus.updateLastAlertableConsensus(tx, monitorId, outcome.verdict);
    }

    // State machine — same tx, same advisory lock, after consensus is persisted.
    const transition = await applyStateTransition(tx, monitor, outcome);

    // EWMA latency baseline. medianDurationMs is non-null only on an `up` verdict with a
    // real measurement (compute.ts). null = no usable reading this cycle — do NOT update
    // the baseline, do NOT ?? 0 it (a fake 0ms poisons the baseline permanently).
    let anomaly: AnomalyOutcome | null = null;
    if (outcome.medianDurationMs !== null) {
      const ewma = updateEwma(
        outcome.medianDurationMs,
        monitor.ewmaDurationMs,
        monitor.ewmaVariance,
        monitor.ewmaSampleCount,
      );

      await monitorsQ.updateEwmaState(tx, {
        id: monitorId,
        ewmaDurationMs: ewma.newEwma,
        ewmaVariance: ewma.newVariance,
        ewmaSampleCount: ewma.newSampleCount,
      });

      if (ewma.isAnomaly && ewma.direction && ewma.zScore !== null) {
        const baselineEwma = monitor.ewmaDurationMs ?? 0;
        const baselineStdDev = Math.sqrt(monitor.ewmaVariance ?? 0);
        await anomalyEvents.insertAnomalyEvent(tx, {
          monitorId,
          direction: ewma.direction,
          zScore: ewma.zScore,
          durationMs: outcome.medianDurationMs,
          baselineEwma,
          baselineStdDev,
        });
        anomaly = {
          direction: ewma.direction,
          zScore: ewma.zScore,
          durationMs: outcome.medianDurationMs,
          baselineEwma,
          baselineStdDev,
        };
      }
    }

    log.info(
      {
        monitorId,
        verdict: outcome.verdict,
        previousVerdict,
        n: outcome.n,
        confidence: outcome.confidence,
        transitioned: transition.transitioned,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        alertReason: transition.alertReason,
        anomalyDirection: anomaly?.direction ?? null,
        anomalyZScore: anomaly?.zScore ?? null,
      },
      'consensus evaluated',
    );

    return { outcome, previousVerdict, transition, anomaly };
  });
}
