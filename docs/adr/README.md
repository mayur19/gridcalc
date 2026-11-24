# Architecture decision records

Decisions use the MADR format: context, decision drivers, considered options, decision, consequences. Accepted records are not rewritten; a changed decision gets a new ADR that supersedes the old one. Most records cover hard, domain-specific choices about the formula engine, recalculation and concurrency (0006 to 0013 and 0015 to 0018).

| ADR                                                               | Title                                                                                                            | Status   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| [ADR-0001](0001-modular-monolith-npm-workspaces.md)               | Modular monolith in npm workspaces, TypeScript end to end                                                        | Accepted |
| [ADR-0002](0002-fastify-pg-zod-no-orm.md)                         | Fastify 5 + pg + zod, no ORM                                                                                     | Accepted |
| [ADR-0003](0003-sparse-cell-table.md)                             | Sparse cell table storing raw input and last computed value                                                      | Accepted |
| [ADR-0004](0004-forward-only-sql-migrations.md)                   | Forward-only plain SQL migrations with checksum runner and advisory lock                                         | Accepted |
| [ADR-0005](0005-org-scoped-tenancy-in-repositories.md)            | Organization-scoped multi-tenancy enforced in repositories                                                       | Accepted |
| [ADR-0006](0006-recalc-engine-ownership.md)                       | Recalc engine ownership: single-writer mutable internals behind immutable outputs                                | Accepted |
| [ADR-0007](0007-row-lock-and-monotonic-revision.md)               | Workbook row lock + monotonic revision for optimistic concurrency                                                | Accepted |
| [ADR-0008](0008-server-authoritative-recalc-lru-cache.md)         | Server-authoritative recalculation with an in-process LRU engine cache                                           | Accepted |
| [ADR-0009](0009-in-house-formula-parser.md)                       | In-house formula language: hand-written tokenizer and Pratt parser, no formula libraries or parser generators    | Accepted |
| [ADR-0010](0010-spreadsheet-compatible-semantics.md)              | Spreadsheet-compatible semantics: precedence, coercion, error propagation, 15 significant digits                 | Accepted |
| [ADR-0011](0011-static-precedents-column-bucketed-range-index.md) | Static conservative precedents with a column-bucketed range index                                                | Accepted |
| [ADR-0012](0012-incremental-recalc-iterative-tarjan.md)           | Incremental recalculation ordered by iterative Tarjan SCC; cycles become #CYCLE!                                 | Accepted |
| [ADR-0013](0013-sheet-ids-and-deferred-binding.md)                | Sheets referenced by id internally with deferred binding of unknown sheet names                                  | Accepted |
| [ADR-0014](0014-server-sessions-csrf-origin.md)                   | Server sessions in Postgres with CSRF double-submit and Origin checks instead of JWT                             | Accepted |
| [ADR-0015](0015-login-throttling-and-trust-proxy.md)              | Login throttling design and explicit TRUST_PROXY                                                                 | Accepted |
| [ADR-0016](0016-virtualized-dom-grid.md)                          | Virtualized absolutely-positioned DOM grid before a canvas renderer                                              | Accepted |
| [ADR-0017](0017-realtime-collaboration-lww.md)                    | Real-time collaboration: cell-level last-writer-wins with revision vectors over WebSocket, LISTEN/NOTIFY fan-out | Proposed |
| [ADR-0018](0018-xlsx-lite-in-house-zip-reader.md)                 | XLSX-lite import/export with an in-house zip/deflate reader                                                      | Proposed |
