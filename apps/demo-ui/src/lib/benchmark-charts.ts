import b1 from '../../../../docs/bench-b1-consensus-fpr.png';
import b2 from '../../../../docs/bench-b2-ewma-alpha-sweep.png';
import b3 from '../../../../docs/bench-b3-flap-suppression.png';
import b5 from '../../../../docs/bench-b5-regional-vs-service.png';

export interface BenchmarkChart {
  id: string;
  title: string;
  summary: string;
  src: string;
}

export const BENCHMARK_CHARTS: BenchmarkChart[] = [
  {
    id: 'b1',
    title: 'Consensus vs single-checker FPR',
    summary:
      '33% false-positive rate under packet loss with one checker; 2-of-3 consensus drives FPR to 0%.',
    src: b1,
  },
  {
    id: 'b2',
    title: 'EWMA alpha sweep',
    summary:
      'Offline replay — lower alpha resists noisy baselines; higher alpha detects gentle drift sooner.',
    src: b2,
  },
  {
    id: 'b3',
    title: 'Flap suppression',
    summary:
      'Sub-threshold oscillation produces consensus edges but zero alert spam; sustained failure still pages.',
    src: b3,
  },
  {
    id: 'b5',
    title: 'Regional vs service-wide anomalies',
    summary:
      'Single-region slowdown stays regional; all-checker slowdown escalates to service-wide alert.',
    src: b5,
  },
];
