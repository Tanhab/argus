# Argus

A small distributed service monitor I'm building as a portfolio backend development project. The real goal is to learn how a distributed system actually fits together — multi-region checks, consensus, anomaly detection, SLA reporting.

I'm building it phase by phase. Each phase tries to do one thing. Whenever I face limitations, I plan to improve it in the next phase. New features show up when I notice the previous version isn't enough.

**Status:** Phase 0 complete — a deployable backend foundation with health checks, Postgres, structured logging, and CI. No monitoring features yet; the first real checker lands in Phase 1.

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
