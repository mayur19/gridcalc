# ADR-0006: Recalc engine ownership: single-writer mutable internals behind immutable outputs

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

The project style prefers immutable data. A recalculation engine for 200,000 cells, however,
updates maps of cells, dependents and range buckets on every edit; copying them per edit would
make each PATCH O(workbook) in time and memory and defeat incremental recalculation.

## Decision Drivers

- Incremental edits must cost O(affected), not O(workbook)
- Callers must never observe or corrupt engine internals
- Safe sharing through the engine cache

## Considered Options

### Option 1: Mutable internals owned by one engine instance, single writer, frozen outputs

Pros:

- O(1) updates to maps and sets
- Every value returned (`ComputedCell`) is a fresh frozen object
- Simple mental model when combined with the workbook row lock

Cons:

- Not safe for concurrent writers; callers must serialize
- A failed transaction leaves a mutated engine that must be discarded

### Option 2: Persistent (structurally shared) immutable maps

Pros:

- Old versions remain valid; trivial rollback

Cons:

- Constant-factor slowdown and allocation pressure on every edge update
- Extra dependency or substantial in-house code

### Option 3: Copy-on-write per edit batch

Pros:

- Purely functional interface

Cons:

- O(workbook) copy per edit, unacceptable at the cell limit

## Decision

`RecalcEngine`, `DependencyGraph` and `RangeIndex` mutate their private maps in place. An engine
instance has one writer at a time, guaranteed by the workbook row lock (ADR-0007). Nothing mutable
escapes: results are frozen `ComputedCell` objects and AST nodes are immutable. On any failure
after mutation the engine is thrown away (ADR-0008), never repaired.

## Consequences

### Positive

- Incremental recalculation touches only the dirty subgraph
- Outputs can be passed to persistence and HTTP layers without defensive copies

### Negative

- Rollback of an engine is impossible; recovery is a rebuild from PostgreSQL
- Moving recalculation to a worker thread (GC-037) must transfer ownership, not share it

## Links

- [engine/recalc-engine.ts](../../packages/shared/src/engine/recalc-engine.ts)
- [graph/range-index.ts](../../packages/shared/src/graph/range-index.ts)
- [engine-cache.ts](../../apps/api/src/modules/workbooks/engine-cache.ts)
