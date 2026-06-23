import { maintenanceJobs } from '@argus/db';
import type { FastifyBaseLogger } from 'fastify';
import type { PgBoss } from 'pg-boss';

export const PARTITION_ROLLOVER_QUEUE = 'maintenance-partition-rollover';
export const DEMO_CLEANUP_QUEUE = 'maintenance-demo-cleanup';

export async function registerMaintenanceJobs(boss: PgBoss, log: FastifyBaseLogger): Promise<void> {
  await boss.createQueue(PARTITION_ROLLOVER_QUEUE);
  await boss.createQueue(DEMO_CLEANUP_QUEUE);

  await boss.schedule(PARTITION_ROLLOVER_QUEUE, '0 3 * * *', {});
  await boss.schedule(DEMO_CLEANUP_QUEUE, '0 * * * *', {});

  await boss.work(PARTITION_ROLLOVER_QUEUE, async (jobs) => {
    if (jobs.length === 0) return;
    await maintenanceJobs.rolloverPartitions();
    log.info('partition rollover complete');
  });

  await boss.work(DEMO_CLEANUP_QUEUE, async (jobs) => {
    if (jobs.length === 0) return;
    await maintenanceJobs.cleanupExpiredDemo();
    log.info('demo cleanup complete');
  });
}
