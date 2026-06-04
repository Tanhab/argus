-- Up Migration
CREATE TABLE status_events (
  id          BIGSERIAL,
  monitor_id  TEXT NOT NULL,
  from_status TEXT NOT NULL
    CHECK (from_status IN ('pending', 'up', 'degraded', 'down', 'recovering')),
  to_status   TEXT NOT NULL
    CHECK (to_status   IN ('pending', 'up', 'degraded', 'down', 'recovering')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (occurred_at, id)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX idx_status_events_monitor_time
  ON status_events(monitor_id, occurred_at DESC);

CREATE TABLE status_events_2026_06
  PARTITION OF status_events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE status_events_2026_07
  PARTITION OF status_events
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- Down Migration
DROP TABLE status_events_2026_07;
DROP TABLE status_events_2026_06;
DROP INDEX idx_status_events_monitor_time;
DROP TABLE status_events;
