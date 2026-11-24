import type { CellAddress } from '../formula/references.js';

/** Compact string identity for a cell, used as a Map key throughout the engine. */
export type CellKey = string;

const SEPARATOR = '|';

export function cellKey(sheetId: string, row: number, col: number): CellKey {
  return `${sheetId}${SEPARATOR}${row}${SEPARATOR}${col}`;
}

export function addressKey(address: CellAddress): CellKey {
  return cellKey(address.sheetId, address.row, address.col);
}

export function parseCellKey(key: CellKey): CellAddress {
  const colSep = key.lastIndexOf(SEPARATOR);
  const rowSep = key.lastIndexOf(SEPARATOR, colSep - 1);
  return {
    sheetId: key.slice(0, rowSep),
    row: Number(key.slice(rowSep + 1, colSep)),
    col: Number(key.slice(colSep + 1)),
  };
}
