import { monitors, results } from '@argus/db';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { NotFoundError } from '../errors.js';

export async function monitorsRoutes(app: FastifyInstance) {
  app.post(
    '/monitors',
    {
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
      },
    },
    async (req, reply) => {
      const body = req.body as { url: string; intervalSeconds?: number };
      const monitor = await monitors.createMonitor({
        userId: config.monitorUserId,
        url: body.url,
        intervalSeconds: body.intervalSeconds ?? 60,
      });
      reply.status(201);
      return monitor;
    },
  );

  app.get('/monitors', async () => {
    const allMonitors = await monitors.listMonitors(config.monitorUserId);
    return allMonitors;
  });
  app.get('/monitors/:id', async (req) => {
    const { id } = req.params as { id: string };
    const monitor = await monitors.getMonitor(id, config.monitorUserId);
    if (!monitor) throw new NotFoundError(`monitor ${id} not found`);
    return monitor;
  });

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
      const { id } = req.params as { id: string };
      const { limit } = req.query as { limit: number };
      const monitor = await monitors.getMonitor(id, config.monitorUserId);
      if (!monitor) throw new NotFoundError(`monitor ${id} not found`);

      const res = await results.getRecentResults(id, limit);
      return res;
    },
  );

  app.delete('/monitors/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const isDeleted = await monitors.deactivateMonitor(id, config.monitorUserId);
    if (!isDeleted) throw new NotFoundError(`monitor ${id} not found`);
    reply.status(204).send();
  });
}
