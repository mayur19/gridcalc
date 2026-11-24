# gridcalc

A collaborative spreadsheet engine for the browser, in the spirit of a lightweight Excel. It has an **in-house
formula language** (tokenizer, Pratt parser, evaluator), a **dependency graph with incremental topological
recalculation and cycle detection**, PostgreSQL persistence with optimistic revisions, and a virtualized grid UI.

> **Status: foundation and first vertical slice. About 10% of the planned product is implemented**
> (178 of 1,764 estimated hours; see [implementation status](docs/planning/implementation-status.md)).
> Everything else is specified, estimated and tracked in the [backlog](docs/planning/backlog.md). Pending API
> endpoints already exist and answer `501` with their ticket id.

## What works today

- **Formula language**: numbers, strings, booleans, error literals, relative and absolute A1 references, ranges,
  cross-sheet references (`'Q1 Plan'!B2:B9`), spreadsheet operator precedence (`-2^2 = 4`, `%`, `&`, comparisons),
  coercion rules, error propagation, and **43 functions** (SUM, AVERAGE, COUNTIF, SUMIF, ROUND, IF, IFERROR, AND/OR,
  CONCAT, LEFT/MID/RIGHT, VLOOKUP, HLOOKUP, INDEX, MATCH, CHOOSE and more).
- **Recalculation**: precedents are extracted statically; a column-bucketed range index finds dependents; edits
  produce a dirty set that is ordered with an **iterative Tarjan SCC** pass, so only affected formulas are recomputed
  and reference cycles become `#CYCLE!`. A randomized property test checks that incremental results always equal a full recalculation.
- **Persistence**: workbooks, sheets and a sparse cell table storing raw input and the computed value. Batch edits
  run under a workbook row lock with revision-based optimistic concurrency, and a warm engine LRU cache makes edits incremental across requests.
- **Security**: organization tenancy, scrypt passwords, HttpOnly session cookies with HMAC'd ids, CSRF tokens,
  Origin checks, layered login throttling, RBAC (owner/admin/editor/viewer), and an audit trail.
- **Web**: sign-in, a workbook list, and a sheet view with a virtualized grid (100,000 rows rendered as a small
  window of DOM cells), formula bar, sheet tabs and keyboard editing.

## Quick start

Prerequisites: Node.js 22 or newer and a natively installed, running PostgreSQL 15 or newer. Locally the defaults use
the Unix socket in `/tmp` and your OS user with no password.

```bash
./run.sh            # checks prerequisites, creates .env, installs, creates DB, migrates, seeds, starts
```

- Web: http://localhost:5107. Sign in as `owner@gridcalc.test` with `gridcalc-demo-pass` (local development seed only).
- API: http://127.0.0.1:4107/api/v1/health/ready

Other commands: `./run.sh help | setup | migrate | seed | reset | test | dev`.

```bash
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
```

## Repository layout

```
apps/api/         Fastify 5 + pg + zod + pino API (modules: auth, workbooks, formulas, health, pending)
apps/api/migrations/  forward-only SQL migrations
apps/web/         React 18 + Vite client (virtualized grid, formula bar)
packages/shared/  formula language, dependency graph, recalculation engine, API schemas
docs/             product, architecture, ADRs, design, API (OpenAPI 3.1), security, testing, operations, planning
e2e/              Playwright smoke specs
run.sh            local launcher
```

## Documentation

Start at [docs/README.md](docs/README.md). Highlights:

- [System design](docs/design/system-design.md): the parser, evaluator and recalculation algorithms with complexity analysis
- [Architecture overview](docs/architecture/overview.md) and [ADRs](docs/adr/README.md)
- [OpenAPI spec](docs/api/openapi.yaml) and the [API guide](docs/api/README.md)
- [Threat model](docs/security/threat-model.md)
- [Roadmap](docs/planning/roadmap.md), [backlog](docs/planning/backlog.md) and [implementation status](docs/planning/implementation-status.md)

## License

[MIT](LICENSE) © gridcalc contributors
