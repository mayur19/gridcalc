import { describe, expect, it } from 'vitest';
import {
  columnToIndex,
  formatA1,
  indexToColumn,
  MAX_COLS,
  normalizeRange,
  parseA1,
  parseRangeA1,
  rangeArea,
  rangeContains,
} from '../src/index.js';

describe('column letters', () => {
  it.each([
    ['A', 0],
    ['Z', 25],
    ['AA', 26],
    ['AZ', 51],
    ['BA', 52],
    ['ZZ', 701],
    ['AAA', 702],
    ['XFD', MAX_COLS - 1],
  ])('%s <-> %i', (letters, index) => {
    expect(columnToIndex(letters)).toBe(index);
    expect(indexToColumn(index)).toBe(letters);
  });

  it('is case-insensitive and round-trips every column', () => {
    expect(columnToIndex('xfd')).toBe(MAX_COLS - 1);
    for (let i = 0; i < 2000; i += 1) expect(columnToIndex(indexToColumn(i))).toBe(i);
  });

  it('rejects invalid input', () => {
    expect(() => columnToIndex('A1')).toThrow(RangeError);
    expect(() => indexToColumn(-1)).toThrow(RangeError);
    expect(() => indexToColumn(1.5)).toThrow(RangeError);
  });
});

describe('parseA1 / formatA1', () => {
  it('parses relative and absolute parts', () => {
    expect(parseA1('B3')).toEqual({ row: 2, col: 1, rowAbsolute: false, colAbsolute: false });
    expect(parseA1('$B$3')).toEqual({ row: 2, col: 1, rowAbsolute: true, colAbsolute: true });
    expect(parseA1('b$3')).toEqual({ row: 2, col: 1, rowAbsolute: true, colAbsolute: false });
    expect(parseA1('$B3')).toEqual({ row: 2, col: 1, rowAbsolute: false, colAbsolute: true });
  });

  it('rejects out-of-bounds and malformed refs', () => {
    expect(parseA1('A0')).toBeNull();
    expect(parseA1('A1048577')).toBeNull();
    expect(parseA1('XFE1')).toBeNull();
    expect(parseA1('1A')).toBeNull();
    expect(parseA1('ABCD1')).toBeNull();
    expect(parseA1('')).toBeNull();
  });

  it('formats with absolute markers', () => {
    expect(formatA1({ row: 9, col: 27, rowAbsolute: true, colAbsolute: false })).toBe('AB$10');
    expect(formatA1({ row: 0, col: 0 })).toBe('A1');
  });
});

describe('ranges', () => {
  it('normalizes reversed corners', () => {
    expect(normalizeRange('s', { row: 5, col: 3 }, { row: 1, col: 0 })).toEqual({
      sheetId: 's',
      top: 1,
      left: 0,
      bottom: 5,
      right: 3,
    });
  });

  it('computes containment and area', () => {
    const range = parseRangeA1('s', 'B2:D4');
    expect(range).not.toBeNull();
    expect(rangeArea(range!)).toBe(9);
    expect(rangeContains(range!, { sheetId: 's', row: 1, col: 1 })).toBe(true);
    expect(rangeContains(range!, { sheetId: 's', row: 4, col: 1 })).toBe(false);
    expect(rangeContains(range!, { sheetId: 'other', row: 2, col: 2 })).toBe(false);
  });

  it('parses single cells and rejects junk', () => {
    expect(parseRangeA1('s', 'C3')).toMatchObject({ top: 2, left: 2, bottom: 2, right: 2 });
    expect(parseRangeA1('s', 'A1:B2:C3')).toBeNull();
    expect(parseRangeA1('s', 'A1:nope')).toBeNull();
    expect(parseRangeA1('s', 'nope')).toBeNull();
  });
});
