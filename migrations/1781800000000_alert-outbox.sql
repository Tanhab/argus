-- Up Migration
CREATE TABLE alert_outbox (
  id          BIGSERIAL PRIMARY KEY,
  monitor_id  TEXT NOT NULL,
  kind        TEXT NOT NULL
    CHECK (kind IN ('transition', 'anomaly')),
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at     TIMESTAMPTZ,
  attempts    INTEGER NOT NULL DEFAULT 0
    CHECK (attempts >= 0),
  last_error  TEXT
);

CREATE INDEX idx_alert_outbox_pending ON alert_outbox (created_at)
  WHERE sent_at IS NULL;

-- Down Migration
DROP TABLE alert_outbox;
