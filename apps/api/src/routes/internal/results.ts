import { type ErrorType, monitors, results } from '@argus/db';
import type { FastifyInstance } from 'fastify';
import { evaluateConsensus } from '../../consensus/evaluate.js';
import { NotFoundError } from '../../errors.js';
import { enqueueAlert, enqueueAnomalyAlert } from '../../notifier/enqueue.js';
import { requireCheckerAuth } from './auth.js';

const bodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['monitorId', 'isUp'],
  properties: {
    monitorId: { type: 'string' },
    statusCode: { type: 'integer', nullable: true },
    durationMs: { type: 'integer', nullable: true, minimum: 0 },
    isUp: { type: 'boolean' },
    errorType: {
      type: ['string', 'null'],
      enum: [
        'timeout',
        'dns_failure',
        'connection_refused',
        'tls_error',
        'http_error',
        'network_error',
        null,
      ],
    },
  },
} as const;

interface ResultBody {
  monitorId: string;
  statusCode?: number | null;
  durationMs?: number | null;
  isUp: boolean;
  errorType?: string | null;
}

export async function resultsRoute(app: FastifyInstance) {
  app.post(
    '/results',
    { schema: { body: bodySchema }, preHandler: requireCheckerAuth },
    async (req, reply) => {
      const b = req.body as ResultBody;
      const checker = req.checker;
      if (!checker) throw new Error('checker not set by auth');

      const monitor = await monitors.getActiveMonitor(b.monitorId);
      if (!monitor) throw new NotFoundError(`monitor ${b.monitorId} not found`);

      await results.insertCheckResult({
        monitorId: b.monitorId,
        checkerId: checker.id,
        statusCode: b.statusCode ?? null,
        durationMs: b.durationMs ?? null,
        isUp: b.isUp,
        errorType: (b.errorType ?? null) as ErrorType | null,
      });

      const consensusResult = await evaluateConsensus(b.monitorId);
      // Alert on state-machine transitions and latency anomalies. evaluateConsensus has
      // already committed by here, so we enqueue outside its transaction: a crash between
      // COMMIT and send loses the alert, but status_events / anomaly_events is the source
      // of truth (a known, documented best-effort tradeoff). The pg-boss queue handles
      // retries on delivery.
      if (consensusResult?.transition.alertReason) {
        await enqueueAlert(req.server.boss, {
          monitorId: monitor.id,
          monitorUrl: monitor.url,
          reason: consensusResult.transition.alertReason,
          occurredAt: new Date().toISOString(),
          n: consensusResult.outcome.n,
        });
      }
      if (consensusResult?.anomaly) {
        await enqueueAnomalyAlert(req.server.boss, {
          monitorId: monitor.id,
          monitorUrl: monitor.url,
          direction: consensusResult.anomaly.direction,
          zScore: consensusResult.anomaly.zScore,
          durationMs: consensusResult.anomaly.durationMs,
          baselineEwma: consensusResult.anomaly.baselineEwma,
          occurredAt: new Date().toISOString(),
        });
      }

      reply.status(202);
    },
  );
}
