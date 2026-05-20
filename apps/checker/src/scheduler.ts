import { createLogger } from '@argus/logger';
import { type CheckerMonitor, fetchMonitors, postResult } from './api-client.js';
import { checkUrl } from './http-check.js';

const log = createLogger('checker');

export interface CheckerScheduler {
  resync(): Promise<void>;
  stop(): void;
}

export function createCheckerScheduler(): CheckerScheduler {
  const timers = new Map<string, NodeJS.Timeout>();

  async function runCheck(m: CheckerMonitor): Promise<void> {
    const result = await checkUrl(m.url);
    await postResult({
      monitorId: m.id,
      isUp: result.isUp,
      statusCode: result.statusCode,
      durationMs: result.durationMs,
      errorType: result.errorType,
    });
  }

  function scheduleMonitor(m: CheckerMonitor): void {
    if (timers.has(m.id)) return;
    const tick = () => {
      runCheck(m).catch((err) => log.error({ err, monitorId: m.id }, 'check failed'));
    };
    void tick();
    timers.set(m.id, setInterval(tick, m.intervalSeconds * 1000));
  }

  function unscheduleMonitor(id: string): void {
    const timer = timers.get(id);
    if (timer) clearInterval(timer);
    timers.delete(id);
  }

  async function resync(): Promise<void> {
    const monitors = await fetchMonitors();
    const incoming = new Set(monitors.map((m) => m.id));

    for (const id of timers.keys()) {
      if (!incoming.has(id)) unscheduleMonitor(id);
    }

    for (const m of monitors) {
      scheduleMonitor(m);
    }

    log.info({ count: timers.size }, 'scheduler resynced');
  }

  function stop(): void {
    for (const timer of timers.values()) clearInterval(timer);
    timers.clear();
  }

  return { resync, stop };
}
