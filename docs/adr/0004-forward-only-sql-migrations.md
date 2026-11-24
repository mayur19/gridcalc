# ADR-0004: Forward-only plain SQL migrations with checksum runner and advisory lock

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

Schema changes must apply identically on developer machines, CI (native runner PostgreSQL) and
production. Two API processes may start at the same time. A migration that was edited after
being applied somewhere is a silent source of drift.

## Decision Drivers

- Reviewable, plain SQL
- Safe under concurrent starts
- Detect edited history
- No extra tooling runtime

## Considered Options

### Option 1: Own runner: NNNN_description.sql files, per-file transaction, advisory lock, SHA-256 checksums

Pros:

- About 100 lines, no dependency
- Applied checksums verified on every run
- `pg_advisory_lock` serializes concurrent runs

Cons:

- No down migrations; rollback means a new forward migration
- We maintain the runner ourselves

### Option 2: Migration library with up/down scripts in JavaScript

Pros:

- Down migrations
- Community maintained

Cons:

- Down scripts are rarely tested and give false confidence
- Another dependency and DSL

### Option 3: ORM schema synchronization

Pros:

- No hand-written SQL

Cons:

- Destructive diffs possible
- Conflicts with ADR-0002 (no ORM)

## Decision

Migrations are files `^\d{4}_[a-z0-9_]+\.sql$` in `apps/api/migrations`, applied in lexical order by
`apps/api/src/db/migrate.ts`. Each runs in its own transaction and is recorded in
`schema_migrations(name, checksum, applied_at)`. The whole run holds `pg_advisory_lock(41070001)`.
A mismatching checksum aborts with "was modified after being applied; add a new migration
instead". There are no down migrations.

## Consequences

### Positive

- A failed migration rolls back completely and is reported with its file name
- Readiness (`/api/v1/health/ready`) reports the number of applied migrations
- Concurrent deploys cannot double-apply

### Negative

- Destructive changes need an expand-then-contract sequence across releases
- Statements that cannot run in a transaction (`CREATE INDEX CONCURRENTLY`) need a special case when first required

## Links

- [db/migrate.ts](../../apps/api/src/db/migrate.ts)
- [migrations](../../apps/api/migrations)
- [Data model, migrations section](../design/data-model.md#4-migrations)
