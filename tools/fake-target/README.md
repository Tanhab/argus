# fake-target

A small controllable HTTP server used to script outages and slowdowns against the
monitor. Phase 4 uses it for the flap-suppression benchmark; Phase 5 reuses its slow mode
for the EWMA anomaly bench.

## Run

```bash
npx tsx tools/fake-target/index.ts
# or with a custom port
PORT=8080 npx tsx tools/fake-target/index.ts
```

It listens on `:7070` by default and starts in `ok` mode.

## Endpoints

### Control plane

| Method | Path | Effect |
|---|---|---|
| GET | `/control/ok` | Healthy: every request returns `200 ok`. |
| GET | `/control/fail` | Down: every request returns `503 down`. |
| GET | `/control/slow/<ms>` | Slow: every request waits `<ms>` then returns `200`. |
| GET | `/control/status` | Returns `{ "mode": ..., "slowMs": ... }` as JSON. |

### Monitored surface

Any path **not** under `/control/` is what a checker pings. Its response depends on the
current mode:

- `ok` → `200 ok`
- `fail` → `503 down`
- `slow` → `200 ok` after a `slowMs` delay

## Use in the flap benchmark

Register the running server as a monitor, then flip it on a schedule:

```bash
curl http://<host>:7070/control/fail   # induce an outage
curl http://<host>:7070/control/ok     # recover it
```

Driving `fail`/`ok` on a loop is how the Phase 4 DoD bench produces 100 flap cycles. See
`misc/dod-numbers.md` for the recorded run.
