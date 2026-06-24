import 'fastify';
import type { MonitorUser } from '../auth/resolve-user.js';

declare module 'fastify' {
  interface FastifyRequest {
    checker?: { id: string; keyId: string };
    monitorUser?: MonitorUser;
  }
}
