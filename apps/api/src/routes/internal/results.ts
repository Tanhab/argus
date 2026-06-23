import { type ErrorType, monitors, results } from '@argus/db';
import type { FastifyInstance } from 'fastify';
import { evaluateConsensus } from '../../consensus/evaluate.js';
import { NotFoundError } from '../../errors.js';
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

      await evaluateConsensus(b.monitorId);

      reply.status(202);
    },
  );
}
