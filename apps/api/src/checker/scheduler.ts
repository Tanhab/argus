import type { Monitor } from '@argus/db';
import { monitors } from '@argus/db';
import { createLogger } from '@argus/logger';
import { runCheck } from './runner.js';

const log = createLogger('checker');

export interface CheckerScheduler {
  start(): Promise<void>;
  stop(): Promise<void>;
  scheduleMonitor(m: Monitor): void;
  unscheduleMonitor(id: string): void;
}

export function createCheckerScheduler(): CheckerScheduler {
  const timers = new Map<string, NodeJS.Timeout>();
  let resyncTimer: NodeJS.Timeout | undefined;

  function scheduleMonitor(m: Monitor): void {
    unscheduleMonitor(m.id);
    if (!m.isActive) return;
    const tick = () => {
      runCheck(m).catch((err) => log.error({ err, monitorId: m.id }, 'check failed'));
    };
    void tick(); // fire immediately
    const timer = setInterval(tick, m.intervalSeconds * 1000);
    timers.set(m.id, timer);
  }

  function unscheduleMonitor(id: string): void {
    const timer = timers.get(id);
    if (timer) clearInterval(timer);
    timers.delete(id);
  }
  async function stop(): Promise<void> {
    for (const timer of timers.values()) clearInterval(timer);
    timers.clear();
    if (resyncTimer) clearInterval(resyncTimer);
  }

  async function start(): Promise<void> {
    const allMonitors = await monitors.getActiveMonitors();
    allMonitors.forEach(scheduleMonitor);
    resyncTimer = setInterval(() => {
      void start();
    }, 60_000);
    log.info({ count: allMonitors.length }, 'scheduler started');
  }

  return { start, stop, scheduleMonitor, unscheduleMonitor };
}
