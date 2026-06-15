-- Up Migration
CREATE TABLE maintenance_windows (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id  TEXT NOT NULL REFERENCES monitors(id),
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX idx_maintenance_windows_monitor_time
  ON maintenance_windows(monitor_id, starts_at, ends_at);

-- Down Migration
DROP INDEX idx_maintenance_windows_monitor_time;
DROP TABLE maintenance_windows;
