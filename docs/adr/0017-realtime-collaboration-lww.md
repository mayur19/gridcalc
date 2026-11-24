# ADR-0017: Real-time collaboration: cell-level last-writer-wins with revision vectors over WebSocket, LISTEN/NOTIFY fan-out

- Status: Proposed
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

Today a concurrent edit anywhere in a workbook makes other clients reload (409, ADR-0007), and
nobody sees others' changes until they reload. M6 targets live collaboration: see edits within a
second, keep editing different cells without conflicts, survive reconnects, and work across
several API instances without adding a message broker.

## Decision Drivers

- Edits to different cells never conflict
- Server stays authoritative for values (ADR-0008)
- Works with several API instances using only PostgreSQL
- Bounded complexity for a spreadsheet's mostly cell-granular edits

## Considered Options

### Option 1: Cell-level last-writer-wins with per-cell revision vectors, WebSocket transport, LISTEN/NOTIFY fan-out

Pros:

- Reuses `cells.updated_revision` and the commit pipeline
- Conflicts limited to the same cell, resolved deterministically and reported
- NOTIFY carries only the new revision; receivers read the change from PostgreSQL

Cons:

- Same-cell concurrent edits lose one value (reported, not merged)
- Structural edits need coordinate transformation of pending ops

### Option 2: Full operational transformation on cell text

Pros:

- Character-level merging inside one cell

Cons:

- Large algorithmic surface for little value; formulas are short and edited atomically

### Option 3: Conflict-free replicated data types on the client

Pros:

- Offline-first, peer merges

Cons:

- Values would be computed by clients, contradicting ADR-0008
- Metadata growth and complex garbage collection

### Option 4: Keep 409 and add polling

Pros:

- No new transport

Cons:

- Latency and wasted requests; still conflicts on unrelated cells

## Decision

Proposed: add `GET /api/v1/workbooks/{id}/live` as a WebSocket endpoint (GC-088) authenticated by
the session cookie plus CSRF token. Clients send ops carrying, for every edited cell, the
`updated_revision` they last saw. Under the existing row lock the server applies each edit; when a
cell's current revision is newer than the client's, the server applies last-writer-wins and
reports the overwritten value to the losing client (GC-089). After `COMMIT` the instance issues
`NOTIFY` on a per-workbook channel with the new revision; other instances read changed cells
(`updated_revision = r`) and push them to their sockets (GC-093). Presence (GC-091) and an offline
queue replayed from `workbook_revisions` (GC-092) build on the same channel.

## Consequences

### Positive

- Fewer reloads and no false conflicts on unrelated cells
- No new infrastructure beyond PostgreSQL

### Negative

- Long-lived connections change capacity planning per instance
- NOTIFY payloads are limited in size, so receivers must query for details
- Engine caches on every instance see more misses; engine snapshots (GC-038) and worker threads (GC-037) become important

## Links

- [pending.routes.ts](../../apps/api/src/modules/pending/pending.routes.ts) (`/live`, `/presence`)
- [System design 2.4 and 6.3](../design/system-design.md#63-collaboration-cell-level-last-writer-wins-with-revision-vectors-planned-gc-089-adr-0017)
- [Backlog E14](../planning/backlog.md)
