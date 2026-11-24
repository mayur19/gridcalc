# ADR-0001: Modular monolith in npm workspaces, TypeScript end to end

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

gridcalc needs the same formula semantics in three places: the server, which is authoritative for
values (ADR-0008); the browser, which classifies input and will later offer autocomplete and
reference highlighting (GC-035); and tests. The team is small, the product has 17 epics, and the
first deliverable was a vertical slice (M0, M1) rather than a distributed platform. The formula
language, dependency graph and recalculation engine are the riskiest code and must be testable
without a database or HTTP.

## Decision Drivers

- One implementation of formula semantics shared by API and web
- Fast local feedback: one install, one typecheck, one test command
- Clear module boundaries that can later be split if load requires it
- No runtime dependency on hosted services or a service mesh

## Considered Options

### Option 1: Modular monolith in npm workspaces (packages/shared, apps/api, apps/web)

Pros:

- Shared code is a normal import, typed end to end
- Single CI job: lint, format, typecheck, coverage, build
- Boundaries are enforced by package dependencies (shared depends on neither app)

Cons:

- Discipline required to keep modules inside apps/api from reaching into each other
- One deployable API means scaling is per process, not per feature

### Option 2: Separate services (auth, workbook, recalculation) with their own repositories

Pros:

- Independent scaling and deployment
- Hard process boundaries

Cons:

- Network hops inside the write path (lock, recalc, persist) would need distributed transactions
- Duplicated types or a published client package for every change
- Operational burden far above the project size

### Option 3: Server in another language with a TypeScript client

Pros:

- Could pick a faster runtime for recalculation

Cons:

- Formula semantics implemented twice and kept in sync by hand
- Two toolchains, two test stacks

## Decision

Use one repository with npm workspaces: `packages/shared` (formula language, graph, engine, zod
schemas, DTOs), `apps/api` (Fastify server, modules per feature) and `apps/web` (React SPA).
TypeScript strict mode everywhere, Node 22 or newer. `packages/shared` must stay free of I/O and
must not import from the apps.

## Consequences

### Positive

- The randomized incremental-versus-full test and the 100k-chain test run as plain unit tests
- The web client uses the exact zod schemas the API validates with (`patchCellsSchema`, `MAX_EDITS_PER_REQUEST`)
- A single `./run.sh test` mirrors CI

### Negative

- A heavy recalculation blocks the API event loop until GC-037 moves it to a worker thread
- Shared package changes rebuild and retest every workspace

## Links

- [package.json](../../package.json) (workspaces)
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts)
- [apps/api/src/app.ts](../../apps/api/src/app.ts) (composition root)
- [Architecture overview](../architecture/overview.md)
