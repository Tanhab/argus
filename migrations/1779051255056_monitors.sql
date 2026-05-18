-- Up Migration
-- Up Migration
CREATE TABLE monitors (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  url              TEXT NOT NULL,
  interval_seconds INTEGER NOT NULL DEFAULT 60
                   CHECK (interval_seconds BETWEEN 30 AND 3600),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at   TIMESTAMPTZ
);

CREATE INDEX idx_monitors_active ON monitors(is_active) WHERE is_active;

-- Down Migration
DROP INDEX idx_monitors_active;
DROP TABLE monitors;
