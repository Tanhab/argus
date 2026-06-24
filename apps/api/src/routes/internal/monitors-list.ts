import { monitors } from '@argus/db';
import type { FastifyInstance } from 'fastify';
import { checkerIdParams } from '../../openapi/common-schemas.js';
import { requireCheckerAuth } from './auth.js';

export async function monitorsListRoute(app: FastifyInstance) {
  app.get(
    '/checkers/:checkerId/monitors',
    {
      preHandler: requireCheckerAuth,
      schema: {
        tags: ['internal'],
        summary: 'List active monitors for a checker',
        description: 'Checker API key required. Not for public use.',
        params: checkerIdParams,
        response: {
          200: {
            type: 'object',
            properties: {
              monitors: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    url: { type: 'string' },
                    intervalSeconds: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async () => {
      const ms = await monitors.getActiveMonitors();
      return {
        monitors: ms.map((m) => ({
          id: m.id,
          url: m.url,
          intervalSeconds: m.intervalSeconds,
        })),
      };
    },
  );
}
