import { consensus, withTransaction } from '@argus/db';
import { createLogger } from '@argus/logger';
import { computeConsensus } from './compute.js';
import type { ConsensusOutcome } from './types.js';

const log = createLogger('api');

export async function evaluateConsensus(monitorId: string): Promise<ConsensusOutcome | null> {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired',
      [monitorId],
    );
    if (!rows[0]?.acquired) {
      log.debug({ monitorId }, 'consensus skipped: lock held');
      return null;
    }

    const results = await consensus.getResultsInWindow(tx, monitorId);
    const activeCheckers = await consensus.getActiveCheckers(tx);
    const outcome = computeConsensus(results, activeCheckers);

    await consensus.updateLastConsensus(tx, monitorId, outcome.verdict);

    log.info(
      {
        monitorId,
        verdict: outcome.verdict,
        n: outcome.n,
        confidence: outcome.confidence,
      },
      'consensus evaluated',
    );
    return outcome;
  });
}
