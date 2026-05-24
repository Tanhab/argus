-- Up Migration
ALTER TABLE monitors
  ADD COLUMN last_alertable_consensus    TEXT,
  ADD COLUMN last_alertable_consensus_at TIMESTAMPTZ;

COMMENT ON COLUMN monitors.last_alertable_consensus IS
  'Most recent consensus verdict that was alertable (up or down only). Used to detect real transitions across transient degraded/insufficient_data verdicts that overwrite last_consensus.';

-- Down Migration
ALTER TABLE monitors
  DROP COLUMN last_alertable_consensus,
  DROP COLUMN last_alertable_consensus_at;
