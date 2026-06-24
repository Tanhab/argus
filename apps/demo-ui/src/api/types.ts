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
