import type { ConsensusVerdict, Monitor } from '@argus/db';
import type { FastifyBaseLogger } from 'fastify';
import { sendNtfy } from '../alert.js';
import type { ConsensusOutcome } from './types.js';

export async function maybeAlertOnConsensus(
  monitor: Monitor,
  outcome: ConsensusOutcome,
  previousVerdict: ConsensusVerdict | null,
  log: FastifyBaseLogger,
): Promise<void> {
  // 1. Only up/down are alertable verdicts. degraded and insufficient_data are "hold."
  if (outcome.verdict !== 'up' && outcome.verdict !== 'down') return;

  // 2. No transition? Nothing to alert.
  if (outcome.verdict === previousVerdict) return;

  // 3. First-evaluation rule: previous must be up or down. previousVerdict is sourced from
  //    monitors.last_alertable_consensus, which is only written for up/down verdicts — so a
  //    transient degraded/insufficient_data does NOT overwrite the prior alertable state.
  //    null here means "no alertable verdict has ever been recorded for this monitor" — a
  //    brand-new monitor, which we deliberately don't alert on.
  if (previousVerdict !== 'up' && previousVerdict !== 'down') return;

  // 4. Real transition. Fire one alert.
  if (outcome.verdict === 'down') {
    await sendNtfy(`DOWN: ${monitor.url}`, `consensus down (${outcome.n} checkers)`, 'high', [
      'rotating_light',
    ]);
  } else {
    await sendNtfy(`RECOVERED: ${monitor.url}`, `consensus up (${outcome.n} checkers)`, 'default', [
      'white_check_mark',
    ]);
  }

  log.info(
    { monitorId: monitor.id, from: previousVerdict, to: outcome.verdict },
    'consensus alert sent',
  );
}
