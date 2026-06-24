import { createHash, randomBytes } from 'node:crypto';
import { apiKeys } from '@argus/db';
import type { FastifyInstance } from 'fastify';
import { demoOwnerFromIp } from '../auth/demo-owner.js';
import { config } from '../config.js';
import { ConflictError } from '../errors.js';

export async function demoRoutes(app: FastifyInstance) {
  app.post(
    '/demo/token',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
      schema: {
        response: {
          201: {
            type: 'object',
            required: ['key', 'expiresAt'],
            properties: {
              key: { type: 'string' },
              expiresAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const owner = demoOwnerFromIp(req.ip);
      const existing = await apiKeys.findActiveDemoKeyForOwner(owner);
      if (existing) {
        throw new ConflictError('demo token already active for this client');
      }

      const activeCount = await apiKeys.countActiveDemoKeys();
      const maxActive = Number(process.env.DEMO_MAX_ACTIVE_TOKENS ?? config.demoMaxActiveTokens);
      if (activeCount >= maxActive) {
        throw new ConflictError('demo capacity reached');
      }

      const rawKey = `argus_demo_${randomBytes(16).toString('base64url')}`;
      const keyHash = createHash('sha256').update(rawKey).digest('hex');
      const keyPrefix = rawKey.slice(0, 14);
      const expiresAt = new Date(Date.now() + config.demoTokenTtlHours * 3_600_000);

      await apiKeys.createDemoKey({ keyHash, keyPrefix, owner, expiresAt });

      reply.setCookie(config.demoCookieName, rawKey, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: config.demoTokenTtlHours * 3_600,
      });

      reply.status(201);
      return { key: rawKey, expiresAt: expiresAt.toISOString() };
    },
  );
}
