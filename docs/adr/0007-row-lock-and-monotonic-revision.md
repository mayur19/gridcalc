# ADR-0007: Workbook row lock + monotonic revision for optimistic concurrency

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

Several browsers, and later several API instances, may edit one workbook. A recalculation batch
reads and writes many cells, so concurrent batches on the same workbook must be serialized, and a
client that edited stale data must be told instead of silently overwriting a newer value.

## Decision Drivers

- Correct under multiple API processes without a coordinator
- Writers on different workbooks never block each other
- Clients detect staleness cheaply
- A gap-free sequence usable as version history

## Considered Options

### Option 1: `SELECT ... FOR UPDATE` on the workbook row plus `baseRevision` comparison

Pros:

- PostgreSQL provides the mutual exclusion across processes
- Revision doubles as cache key (ADR-0008) and history index
- One integer per request

Cons:

- Two edits to unrelated cells conflict (coarse granularity) until GC-089
- Writers queue on hot workbooks

### Option 2: Serializable isolation with retry on serialization failure

Pros:

- No explicit locks

Cons:

- Retries re-run recalculation; wasted work under contention
- The in-memory engine cannot be retried safely after mutation

### Option 3: Advisory lock keyed by workbook id

Pros:

- Does not touch the row

Cons:

- Separate from the revision read, so two round trips and easier to misuse
- Session-level advisory locks leak on pooled connections if not released

### Option 4: Per-cell versions only (no workbook lock)

Pros:

- Fine-grained, fewer conflicts

Cons:

- Recalculation reads cells outside the edit set; per-cell checks cannot protect derived values
- Planned as an additional layer in ADR-0017, not a replacement

## Decision

Every write runs inside `commit()`: `BEGIN`; lock the workbook row with `FOR UPDATE` scoped by
organization; if `baseRevision` is given and differs from `workbooks.revision`, fail with
`409 REVISION_CONFLICT` and `details.currentRevision`; otherwise apply, persist, set
`revision = revision + 1`, insert the matching `workbook_revisions` row and `COMMIT`. Workbooks
start at revision 1. Adding a sheet passes no base revision.

## Consequences

### Positive

- Exactly one of two concurrent writers on the same revision wins (integration test)
- `workbook_revisions` is gap-free and ordered, ready for the timeline (GC-094)

### Negative

- Any concurrent edit, even to a different cell, forces the other client to reload and re-apply
- Long recalculations hold the row lock and delay other writers to that workbook

## Links

- [lockWorkbook in workbook.repository.ts](../../apps/api/src/modules/workbooks/workbook.repository.ts)
- [commit() in workbook.service.ts](../../apps/api/src/modules/workbooks/workbook.service.ts)
- [workbooks.int.test.ts](../../apps/api/test/workbooks.int.test.ts)
- [System design section 5](../design/system-design.md#5-concurrency-and-consistency)
