-- Up Migration
CREATE TABLE checker_heartbeats (
  checker_id   TEXT NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (checker_id, recorded_at)
) PARTITION BY RANGE (recorded_at);

CREATE INDEX idx_checker_heartbeats_recent
  ON checker_heartbeats(checker_id, recorded_at DESC);

CREATE TABLE checker_heartbeats_2026_05
  PARTITION OF checker_heartbeats
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE checker_heartbeats_2026_06
  PARTITION OF checker_heartbeats
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE checker_heartbeats_2026_07
  PARTITION OF checker_heartbeats
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- Down Migration
DROP TABLE checker_heartbeats_2026_07;
DROP TABLE checker_heartbeats_2026_06;
DROP TABLE checker_heartbeats_2026_05;
DROP INDEX idx_checker_heartbeats_recent;
DROP TABLE checker_heartbeats;
