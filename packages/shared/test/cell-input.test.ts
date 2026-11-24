import { describe, expect, it } from 'vitest';
import {
  parseCellInput,
  toCellValueDto,
  makeError,
  isRange,
  flatten,
  scalarEquals,
} from '../src/index.js';

describe('parseCellInput', () => {
  it.each([
    ['', { kind: 'empty' }],
    ['42', { kind: 'value', value: 42 }],
    ['-1.5e2', { kind: 'value', value: -150 }],
    ['15%', { kind: 'value', value: 0.15 }],
    ['true', { kind: 'value', value: true }],
    ["'123", { kind: 'value', value: '123' }],
    ['hello', { kind: 'value', value: 'hello' }],
    ['=', { kind: 'value', value: '=' }],
  ])('%j', (raw, expected) => {
    expect(parseCellInput(raw)).toEqual(expected);
  });

  it('parses formulas and error literals', () => {
    expect(parseCellInput('=1+1')).toMatchObject({ kind: 'formula', ast: { type: 'binary' } });
    expect(parseCellInput('#n/a')).toMatchObject({ kind: 'value', value: { code: '#N/A' } });
  });

  it('reports formula syntax errors with 0-based raw offsets including "="', () => {
    expect(parseCellInput('=1+')).toEqual({
      kind: 'invalid-formula',
      message: 'Unexpected end of formula',
      position: 3,
    });
  });
});

describe('value helpers', () => {
  it('converts scalars to wire DTOs', () => {
    expect(toCellValueDto(null)).toEqual({ type: 'empty', value: null });
    expect(toCellValueDto(1)).toEqual({ type: 'number', value: 1 });
    expect(toCellValueDto('a')).toEqual({ type: 'string', value: 'a' });
    expect(toCellValueDto(false)).toEqual({ type: 'boolean', value: false });
    expect(toCellValueDto(makeError('#N/A'))).toEqual({ type: 'error', value: '#N/A' });
    expect(toCellValueDto(makeError('#DIV/0!', 'x'))).toEqual({
      type: 'error',
      value: '#DIV/0!',
      message: 'x',
    });
  });

  it('compares scalars structurally', () => {
    expect(scalarEquals(makeError('#N/A'), makeError('#N/A', 'other message'))).toBe(true);
    expect(scalarEquals(makeError('#N/A'), 1)).toBe(false);
    expect(scalarEquals(NaN, NaN)).toBe(true);
    expect(scalarEquals(1, 1)).toBe(true);
    expect(scalarEquals('1', 1)).toBe(false);
  });

  it('flattens values', () => {
    expect(flatten(3)).toEqual([3]);
    expect(isRange(3)).toBe(false);
  });
});
