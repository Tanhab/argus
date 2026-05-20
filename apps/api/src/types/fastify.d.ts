import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    checker?: { id: string; keyId: string };
  }
}
