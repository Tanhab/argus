import { monitors } from '@argus/db';
import type { FastifyInstance } from 'fastify';
import { requireCheckerAuth } from './auth.js';

export async function monitorsListRoute(app: FastifyInstance) {
  app.get('/checkers/:checkerId/monitors', { preHandler: requireCheckerAuth }, async () => {
    const ms = await monitors.getActiveMonitors();
    return {
      monitors: ms.map((m) => ({
        id: m.id,
        url: m.url,
        intervalSeconds: m.intervalSeconds,
      })),
    };
  });
}
