import { ping } from '@argus/db';
import { createLogger } from '@argus/logger';
import Fastify, { type FastifyError } from 'fastify';
import type { PgBoss } from 'pg-boss';
import { config } from './config.js';
import { ArgusError } from './errors.js';
import { registerMaintenanceJobs } from './maintenance/register-jobs.js';
import { startBoss, stopBoss } from './notifier/boss.js';
import { startOutboxPoller } from './notifier/outbox-worker.js';
import { registerAlertWorker } from './notifier/worker.js';
import { isRateLimitProblem, rateLimitPlugin } from './rate-limit.js';
import { internalRoutes } from './routes/internal/index.js';
import { maintenanceRoutes } from './routes/maintenance.js';
import { monitorsRoutes } from './routes/monitors.js';
import { slaRoutes } from './routes/sla.js';

declare module 'fastify' {
  interface FastifyInstance {
    boss: PgBoss;
  }
}

export async function buildApp() {
  const app = Fastify({
    loggerInstance: createLogger('api'),
    genReqId: () => crypto.randomUUID(),
  });

  // The pg-boss instance lives and dies with the app. buildApp starts it and registers the
  // alert worker; onClose stops it so connections release cleanly (see notifier/boss.ts).
  // Read DATABASE_URL live (not via the import-time config snapshot) so integration tests
  // that swap the env to a testcontainer URI before buildApp connect to the right DB.
  const boss = await startBoss(process.env.DATABASE_URL ?? config.databaseUrl);
  app.decorate('boss', boss);
  await registerAlertWorker(boss, app.log);
  await registerMaintenanceJobs(boss, app.log);
  const stopOutboxPoller = startOutboxPoller(app.log);
  app.addHook('onClose', async () => {
    stopOutboxPoller();
    await stopBoss(boss);
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (isRateLimitProblem(err)) {
      return reply.status(err.status).send(err);
    }

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

  await app.register(rateLimitPlugin);

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
  await app.register(maintenanceRoutes, { prefix: '/v1' });
  await app.register(internalRoutes, { prefix: '/internal' });
  await app.register(slaRoutes, { prefix: '/v1' });
  return app;
}
