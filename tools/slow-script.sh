#!/usr/bin/env bash
# Drives the fake-target through a slow-then-recover sequence for the Phase 5 EWMA DoD
# benchmark. Assumes the monitor baseline is already warm (or seeded — see misc/dod-numbers.md).
#
# Usage: tools/slow-script.sh <host:port> [slow_ms] [wait_seconds]
#   tools/slow-script.sh 138.68.109.43:7070
#   tools/slow-script.sh 138.68.109.43:7070 400 120
set -euo pipefail

TARGET=${1:?usage: slow-script.sh <host:port> [slow_ms] [wait_seconds]}
SLOW_MS=${2:-400}
WAIT=${3:-120}

echo "Phase 5 EWMA bench on http://$TARGET"
echo "  slow_ms=$SLOW_MS  wait_after_inject=${WAIT}s"
echo ""
echo "Before running: confirm baseline is warm (ewma_sample_count > 30) or seeded."
echo "During wait: watch API logs for 'anomaly alert delivered' and query anomaly_events."
echo ""

echo "[$(date -u +%FT%TZ)] inject slow ${SLOW_MS}ms"
curl -fsS "http://$TARGET/control/slow/${SLOW_MS}" >/dev/null

echo "[$(date -u +%FT%TZ)] waiting ${WAIT}s for check cycles..."
sleep "$WAIT"

echo "[$(date -u +%FT%TZ)] recover"
curl -fsS "http://$TARGET/control/ok" >/dev/null

echo "[$(date -u +%FT%TZ)] waiting ${WAIT}s for baseline recovery..."
sleep "$WAIT"

echo "done; target left in ok mode"
echo "Capture: anomaly_events row, worker log line, final ewma_* columns — see misc/dod-numbers.md"
