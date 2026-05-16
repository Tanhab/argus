import { createLogger } from '@argus/logger';

const log = createLogger('checker');

log.info({ checkerId: process.env.CHECKER_ID ?? 'local' }, 'checker stub started');

// Keep the process alive. Phase 2 replaces this with the real checker loop.
setInterval(() => {
  log.debug('checker stub heartbeat');
}, 30_000);

// Graceful shutdown so docker stop doesn't take 10s
const shutdown = (signal: string) => {
  log.info({ signal }, 'checker shutting down');
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
