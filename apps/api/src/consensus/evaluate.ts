import { type ConsensusVerdict, consensus, withTransaction } from '@argus/db';
import { createLogger } from '@argus/logger';
import { computeConsensus } from './compute.js';
import type { ConsensusResult } from './types.js';

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

    const { rows: prevRows } = await tx.query<{ last_alertable_consensus: string | null }>(
      'SELECT last_alertable_consensus FROM monitors WHERE id = $1',
      [monitorId],
    );
    const previousVerdict = (prevRows[0]?.last_alertable_consensus ??
      null) as ConsensusVerdict | null;

    const results = await consensus.getResultsInWindow(tx, monitorId);
    const activeCheckers = await consensus.getActiveCheckers(tx);
    const outcome = computeConsensus(results, activeCheckers);

    await consensus.updateLastConsensus(tx, monitorId, outcome.verdict);
    if (outcome.verdict === 'up' || outcome.verdict === 'down') {
      await consensus.updateLastAlertableConsensus(tx, monitorId, outcome.verdict);
    }

    log.info(
      {
        monitorId,
        verdict: outcome.verdict,
        previousVerdict,
        n: outcome.n,
        confidence: outcome.confidence,
      },
      'consensus evaluated',
    );
    return { outcome, previousVerdict };
  });
}
