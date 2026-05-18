export interface Monitor {
  id: string;
  userId: string;
  url: string;
  intervalSeconds: number;
  isActive: boolean;
  createdAt: Date;
  deactivatedAt: Date | null;
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
