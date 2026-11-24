# ADR-0009: In-house formula language: hand-written tokenizer and Pratt parser, no formula libraries or parser generators

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

The formula language is the core of the product. We need precise control over spreadsheet
precedence (`-2^2 = 4`), error positions for the formula bar, quoted sheet names, absolute
references, missing arguments, and hard limits against hostile input. The same AST will be the
input to reference rewriting (GC-060, GC-071) and printing.

## Decision Drivers

- Exact spreadsheet precedence and associativity
- Good error messages with positions
- Bounded resource use (length, depth, argument count)
- AST designed for rewriting and printing
- No runtime dependencies

## Considered Options

### Option 1: Hand-written tokenizer and Pratt parser

Pros:

- Precedence is a small binding-power table
- Each limit is a constant (`MAX_FORMULA_LENGTH` 8192, `MAX_DEPTH` 64, `MAX_ARGS` 255)
- About 400 lines, fully covered by tests

Cons:

- We own every edge case and must test it

### Option 2: Parser generator (grammar file compiled to a parser)

Pros:

- Grammar is declarative

Cons:

- Build step and an extra toolchain
- Error messages and recovery are harder to tailor
- Left-associative `^` and prefix-over-power precedence require grammar contortions

### Option 3: Existing formula library

Pros:

- Many functions available immediately

Cons:

- Semantics we do not control (coercion, errors, precision)
- AST not designed for our rewriting and dependency extraction
- Licensing and maintenance risk at the heart of the product

### Option 4: Recursive descent with one function per precedence level

Pros:

- Straightforward

Cons:

- Eight levels of nearly identical functions; Pratt expresses the same with a table

## Decision

Write the tokenizer (`tokenizer.ts`) and a Pratt parser (`parser.ts`) by hand, producing immutable
AST nodes (`ast.ts`), with a printer (`printer.ts`) as the inverse. Binding powers: comparison 10,
`&` 20, `+ -` 30, `* /` 40, `^` 50 (left-associative), postfix `%` 60, prefix `+ -` 70, range `:` 80.
`tryParseFormula` is the non-throwing boundary used by cell input and the parse endpoint.

## Consequences

### Positive

- Parse errors carry a character position that the formula bar can underline
- The parse endpoint (`POST /api/v1/formulas/parse`) and the engine share one parser

### Negative

- New syntax (whole-column refs GC-029, locale separators GC-036, spill operator GC-034) is our work
- The tokenizer copies the input tail for each number token; strict O(n) needs a sticky regular expression (see system design 3.1)

## Links

- [formula/tokenizer.ts](../../packages/shared/src/formula/tokenizer.ts)
- [formula/parser.ts](../../packages/shared/src/formula/parser.ts)
- [formula/printer.ts](../../packages/shared/src/formula/printer.ts)
- [parser.test.ts](../../packages/shared/test/parser.test.ts)
- [System design 3.1-3.2](../design/system-design.md#3-formula-pipeline-algorithms)
