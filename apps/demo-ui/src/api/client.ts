import type {
  AnomalyEvent,
  BucketedLatencyPoint,
  CheckResult,
  DeliveredAlert,
  LatencyWindow,
  PublicMonitor,
  StatusEvent,
} from './types';

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

export function getPublicResults(monitorId: string, limit = 30): Promise<CheckResult[]> {
  return apiGet(`/v1/public/monitors/${monitorId}/results?limit=${limit}`);
}

export function getPublicTransitions(monitorId: string, limit = 20): Promise<StatusEvent[]> {
  return apiGet(`/v1/public/monitors/${monitorId}/transitions?limit=${limit}`);
}

export function getPublicAnomalies(monitorId: string, limit = 20): Promise<AnomalyEvent[]> {
  return apiGet(`/v1/public/monitors/${monitorId}/anomalies?limit=${limit}`);
}

export function getPublicAlerts(monitorId: string, limit = 20): Promise<DeliveredAlert[]> {
  return apiGet(`/v1/public/monitors/${monitorId}/alerts?limit=${limit}`);
}
