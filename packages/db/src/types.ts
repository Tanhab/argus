export type ConsensusVerdict = 'up' | 'down' | 'degraded' | 'insufficient_data';
export type MonitorStatus = 'pending' | 'up' | 'degraded' | 'down' | 'recovering';

export interface Monitor {
  id: string;
  userId: string;
  url: string;
  intervalSeconds: number;
  isActive: boolean;
  createdAt: Date;
  deactivatedAt: Date | null;
  lastConsensus: ConsensusVerdict | null;
  lastConsensusAt: Date | null;
  lastAlertableConsensus: ConsensusVerdict | null;
  lastAlertableConsensusAt: Date | null;
  status: MonitorStatus;
  statusChangedAt: Date | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  downThresholdSeconds: number;
  recoveryThresholdSeconds: number;
  ewmaDurationMs: number | null;
  ewmaVariance: number | null;
  ewmaSampleCount: number;
}

export type AnomalyDirection = 'slower' | 'faster';
export type AnomalyScope = 'service' | 'regional';

export interface NewAnomalyEvent {
  monitorId: string;
  direction: AnomalyDirection;
  zScore: number;
  durationMs: number;
  baselineEwma: number;
  baselineStdDev: number;
  checkerId?: string | null;
  scope?: AnomalyScope;
}

export interface AnomalyEvent extends NewAnomalyEvent {
  id: number;
  occurredAt: Date;
  checkerId: string | null;
  scope: AnomalyScope;
}

export interface CheckerEwmaState {
  monitorId: string;
  checkerId: string;
  ewmaDurationMs: number | null;
  ewmaVariance: number | null;
  ewmaSampleCount: number;
}

export type AlertOutboxKind = 'transition' | 'anomaly';

export interface NewAlertOutboxRow {
  monitorId: string;
  kind: AlertOutboxKind;
  payload: Record<string, unknown>;
}

export interface AlertOutboxRow extends NewAlertOutboxRow {
  id: number;
  createdAt: Date;
  sentAt: Date | null;
  attempts: number;
  lastError: string | null;
}

export type ErrorType =
  | 'timeout'
  | 'dns_failure'
  | 'connection_refused'
  | 'tls_error'
  | 'http_error'
  | 'network_error';

export interface CheckResult {
  id: number;
  monitorId: string;
  checkerId: string;
  statusCode: number | null;
  durationMs: number | null;
  isUp: boolean;
  errorType: ErrorType | null;
  checkedAt: Date;
}

export interface NewCheckResult {
  monitorId: string;
  checkerId: string;
  statusCode: number | null;
  durationMs: number | null;
  isUp: boolean;
  errorType: ErrorType | null;
}

export interface NewMonitor {
  userId: string;
  url: string;
  intervalSeconds: number;
}

export interface ApiKey {
  id: string;
  keyHash: string;
  keyPrefix: string;
  owner: string;
  scopes: string[];
  isActive: boolean;
  createdAt: Date;
  revokedAt: Date | null;
}
