import { createLogger } from '@argus/logger';
import { config } from './config.js';

export interface CheckerMonitor {
  id: string;
  url: string;
  intervalSeconds: number;
}

export interface CheckResultPayload {
  monitorId: string;
  isUp: boolean;
  statusCode: number | null;
  durationMs: number | null;
  errorType: string | null;
}

const log = createLogger('checker');

export async function fetchMonitors(): Promise<CheckerMonitor[]> {
  const res = await fetch(`${config.apiUrl}/internal/checkers/${config.checkerId}/monitors`, {
    headers: { 'X-API-Key': config.apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`fetchMonitors failed: ${res.status}`);
  const body = (await res.json()) as { monitors: CheckerMonitor[] };
  return body.monitors;
}

export async function postResult(r: CheckResultPayload): Promise<void> {
  const res = await fetch(`${config.apiUrl}/internal/results`, {
    method: 'POST',
    headers: { 'X-API-Key': config.apiKey, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify(r),
  });
  if (!res.ok && res.status !== 404) {
    log.warn({ status: res.status, monitorId: r.monitorId }, 'postResult non-2xx');
  }
}

export async function postHeartbeat(): Promise<void> {
  const res = await fetch(`${config.apiUrl}/internal/checkers/${config.checkerId}/heartbeat`, {
    method: 'POST',
    headers: { 'X-API-Key': config.apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    log.warn({ status: res.status }, 'heartbeat non-2xx');
  }
}
