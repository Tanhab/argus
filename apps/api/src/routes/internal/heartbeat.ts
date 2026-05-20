import { heartbeats } from '@argus/db';
import type { FastifyInstance } from 'fastify';
import { requireCheckerAuth } from './auth.js';

export async function heartbeatRoute(app: FastifyInstance) {
  app.post(
    '/checkers/:checkerId/heartbeat',
    { preHandler: requireCheckerAuth },
    async (req, reply) => {
      const checker = req.checker;
      if (!checker) throw new Error('checker not set by auth');
      await heartbeats.insert(checker.id);
      reply.status(204).send();
    },
  );
}
