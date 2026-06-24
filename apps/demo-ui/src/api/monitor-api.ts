import { apiJson } from './demo-client';
import type {
  AnomalyEvent,
  BucketedLatencyPoint,
  CheckResult,
  DeliveredAlert,
  LatencyWindow,
  SlaResponse,
  StatusEvent,
} from './types';

export type MonitorDataScope = 'public' | 'owned';

function monitorBase(scope: MonitorDataScope, monitorId: string): string {
  return scope === 'public' ? `/v1/public/monitors/${monitorId}` : `/v1/monitors/${monitorId}`;
}

async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function scopedGet<T>(scope: MonitorDataScope, path: string): Promise<T> {
  if (scope === 'owned') return apiJson(path);
  return publicGet(path);
}

export function getMonitorLatency(
  scope: MonitorDataScope,
  monitorId: string,
  window: LatencyWindow,
): Promise<BucketedLatencyPoint[]> {
  return scopedGet(scope, `${monitorBase(scope, monitorId)}/latency?window=${window}`);
}

export function getMonitorResults(
  scope: MonitorDataScope,
  monitorId: string,
  limit = 30,
): Promise<CheckResult[]> {
  return scopedGet(scope, `${monitorBase(scope, monitorId)}/results?limit=${limit}`);
}

export function getMonitorTransitions(
  scope: MonitorDataScope,
  monitorId: string,
  limit = 20,
): Promise<StatusEvent[]> {
  return scopedGet(scope, `${monitorBase(scope, monitorId)}/transitions?limit=${limit}`);
}

export function getMonitorAnomalies(
  scope: MonitorDataScope,
  monitorId: string,
  limit = 20,
): Promise<AnomalyEvent[]> {
  return scopedGet(scope, `${monitorBase(scope, monitorId)}/anomalies?limit=${limit}`);
}

export function getMonitorAlerts(
  scope: MonitorDataScope,
  monitorId: string,
  limit = 20,
): Promise<DeliveredAlert[]> {
  return scopedGet(scope, `${monitorBase(scope, monitorId)}/alerts?limit=${limit}`);
}

export function getMonitorSla(
  scope: MonitorDataScope,
  monitorId: string,
  from: string,
  to: string,
): Promise<SlaResponse> {
  const qs = new URLSearchParams({ from, to });
  const path =
    scope === 'public'
      ? `/v1/public/monitors/${monitorId}/sla?${qs}`
      : `/v1/monitors/${monitorId}/sla?${qs}`;
  return scopedGet(scope, path);
}
