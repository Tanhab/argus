# Argus

A small distributed service monitor I'm building as a portfolio backend development project. The real goal is to learn how a distributed system actually fits together — multi-region checks, consensus, anomaly detection, SLA reporting.

I'm building it phase by phase. Each phase tries to do one thing. Whenever I discover limitations, I plan to improve it in the next phase. New features show up when I notice the previous version isn't enough.

**Status:** Phase 1 complete — monitors CRUD API, in-process checker, partitioned check_results, and ntfy.sh alerts. Phase 2 next.

## Architecture

Currently a single-host Docker Compose stack:

``` md
Docker Compose
 
  ┌──────────┐         ┌──────────────┐
  │   API    │ ──────▶ │  PostgreSQL  │
  │  :3000   │         │    :5432     │
  └──────────┘         └──────────────┘
 
  ┌──────────────┐
  │ Checker stub │   (idle until Phase 1)
  └──────────────┘
```

Later phases replace the stub with real network probes from multiple regions and add the storage and processing for consensus and anomaly detection.

## Stack

Node 24 LTS, TypeScript 6 strict, ESM throughout. Fastify, Postgres 17 with raw `pg` (no ORM), Pino, Biome (format + lint), `node-pg-migrate`, multi-stage Docker, GitHub Actions, Husky + commitlint.

## Running locally

Requires Docker Desktop and Node 24.

``` bash
git clone https://github.com/YOUR_USERNAME/argus.git
cd argus
docker compose up --build
```

Brings up Postgres, the API on `localhost:3000` (`/health`, `/ready`), and the checker stub.

---

## Engineering Ledger

A running record of decisions I made each phase. Entries stay as-written when later phases ship; the log captures the reasoning at the time, not retrospective tidying.

### Phase 0 — Foundations

**Focus:** A deployable backend spine before any feature work. Strict TypeScript, structured logging, RFC 7807 errors, multi-stage Docker, and CI from day one.

**What's in place:**

- npm monorepo with four workspaces: `apps/api`, `apps/checker`, `packages/db`, `packages/logger`
- TypeScript 6 strict (`noUncheckedIndexedAccess`, `noImplicitOverride`), ESM throughout
- Fastify API with `/health` and `/ready`; global error handler emits RFC 7807 with request IDs
- Custom `ArgusError` class hierarchy for typed exceptions (`NotFoundError`, `ValidationError`, etc.)
- Pino structured logging with `service` and `env` base fields across all packages
- `withTransaction` helper in `@argus/db` to keep BEGIN/COMMIT out of route handlers
- Multi-stage Docker, both images under 200MB, non-root user
- Docker Compose with healthcheck-ordered startup
- GitHub Actions CI: build & lint, Docker build, smoke test against the built image
- Branch protection; Conventional Commits enforced via Husky + commitlint

**Key decisions and Tricky Bugs:**

- `pg.Pool` emits an `'error'` event on top of rejecting the query promise when the database disappears. Without a listener, Node treats it as unhandled and crashes the process — bypassing the try/catch inside `ping()`. Added a no-op `pool.on('error', ...)` listener to absorb pool-level errors; query-level errors still propagate to callers.
- `npm run build --workspaces` doesn't respect topological order, so `apps/api` failed to compile in CI before `packages/db` had emitted its `.d.ts` files. Resolved with explicit build ordering in the root script rather than introducing TypeScript project references — `composite: true` setup felt heavy for four workspaces, but I will change it if the project monorepo grows noticibly.
- Each package owns its own environment variables. The API never reads `DATABASE_URL` directly; importing `@argus/db` triggers validation. Avoids duplicated `requireEnv` helpers and keeps the per-package contract explicit.

### Phase 1 — Single Checker MVP

**Focus:** First real feature: a working uptime monitor with push alerts via ntfy.sh. Five monitors CRUD routes, an in-process checker scheduled with `setInterval`, and partitioned `check_results` storage.

**What's in place:**

- all monitor api with Fastify JSON Schema validation and RFC 7807 errors
- `monitors` table with `CHECK (interval_seconds BETWEEN 30 AND 3600)`; `check_results` partitioned by month with current and next month partitions created at migration time
- In-process checker: `setInterval` per monitor, reseeds from DB on startup, resyncs every 60 seconds
- Error classification on fetch failures: `timeout`, `dns_failure`, `connection_refused`, `tls_error`, `http_error`, `network_error` — reads `err.cause.code` not `err.code` because Node's fetch wraps syscall errors in a TypeError
- Alerts on every up↔down transition via ntfy.sh — best-effort, failures logged as warn and never propagated
- Integration tests for all query functions and routes via testcontainers (real Postgres, no mocks)

**Key decisions and tricky bugs:**

- Used `setInterval` instead of pg-boss `schedule`. pg-boss cron has a one-minute minimum granularity; `setInterval` is simpler and has no scheduling overhead for a single-process checker.
- Added `resetPool(connectionString)` to `@argus/db` so integration tests can swap the pool to point at the testcontainers Postgres after module load — only called by tests, never in production.

**Limitations of this phase:**

- Alerting fires on every transition with no debouncing. A 3-second blip produces a DOWN alert and immediately a RECOVERED alert.
- One checker, one network path. A local network issue is indistinguishable from the target being down.
- Partition rollover is manual — partitions are created at migration time. Running out of partitions will cause inserts to fail.
- Authentication is a hardcoded `MONITOR_USER_ID` env var — no real auth.
