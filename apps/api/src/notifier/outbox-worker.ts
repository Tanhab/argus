import type { AlertOutboxRow, AnomalyDirection } from '@argus/db';
import { alertOutbox, withTransaction } from '@argus/db';
import type { FastifyBaseLogger } from 'fastify';
import type { AlertReason } from '../state/types.js';
import type { AlertJob } from './alert-job.js';
import { deliverAlertJob } from './deliver.js';

export type AlertDeliverer = (job: AlertJob) => Promise<void>;

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_POLL_MS = 2_000;

function rowToAlertJob(row: AlertOutboxRow): AlertJob {
  const payload = row.payload;
  if (row.kind === 'anomaly') {
    return {
      kind: 'anomaly',
      monitorId: row.monitorId,
      monitorUrl: String(payload.monitorUrl),
      direction: payload.direction as AnomalyDirection,
      zScore: Number(payload.zScore),
      durationMs: Number(payload.durationMs),
      baselineEwma: Number(payload.baselineEwma),
      occurredAt: String(payload.occurredAt),
    };
  }

  return {
    kind: 'transition',
    monitorId: row.monitorId,
    monitorUrl: String(payload.monitorUrl),
    reason: payload.reason as AlertReason,
    occurredAt: String(payload.occurredAt),
    n: Number(payload.n),
  };
}

export async function processOutboxBatch(
  limit: number,
  deliver: AlertDeliverer = deliverAlertJob,
): Promise<number> {
  return withTransaction(async (tx) => {
    const rows = await alertOutbox.claimPendingOutbox(tx, limit);
    let delivered = 0;

    for (const row of rows) {
      try {
        await deliver(rowToAlertJob(row));
        await alertOutbox.markOutboxSent(tx, row.id);
        delivered++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await alertOutbox.markOutboxFailed(tx, row.id, message);
      }
    }

    return delivered;
  });
}

export function startOutboxPoller(
  log: FastifyBaseLogger,
  deliver: AlertDeliverer = deliverAlertJob,
  pollMs = DEFAULT_POLL_MS,
  batchSize = DEFAULT_BATCH_SIZE,
): () => void {
  const timer = setInterval(() => {
    processOutboxBatch(batchSize, deliver).catch((err) => {
      log.warn({ err }, 'alert outbox poll failed');
    });
  }, pollMs);

  return () => clearInterval(timer);
}
