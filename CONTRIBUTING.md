# Contributing

## Setup

```bash
./run.sh setup   # Node 22+, native PostgreSQL 15+
./run.sh         # API on :4107, web on :5107
```

## Workflow

1. Pick a ticket from [docs/planning/backlog.md](docs/planning/backlog.md). Every change maps to a `GC-xxx` ticket.
2. Write the test first. Engine changes go in `packages/shared/test`; API behaviour goes in `apps/api/test` (real Postgres via `TEST_DATABASE_URL`).
3. Implement. When you implement a pending endpoint, remove it from `apps/api/src/modules/pending/pending.routes.ts` and set `x-status: implemented` in `docs/api/openapi.yaml`.
4. Run `./run.sh test` (lint, format check, typecheck, tests) and `npm run build`.
5. Update the docs the change touches: requirements status, traceability, backlog status, implementation status, ADR if a decision changed.

## Conventions

- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `ci:`, `perf:`.
- Immutable domain logic: pure functions that return new objects. The recalculation engine's private indexes are the documented exception (ADR-0006).
- Small files (under 400 lines) and small functions. Validate every boundary with zod. Never swallow errors.
- SQL: parameterized only, every tenant-owned query filtered by `organization_id`, forward-only migrations, and never edit an applied migration.
- No runtime calls to third-party services. Anything that would need one is built in-house or simulated locally (for example an outbox table instead of sending email).

## Formula engine changes

- Add or change functions in `packages/shared/src/formula/functions/*` and register them in `registry.ts`.
- Each function needs tests for normal values, coercion, blanks, errors and arity.
- Keep the randomized equivalence test green. If you change dependency extraction, add a seed that exercises the new path.
