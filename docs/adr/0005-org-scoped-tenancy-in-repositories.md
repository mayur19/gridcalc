# ADR-0005: Organization-scoped multi-tenancy enforced in repositories

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

Every workbook belongs to exactly one organization. A user reaches data through a membership and
a session that is bound to one organization. Tenant isolation failures are the most damaging bug
class for a hosted spreadsheet.

## Decision Drivers

- Impossible to forget the tenant filter in a new query
- No per-tenant infrastructure
- Simple to test

## Considered Options

### Option 1: Shared schema, `organization_id` column, repositories take it as a required parameter

Pros:

- One schema, one pool
- Isolation is visible in every query and code review
- Integration test "isolates organizations" covers it

Cons:

- Relies on discipline for every new repository function
- No defence in depth at the database level

### Option 2: PostgreSQL row-level security with a session variable

Pros:

- Database enforces isolation even for buggy queries

Cons:

- Every connection must set the variable; pooled connections risk leaking it
- Harder to debug; policies hidden from application code

### Option 3: Schema or database per tenant

Pros:

- Strong isolation, per-tenant backup

Cons:

- Migrations multiply by tenant count
- Connection pool explosion

## Decision

Use a shared schema. Tenant-owned tables carry `organization_id` (directly or through a parent
row), and repository functions that read or lock tenant data take `organizationId` from the
session's `AuthContext` and include it in the `WHERE` clause (`findWorkbook`, `lockWorkbook`,
`listWorkbooks`). Child lookups (sheets, cells) happen only after the parent workbook was found
inside the caller's organization. Row-level security stays an option for defence in depth.

## Consequences

### Positive

- A wrong workbook id from another tenant yields 404, not 403, so existence is not revealed
- No per-tenant operational work

### Negative

- Child queries such as `listSheets(workbookId)` trust that the caller checked the parent first
- Cross-organization features (sharing, GC-098/GC-099) must add explicit paths rather than loosening filters

## Links

- [workbook.repository.ts](../../apps/api/src/modules/workbooks/workbook.repository.ts)
- [workbook.service.ts](../../apps/api/src/modules/workbooks/workbook.service.ts)
- [workbooks.int.test.ts](../../apps/api/test/workbooks.int.test.ts) ("isolates organizations")
