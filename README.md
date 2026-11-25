# gridcalc

[![CI](https://github.com/mayur19/gridcalc/actions/workflows/ci.yml/badge.svg)](https://github.com/mayur19/gridcalc/actions/workflows/ci.yml)

**Spreadsheet calculations you can trust: formulas recompute instantly and correctly, only where something
actually changed.**

gridcalc is a collaborative spreadsheet engine for the browser, a lightweight Excel aimed at finance, operations
and planning teams who build shared models in workbooks. It has its own formula language (tokenizer, Pratt parser
and evaluator), a dependency graph that recalculates only the formulas an edit affects and turns reference cycles
into `#CYCLE!`, multi-tenant PostgreSQL persistence with revision-based conflict detection, and a virtualized grid
that keeps a 100,000-row sheet responsive.

> **Project status: early build.** The foundation (tooling, migrations, auth, RBAC, audit) and the hardest core
> slice (formula language with 43 functions, incremental recalculation with cycle detection, workbook/cell
> persistence and the grid with formula bar) are implemented and tested. Everything else is designed, documented
> and tracked in the [backlog](docs/planning/backlog.md): **10.1 %** of the estimated effort is complete
> (178 of 1,764 hours, see [implementation status](docs/planning/implementation-status.md)). The 74 pending API
> endpoints answer `501 Not Implemented` with their ticket id, and pending screens say which ticket delivers them.

## Project status

| Area                                                                                                                                        | Status         | Tickets                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------ |
| Platform foundation: monorepo, config, logging, error envelope, migrations, health, `run.sh`, CI                                            | ✅ Implemented | GC-001 to GC-007                                 |
| Identity and access: registration, sessions, CSRF, login throttling, RBAC, audit write path                                                 | ✅ Implemented | GC-010 to GC-013, GC-015                         |
| Identity and access: shared throttle counters, verified sign-up, multi-org, invitations, members, password reset, sessions UI, audit search | ⏳ Pending     | GC-008, GC-009, GC-014, GC-016 to GC-019, GC-090 |
| Formula language: tokenizer, Pratt parser, evaluator, 43 functions                                                                          | ✅ Implemented | GC-020 to GC-023                                 |
| Formula language: date/time, lookup v2, text v2, math v2, named ranges, whole-row/column refs, dynamic arrays, locale input                 | ⏳ Pending     | GC-024 to GC-029, GC-034, GC-036                 |
| Recalculation engine: dependency graph, incremental recalc, cycle detection, randomized equivalence tests                                   | ✅ Implemented | GC-030 to GC-032                                 |
| Recalculation engine: volatile functions, worker thread, snapshots, interval tree, iterative calculation, tracing                           | ⏳ Pending     | GC-033, GC-037, GC-038, GC-047 to GC-049         |
| Workbook persistence and API: schema, batch cell edits with revisions, engine cache, formula endpoints, seed                                | ✅ Implemented | GC-040 to GC-042, GC-052                         |
| Workbook persistence and API: rename/delete/duplicate, sheet management, search and templates, comments                                     | ⏳ Pending     | GC-043 to GC-046                                 |
| Grid UI: web shell, virtualized grid, formula bar, sheet tabs, keyboard editing                                                             | ✅ Implemented | GC-050, GC-051                                   |
| Grid UI: autocomplete, resizing, range selection, freeze panes, canvas renderer, find and replace, accessibility, touch                     | ⏳ Pending     | GC-035, GC-053 to GC-059                         |
| Structural editing with reference rewriting                                                                                                 | ⏳ Pending     | GC-060 to GC-063                                 |
| Formatting and number formats                                                                                                               | ⏳ Pending     | GC-064 to GC-068                                 |
| Clipboard, fill and undo/redo                                                                                                               | ⏳ Pending     | GC-070 to GC-073                                 |
| Sort and filter                                                                                                                             | ⏳ Pending     | GC-074 to GC-076                                 |
| Pivot tables                                                                                                                                | ⏳ Pending     | GC-077 to GC-079                                 |
| Charts                                                                                                                                      | ⏳ Pending     | GC-080 to GC-082                                 |
| Import / export (CSV, XLSX-lite, job runner)                                                                                                | ⏳ Pending     | GC-083 to GC-087                                 |
| Real-time collaboration                                                                                                                     | ⏳ Pending     | GC-088, GC-089, GC-091 to GC-093                 |
| Version history                                                                                                                             | ⏳ Pending     | GC-094 to GC-097                                 |
| Sharing and protection                                                                                                                      | ⏳ Pending     | GC-098 to GC-100                                 |
| Operations, performance and quality: metrics, performance harness, backup drills, data export, E2E in CI, security gates                    | ⏳ Pending     | GC-101 to GC-106                                 |

## Quick start

Requirements: Node.js 22+, npm, and a natively installed PostgreSQL 15+ server that accepts connections from your
OS user over the local socket in `/tmp` (no password).

```bash
./run.sh
```

This checks prerequisites, creates `.env` from `.env.example` with a random session secret, installs
dependencies, creates the `gridcalc_dev` database, applies migrations, seeds demo data and starts:

- Web: http://localhost:5107
- API: http://127.0.0.1:4107 (proxied by the web dev server under `/api`; readiness at `/api/v1/health/ready`)

## Demo logins (development only)

These accounts are created by the development seed (`apps/api/src/db/seed.ts`), are public, and must never exist
in a production database. Password for all: `gridcalc-demo-pass`.

| Email                  | Role   | Organization      |
| ---------------------- | ------ | ----------------- |
| `owner@gridcalc.test`  | Owner  | Northwind Finance |
| `editor@gridcalc.test` | Editor | Northwind Finance |
| `viewer@gridcalc.test` | Viewer | Northwind Finance |

The seed also creates the workbook **Quarterly budget FY26** with two sheets: `Budget`, with quarterly figures,
`SUM` totals, percentage shares, `VLOOKUP` checks against the other sheet, `INDEX`/`MATCH`, `AVERAGE`, `COUNTIF`
and a deliberate `#DIV/0!`, and `Limits`, with annual limits per category. That is 84 cells, 27 of them formulas.
Sign in as the viewer to see the read-only experience. Register a new organization from the sign-in page to start
from an empty workspace.

## run.sh commands

| Command                     | Description                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `./run.sh` / `./run.sh dev` | Run `setup`, then launch API (:4107) and web (:5107) together (`start` is an alias)  |
| `./run.sh setup`            | Check prerequisites, create `.env`, install deps, create the database, migrate, seed |
| `./run.sh migrate`          | Apply pending SQL migrations                                                         |
| `./run.sh seed`             | Load development demo data (idempotent; skipped if present)                          |
| `./run.sh reset [--yes]`    | Drop and recreate the dev schema, then migrate and seed (refuses in production)      |
| `./run.sh test`             | Lint, format check, typecheck and all tests (creates `gridcalc_test` if needed)      |
| `./run.sh help`             | Show all commands                                                                    |

## Tech stack

| Layer          | Technology                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| API            | Node.js 22, Fastify 5, `@fastify/cookie`, TypeScript (strict), zod, pg, pino; bundled with tsup      |
| Formula engine | `@gridcalc/shared`: in-house tokenizer, Pratt parser, evaluator, dependency graph, recalc engine     |
| Web            | React 18, React Router 6, Vite 6, plain CSS with design tokens                                       |
| Database       | PostgreSQL 15+ (native install), forward-only SQL migrations with checksums                          |
| Tests          | Vitest with v8 coverage, Testing Library + jsdom, Fastify inject against real PostgreSQL, Playwright |
| Tooling        | npm workspaces, ESLint 9, Prettier, GitHub Actions (runner's native PostgreSQL)                      |

## Repository layout

```
gridcalc/
├── apps/
│   ├── api/                       Fastify API
│   │   ├── migrations/            0001_foundation.sql, 0002_workbooks_and_cells.sql
│   │   ├── src/
│   │   │   ├── config/ db/ http/  env validation, pool + migration runner + seed, envelope/errors/headers
│   │   │   ├── app.ts             composition root
│   │   │   └── modules/
│   │   │       ├── auth/ rbac/ audit/ health/   sessions, CSRF, throttling, roles, audit, probes
│   │   │       ├── workbooks/                   implemented vertical slice (row lock, revisions, engine cache)
│   │   │       ├── formulas/                    function catalog and parse endpoint
│   │   │       └── pending/                     74 registered routes answering 501 with ticket ids
│   │   └── test/                  unit and PostgreSQL integration tests
│   └── web/                       React SPA
│       └── src/pages/             workbook/ (virtualized grid, formula bar, sheet tabs), PendingPage elsewhere
├── packages/shared/               the engine, fully unit tested
│   └── src/
│       ├── formula/               tokenizer, parser, printer, coercion, evaluator, functions/
│       ├── graph/                 dependency graph, range index
│       ├── engine/                incremental recalculation engine
│       └── api/                   zod schemas, envelope and cell DTO types
├── e2e/                           Playwright config and smoke specs
├── docs/                          product, architecture, ADRs, design, API, security, testing, ops, planning
├── run.sh                         single entry point
└── .env.example                   placeholder configuration
```

## Documentation

Start with the [documentation index](docs/README.md). Key documents:
[PRD](docs/product/PRD.md) ·
[requirements](docs/product/requirements.md) ·
[architecture](docs/architecture/overview.md) ·
[ADRs](docs/adr/README.md) ·
[data model](docs/design/data-model.md) ·
[system design](docs/design/system-design.md) ·
[API](docs/api/README.md) ([OpenAPI](docs/api/openapi.yaml)) ·
[threat model](docs/security/threat-model.md) ·
[test strategy](docs/testing/test-strategy.md) ·
[runbook](docs/operations/runbook.md) ·
[deployment](docs/operations/deployment.md) ·
[roadmap](docs/planning/roadmap.md) ·
[backlog](docs/planning/backlog.md) ·
[implementation status](docs/planning/implementation-status.md)

## Known limitations

- Login and registration throttle counters live in process memory, so run a **single API instance** until
  GC-008 moves them to PostgreSQL.
- Concurrent editors of one workbook get `409 REVISION_CONFLICT` and must reload; real-time merge is GC-089.
- Recalculation runs on the request thread (worker thread is GC-037). Workbooks are capped at 200,000 non-empty
  cells and 1,000 edits per request.
- A user belongs to exactly one organization (GC-014). Registering with an existing email returns a generic error,
  but the status code still differs from success until email-verified sign-up (GC-009).
- No formatting, row/column insertion, undo, clipboard, import/export, pivots, charts or version history yet
  (see status table).
- Playwright smoke specs are not run in CI yet (GC-105); run them locally against `./run.sh`.

## Contributing, security and license

- [Contributing guide](CONTRIBUTING.md): workflow, commit conventions, engine and SQL rules.
- [Security policy](SECURITY.md): how to report vulnerabilities; deployment hardening checklist.
- [Changelog](CHANGELOG.md).
- Licensed under the [MIT License](LICENSE).
