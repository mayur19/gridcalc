# ADR-0018: XLSX-lite import/export with an in-house zip/deflate reader

- Status: Proposed
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

Users need to bring spreadsheets from desktop tools (M5). XLSX is a zip container of XML parts.
Imports are untrusted input that can be crafted to exhaust memory (zip bombs, deeply nested XML,
huge shared-string tables). The project avoids runtime dependencies for core paths and must not
call hosted conversion services.

## Decision Drivers

- Safety against hostile archives
- Only the subset gridcalc can represent (values, formulas, basic styles)
- No external services
- Streaming within memory budgets

## Considered Options

### Option 1: In-house zip central-directory reader and inflate implementation, SpreadsheetML subset parser

Pros:

- Every limit (entry count, uncompressed size, ratio, XML depth) is ours to enforce before allocation
- Reads only needed parts (`workbook.xml`, `sheetN.xml`, `sharedStrings.xml`, `styles.xml`)
- No dependency at the import boundary

Cons:

- Substantial work and test corpus (48 h import, 36 h export estimated)
- We own correctness of inflate

### Option 2: General-purpose spreadsheet library

Pros:

- Broad format coverage quickly

Cons:

- Large dependency processing untrusted input
- Its formula and value model differs from ours; conversion still needed

### Option 3: Use Node zlib for inflate with an in-house zip reader

Pros:

- Battle-tested decompression

Cons:

- Still a valid fallback; chosen only if the in-house inflate fails the fuzz and corpus tests

### Option 4: CSV only

Pros:

- Trivial and safe

Cons:

- Loses formulas, multiple sheets and styles

## Decision

Proposed: implement GC-085 (import) and GC-086 (export) as an in-house reader/writer for a
documented SpreadsheetML subset: cell values, shared strings, formulas (re-parsed with our parser;
unsupported functions become `#NAME?`), sheet names and basic styles. Imports run as jobs (GC-087)
with limits on archive size, entry count, total uncompressed bytes, compression ratio and XML
depth checked before inflating. Export maps gridcalc-specific errors (`#CYCLE!`, `#ERROR!`) to
standard ones.

## Consequences

### Positive

- Predictable behaviour on hostile input with explicit, testable limits
- No new runtime dependency

### Negative

- Format coverage is intentionally partial; unsupported features are reported in the import report
- Inflate performance must be benchmarked (GC-102)

## Links

- [pending.routes.ts](../../apps/api/src/modules/pending/pending.routes.ts) (`/api/v1/imports`, `/export`)
- [Backlog E13](../planning/backlog.md)
- [Data model: jobs, imports](../design/data-model.md)
