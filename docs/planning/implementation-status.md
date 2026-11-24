# Implementation status

**Overall: 10.1% implemented** (178 of 1764 estimated hours).

## How the percentage is computed

`percent = sum(estimate of done tickets) / sum(estimate of all tickets)` over [backlog.md](backlog.md). A ticket counts as done only when its code is merged, covered by tests that run in CI, and documented. Partially finished work counts as pending. Estimates are re-baselined when a milestone starts, never retroactively to inflate progress.

## By epic

| Epic                                         | Done (h) | Total (h) |    % |
| -------------------------------------------- | -------: | --------: | ---: |
| E01 Platform foundation                      |       33 |        33 | 100% |
| E02 Identity, tenancy & access               |       28 |       122 |  23% |
| E03 Formula language                         |       48 |       246 |  20% |
| E04 Recalculation engine                     |       26 |       136 |  19% |
| E05 Workbook persistence & API               |       21 |        79 |  27% |
| E06 Grid UI                                  |       22 |       168 |  13% |
| E07 Structural editing & reference rewriting |        0 |        80 |   0% |
| E08 Formatting & number formats              |        0 |       132 |   0% |
| E09 Clipboard, fill & undo/redo              |        0 |        96 |   0% |
| E10 Sort & filter                            |        0 |        56 |   0% |
| E11 Pivot tables                             |        0 |        96 |   0% |
| E12 Charts                                   |        0 |        74 |   0% |
| E13 Import / export                          |        0 |       122 |   0% |
| E14 Real-time collaboration                  |        0 |       120 |   0% |
| E15 Version history                          |        0 |        68 |   0% |
| E16 Sharing & protection                     |        0 |        58 |   0% |
| E17 Operations, performance & quality        |        0 |        78 |   0% |

## By milestone

| Milestone                              | Done (h) | Total (h) |    % |
| -------------------------------------- | -------: | --------: | ---: |
| M0 Foundation                          |       61 |        61 | 100% |
| M1 Formula core slice                  |      117 |       117 | 100% |
| M2 Formula completeness & named ranges |        0 |       192 |   0% |
| M3 Structure & formatting              |        0 |       192 |   0% |
| M4 Editing productivity                |        0 |       174 |   0% |
| M5 Import / export                     |        0 |       122 |   0% |
| M6 Real-time collaboration             |        0 |       164 |   0% |
| M7 History, sharing & administration   |        0 |       204 |   0% |
| M8 Analysis: pivots & charts           |        0 |       272 |   0% |
| M9 Hardening & general availability    |        0 |       266 |   0% |

## What is done (M0 and M1)

| Area                | Implemented                                                                                                                                                                                                                                                | Where                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Tooling and CI      | npm workspaces, strict TypeScript, ESLint, Prettier, Vitest with coverage thresholds, CI on the runner's native PostgreSQL                                                                                                                                 | root configs, `.github/workflows/ci.yml`       |
| Launcher            | `run.sh` with help/setup/migrate/seed/reset/test/dev, `.env` bootstrap with a random secret, database creation                                                                                                                                             | `run.sh`                                       |
| API foundation      | zod config, pino logs with redaction, `{data,error,meta}` envelope, central error handler, request ids, security headers, health/readiness                                                                                                                 | `apps/api/src/{config,http}`, `modules/health` |
| Migrations          | Forward-only runner with checksums, advisory lock, per-file transactions; migrations 0001 (tenancy, identity, sessions, audit) and 0002 (workbooks, sheets, cells, revision log)                                                                           | `apps/api/src/db`, `apps/api/migrations`       |
| Auth and security   | Registration (non-enumerating errors), login, logout, me; scrypt; HMAC'd session ids; CSRF double-submit; Origin allow-list; layered login throttling with reservation, IP normalization and bounded store; explicit `TRUST_PROXY`; RBAC; audit write path | `apps/api/src/modules/{auth,rbac,audit}`       |
| Formula language    | Tokenizer, Pratt parser, printer, coercion, evaluator, 43 functions, criteria with wildcards                                                                                                                                                               | `packages/shared/src/formula`                  |
| Recalculation       | Dependency graph with range index, dirty-set closure, iterative Tarjan ordering, `#CYCLE!` detection, deferred sheet binding, randomized equivalence tests                                                                                                 | `packages/shared/src/{graph,engine}`           |
| Workbook API        | Create/list/get workbooks, add sheets, windowed cell reads, batch PATCH with row lock, revisions, engine LRU cache, revision log                                                                                                                           | `apps/api/src/modules/workbooks`               |
| Formula tooling API | Function catalog, parse/normalize endpoint                                                                                                                                                                                                                 | `apps/api/src/modules/formulas`                |
| Web                 | Login, register, app shell with Planned badges, workbook list, workbook page with virtualized grid, formula bar, sheet tabs, keyboard editing                                                                                                              | `apps/web/src`                                 |
| Seed                | Demo organization with owner/editor/viewer and a budget workbook using cross-sheet lookups, ranges and an intentional error                                                                                                                                | `apps/api/src/db/seed.ts`                      |

## What is stubbed

- **74 pending API operations** are registered and return `501 NOT_IMPLEMENTED` with their ticket id. See `apps/api/src/modules/pending/pending.routes.ts` and the `x-status: pending` operations in [openapi.yaml](../api/openapi.yaml). Authentication still applies to them.
- **8 planned navigation sections** in the web app (Templates, Import and export, Shared with me, Version history, Pivot tables, Charts, Members, Audit log) render a page with a Planned badge, the milestone and the ticket id.
- **Database:** only migrations 0001 and 0002 exist. The full target schema, including planned tables, is in [data-model.md](../design/data-model.md).
- **E2E:** Playwright smoke specs exist but skip in CI until GC-105.

## Known limitations of the slice

- A user belongs to exactly one organization (GC-014).
- Concurrent editors of one workbook get `409 REVISION_CONFLICT` and must reload; real-time merge is GC-089.
- Recalculation runs on the request thread (GC-037). Workbooks are capped at 200,000 non-empty cells.
- Login and registration throttle counters are in memory, so a single API instance is required (GC-008).
- No formatting, structural edits, undo, clipboard, import/export, pivots or charts yet (M3-M8).
