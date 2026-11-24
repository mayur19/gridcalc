# ADR-0002: Fastify 5 + pg + zod, no ORM

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

The API's critical path is one transaction per edit batch: lock a workbook row, read sheets,
optionally load every cell of the workbook, upsert hundreds of changed cells, bump a revision and
append a log row. These statements need exact SQL (`FOR UPDATE`, `unnest` arrays,
`ON CONFLICT DO UPDATE`, partial indexes). Input arrives as JSON and must be validated with the
same schemas the web client uses.

## Decision Drivers

- Full control over SQL in the write path
- Validation schemas shared with the browser
- Small dependency surface and fast startup
- Structured logging with redaction

## Considered Options

### Option 1: Fastify 5, node-postgres (pg) with hand-written SQL, zod validation

Pros:

- Set-based `unnest` upserts and `FOR UPDATE` are written directly
- zod schemas live in packages/shared and type both ends
- Fastify brings pino logging, request ids, hooks and good throughput

Cons:

- Manual mapping from rows to types (column aliases such as `row_idx AS "row"`)
- No automatic migrations; handled by ADR-0004

### Option 2: Express + an ORM (entity mapping, migrations)

Pros:

- Familiar to many developers
- Less boilerplate for CRUD

Cons:

- Bulk upserts and row locks fall back to raw SQL anyway
- ORM identity maps hide query counts in the hot path
- Extra layer to learn and upgrade

### Option 3: NestJS + a query builder

Pros:

- Opinionated structure, dependency injection

Cons:

- Large framework for a modular monolith of a few modules
- Decorator-heavy code, slower cold start

## Decision

Use Fastify 5 with `pg` and plain parameterized SQL in per-module repository files, zod for every
body, param and query (`parseInput` in `http/validate.ts`), and the JSON envelope
`{data, error, meta}` for every response.

## Consequences

### Positive

- Cell persistence is two statements per commit regardless of batch size
- All SQL is reviewable in one place per module and parameterized
- Validation errors carry zod issue paths in `VALIDATION_FAILED` details

### Negative

- Repositories repeat column lists; refactors touch SQL strings
- Type safety between SQL and TypeScript relies on tests (integration suites against real PostgreSQL)

## Links

- [workbook.repository.ts](../../apps/api/src/modules/workbooks/workbook.repository.ts)
- [http/validate.ts](../../apps/api/src/http/validate.ts)
- [api/schemas.ts](../../packages/shared/src/api/schemas.ts)
- [db/pool.ts](../../apps/api/src/db/pool.ts)
