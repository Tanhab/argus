/** Condensed README intro for the Benchmarks tab — architecture context before charts. */

export const BENCHMARK_INTRO = {
  tagline:
    'Argus is a distributed HTTP monitor: three independent checkers in EU, AP, and US post results to a central API. Consensus, flap suppression, EWMA anomalies, and SLA math run on that stream.',
  architecture: [
    'Main VPS (Helsinki): API + Postgres — stores checks, state, anomalies, alerts.',
    'Checker EU (Frankfurt), AP (Singapore), US (New York): each runs its own scheduler; no coordination between regions.',
    '2-of-3 consensus over a rolling window decides up/down; a four-state machine suppresses alert spam on brief flaps.',
  ],
  chartsLeadIn:
    'The charts below are reproducible bench runs from Phase 3–5 (exported from tools/bench/). They validate design choices — not live production traffic.',
} as const;
