import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

interface RateLimitProblem {
  status: number;
  type: string;
  title: string;
  detail: string;
  requestId: string;
}

export function isRateLimitProblem(err: unknown): err is RateLimitProblem {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as RateLimitProblem).status === 429 &&
    'type' in err &&
    'title' in err &&
    'detail' in err
  );
}

const plugin: FastifyPluginAsync = async (app) => {
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    allowList: (req) =>
      req.url.startsWith('/health') ||
      req.url.startsWith('/ready') ||
      req.url.startsWith('/internal'),
    errorResponseBuilder: (req, context) => ({
      type: 'https://argus.local/errors/rate_limit',
      title: 'Too Many Requests',
      status: 429,
      detail: `Rate limit exceeded, retry in ${context.after}`,
      requestId: req.id,
    }),
  });
};

export const rateLimitPlugin = fp(plugin, { name: '@argus/rate-limit' });
