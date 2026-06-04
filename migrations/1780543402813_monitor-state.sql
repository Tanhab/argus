-- Up Migration
ALTER TABLE monitors
  ADD COLUMN status                     TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'up', 'degraded', 'down', 'recovering')),
  ADD COLUMN status_changed_at          TIMESTAMPTZ,
  ADD COLUMN consecutive_failures       INTEGER NOT NULL DEFAULT 0
    CHECK (consecutive_failures  >= 0),
  ADD COLUMN consecutive_successes      INTEGER NOT NULL DEFAULT 0
    CHECK (consecutive_successes >= 0),
  ADD COLUMN down_threshold_seconds     INTEGER NOT NULL DEFAULT 180
    CHECK (down_threshold_seconds     BETWEEN 30 AND 3600),
  ADD COLUMN recovery_threshold_seconds INTEGER NOT NULL DEFAULT 120
    CHECK (recovery_threshold_seconds BETWEEN 30 AND 3600);

COMMENT ON COLUMN monitors.status IS
  'Finite-state-machine state: pending | up | degraded | down | recovering. degraded here is the FSM state meaning "counting failures toward DOWN" — NOT the ConsensusVerdict ''degraded'' (1/1 split). Different layers, same word.';

CREATE INDEX idx_monitors_status ON monitors(status)
  WHERE status IN ('degraded', 'down', 'recovering');

-- Down Migration
DROP INDEX idx_monitors_status;
ALTER TABLE monitors
  DROP COLUMN status,
  DROP COLUMN status_changed_at,
  DROP COLUMN consecutive_failures,
  DROP COLUMN consecutive_successes,
  DROP COLUMN down_threshold_seconds,
  DROP COLUMN recovery_threshold_seconds;
