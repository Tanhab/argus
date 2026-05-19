-- Up Migration
CREATE TABLE api_keys (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash    TEXT NOT NULL UNIQUE,
  key_prefix  TEXT NOT NULL,
  owner       TEXT NOT NULL,
  scopes      TEXT[] NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_lookup ON api_keys(key_hash) WHERE is_active;

-- Down Migration
DROP INDEX idx_api_keys_lookup;
DROP TABLE api_keys;
