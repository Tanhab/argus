import { buildApp } from './app.js';
import { config } from './config.js';

const app = buildApp();

const start = async () => {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error({ err }, 'failed to start server');
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
