import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyPluginAsync } from 'fastify';

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** apps/api/{src|dist} → apps/demo-ui/dist */
function resolveDemoUiDist(): string {
  return join(moduleDir, '..', '..', 'demo-ui', 'dist');
}

export const demoStaticPlugin: FastifyPluginAsync = async (app) => {
  const root = resolveDemoUiDist();
  if (!existsSync(root)) {
    app.log.info({ root }, 'demo-ui dist not found — skipping /demo static serving');
    return;
  }

  app.get('/demo', (_req, reply) => reply.redirect('/demo/'));

  await app.register(fastifyStatic, {
    root,
    prefix: '/demo/',
    decorateReply: false,
  });

  app.log.info({ root }, 'serving demo-ui at /demo/');
};
