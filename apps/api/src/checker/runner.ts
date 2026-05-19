import { type Monitor, type NewCheckResult, results } from '@argus/db';
import { config } from '../config.js';
import { sendNtfy } from './alert.js';
import { checkUrl } from './http-client.js';

export async function runCheck(monitor: Monitor): Promise<void> {
  const res = await checkUrl(monitor.url);
  const newCR = { ...res, monitorId: monitor.id, checkerId: config.checkerId } as NewCheckResult;
  await results.insertCheckResult(newCR);
  await maybeAlert(monitor, newCR);
}

export async function maybeAlert(monitor: Monitor, current: NewCheckResult): Promise<void> {
  const last = await results.getLastTwoResults(monitor.id);
  if (last.length < 2) return;
  if (last[1]?.isUp === current.isUp) return;
  if (!current.isUp) {
    // DOWN:
    await sendNtfy(
      `DOWN: ${monitor.url}`,
      `${current.errorType ?? 'unknown error'} after ${current.durationMs}ms`,
      'high',
      ['rotating_light'],
    );
  }
  if (current.isUp) {
    // RECOVERED:
    await sendNtfy(`RECOVERED: ${monitor.url}`, `back up in ${current.durationMs}ms`, 'default', [
      'white_check_mark',
    ]);
  }
}
