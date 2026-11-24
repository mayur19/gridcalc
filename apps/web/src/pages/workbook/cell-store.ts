import type { CellDto } from '@gridcalc/shared';
import { cellKeyOf } from './cell-display';

/** Per-sheet cell maps. Updates always return new maps (React state stays immutable). */
export type SheetCells = ReadonlyMap<string, CellDto>;
export type CellStore = ReadonlyMap<string, SheetCells>;

export function sheetFromList(cells: readonly CellDto[]): SheetCells {
  return new Map(cells.map((cell) => [cellKeyOf(cell.row, cell.col), cell] as const));
}

/** Applies server-confirmed changes; cleared cells (raw "") are removed. Unloaded sheets are skipped. */
export function applyChanges(store: CellStore, changed: readonly CellDto[]): CellStore {
  const next = new Map(store);
  const bySheet = new Map<string, CellDto[]>();
  for (const cell of changed)
    bySheet.set(cell.sheetId, [...(bySheet.get(cell.sheetId) ?? []), cell]);
  for (const [sheetId, cells] of bySheet) {
    const current = next.get(sheetId);
    if (!current) continue;
    const sheet = new Map(current);
    for (const cell of cells) {
      const key = cellKeyOf(cell.row, cell.col);
      if (cell.raw === '') sheet.delete(key);
      else sheet.set(key, cell);
    }
    next.set(sheetId, sheet);
  }
  return next;
}
