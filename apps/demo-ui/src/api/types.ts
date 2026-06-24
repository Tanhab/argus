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
