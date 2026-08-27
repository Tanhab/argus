-- Up Migration
-- Every partitioned table shipped with its month ranges hardcoded at creation
-- time, so a database built from migrations alone (CI, a fresh dev box) has no
-- partition once the wall clock passes the last hardcoded month. That is why
-- `checker_heartbeats` inserts started failing in August 2026.
--
-- ensure_next_partition() derives its ranges from CURRENT_DATE and covers the
-- current plus next month, so calling it here means any database is correct for
-- the month it was built in, whenever that is. The daily partition-rollover job
-- carries it forward from there, so no further dated migrations are needed.
SELECT ensure_next_partition('check_results');
SELECT ensure_next_partition('checker_heartbeats');
SELECT ensure_next_partition('status_events');
SELECT ensure_next_partition('anomaly_events');

-- Down Migration
-- Dropping the partitions would discard rows, so this is deliberately a no-op.
SELECT 1;
