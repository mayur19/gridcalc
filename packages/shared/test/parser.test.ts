import { describe, expect, it } from 'vitest';
import {
  MAX_DEPTH,
  parseFormula,
  printFormula,
  tryParseFormula,
  type AstNode,
} from '../src/index.js';

const p = (src: string) => printFormula(parseFormula(src));

describe('parser precedence and associativity', () => {
  it.each([
    ['1+2*3', '1+(2*3)'],
    ['(1+2)*3', '(1+2)*3'],
    ['1-2-3', '(1-2)-3'],
    ['8/4/2', '(8/4)/2'],
    ['2^3^2', '(2^3)^2'],
    ['-2^2', '(-2)^2'],
    ['2^-1', '2^(-1)'],
    ['50%*2', '50%*2'],
    ['-5%', '(-5)%'],
    ['1+2&"x"', '(1+2)&"x"'],
    ['1&2=3', '(1&2)=3'],
    ['A1<>B1', 'A1<>B1'],
    ['1+2<=3*4', '(1+2)<=(3*4)'],
    ['+A1', '+A1'],
  ])('%s => %s', (src, printed) => {
    expect(p(src)).toBe(printed);
  });
});

describe('references', () => {
  it('parses cell, range and sheet-qualified references', () => {
    expect(parseFormula('$A$1')).toEqual({
      type: 'cell',
      sheet: null,
      ref: { row: 0, col: 0, rowAbsolute: true, colAbsolute: true },
    });
    const range = parseFormula('Data!A1:B$5') as Extract<AstNode, { type: 'range' }>;
    expect(range.type).toBe('range');
    expect(range.sheet).toBe('Data');
    expect(range.end).toMatchObject({ row: 4, col: 1, rowAbsolute: true });
  });

  it('prints quoted sheet names when needed', () => {
    expect(p("'My Sheet'!A1")).toBe("'My Sheet'!A1");
    expect(p("'It''s'!A1:B2")).toBe("'It''s'!A1:B2");
    expect(p('Data!C3')).toBe('Data!C3');
  });

  it('rejects malformed ranges', () => {
    expect(tryParseFormula('1:A2')).toMatchObject({
      ok: false,
      message: expect.stringContaining('Range start'),
    });
    expect(tryParseFormula('A1:Data!B2')).toMatchObject({
      ok: false,
      message: expect.stringContaining('Sheet name'),
    });
    expect(tryParseFormula('A1:5')).toMatchObject({ ok: false });
    expect(tryParseFormula('Data!5')).toMatchObject({
      ok: false,
      message: expect.stringContaining('cell reference'),
    });
  });
});

describe('function calls', () => {
  it('parses zero, one and many arguments', () => {
    expect(parseFormula('PI()')).toEqual({ type: 'call', name: 'PI', args: [] });
    expect(p('sum(A1:A3, 2, MAX(1,2))')).toBe('SUM(A1:A3,2,MAX(1,2))');
  });

  it('supports omitted arguments', () => {
    const call = parseFormula('IF(A1,,1)') as Extract<AstNode, { type: 'call' }>;
    expect(call.args.map((a) => a.type)).toEqual(['cell', 'missing', 'number']);
    expect(p('IF(A1,1,)')).toBe('IF(A1,1,)');
  });

  it('reports a missing separator', () => {
    expect(tryParseFormula('SUM(1 2)')).toMatchObject({
      ok: false,
      message: "Expected ',' or ')' but found '2'",
    });
    expect(tryParseFormula('SUM(1')).toMatchObject({
      ok: false,
      message: expect.stringContaining('end of formula'),
    });
  });

  it('limits argument count', () => {
    expect(tryParseFormula(`SUM(${Array(300).fill('1').join(',')})`)).toMatchObject({ ok: false });
  });
});

describe('literals and errors', () => {
  it('parses literals', () => {
    expect(parseFormula('"a"')).toEqual({ type: 'string', value: 'a' });
    expect(parseFormula('TRUE')).toEqual({ type: 'boolean', value: true });
    expect(parseFormula('#N/A')).toEqual({ type: 'error', code: '#N/A' });
    expect(parseFormula('Revenue')).toEqual({ type: 'name', name: 'REVENUE' });
    expect(p('"q""uote"')).toBe('"q""uote"');
    expect(p('FALSE')).toBe('FALSE');
    expect(p('#REF!')).toBe('#REF!');
  });

  it.each([
    ['', 'end of formula'],
    ['1+', 'end of formula'],
    ['(1', "Expected ')'"],
    ['1)', "Unexpected ')'"],
    ['*2', "Unexpected '*'"],
    [',', "Unexpected ','"],
  ])('rejects %j', (src, message) => {
    const result = tryParseFormula(src);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(message);
  });

  it('bounds nesting depth', () => {
    const deep = `${'('.repeat(MAX_DEPTH + 1)}1${')'.repeat(MAX_DEPTH + 1)}`;
    expect(tryParseFormula(deep)).toMatchObject({
      ok: false,
      message: expect.stringContaining('nesting'),
    });
    const ok = `${'('.repeat(MAX_DEPTH - 2)}1${')'.repeat(MAX_DEPTH - 2)}`;
    expect(tryParseFormula(ok).ok).toBe(true);
  });

  it('rethrows non-syntax errors', () => {
    expect(() => tryParseFormula(null as unknown as string)).toThrow(TypeError);
  });
});

describe('printer round-trip', () => {
  it.each([
    'SUM(A1:B2)*2',
    "'Q 1'!A1+Data!$B$2",
    'IF(A1>0,"pos",IF(A1<0,"neg","zero"))',
    '-(1+2)%',
    '(A1&B1)=C1',
  ])('parse(print(parse(%s))) is stable', (src) => {
    const once = parseFormula(src);
    expect(parseFormula(printFormula(once))).toEqual(once);
  });
});
