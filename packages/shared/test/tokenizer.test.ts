import { describe, expect, it } from 'vitest';
import { FormulaSyntaxError, MAX_FORMULA_LENGTH, tokenize } from '../src/index.js';

const types = (input: string) => tokenize(input).map((t) => t.type);
const texts = (input: string) => tokenize(input).map((t) => t.text);

describe('tokenize', () => {
  it('lexes numbers in all supported shapes', () => {
    const values = tokenize('1 2.5 .5 3. 1e3 2.5E-2')
      .filter((t) => t.type === 'number')
      .map((t) => t.value);
    expect(values).toEqual([1, 2.5, 0.5, 3, 1000, 0.025]);
  });

  it('lexes strings with doubled quotes', () => {
    const [token] = tokenize('"say ""hi"""');
    expect(token).toMatchObject({ type: 'string', value: 'say "hi"' });
  });

  it('distinguishes cells, functions, names and booleans', () => {
    expect(types('A1 $B$2 SUM( LOG10( Revenue true FALSE')).toEqual([
      'cell',
      'cell',
      'function',
      'lparen',
      'function',
      'lparen',
      'name',
      'boolean',
      'boolean',
      'eof',
    ]);
  });

  it('upper-cases function names and cell refs', () => {
    const tokens = tokenize('sum(b2)');
    expect(tokens[0]?.value).toBe('SUM');
    expect(tokens[2]?.value).toBe('B2');
  });

  it('lexes sheet prefixes, quoted and unquoted', () => {
    const tokens = tokenize("Data!A1 'Q1 ''24'!B2");
    expect(tokens[0]).toMatchObject({ type: 'sheet', value: 'Data' });
    expect(tokens[2]).toMatchObject({ type: 'sheet', value: "Q1 '24" });
    expect(tokens[3]).toMatchObject({ type: 'cell', text: 'B2' });
  });

  it('lexes operators greedily', () => {
    expect(texts('1<=2<>3>=4<5>6=7&8%').filter((t) => !/\d/.test(t) && t !== '')).toEqual([
      '<=',
      '<>',
      '>=',
      '<',
      '>',
      '=',
      '&',
      '%',
    ]);
  });

  it('lexes error literals', () => {
    const codes = tokenize('#DIV/0! #N/A #name? #REF!').map((t) => t.value);
    expect(codes.slice(0, 4)).toEqual(['#DIV/0!', '#N/A', '#NAME?', '#REF!']);
  });

  it('records source positions', () => {
    const tokens = tokenize('  SUM(A1)');
    expect(tokens[0]).toMatchObject({ start: 2, end: 5 });
    expect(tokens.at(-1)).toMatchObject({ type: 'eof', start: 9 });
  });

  it.each([
    ['"open', 'Unterminated string literal'],
    ["'Sheet", 'Unterminated quoted sheet name'],
    ["'Sheet'A1", "must be followed by '!'"],
    ["''!A1", 'Empty sheet name'],
    ['#BOGUS', 'Unknown error literal'],
    ['A1 @ B2', "Unexpected character '@'"],
    ['$Foo', "Invalid reference '$Foo'"],
  ])('rejects %s', (input, message) => {
    expect(() => tokenize(input)).toThrow(FormulaSyntaxError);
    expect(() => tokenize(input)).toThrow(message);
  });

  it('enforces the maximum formula length', () => {
    expect(() => tokenize('1+'.repeat(MAX_FORMULA_LENGTH))).toThrow('exceeds');
  });

  it('treats out-of-range refs as names', () => {
    expect(tokenize('XFE1')[0]?.type).toBe('name');
  });
});
