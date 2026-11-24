# ADR-0016: Virtualized absolutely-positioned DOM grid before a canvas renderer

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

Sheets default to 100,000 rows by 52 columns. Rendering every cell as a DOM node is impossible;
the grid must stay at 60 fps while scrolling, support keyboard editing, and expose semantics to
assistive technology.

## Decision Drivers

- DOM size independent of sheet size
- Accessibility through native ARIA roles
- Fast to build for M1
- Upgrade path for million-row sheets

## Considered Options

### Option 1: Virtualized DOM: render only the visible window plus overscan, cells absolutely positioned

Pros:

- ARIA `grid`, `gridcell`, headers work natively
- Text selection, editing and testing with standard DOM tools
- Window math is a pure, unit-tested function

Cons:

- Node churn on fast scroll; per-cell styling cost grows with formatting (GC-064)

### Option 2: Canvas renderer

Pros:

- Highest throughput for huge sheets

Cons:

- Accessibility must be rebuilt with a parallel hidden DOM
- Text input, hit testing and selection are custom
- Much larger first investment

### Option 3: HTML table with all rows

Pros:

- Trivial

Cons:

- Millions of nodes; unusable beyond a few thousand rows

## Decision

`Grid.tsx` renders headers and cells inside a scroll container, each absolutely positioned at
`headerHeight + row * rowHeight`, `headerWidth + col * colWidth` (defaults 24 px rows, 104 px
columns). `visibleSpan` in `virtualization.ts` computes the row and column window with an
overscan of 3, so the DOM holds about (visible rows + 7) x (visible cols + 7) cells. A canvas
renderer remains the planned upgrade (GC-056).

## Consequences

### Positive

- A 100,000-row sheet renders only its visible window (component test)
- ARIA roles and keyboard model available from the first release

### Negative

- Uniform row heights and column widths are assumed until GC-053 adds prefix sums for variable sizes
- Very large viewports and heavy formatting may exceed the frame budget; measured by GC-102

## Links

- [Grid.tsx](../../apps/web/src/pages/workbook/Grid.tsx)
- [virtualization.ts](../../apps/web/src/pages/workbook/virtualization.ts)
- [components.test.tsx](../../apps/web/test/components.test.tsx)
- [Quality attributes P-5, A-1](../architecture/quality-attributes.md)
