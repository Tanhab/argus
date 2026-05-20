import { ping } from '@argus/db';
import { createLogger } from '@argus/logger';
import Fastify, { type FastifyError } from 'fastify';
import { ArgusError } from './errors.js';
import { internalRoutes } from './routes/internal/index.js';
import { monitorsRoutes } from './routes/monitors.js';

export async function buildApp() {
  const app = Fastify({
    loggerInstance: createLogger('api'),
    genReqId: () => crypto.randomUUID(),
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode ?? 500;
    const isKnown = err instanceof ArgusError;

    if (status >= 500) {
      req.log.error({ err }, 'server error');
    } else {
      req.log.warn({ err }, 'client error');
    }

    reply.status(status).send({
      type: `https://argus.local/errors/${err.code ?? 'internal'}`,
      title: err.name ?? 'InternalServerError',
      status,
      detail: status >= 500 && !isKnown ? 'Internal Server Error' : err.message,
      requestId: req.id,
    });
  });

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get('/ready', async (req, reply) => {
    const ok = await ping();
    if (!ok) {
      req.log.warn('database ping failed');
      reply.status(503);
      return { status: 'not_ready', db: false };
    }
    return { status: 'ready', db: true };
  });

  await app.register(monitorsRoutes, { prefix: '/v1' });
  await app.register(internalRoutes, { prefix: '/internal' });
  return app;
}
