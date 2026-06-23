-- Up Migration
CREATE TABLE monitor_checker_ewma (
  monitor_id        TEXT NOT NULL REFERENCES monitors(id),
  checker_id        TEXT NOT NULL,
  ewma_duration_ms  DOUBLE PRECISION,
  ewma_variance     DOUBLE PRECISION,
  ewma_sample_count INTEGER NOT NULL DEFAULT 0
    CHECK (ewma_sample_count >= 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (monitor_id, checker_id)
);

ALTER TABLE anomaly_events
  ADD COLUMN checker_id TEXT,
  ADD COLUMN scope      TEXT NOT NULL DEFAULT 'service'
    CHECK (scope IN ('service', 'regional'));

-- Down Migration
ALTER TABLE anomaly_events
  DROP COLUMN scope,
  DROP COLUMN checker_id;

DROP TABLE monitor_checker_ewma;
