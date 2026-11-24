# ADR-0010: Spreadsheet-compatible semantics: precedence, coercion, error propagation, 15 significant digits

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

Users bring expectations from desktop spreadsheets: `0.1+0.2` shows `0.3`, `="1"+1` is 2,
`SUM` over a range ignores text, comparisons are case-insensitive, and errors such as `#DIV/0!`
flow through formulas. Diverging silently would make imported workbooks (GC-085) compute different
numbers.

## Decision Drivers

- Results users recognize
- Deterministic, documented rules
- No exceptions escaping evaluation
- Compatibility with future XLSX-lite import

## Considered Options

### Option 1: Follow common spreadsheet conventions, documented and tested

Pros:

- Least surprise for users
- Import keeps meaning

Cons:

- Some conventions are odd (`-2^2 = 4`, left-associative `^`) and must be explained

### Option 2: Strict typing: no implicit coercion, raise on mixed types

Pros:

- Simpler evaluator

Cons:

- Breaks ordinary formulas like `="5"*2` and `A1&B1` with numbers

### Option 3: Exact decimal arithmetic

Pros:

- No binary floating-point artefacts

Cons:

- Slower, larger values, and incompatible with what spreadsheets actually compute

## Decision

Adopt these rules, implemented in `coercion.ts`, `evaluator.ts` and `values.ts`: precedence per
ADR-0009; coercion table (empty is 0, "" or FALSE; numeric text including `5%` converts; other text
to number is `#VALUE!`); errors propagate left operand first; comparison order numbers < text <
booleans with case-insensitive text; numbers compared after rounding to 15 significant digits;
subtraction results rounded to 15 significant digits; `formatGeneral` prints at most 15
significant digits; division by zero is `#DIV/0!`; non-finite results are `#NUM!`; a multi-cell
range used as a scalar is `#VALUE!`; a bare cell argument to an eager function behaves as a 1x1
range. Error codes: `#DIV/0!`, `#VALUE!`, `#REF!`, `#NAME?`, `#N/A`, `#NUM!`, `#NULL!`, `#CYCLE!`,
`#ERROR!`.

## Consequences

### Positive

- `=0.3-0.1-0.2` is exactly 0 and `=0.1+0.2=0.3` is TRUE
- The evaluator returns values or errors; it never throws for user input

### Negative

- Addition is not rounded, so stored values may carry binary noise that only display and comparison hide
- `#CYCLE!` and `#ERROR!` are gridcalc-specific codes that export (GC-086) must map

## Links

- [formula/coercion.ts](../../packages/shared/src/formula/coercion.ts)
- [formula/evaluator.ts](../../packages/shared/src/formula/evaluator.ts)
- [formula/values.ts](../../packages/shared/src/formula/values.ts)
- [evaluator.test.ts](../../packages/shared/test/evaluator.test.ts)
