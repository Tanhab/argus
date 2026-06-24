import { ping } from '@argus/db';
import { createLogger } from '@argus/logger';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyError } from 'fastify';
import type { PgBoss } from 'pg-boss';
import { config } from './config.js';
import { ArgusError } from './errors.js';
import { registerMaintenanceJobs } from './maintenance/register-jobs.js';
import { startBoss, stopBoss } from './notifier/boss.js';
import { startOutboxPoller } from './notifier/outbox-worker.js';
import { registerAlertWorker } from './notifier/worker.js';
import { isRateLimitProblem, rateLimitPlugin } from './rate-limit.js';
import { demoRoutes } from './routes/demo.js';
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

  await app.register(cookie);
  await app.register(rateLimitPlugin);

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Argus API',
        description: 'Distributed service monitor API',
        version: '1.0.0',
      },
      tags: [
        { name: 'health', description: 'Liveness and readiness probes' },
        { name: 'monitors', description: 'Monitor CRUD and check results' },
        { name: 'sla', description: 'Uptime and SLA reporting' },
        { name: 'maintenance', description: 'Maintenance window scheduling' },
        { name: 'demo', description: 'Self-service demo token (cookie auth)' },
        { name: 'internal', description: 'Checker-only endpoints — not for public use' },
      ],
    },
  });

  app.get('/health', {
    schema: {
      tags: ['health'],
      summary: 'Liveness probe',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    handler: async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  });

  app.get('/ready', {
    schema: {
      tags: ['health'],
      summary: 'Readiness probe',
      description: 'Returns 503 when the database is unreachable.',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            db: { type: 'boolean' },
          },
        },
        503: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            db: { type: 'boolean' },
          },
        },
      },
    },
    handler: async (req, reply) => {
      const ok = await ping();
      if (!ok) {
        req.log.warn('database ping failed');
        reply.status(503);
        return { status: 'not_ready', db: false };
      }
      return { status: 'ready', db: true };
    },
  });

  await app.register(demoRoutes, { prefix: '/v1' });
  await app.register(monitorsRoutes, { prefix: '/v1' });
  await app.register(maintenanceRoutes, { prefix: '/v1' });
  await app.register(internalRoutes, { prefix: '/internal' });
  await app.register(slaRoutes, { prefix: '/v1' });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      withCredentials: true,
    },
  });

  return app;
}
