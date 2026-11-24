# ADR-0012: Incremental recalculation ordered by iterative Tarjan SCC; cycles become #CYCLE!

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

After an edit, only formulas downstream of the edited cells may change. They must be evaluated
with every precedent before its dependents, and reference cycles must be detected without hanging.
Dependency chains can be very long (a 100,000-row running balance), which rules out recursive
graph walks in JavaScript.

## Decision Drivers

- Work proportional to the affected subgraph
- Topological order and cycle detection in one pass
- No recursion depth limits
- Deterministic and testable against full recalculation

## Considered Options

### Option 1: Dirty set by BFS, then iterative Tarjan SCC on the dirty subgraph, reversed

Pros:

- O(V_d + E_d) for both steps
- Cycles identified exactly as SCCs with more than one member or a self-loop
- Explicit frame stack survives 100k chains

Cons:

- Successor lists are computed twice (BFS and Tarjan)
- Slightly more code than Kahn's algorithm

### Option 2: Kahn's algorithm (in-degree counting) on the dirty subgraph

Pros:

- Simple, iterative

Cons:

- Leftover nodes include both cycle members and their downstream dependents; separating them needs a second pass

### Option 3: Full recalculation after every edit

Pros:

- Trivially correct

Cons:

- O(workbook) per keystroke commit

### Option 4: Recursive depth-first evaluation with memoization

Pros:

- Natural to write

Cons:

- Stack overflow on long chains
- Cycle reporting is ad hoc

## Decision

`collectDirty` performs a BFS over direct dependents (cell edges plus range-index matches);
`applyEdits` adds edited formula cells. `planRecalc` runs Tarjan with an explicit frame stack over
the dirty subgraph, reverses the emitted components to get precedents first, and marks members of
components of size greater than one, or with a self-loop, as cyclic. Cyclic cells get `#CYCLE!`;
everything else is evaluated in order. The result reports edited cells plus cells whose value
changed, the count evaluated, and the cyclic cells.

## Consequences

### Positive

- Incremental equals full recalculation (25-seed randomized test)
- Breaking a cycle restores real values in the same commit
- The API reports `evaluated` and `cycles` so the UI can explain what happened

### Negative

- Intentional iterative calculation is not supported until GC-048
- One very large dirty set still runs synchronously on the event loop (GC-037)

## Links

- [graph/dependency-graph.ts](../../packages/shared/src/graph/dependency-graph.ts)
- [engine/recalc-engine.ts](../../packages/shared/src/engine/recalc-engine.ts)
- [recalc-engine.test.ts](../../packages/shared/test/recalc-engine.test.ts)
- [dependency-graph.test.ts](../../packages/shared/test/dependency-graph.test.ts)
