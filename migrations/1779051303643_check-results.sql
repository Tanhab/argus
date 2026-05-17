-- Up Migration
CREATE TABLE check_results (
  id          BIGSERIAL,
  monitor_id  TEXT NOT NULL,
  checker_id  TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER,
  is_up       BOOLEAN NOT NULL,
  error_type  TEXT CHECK (error_type IS NULL OR error_type IN
                ('timeout','dns_failure','connection_refused','tls_error','http_error','network_error')),
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (checked_at, id)
) PARTITION BY RANGE (checked_at);

CREATE INDEX idx_check_results_monitor_time
  ON check_results(monitor_id, checked_at DESC);

CREATE TABLE check_results_2026_05
  PARTITION OF check_results
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE check_results_2026_06
  PARTITION OF check_results
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Down Migration
DROP TABLE check_results_2026_06;
DROP TABLE check_results_2026_05;
DROP INDEX idx_check_results_monitor_time;
DROP TABLE check_results;
