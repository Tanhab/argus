import {
  anomalyEvents,
  type CheckerEwmaState,
  consensus,
  monitorCheckerEwma,
  monitors as monitorsQ,
  withTransaction,
} from '@argus/db';
import { createLogger } from '@argus/logger';
import type { CheckerAnomaly } from '../ewma/classify.js';
import { classifyAnomalies } from '../ewma/classify.js';
import { updateEwma } from '../ewma/update.js';
import { applyStateTransition } from '../state/transition.js';
import { computeConsensus } from './compute.js';
import type { AnomalyOutcome, ConsensusResult } from './types.js';

const log = createLogger('api');

function preReadingBaseline(baseline: CheckerEwmaState | undefined): {
  baselineEwma: number;
  baselineStdDev: number;
} {
  return {
    baselineEwma: baseline?.ewmaDurationMs ?? 0,
    baselineStdDev: Math.sqrt(baseline?.ewmaVariance ?? 0),
  };
}

function toAnomalyOutcome(
  entry: CheckerAnomaly,
  baseline: CheckerEwmaState | undefined,
): AnomalyOutcome | null {
  if (!entry.result.isAnomaly || entry.result.direction === null || entry.result.zScore === null) {
    return null;
  }
  const { baselineEwma, baselineStdDev } = preReadingBaseline(baseline);
  return {
    direction: entry.result.direction,
    zScore: entry.result.zScore,
    durationMs: entry.durationMs,
    baselineEwma,
    baselineStdDev,
  };
}

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

    const monitor = await monitorsQ.getMonitorByIdForUpdate(tx, monitorId);
    if (!monitor) return null;

    const previousVerdict = monitor.lastAlertableConsensus;

    const results = await consensus.getResultsInWindow(tx, monitorId);
    const activeCheckers = await consensus.getActiveCheckers(tx);
    const outcome = computeConsensus(results, activeCheckers);

    await consensus.updateLastConsensus(tx, monitorId, outcome.verdict);
    if (outcome.verdict === 'up' || outcome.verdict === 'down') {
      await consensus.updateLastAlertableConsensus(tx, monitorId, outcome.verdict);
    }

    const transition = await applyStateTransition(tx, monitor, outcome);

    // Display aggregate on monitors — not used for anomaly detection.
    if (outcome.medianDurationMs !== null) {
      const displayEwma = updateEwma(
        outcome.medianDurationMs,
        monitor.ewmaDurationMs,
        monitor.ewmaVariance,
        monitor.ewmaSampleCount,
      );
      await monitorsQ.updateEwmaState(tx, {
        id: monitorId,
        ewmaDurationMs: displayEwma.newEwma,
        ewmaVariance: displayEwma.newVariance,
        ewmaSampleCount: displayEwma.newSampleCount,
      });
    }

    let anomaly: AnomalyOutcome | null = null;

    const latencyReadings = results
      .filter((r) => activeCheckers.has(r.checkerId) && r.isUp && r.durationMs !== null)
      .map((r) => ({ checkerId: r.checkerId, durationMs: r.durationMs }));

    if (latencyReadings.length > 0) {
      const baselines = await monitorCheckerEwma.getCheckerEwmaStates(tx, monitorId);
      const baselineByChecker = new Map(baselines.map((b) => [b.checkerId, b]));
      const classification = classifyAnomalies(latencyReadings, baselines, activeCheckers);

      for (const entry of classification.perChecker) {
        await monitorCheckerEwma.upsertCheckerEwma(tx, {
          monitorId,
          checkerId: entry.checkerId,
          ewmaDurationMs: entry.result.newEwma,
          ewmaVariance: entry.result.newVariance,
          ewmaSampleCount: entry.result.newSampleCount,
        });
      }

      if (classification.serviceWide.isAnomaly && classification.serviceWide.direction !== null) {
        const direction = classification.serviceWide.direction;
        const hit = classification.perChecker.find(
          (c) => c.result.isAnomaly && c.result.direction === direction,
        );
        if (hit && hit.result.zScore !== null) {
          const { baselineEwma, baselineStdDev } = preReadingBaseline(
            baselineByChecker.get(hit.checkerId),
          );
          await anomalyEvents.insertAnomalyEvent(tx, {
            monitorId,
            direction,
            zScore: hit.result.zScore,
            durationMs: hit.durationMs,
            baselineEwma,
            baselineStdDev,
            scope: 'service',
            checkerId: null,
          });
          anomaly = toAnomalyOutcome(hit, baselineByChecker.get(hit.checkerId));
        }
      }

      for (const regional of classification.regional) {
        const hit = classification.perChecker.find((c) => c.checkerId === regional.checkerId);
        if (!hit || hit.result.zScore === null) continue;
        const { baselineEwma, baselineStdDev } = preReadingBaseline(
          baselineByChecker.get(regional.checkerId),
        );
        await anomalyEvents.insertAnomalyEvent(tx, {
          monitorId,
          direction: regional.direction,
          zScore: hit.result.zScore,
          durationMs: hit.durationMs,
          baselineEwma,
          baselineStdDev,
          scope: 'regional',
          checkerId: regional.checkerId,
        });
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
