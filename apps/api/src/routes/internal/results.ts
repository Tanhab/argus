import { type ErrorType, monitors, results } from '@argus/db';
import type { FastifyInstance } from 'fastify';
import { sendNtfy } from '../../checker/alert.js';
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
      type: 'string',
      nullable: true,
      enum: [
        'timeout',
        'dns_failure',
        'connection_refused',
        'tls_error',
        'http_error',
        'network_error',
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

      await maybeAlert(
        b.monitorId,
        monitor.url,
        checker.id,
        b.isUp,
        b.durationMs ?? null,
        b.errorType ?? null,
      );

      reply.status(202);
    },
  );
}

async function maybeAlert(
  monitorId: string,
  url: string,
  checkerId: string,
  isUp: boolean,
  durationMs: number | null,
  errorType: string | null,
): Promise<void> {
  const last = await results.getLastTwoResultsForChecker(monitorId, checkerId);
  if (last.length < 2) return;
  if (last[1]?.isUp === isUp) return;

  if (!isUp) {
    await sendNtfy(
      `DOWN [${checkerId}]: ${url}`,
      `${errorType ?? 'unknown error'} after ${durationMs}ms`,
      'high',
      ['rotating_light'],
    );
  } else {
    await sendNtfy(`RECOVERED [${checkerId}]: ${url}`, `back up in ${durationMs}ms`, 'default', [
      'white_check_mark',
    ]);
  }
}
