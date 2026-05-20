import type { CheckerScheduler } from '../checker/scheduler.js';

declare module 'fastify' {
  interface FastifyInstance {
    checker: CheckerScheduler;
  }
  interface FastifyRequest {
    checker?: { id: string; keyId: string };
  }
}
