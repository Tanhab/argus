#!/usr/bin/env bash
# Drives the fake-target through N flap cycles for the Phase 4 DoD benchmark: each cycle
# fails the target, waits, recovers it, waits. With a 30s check interval and a 60s down
# threshold (checksToDown=2) a single 20s fail phase never reaches the threshold on its
# own, so the state machine only declares DOWN when two consecutive checks both observe
# the failure. Count alerts vs cycles afterwards (see misc/dod-numbers.md).
#
# Usage: tools/flap-script.sh <host:port> [cycles] [phase_seconds]
#   tools/flap-script.sh 203.0.113.7:7070
#   tools/flap-script.sh 203.0.113.7:7070 100 20
set -euo pipefail

TARGET=${1:?usage: flap-script.sh <host:port> [cycles] [phase_seconds]}
CYCLES=${2:-100}
PHASE=${3:-20}

echo "flapping http://$TARGET for $CYCLES cycles, ${PHASE}s per phase"

for i in $(seq 1 "$CYCLES"); do
  echo "[$(date -u +%FT%TZ)] cycle $i/$CYCLES: fail"
  curl -fsS "http://$TARGET/control/fail" >/dev/null
  sleep "$PHASE"

  echo "[$(date -u +%FT%TZ)] cycle $i/$CYCLES: ok"
  curl -fsS "http://$TARGET/control/ok" >/dev/null
  sleep "$PHASE"
done

# Leave the target healthy so a forgotten run doesn't keep it down.
curl -fsS "http://$TARGET/control/ok" >/dev/null
echo "done; target left in ok mode"
