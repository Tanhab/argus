import { monitors, results } from '@argus/db';
import type { FastifyInstance } from 'fastify';
import { attachMonitorUser, requireMonitorUser } from '../auth/resolve-user.js';
import { config } from '../config.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { monitorIdParams } from '../openapi/common-schemas.js';
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

const checkResultSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    monitorId: { type: 'string' },
    checkerId: { type: 'string' },
    statusCode: { type: 'integer', nullable: true },
    durationMs: { type: 'integer', nullable: true },
    isUp: { type: 'boolean' },
    errorType: { type: 'string', nullable: true },
    checkedAt: { type: 'string', format: 'date-time' },
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
        tags: ['monitors'],
        summary: 'Create a monitor',
        description:
          'Requires demo cookie or API key. URL is SSRF-guarded (http/https public hosts only). Demo accounts capped at 3 active monitors.',
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
    {
      schema: {
        tags: ['monitors'],
        summary: 'List monitors',
        description: 'Returns monitors owned by the authenticated user (demo cookie or API key).',
        response: { 200: { type: 'array', items: monitorResponseSchema } },
      },
    },
    async (req) => {
      const { userId } = requireMonitorUser(req);
      return monitors.listMonitors(userId);
    },
  );

  app.get(
    '/monitors/:id',
    {
      schema: {
        tags: ['monitors'],
        summary: 'Get a monitor',
        params: monitorIdParams,
        response: { 200: monitorResponseSchema },
      },
    },
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
        tags: ['monitors'],
        summary: 'Recent check results',
        description: 'Per-checker results for a monitor, newest first.',
        params: monitorIdParams,
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
        response: { 200: { type: 'array', items: checkResultSchema } },
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

  app.delete(
    '/monitors/:id',
    {
      schema: {
        tags: ['monitors'],
        summary: 'Deactivate a monitor',
        params: monitorIdParams,
        response: { 204: { type: 'null', description: 'Monitor deactivated' } },
      },
    },
    async (req, reply) => {
      const { userId } = requireMonitorUser(req);
      const { id } = req.params as { id: string };
      const isDeleted = await monitors.deactivateMonitor(id, userId);
      if (!isDeleted) throw new NotFoundError(`monitor ${id} not found`);
      reply.status(204).send();
    },
  );
}
