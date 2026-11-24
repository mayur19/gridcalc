/**
 * A1-style reference helpers. Rows and columns are zero-based internally;
 * "A1" is { row: 0, col: 0 }.
 */
export const MAX_ROWS = 1_048_576;
export const MAX_COLS = 16_384;

export interface CellRef {
  readonly row: number;
  readonly col: number;
  readonly rowAbsolute: boolean;
  readonly colAbsolute: boolean;
}

export interface CellAddress {
  readonly sheetId: string;
  readonly row: number;
  readonly col: number;
}

export interface RangeAddress {
  readonly sheetId: string;
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

const A1_PATTERN = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})$/;

export function columnToIndex(letters: string): number {
  let index = 0;
  for (const ch of letters.toUpperCase()) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) {
      throw new RangeError(`Invalid column letters: ${letters}`);
    }
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

export function indexToColumn(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`Invalid column index: ${index}`);
  }
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Parses "B3", "$B$3", "b$3". Returns null when the text is not a valid in-bounds A1 ref. */
export function parseA1(text: string): CellRef | null {
  const match = A1_PATTERN.exec(text);
  if (!match) return null;
  const [, colAbs, letters, rowAbs, digits] = match;
  const col = columnToIndex(letters as string);
  const row = Number(digits) - 1;
  if (row < 0 || row >= MAX_ROWS || col >= MAX_COLS) return null;
  return { row, col, rowAbsolute: rowAbs === '$', colAbsolute: colAbs === '$' };
}

export function formatA1(ref: Pick<CellRef, 'row' | 'col'> & Partial<CellRef>): string {
  const col = `${ref.colAbsolute ? '$' : ''}${indexToColumn(ref.col)}`;
  const row = `${ref.rowAbsolute ? '$' : ''}${ref.row + 1}`;
  return col + row;
}

export function normalizeRange(
  sheetId: string,
  a: Pick<CellRef, 'row' | 'col'>,
  b: Pick<CellRef, 'row' | 'col'>,
): RangeAddress {
  return {
    sheetId,
    top: Math.min(a.row, b.row),
    left: Math.min(a.col, b.col),
    bottom: Math.max(a.row, b.row),
    right: Math.max(a.col, b.col),
  };
}

export function rangeContains(range: RangeAddress, cell: CellAddress): boolean {
  return (
    range.sheetId === cell.sheetId &&
    cell.row >= range.top &&
    cell.row <= range.bottom &&
    cell.col >= range.left &&
    cell.col <= range.right
  );
}

export function rangeArea(range: RangeAddress): number {
  return (range.bottom - range.top + 1) * (range.right - range.left + 1);
}

/** Parses "A1:C10" (no sheet prefix) into a normalized range on the given sheet. */
export function parseRangeA1(sheetId: string, text: string): RangeAddress | null {
  const parts = text.split(':');
  if (parts.length === 1) {
    const cell = parseA1(parts[0] as string);
    return cell ? normalizeRange(sheetId, cell, cell) : null;
  }
  if (parts.length !== 2) return null;
  const start = parseA1(parts[0] as string);
  const end = parseA1(parts[1] as string);
  return start && end ? normalizeRange(sheetId, start, end) : null;
}
