-- Up Migration
ALTER TABLE monitors
  ADD COLUMN ewma_duration_ms  DOUBLE PRECISION,
  ADD COLUMN ewma_variance     DOUBLE PRECISION,
  ADD COLUMN ewma_sample_count INTEGER NOT NULL DEFAULT 0
    CHECK (ewma_sample_count >= 0);

CREATE TABLE anomaly_events (
  id               BIGSERIAL,
  monitor_id       TEXT NOT NULL,
  direction        TEXT NOT NULL CHECK (direction IN ('slower', 'faster')),
  z_score          DOUBLE PRECISION NOT NULL,
  duration_ms      DOUBLE PRECISION NOT NULL,
  baseline_ewma    DOUBLE PRECISION NOT NULL,
  baseline_std_dev DOUBLE PRECISION NOT NULL,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (occurred_at, id)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX idx_anomaly_events_monitor_time
  ON anomaly_events(monitor_id, occurred_at DESC);

CREATE TABLE anomaly_events_2026_06 PARTITION OF anomaly_events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE anomaly_events_2026_07 PARTITION OF anomaly_events
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- Down Migration
DROP TABLE anomaly_events_2026_07;
DROP TABLE anomaly_events_2026_06;
DROP INDEX idx_anomaly_events_monitor_time;
DROP TABLE anomaly_events;

ALTER TABLE monitors
  DROP COLUMN ewma_sample_count,
  DROP COLUMN ewma_variance,
  DROP COLUMN ewma_duration_ms;
