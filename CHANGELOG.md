# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog, and the project uses Semantic Versioning.

## [Unreleased]

### Planned

- M2: date/time and lookup v2 functions, named ranges, volatile functions, formula autocomplete (see docs/planning/roadmap.md).

## [0.1.0] - 2026-11-25

### Added

- Monorepo with npm workspaces, strict TypeScript, ESLint, Prettier, Vitest and a CI pipeline on native PostgreSQL.
- `run.sh` launcher with setup, migrate, seed, reset, test and dev commands.
- Formula language: tokenizer, Pratt parser, printer, evaluator and 43 functions across math, statistical, logical, text and lookup.
- Dependency graph with a column-bucketed range index, incremental recalculation ordered by iterative Tarjan SCC, and `#CYCLE!` detection.
- API: registration, login, logout and session endpoints; CSRF and Origin protection; layered login throttling; RBAC; audit write path.
- API: workbook, sheet and cell endpoints with revision-based optimistic concurrency and an engine cache; function catalog and formula parse endpoints.
- 74 pending endpoints registered with `501 NOT_IMPLEMENTED` and backlog ticket references.
- Web client: sign-in, workbook list, virtualized grid with formula bar, sheet tabs and keyboard editing.
- Documentation set: PRD, requirements, ADRs, system design, data model, OpenAPI 3.1, threat model, test strategy, runbook, deployment, roadmap, backlog.
