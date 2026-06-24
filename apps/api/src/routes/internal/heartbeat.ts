import { heartbeats } from '@argus/db';
import type { FastifyInstance } from 'fastify';
import { checkerIdParams } from '../../openapi/common-schemas.js';
import { requireCheckerAuth } from './auth.js';

export async function heartbeatRoute(app: FastifyInstance) {
  app.post(
    '/checkers/:checkerId/heartbeat',
    {
      preHandler: requireCheckerAuth,
      schema: {
        tags: ['internal'],
        summary: 'Checker heartbeat',
        description: 'Checker API key required. Not for public use.',
        params: checkerIdParams,
        response: { 204: { type: 'null', description: 'Heartbeat recorded' } },
      },
    },
    async (req, reply) => {
      const checker = req.checker;
      if (!checker) throw new Error('checker not set by auth');
      await heartbeats.insert(checker.id);
      reply.status(204).send();
    },
  );
}
