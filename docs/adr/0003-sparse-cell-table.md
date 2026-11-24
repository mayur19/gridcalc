# ADR-0003: Sparse cell table storing raw input and last computed value

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

A sheet has up to 1,048,576 x 16,384 addressable cells but real workbooks fill a tiny fraction.
Reads of a visible window must be fast and must not require running the formula engine. Writes
must touch only changed cells. The engine needs every non-empty cell's raw input to rebuild.

## Decision Drivers

- Storage proportional to non-empty cells
- Window reads without evaluation
- Engine rebuild with one indexed scan
- Per-cell change tracking for future history and collaboration

## Considered Options

### Option 1: One row per non-empty cell with raw input and last computed value

Pros:

- Window read is a primary-key range scan
- Reads are cheap and consistent with the last commit
- `updated_revision` per cell supports cell history (GC-096) and LWW (GC-089)

Cons:

- Values are duplicated state that must be updated whenever they change
- Many rows for dense sheets

### Option 2: Store only raw input; compute values on read

Pros:

- No derived state in the database

Cons:

- Every read needs a warm engine; cold reads would rebuild the whole workbook
- Read latency tied to recalculation

### Option 3: Whole sheet as one JSON document per sheet

Pros:

- One row per sheet, simple load

Cons:

- Every edit rewrites the whole document
- Row-level locking and partial reads impossible
- TOAST bloat for large sheets

### Option 4: Columnar chunks (e.g. 256x256 tiles as blobs)

Pros:

- Compact for dense data

Cons:

- Edits rewrite whole tiles
- Complex merge logic; premature for current sizes

## Decision

Store cells in `cells(sheet_id, row_idx, col_idx)` with `raw` (non-empty, at most 8,192 chars),
`value_type`, `value` (the `CellValueDto` as jsonb), `updated_revision` and a denormalized
`workbook_id`. Empty cells have no row; clearing a cell deletes it.

## Consequences

### Positive

- `GET .../cells?range=` never touches the engine
- Only cells whose value changed are written (`RecalcResult.changed`)
- Rebuild is `SELECT ... WHERE workbook_id = $1` on `cells_workbook_idx`

### Negative

- Computed values can only be trusted if every write goes through the engine (ADR-0008)
- A change to evaluation semantics requires a recalculation pass over stored workbooks
- Formatting must live elsewhere (style runs, GC-064) so it does not force rows for empty cells

## Links

- [0002_workbooks_and_cells.sql](../../apps/api/migrations/0002_workbooks_and_cells.sql)
- [persistCells in workbook.repository.ts](../../apps/api/src/modules/workbooks/workbook.repository.ts)
- [api/cell-value.ts](../../packages/shared/src/api/cell-value.ts)
- [Data model](../design/data-model.md)
