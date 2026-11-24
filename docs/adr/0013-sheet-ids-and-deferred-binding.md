# ADR-0013: Sheets referenced by id internally with deferred binding of unknown sheet names

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

Formulas name sheets (`Data!A1`, `'Q1 Budget'!B2`). Sheets will be renamed (GC-044), and users
often type a formula that references a sheet they are about to create. Graph keys and stored
coordinates must not change when a display name changes.

## Decision Drivers

- Stable identity for graph keys and cell rows
- Case-insensitive name lookup like common spreadsheets
- A formula typed before its sheet exists starts working when the sheet appears
- No full rebuild when a sheet is added

## Considered Options

### Option 1: Bind names to sheet ids at bind time; keep a waiting list per missing lower-case name

Pros:

- `CellKey` and `cells.sheet_id` use uuids; names live only in formula text
- Adding a sheet rebinds only the waiting formulas and their dependents

Cons:

- Rename must rewrite formula text and rebind (planned GC-044)
- Waiting lists must be cleaned when a formula is replaced

### Option 2: Use sheet names as keys everywhere

Pros:

- Simplest lookup

Cons:

- Rename invalidates every key and stored row
- Case and quoting issues in keys

### Option 3: Reject formulas that reference unknown sheets

Pros:

- No waiting state

Cons:

- Forces an order of work on users; breaks paste and import of multi-sheet content

### Option 4: Rebuild the whole engine whenever a sheet is added

Pros:

- No extra bookkeeping

Cons:

- O(workbook) for a common, cheap operation

## Decision

The engine maps sheet id to name and lower-cased name to id. `collectPrecedents` resolves names
through that map; unresolved names are returned and the formula is recorded in
`waitingOnSheet[lowerName]`. The formula evaluates to `#REF!` ("Unknown sheet"). `addSheet`
registers the sheet, rebinds every waiting formula, and evaluates them plus their dirty closure.
Replacing a cell's content removes it from all waiting lists. The database enforces the same
case-insensitive uniqueness with `sheets_workbook_name_key (workbook_id, lower(name))`.

## Consequences

### Positive

- `POST /sheets` returns the formulas that changed from `#REF!` to values in the same response
- Graph and storage are unaffected by future renames

### Negative

- Rename and delete (GC-044) need formula rewriting through the printer and rebinding
- Removing a key from waiting lists scans all missing names (small in practice)

## Links

- [engine/recalc-engine.ts](../../packages/shared/src/engine/recalc-engine.ts) (`addSheet`, `bind`, `unwait`)
- [formula/dependencies.ts](../../packages/shared/src/formula/dependencies.ts)
- [recalc-engine.test.ts](../../packages/shared/test/recalc-engine.test.ts) (sheets suite)
- [System design 2.3](../design/system-design.md#23-add-sheet-with-deferred-binding-implemented)
