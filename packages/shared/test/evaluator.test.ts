import { describe, expect, it } from 'vitest';
import { evaluateBinary, formatGeneral, makeError, MAX_RANGE_CELLS } from '../src/index.js';
import { calc, errorCode, evalRaw } from './helpers.js';

describe('arithmetic', () => {
  it.each([
    ['=1+2*3', 7],
    ['=(1+2)*3', 9],
    ['=2^3^2', 64],
    ['=-2^2', 4],
    ['=10/4', 2.5],
    ['=50%', 0.5],
    ['=200*10%', 20],
    ['=-(-3)', 3],
    ['=+"4"', 4],
    ['=0.3-0.1-0.2', 0],
    ['="3"+"4"', 7],
    ['=TRUE+TRUE', 2],
    ['=" 5 "*2', 10],
    ['="10%"*10', 1],
  ])('%s = %s', (formula, expected) => {
    expect(calc(formula)).toBe(expected);
  });

  it('treats empty cells as zero', () => {
    expect(calc('=A1+5')).toBe(5);
  });

  it('produces spreadsheet errors', () => {
    expect(errorCode(calc('=1/0'))).toBe('#DIV/0!');
    expect(errorCode(calc('="abc"+1'))).toBe('#VALUE!');
    expect(errorCode(calc('=0^0'))).toBe('#NUM!');
    expect(errorCode(calc('=0^-1'))).toBe('#DIV/0!');
    expect(errorCode(calc('=10^400'))).toBe('#NUM!');
    expect(errorCode(calc('=1e308*10'))).toBe('#NUM!');
    expect(errorCode(calc('=-"x"'))).toBe('#VALUE!');
    expect(errorCode(calc('="x"%'))).toBe('#VALUE!');
  });

  it('propagates the leftmost error', () => {
    expect(errorCode(calc('=#N/A+1/0'))).toBe('#N/A');
    expect(errorCode(calc('=1/0+#N/A'))).toBe('#DIV/0!');
    expect(errorCode(calc('=A1*2', { A1: '#REF!' }))).toBe('#REF!');
    expect(errorCode(calc('=1+#NAME?'))).toBe('#NAME?');
  });
});

describe('text and comparison', () => {
  it.each([
    ['="a"&"b"', 'ab'],
    ['=1&2', '12'],
    ['=TRUE&"x"', 'TRUEx'],
    ['=0.1+0.2&""', '0.3'],
    ['=1=1', true],
    ['="ABC"="abc"', true],
    ['="a"<"b"', true],
    ['=2<"1"', true],
    ['="z"<TRUE', true],
    ['=1<>2', true],
    ['=3>=3', true],
    ['=2<=1', false],
    ['=2>1', true],
    ['=0.1+0.2=0.3', true],
  ])('%s = %s', (formula, expected) => {
    expect(calc(formula)).toBe(expected);
  });

  it('compares empty cells as 0, "" or FALSE depending on the other side', () => {
    expect(calc('=A1=0')).toBe(true);
    expect(calc('=A1=""')).toBe(true);
    expect(calc('=A1=FALSE')).toBe(true);
    expect(calc('=A1=B1')).toBe(true);
  });

  it('propagates errors through comparisons and concatenation', () => {
    expect(errorCode(calc('=1/0=1'))).toBe('#DIV/0!');
    expect(errorCode(calc('="a"&#N/A'))).toBe('#N/A');
  });
});

describe('references and ranges', () => {
  it('reads values from other sheets case-insensitively', () => {
    expect(calc('=DATA!A1*2', { 'Data!A1': '21' })).toBe(42);
  });

  it('returns #REF! for unknown sheets and #NAME? for names/functions', () => {
    expect(errorCode(calc('=Nope!A1'))).toBe('#REF!');
    expect(errorCode(calc('=SUM(Nope!A1:A2)'))).toBe('#REF!');
    expect(errorCode(calc('=Revenue*2'))).toBe('#NAME?');
    expect(errorCode(calc('=FOO(1)'))).toBe('#NAME?');
  });

  it('collapses 1x1 ranges and rejects multi-cell ranges as scalars', () => {
    expect(calc('=A1:A1+1', { A1: '4' })).toBe(5);
    expect(errorCode(calc('=A1:A2', { A1: '1' }))).toBe('#VALUE!');
  });

  it('materializes ranges row-major', () => {
    expect(evalRaw('=A1:B2', { A1: 1, B1: 2, A2: 3 })).toEqual({
      kind: 'range',
      rows: [
        [1, 2],
        [3, null],
      ],
    });
  });

  it('refuses gigantic ranges', () => {
    expect(MAX_RANGE_CELLS).toBeGreaterThan(1_000_000);
    expect(errorCode(evalRaw('=SUM(A1:XFD1048576)'))).toBe('#NUM!');
  });

  it('checks function arity', () => {
    expect(errorCode(calc('=ABS()'))).toBe('#VALUE!');
    expect(errorCode(calc('=ABS(1,2)'))).toBe('#VALUE!');
    expect(errorCode(calc('=ROUND(1,2,3)'))).toBe('#VALUE!');
    expect(errorCode(calc('=SUMIF()'))).toBe('#VALUE!');
    expect(errorCode(calc('=PI(1)'))).toBe('#VALUE!');
  });

  it('evaluates error literals and missing args', () => {
    expect(errorCode(calc('=#NULL!'))).toBe('#NULL!');
    expect(evaluateBinary('+', makeError('#N/A'), 1)).toMatchObject({ code: '#N/A' });
  });
});

describe('formatGeneral', () => {
  it.each([
    [0, '0'],
    [-0, '0'],
    [42, '42'],
    [-7.5, '-7.5'],
    [0.1 + 0.2, '0.3'],
    [1 / 3, '0.333333333333333'],
    [1e21, '1E+21'],
    [1.5e-12, '1.5E-12'],
    [123456789012345680, '1.23456789012346E+17'],
    [Infinity, 'Infinity'],
    [-Infinity, '-Infinity'],
    [NaN, 'NaN'],
  ])('%s -> %s', (n, text) => {
    expect(formatGeneral(n)).toBe(text);
  });
});
