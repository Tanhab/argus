import { monitors, results } from '@argus/db';
import type { FastifyInstance } from 'fastify';
import { attachMonitorUser, requireMonitorUser } from '../auth/resolve-user.js';
import { config } from '../config.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { assertPublicHttpUrl } from '../security/url-guard.js';

const monitorResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    url: { type: 'string' },
    intervalSeconds: { type: 'integer' },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    deactivatedAt: { type: 'string', format: 'date-time', nullable: true },
    lastConsensus: { type: 'string', nullable: true },
    lastConsensusAt: { type: 'string', format: 'date-time', nullable: true },
  },
} as const;

export async function monitorsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', attachMonitorUser);

  app.post(
    '/monitors',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
      schema: {
        body: {
          type: 'object',
          required: ['url'],
          additionalProperties: false,
          properties: {
            url: { type: 'string', format: 'uri', maxLength: 2048 },
            intervalSeconds: { type: 'integer', minimum: 30, maximum: 3600, default: 60 },
          },
        },
        response: { 201: monitorResponseSchema },
      },
    },
    async (req, reply) => {
      const { userId, isDemo } = requireMonitorUser(req);
      const body = req.body as { url: string; intervalSeconds?: number };

      if (isDemo) {
        const quota = Number(process.env.DEMO_MONITOR_QUOTA ?? config.demoMonitorQuota);
        const count = await monitors.countActiveMonitors(userId);
        if (count >= quota) {
          throw new ConflictError('demo accounts are limited to 3 monitors');
        }
      }

      const url = assertPublicHttpUrl(body.url);
      const storedUrl = url.pathname === '/' && !url.search && !url.hash ? url.origin : url.href;

      const monitor = await monitors.createMonitor({
        userId,
        url: storedUrl,
        intervalSeconds: body.intervalSeconds ?? 60,
      });
      reply.status(201);
      return monitor;
    },
  );

  app.get(
    '/monitors',
    { schema: { response: { 200: { type: 'array', items: monitorResponseSchema } } } },
    async (req) => {
      const { userId } = requireMonitorUser(req);
      return monitors.listMonitors(userId);
    },
  );

  app.get(
    '/monitors/:id',
    { schema: { response: { 200: monitorResponseSchema } } },
    async (req) => {
      const { userId } = requireMonitorUser(req);
      const { id } = req.params as { id: string };
      const monitor = await monitors.getMonitor(id, userId);
      if (!monitor) throw new NotFoundError(`monitor ${id} not found`);
      return monitor;
    },
  );

  app.get(
    '/monitors/:id/results',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
    },
    async (req) => {
      const { userId } = requireMonitorUser(req);
      const { id } = req.params as { id: string };
      const { limit } = req.query as { limit: number };
      const monitor = await monitors.getMonitor(id, userId);
      if (!monitor) throw new NotFoundError(`monitor ${id} not found`);

      return results.getRecentResults(id, limit);
    },
  );

  app.delete('/monitors/:id', async (req, reply) => {
    const { userId } = requireMonitorUser(req);
    const { id } = req.params as { id: string };
    const isDeleted = await monitors.deactivateMonitor(id, userId);
    if (!isDeleted) throw new NotFoundError(`monitor ${id} not found`);
    reply.status(204).send();
  });
}
