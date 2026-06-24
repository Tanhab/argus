export type MonitorStatus = 'pending' | 'up' | 'degraded' | 'down' | 'recovering';

export type ConsensusVerdict = 'up' | 'down' | 'degraded' | 'insufficient_data';

export interface PublicMonitor {
  id: string;
  url: string;
  intervalSeconds: number;
  isActive: boolean;
  createdAt: string;
  deactivatedAt: string | null;
  lastConsensus: ConsensusVerdict | null;
  lastConsensusAt: string | null;
  status: MonitorStatus;
  statusChangedAt: string | null;
}

export type LatencyWindow = '1h' | '24h';

export interface BucketedLatencyPoint {
  bucket: string;
  checkerId: string;
  avgMs: number | null;
  p95Ms: number | null;
  downCount: number;
  total: number;
}

export interface CheckResult {
  id: number;
  monitorId: string;
  checkerId: string;
  statusCode: number | null;
  durationMs: number | null;
  isUp: boolean;
  errorType: string | null;
  checkedAt: string;
}

export interface StatusEvent {
  id: number;
  monitorId: string;
  fromStatus: string;
  toStatus: string;
  occurredAt: string;
}

export interface AnomalyEvent {
  id: number;
  monitorId: string;
  direction: string;
  zScore: number;
  durationMs: number;
  baselineEwma: number;
  baselineStdDev: number;
  checkerId: string | null;
  scope: string;
  occurredAt: string;
}

export interface DeliveredAlert {
  id: number;
  monitorId: string;
  kind: string;
  createdAt: string;
  sentAt: string;
}

export type ActivityKind = 'CHECK' | 'STATE' | 'ANOMALY' | 'ALERT';

export interface ActivityEntry {
  key: string;
  kind: ActivityKind;
  occurredAt: string;
  title: string;
  detail: string;
}
