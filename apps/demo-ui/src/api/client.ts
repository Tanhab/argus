import type { BucketedLatencyPoint, LatencyWindow, PublicMonitor } from './types';

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export function getPublicMonitors(): Promise<PublicMonitor[]> {
  return apiGet('/v1/public/monitors');
}

export function getPublicLatency(
  monitorId: string,
  window: LatencyWindow,
): Promise<BucketedLatencyPoint[]> {
  return apiGet(`/v1/public/monitors/${monitorId}/latency?window=${window}`);
}
