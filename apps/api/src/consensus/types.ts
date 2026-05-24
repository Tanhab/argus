import type { ConsensusVerdict } from '@argus/db';

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface ConsensusOutcome {
  verdict: ConsensusVerdict;
  n: number;
  confidence: Confidence;
  medianDurationMs: number | null;
}

export interface ConsensusResult {
  outcome: ConsensusOutcome;
  previousVerdict: ConsensusVerdict | null;
}
