import type { CellAddress, RangeAddress } from '../formula/references.js';
import type { CellKey } from './cell-key.js';

/**
 * Reverse index from cells to the formulas whose *range* precedents cover them.
 *
 * Ranges are bucketed by column: a range spanning columns L..R is registered in each
 * column bucket L..R of its sheet, so a lookup only scans ranges that intersect the
 * cell's column. Ranges wider than WIDE_RANGE_COLUMNS go to a per-sheet "wide" list that
 * every lookup scans. Lookup cost is O(k) where k is the number of ranges in the column
 * bucket (+ wide ranges). A 2D interval tree is the planned upgrade (see backlog GC-047).
 *
 * The index is owned by a single DependencyGraph and mutated in place (see ADR-0006).
 */
export const WIDE_RANGE_COLUMNS = 64;

interface Entry {
  readonly formula: CellKey;
  readonly range: RangeAddress;
}

interface SheetBuckets {
  readonly byColumn: Map<number, Set<Entry>>;
  readonly wide: Set<Entry>;
}

export class RangeIndex {
  private readonly sheets = new Map<string, SheetBuckets>();
  private readonly entriesByFormula = new Map<CellKey, Entry[]>();

  add(formula: CellKey, ranges: readonly RangeAddress[]): void {
    if (ranges.length === 0) return;
    const entries = ranges.map((range) => ({ formula, range }));
    this.entriesByFormula.set(formula, entries);
    for (const entry of entries) {
      const buckets = this.bucketsFor(entry.range.sheetId);
      if (isWide(entry.range)) {
        buckets.wide.add(entry);
        continue;
      }
      for (let col = entry.range.left; col <= entry.range.right; col += 1) {
        let set = buckets.byColumn.get(col);
        if (!set) {
          set = new Set();
          buckets.byColumn.set(col, set);
        }
        set.add(entry);
      }
    }
  }

  remove(formula: CellKey): void {
    const entries = this.entriesByFormula.get(formula);
    if (!entries) return;
    this.entriesByFormula.delete(formula);
    for (const entry of entries) {
      const buckets = this.sheets.get(entry.range.sheetId);
      if (!buckets) continue;
      if (isWide(entry.range)) {
        buckets.wide.delete(entry);
        continue;
      }
      for (let col = entry.range.left; col <= entry.range.right; col += 1) {
        const set = buckets.byColumn.get(col);
        set?.delete(entry);
        if (set?.size === 0) buckets.byColumn.delete(col);
      }
    }
  }

  /** Formulas with at least one range precedent containing the cell. */
  formulasCovering(cell: CellAddress, into: Set<CellKey>): void {
    const buckets = this.sheets.get(cell.sheetId);
    if (!buckets) return;
    const scan = (entries: Iterable<Entry>): void => {
      for (const { formula, range } of entries) {
        if (
          cell.row >= range.top &&
          cell.row <= range.bottom &&
          cell.col >= range.left &&
          cell.col <= range.right
        ) {
          into.add(formula);
        }
      }
    };
    const column = buckets.byColumn.get(cell.col);
    if (column) scan(column);
    scan(buckets.wide);
  }

  get size(): number {
    let total = 0;
    for (const entries of this.entriesByFormula.values()) total += entries.length;
    return total;
  }

  private bucketsFor(sheetId: string): SheetBuckets {
    let buckets = this.sheets.get(sheetId);
    if (!buckets) {
      buckets = { byColumn: new Map(), wide: new Set() };
      this.sheets.set(sheetId, buckets);
    }
    return buckets;
  }
}

function isWide(range: RangeAddress): boolean {
  return range.right - range.left + 1 > WIDE_RANGE_COLUMNS;
}
