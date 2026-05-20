import type { FastifyInstance } from 'fastify';
import { heartbeatRoute } from './heartbeat.js';
import { monitorsListRoute } from './monitors-list.js';
import { resultsRoute } from './results.js';

export async function internalRoutes(app: FastifyInstance) {
  await app.register(monitorsListRoute);
  await app.register(heartbeatRoute);
  await app.register(resultsRoute);
}
