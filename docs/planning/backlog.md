# Backlog

Every ticket of the target product. Estimates are engineering hours for one experienced developer, including tests and docs. Status is `done` (merged, tested) or `pending`. Pending API endpoints already exist and answer `501 NOT_IMPLEMENTED` with the ticket id in `error.details.ticket`.

Ticket prefix: `GC`. Epics `E01`-`E17`, milestones `M0`-`M9` (see [roadmap.md](roadmap.md)).

## Summary

- Tickets: 104 (25 done, 79 pending)
- Estimated hours: 1764 total, 178 done, 1586 pending

## E01 Platform foundation

| ID     | Title                                                                      | Milestone | Estimate (h) | Status | Depends on |
| ------ | -------------------------------------------------------------------------- | --------- | -----------: | ------ | ---------- |
| GC-001 | Monorepo tooling: npm workspaces, strict TS, ESLint, Prettier              | M0        |            6 | done   | -          |
| GC-002 | Zod-validated config loader and structured logging with redaction          | M0        |            4 | done   | GC-001     |
| GC-003 | Fastify app shell: envelope, central errors, request ids, security headers | M0        |            6 | done   | GC-002     |
| GC-004 | Forward-only SQL migration runner (checksums, advisory lock, per-file txn) | M0        |            6 | done   | GC-002     |
| GC-005 | Liveness and readiness endpoints                                           | M0        |            2 | done   | GC-004     |
| GC-006 | run.sh launcher (setup, migrate, seed, reset, test, dev)                   | M0        |            5 | done   | GC-004     |
| GC-007 | CI pipeline on native runner PostgreSQL                                    | M0        |            4 | done   | GC-006     |

## E02 Identity, tenancy & access

| ID     | Title                                                                        | Milestone | Estimate (h) | Status  | Depends on |
| ------ | ---------------------------------------------------------------------------- | --------- | -----------: | ------- | ---------- |
| GC-008 | Postgres-backed login/registration throttle counters for multi-instance      | M9        |            8 | pending | GC-012     |
| GC-009 | Email-verified sign-up via local outbox (removes enumeration signal)         | M7        |           14 | pending | GC-010     |
| GC-010 | Organization registration with owner account (non-enumerating errors)        | M0        |            6 | done    | GC-004     |
| GC-011 | Session auth: scrypt, HttpOnly cookie, CSRF double-submit, Origin check      | M0        |           10 | done    | GC-010     |
| GC-012 | Login throttling: per-IP window + per-email progressive backoff; TRUST_PROXY | M0        |            5 | done    | GC-011     |
| GC-013 | RBAC skeleton: roles to permissions, route guards                            | M0        |            4 | done    | GC-011     |
| GC-014 | Multi-organization membership, org switcher and org settings                 | M7        |           16 | pending | GC-013     |
| GC-015 | Audit log write path                                                         | M0        |            3 | done    | GC-004     |
| GC-016 | Member invitations through the local outbox table                            | M7        |           14 | pending | GC-009     |
| GC-017 | Member list, role changes and removal (API + UI)                             | M7        |           10 | pending | GC-016     |
| GC-018 | Password reset via local outbox with session revocation                      | M7        |           12 | pending | GC-009     |
| GC-019 | Active session list and revoke-device UI                                     | M9        |            8 | pending | GC-011     |
| GC-090 | Audit log search API and viewer with CSV export                              | M7        |           12 | pending | GC-015     |

## E03 Formula language

| ID     | Title                                                                                | Milestone | Estimate (h) | Status  | Depends on |
| ------ | ------------------------------------------------------------------------------------ | --------- | -----------: | ------- | ---------- |
| GC-020 | Formula tokenizer (refs, sheets, strings, errors, operators)                         | M1        |            8 | done    | -          |
| GC-021 | Pratt parser to immutable AST, depth/arity limits, printer                           | M1        |           12 | done    | GC-020     |
| GC-022 | Evaluator: operators, coercion rules, error propagation, ranges                      | M1        |           12 | done    | GC-021     |
| GC-023 | Function library v1: 43 math/statistical/logical/text/lookup functions               | M1        |           16 | done    | GC-022     |
| GC-024 | Date & time functions on the serial-date system (DATE, TODAY, EDATE, NETWORKDAYS...) | M2        |           28 | pending | GC-023     |
| GC-025 | Lookup v2: XLOOKUP, XMATCH, SUMIFS/COUNTIFS/AVERAGEIFS, MAXIFS/MINIFS, SUMPRODUCT    | M2        |           24 | pending | GC-023     |
| GC-026 | Text v2: TEXT, FIND/SEARCH, SUBSTITUTE, REPLACE, TEXTJOIN, VALUE, PROPER             | M2        |           20 | pending | GC-065     |
| GC-027 | Math/stat v2: MEDIAN, STDEV, VAR, RANK, LARGE/SMALL, LOG/EXP, trig, RAND             | M2        |           20 | pending | GC-023     |
| GC-028 | Named ranges: definitions, scoping, parser binding, graph edges, API                 | M2        |           24 | pending | GC-031     |
| GC-029 | Whole-row/column references (A:A, 1:1) and 3D references                             | M2        |           18 | pending | GC-030     |
| GC-034 | Dynamic arrays and spill ranges (#SPILL!)                                            | M8        |           48 | pending | GC-033     |
| GC-036 | Locale-aware formula input (decimal comma, semicolon separators)                     | M9        |           16 | pending | GC-021     |

## E04 Recalculation engine

| ID     | Title                                                                      | Milestone | Estimate (h) | Status  | Depends on |
| ------ | -------------------------------------------------------------------------- | --------- | -----------: | ------- | ---------- |
| GC-030 | Dependency graph with column-bucketed range index                          | M1        |           10 | done    | GC-021     |
| GC-031 | Incremental recalc: dirty closure, iterative Tarjan order, cycle detection | M1        |           12 | done    | GC-030     |
| GC-032 | Randomized incremental-vs-full recalculation equivalence tests             | M1        |            4 | done    | GC-031     |
| GC-033 | Volatile functions and dynamic references (INDIRECT, OFFSET) scheduling    | M2        |           20 | pending | GC-031     |
| GC-037 | Recalculation in a worker thread with time budget and cancellation         | M6        |           24 | pending | GC-031     |
| GC-038 | Engine snapshot persistence for fast cold start of large workbooks         | M6        |           20 | pending | GC-041     |
| GC-047 | 2D interval tree for range dependents                                      | M9        |           16 | pending | GC-030     |
| GC-048 | Iterative calculation mode for intentional cycles                          | M9        |           16 | pending | GC-031     |
| GC-049 | Precedent/dependent tracing API and grid arrows                            | M9        |           14 | pending | GC-031     |

## E05 Workbook persistence & API

| ID     | Title                                                              | Milestone | Estimate (h) | Status  | Depends on     |
| ------ | ------------------------------------------------------------------ | --------- | -----------: | ------- | -------------- |
| GC-040 | Workbook, sheet, cell and revision schema plus repositories        | M1        |            6 | done    | GC-004         |
| GC-041 | Cell batch PATCH: row lock, optimistic revisions, engine LRU cache | M1        |           10 | done    | GC-031, GC-040 |
| GC-042 | Function catalog and formula parse endpoints                       | M1        |            2 | done    | GC-023         |
| GC-043 | Workbook rename, soft delete and duplicate                         | M2        |           10 | pending | GC-041         |
| GC-044 | Sheet rename (with formula rewriting), reorder, hide, delete       | M3        |           16 | pending | GC-060         |
| GC-045 | Workbook search, sorting, pagination UI and templates gallery      | M2        |           12 | pending | GC-043         |
| GC-046 | Cell comments and threaded notes                                   | M7        |           20 | pending | GC-041         |
| GC-052 | Seed script with demo organization and budget workbook             | M1        |            3 | done    | GC-041         |

## E06 Grid UI

| ID     | Title                                                                   | Milestone | Estimate (h) | Status  | Depends on |
| ------ | ----------------------------------------------------------------------- | --------- | -----------: | ------- | ---------- |
| GC-035 | Formula autocomplete, signature help and reference highlighting         | M2        |           16 | pending | GC-042     |
| GC-050 | Web shell: login, register, layout, navigation with Planned badges      | M1        |            8 | done    | GC-011     |
| GC-051 | Virtualized grid with formula bar, sheet tabs and keyboard navigation   | M1        |           14 | done    | GC-041     |
| GC-053 | Resizable column widths and row heights with persistence                | M3        |           12 | pending | GC-051     |
| GC-054 | Multi-cell range selection (shift/ctrl, select all) and selection stats | M3        |           14 | pending | GC-051     |
| GC-055 | Freeze panes                                                            | M3        |           12 | pending | GC-053     |
| GC-056 | Canvas renderer for million-row sheets                                  | M9        |           40 | pending | GC-051     |
| GC-057 | Find and replace across sheets                                          | M4        |           14 | pending | GC-054     |
| GC-058 | Accessibility audit: ARIA grid semantics, screen reader announcements   | M9        |           18 | pending | GC-051     |
| GC-059 | Touch and small-screen editing layout                                   | M9        |           20 | pending | GC-051     |

## E07 Structural editing & reference rewriting

| ID     | Title                                                               | Milestone | Estimate (h) | Status  | Depends on     |
| ------ | ------------------------------------------------------------------- | --------- | -----------: | ------- | -------------- |
| GC-060 | Insert/delete rows with reference rewriting (#REF! on deleted refs) | M3        |           32 | pending | GC-021, GC-031 |
| GC-061 | Insert/delete columns with reference rewriting                      | M3        |           16 | pending | GC-060         |
| GC-062 | Move range with dependent formula rewriting                         | M4        |           20 | pending | GC-060         |
| GC-063 | Hide/unhide and group rows and columns                              | M3        |           12 | pending | GC-053         |

## E08 Formatting & number formats

| ID     | Title                                                                    | Milestone | Estimate (h) | Status  | Depends on |
| ------ | ------------------------------------------------------------------------ | --------- | -----------: | ------- | ---------- |
| GC-064 | Cell style model with range-run storage (font, fill, borders, alignment) | M3        |           28 | pending | GC-041     |
| GC-065 | Number format engine (custom codes, dates, percent, currency)            | M3        |           36 | pending | GC-024     |
| GC-066 | Conditional formatting rules                                             | M8        |           30 | pending | GC-064     |
| GC-067 | Data validation (lists, ranges, custom formula)                          | M8        |           24 | pending | GC-064     |
| GC-068 | Merge cells                                                              | M3        |           14 | pending | GC-064     |

## E09 Clipboard, fill & undo/redo

| ID     | Title                                                                      | Milestone | Estimate (h) | Status  | Depends on     |
| ------ | -------------------------------------------------------------------------- | --------- | -----------: | ------- | -------------- |
| GC-070 | Command model and undo/redo stack with server inverse operations           | M4        |           32 | pending | GC-041         |
| GC-071 | Copy/paste with relative reference adjustment                              | M4        |           24 | pending | GC-054, GC-070 |
| GC-072 | Paste special (values, formats, transpose) and external TSV/HTML clipboard | M4        |           20 | pending | GC-071         |
| GC-073 | Fill handle and series detection                                           | M4        |           20 | pending | GC-071         |

## E10 Sort & filter

| ID     | Title                                               | Milestone | Estimate (h) | Status  | Depends on |
| ------ | --------------------------------------------------- | --------- | -----------: | ------- | ---------- |
| GC-074 | Multi-key stable range sort with formula adjustment | M4        |           20 | pending | GC-062     |
| GC-075 | Auto-filter with value and condition filters        | M4        |           24 | pending | GC-063     |
| GC-076 | Per-user filter views                               | M9        |           12 | pending | GC-075     |

## E11 Pivot tables

| ID     | Title                                                    | Milestone | Estimate (h) | Status  | Depends on     |
| ------ | -------------------------------------------------------- | --------- | -----------: | ------- | -------------- |
| GC-077 | Pivot table model and aggregation engine                 | M8        |           40 | pending | GC-041         |
| GC-078 | Pivot builder UI (drag fields), refresh and output sheet | M8        |           32 | pending | GC-077         |
| GC-079 | Pivot date grouping, calculated fields and filters       | M8        |           24 | pending | GC-078, GC-024 |

## E12 Charts

| ID     | Title                                                        | Milestone | Estimate (h) | Status  | Depends on |
| ------ | ------------------------------------------------------------ | --------- | -----------: | ------- | ---------- |
| GC-080 | Chart model and SVG renderer (bar, line, area, pie, scatter) | M8        |           40 | pending | GC-041     |
| GC-081 | Chart editor UI with live range binding                      | M8        |           24 | pending | GC-080     |
| GC-082 | Chart export to SVG/PNG (client-side rasterization)          | M8        |           10 | pending | GC-080     |

## E13 Import / export

| ID     | Title                                                                  | Milestone | Estimate (h) | Status  | Depends on     |
| ------ | ---------------------------------------------------------------------- | --------- | -----------: | ------- | -------------- |
| GC-083 | CSV import: streaming parser, delimiter and type inference             | M5        |           16 | pending | GC-041         |
| GC-084 | CSV export per sheet                                                   | M5        |            6 | pending | GC-041         |
| GC-085 | XLSX-lite import: in-house zip/deflate reader and SpreadsheetML subset | M5        |           48 | pending | GC-083         |
| GC-086 | XLSX-lite export: values, formulas, basic styles                       | M5        |           36 | pending | GC-085, GC-064 |
| GC-087 | Background job runner for imports (Postgres SKIP LOCKED queue)         | M5        |           16 | pending | GC-083         |

## E14 Real-time collaboration

| ID     | Title                                                                     | Milestone | Estimate (h) | Status  | Depends on |
| ------ | ------------------------------------------------------------------------- | --------- | -----------: | ------- | ---------- |
| GC-088 | WebSocket gateway with session auth and per-workbook rooms                | M6        |           24 | pending | GC-041     |
| GC-089 | Cell-level operational transform / last-writer-wins with revision vectors | M6        |           40 | pending | GC-088     |
| GC-091 | Presence: remote cursors, selections and avatars                          | M6        |           16 | pending | GC-088     |
| GC-092 | Offline edit queue and reconnect resynchronization                        | M6        |           24 | pending | GC-089     |
| GC-093 | Cross-instance fan-out via Postgres LISTEN/NOTIFY                         | M6        |           16 | pending | GC-088     |

## E15 Version history

| ID     | Title                                          | Milestone | Estimate (h) | Status  | Depends on |
| ------ | ---------------------------------------------- | --------- | -----------: | ------- | ---------- |
| GC-094 | Version history timeline from the revision log | M7        |           20 | pending | GC-041     |
| GC-095 | Named versions and restore                     | M7        |           20 | pending | GC-094     |
| GC-096 | Cell edit history ("who changed this")         | M7        |           12 | pending | GC-094     |
| GC-097 | Revision log compaction and periodic snapshots | M7        |           16 | pending | GC-094     |

## E16 Sharing & protection

| ID     | Title                                                            | Milestone | Estimate (h) | Status  | Depends on |
| ------ | ---------------------------------------------------------------- | --------- | -----------: | ------- | ---------- |
| GC-098 | Workbook ACL (owner/editor/commenter/viewer) overriding org role | M7        |           24 | pending | GC-013     |
| GC-099 | View-only share links with signed, revocable tokens              | M7        |           14 | pending | GC-098     |
| GC-100 | Protected ranges and sheet protection                            | M9        |           20 | pending | GC-098     |

## E17 Operations, performance & quality

| ID     | Title                                                                    | Milestone | Estimate (h) | Status  | Depends on |
| ------ | ------------------------------------------------------------------------ | --------- | -----------: | ------- | ---------- |
| GC-101 | Metrics endpoint (Prometheus text format) with recalc latency histograms | M9        |           12 | pending | GC-003     |
| GC-102 | Performance harness (100k rows, 10k formulas) with CI budgets            | M9        |           20 | pending | GC-041     |
| GC-103 | Backup/restore automation and restore drill                              | M9        |            8 | pending | GC-006     |
| GC-104 | Organization data export and deletion                                    | M9        |           16 | pending | GC-014     |
| GC-105 | Playwright E2E suite in CI with cached browsers                          | M9        |           12 | pending | GC-051     |
| GC-106 | Web CSP, dependency audit gate and secret scanning in CI                 | M9        |           10 | pending | GC-007     |
