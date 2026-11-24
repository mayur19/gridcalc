# ADR-0011: Static conservative precedents with a column-bucketed range index

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

Incremental recalculation needs, for any changed cell, the formulas that read it. Formulas read
single cells and rectangular ranges, often tall ones (`SUM(A1:A10000)`). Lazy functions (`IF`,
`CHOOSE`) read different cells depending on data.

## Decision Drivers

- Never miss a recalculation
- Memory independent of range height
- Fast lookups for the common shape (tall, narrow ranges)
- Simple enough to verify

## Considered Options

### Option 1: Static extraction over all branches; cell edges in maps; ranges indexed per column with a wide list

Pros:

- Superset of dynamic reads, so incremental equals full
- A range costs at most 64 index entries
- Lookup scans only ranges in the cell's column plus wide ones

Cons:

- Untaken branches create edges (possible spurious `#CYCLE!`, extra recalculation)
- Many tall ranges in one column make lookups linear in that bucket

### Option 2: Expand ranges into per-cell edges

Pros:

- Uniform graph, O(1) lookup

Cons:

- Memory O(range area); `SUM(A:A)` later would be a million edges

### Option 3: Dynamic dependency tracking during evaluation

Pros:

- Precise edges, no spurious cycles

Cons:

- Edges change on every evaluation; ordering needs re-evaluation passes
- Harder to prove correct; planned only for volatile/dynamic references (GC-033)

### Option 4: 2D interval tree from the start

Pros:

- O(log n + k) lookups

Cons:

- More code before the need was measured; scheduled as GC-047

## Decision

`collectPrecedents` walks the whole AST (every argument of every call) and returns cells, ranges
and unresolved sheet names. `DependencyGraph` stores deduplicated cell edges both ways, and
`RangeIndex` registers each range in every column bucket it spans, or in a per-sheet wide list
when it spans more than `WIDE_RANGE_COLUMNS = 64` columns.

## Consequences

### Positive

- The randomized equivalence test holds by construction
- Index size grows with range width (capped at 64), not height

### Negative

- `=IF(TRUE,1,A1)` in `A1` reports `#CYCLE!`
- Running-total patterns stack many ranges in one bucket; GC-047 addresses it

## Links

- [formula/dependencies.ts](../../packages/shared/src/formula/dependencies.ts)
- [graph/dependency-graph.ts](../../packages/shared/src/graph/dependency-graph.ts)
- [graph/range-index.ts](../../packages/shared/src/graph/range-index.ts)
- [System design 3.4 and 4.2](../design/system-design.md#42-range-index-column-buckets-and-the-wide-list-implemented)
