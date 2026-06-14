import type { AnomalyDirection, ConsensusVerdict } from '@argus/db';
import type { TransitionResult } from '../state/transition.js';

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface ConsensusOutcome {
  verdict: ConsensusVerdict;
  n: number;
  confidence: Confidence;
  medianDurationMs: number | null;
}

export interface AnomalyOutcome {
  direction: AnomalyDirection;
  zScore: number;
  durationMs: number;
  baselineEwma: number;
  baselineStdDev: number;
}

export interface ConsensusResult {
  outcome: ConsensusOutcome;
  previousVerdict: ConsensusVerdict | null;
  transition: TransitionResult;
  anomaly: AnomalyOutcome | null;
}
