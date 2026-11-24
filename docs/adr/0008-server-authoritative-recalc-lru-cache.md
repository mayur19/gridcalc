# ADR-0008: Server-authoritative recalculation with an in-process LRU engine cache

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

Values must be identical for every viewer, stored for fast reads (ADR-0003), and protected from
tampering. Rebuilding an engine from all cells on every edit costs O(workbook); keeping engines
in memory risks serving stale state when another process committed.

## Decision Drivers

- One source of truth for computed values
- Warm edits avoid rebuilding
- Never use an engine that does not match the committed revision
- No external cache service

## Considered Options

### Option 1: Server computes; per-process LRU of engines keyed by workbook id and valid for one exact revision

Pros:

- Warm edit cost is the dirty subgraph only
- Staleness detected by comparing with the locked row revision
- Bounded memory (`ENGINE_CACHE_SIZE`, default 16)

Cons:

- Cold rebuild after eviction or on another instance
- Engine memory per cached workbook

### Option 2: Client computes and uploads values

Pros:

- No server CPU

Cons:

- Clients can store arbitrary values; untrustworthy for sharing and audit
- Different browsers could compute differently

### Option 3: Server computes without caching

Pros:

- Simplest; always fresh

Cons:

- Every edit is O(workbook) parse, bind and evaluate

### Option 4: Shared external cache of engine state

Pros:

- Shared across instances

Cons:

- Serialization cost per edit and a new runtime dependency; contradicts self-hosted simplicity

## Decision

The API is authoritative. `EngineCache` keeps up to `ENGINE_CACHE_SIZE` engines. `get(id, revision)`
returns an engine only when its revision equals the revision read under the row lock, otherwise it
evicts and the service rebuilds with `RecalcEngine.create` from the `cells` table. `set` runs only
after `COMMIT`. Any error after the engine was obtained calls `invalidate(id)`.

## Consequences

### Positive

- Multi-instance correctness without coordination
- The client only renders values and merges `changed` cells

### Negative

- Each instance warms its own cache; sticky routing by workbook id is advisable
- Recalculation runs on the event loop until GC-037
- Cold start of large workbooks is bounded by rebuild time until engine snapshots (GC-038)

## Links

- [engine-cache.ts](../../apps/api/src/modules/workbooks/engine-cache.ts)
- [workbook.service.ts](../../apps/api/src/modules/workbooks/workbook.service.ts)
- [unit.test.ts](../../apps/api/test/unit.test.ts) (EngineCache)
- [workbooks.int.test.ts](../../apps/api/test/workbooks.int.test.ts) ("rebuilds from Postgres when the cached engine is stale")
