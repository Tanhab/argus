-- Up Migration
ALTER TABLE monitors
  ADD COLUMN last_consensus    TEXT,
  ADD COLUMN last_consensus_at TIMESTAMPTZ;

COMMENT ON COLUMN monitors.last_consensus IS
  'Most recent windowed-consensus verdict: up | down | degraded | insufficient_data. Denormalised for fast reads; source of truth is check_results.';

-- Down Migration
ALTER TABLE monitors
  DROP COLUMN last_consensus,
  DROP COLUMN last_consensus_at;
