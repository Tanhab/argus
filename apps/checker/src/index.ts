import { createLogger } from '@argus/logger';
import { postHeartbeat } from './api-client.js';
import { config } from './config.js';
import { createCheckerScheduler } from './scheduler.js';

const log = createLogger('checker');

async function main() {
  log.info({ checkerId: config.checkerId, apiUrl: config.apiUrl }, 'checker starting');

  const scheduler = createCheckerScheduler();
  await scheduler.resync();

  setInterval(
    () => scheduler.resync().catch((err) => log.error({ err }, 'resync failed')),
    config.syncIntervalMs,
  );

  setInterval(
    () => postHeartbeat().catch((err) => log.error({ err }, 'heartbeat failed')),
    config.heartbeatIntervalMs,
  );

  await postHeartbeat();

  process.on('SIGTERM', () => {
    scheduler.stop();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    scheduler.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  log.error({ err }, 'checker has failed to start');
  process.exit(1);
});
