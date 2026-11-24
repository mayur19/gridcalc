import { describe, expect, it } from 'vitest';
import { getFunction, listFunctions } from '../src/index.js';
import { calc, errorCode, evalRaw } from './helpers.js';

const grid = {
  A1: '10',
  A2: '20',
  A3: 'text',
  A4: 'TRUE',
  A5: '',
  A6: '5',
  B1: '1',
  B2: '2',
  B3: '3',
  B4: '4',
  B6: '6',
};

describe('math', () => {
  it.each([
    ['=SUM(A1:A6)', 35],
    ['=SUM(1,"2",TRUE)', 4],
    ['=SUM(A1:A2,B1:B2,100)', 133],
    ['=PRODUCT(B1:B4)', 24],
    ['=PRODUCT(A3)', 0],
    ['=ABS(-3.5)', 3.5],
    ['=INT(-2.5)', -3],
    ['=MOD(10,3)', 1],
    ['=MOD(-10,3)', 2],
    ['=MOD(10,-3)', -2],
    ['=POWER(2,10)', 1024],
    ['=SQRT(16)', 4],
    ['=ROUND(2.5,0)', 3],
    ['=ROUND(-2.5,0)', -3],
    ['=ROUND(1.005,2)', 1.01],
    ['=ROUND(1234.5678,-2)', 1200],
    ['=ROUND(2.345)', 2],
    ['=ROUNDUP(1.21,1)', 1.3],
    ['=ROUNDUP(-1.21,1)', -1.3],
    ['=ROUNDDOWN(1.29,1)', 1.2],
    ['=ROUNDDOWN(-1.29,1)', -1.2],
    ['=SUMIF(A1:A6,">8")', 30],
    ['=SUMIF(A1:A6,">=5",B1:B6)', 9],
    ['=SUMIF(A1:A6,"text",B1:B6)', 3],
    ['=SUMIF(A1:A6,"<>10")', 25],
  ])('%s = %s', (formula, expected) => {
    expect(calc(formula, grid)).toBe(expected);
  });

  it('returns PI', () => {
    expect(calc('=PI()')).toBeCloseTo(3.14159265358979, 12);
  });

  it('reports math errors', () => {
    expect(errorCode(calc('=SUM(A1,1/0)'))).toBe('#DIV/0!');
    expect(errorCode(calc('=SUM("abc")'))).toBe('#VALUE!');
    expect(errorCode(calc('=SUM(A1:A2)', { A2: '#N/A' }))).toBe('#N/A');
    expect(errorCode(calc('=MOD(1,0)'))).toBe('#DIV/0!');
    expect(errorCode(calc('=SQRT(-1)'))).toBe('#NUM!');
    expect(errorCode(calc('=POWER(0,-1)'))).toBe('#DIV/0!');
    expect(errorCode(calc('=ABS("x")'))).toBe('#VALUE!');
    expect(errorCode(calc('=ROUND("x",1)'))).toBe('#VALUE!');
    expect(errorCode(calc('=ROUND(1,"x")'))).toBe('#VALUE!');
    expect(errorCode(calc('=MOD("x",1)'))).toBe('#VALUE!');
    expect(errorCode(calc('=MOD(1,"x")'))).toBe('#VALUE!');
    expect(errorCode(calc('=POWER("x",1)'))).toBe('#VALUE!');
    expect(errorCode(calc('=POWER(1,"x")'))).toBe('#VALUE!');
    expect(errorCode(calc('=PRODUCT(1/0)'))).toBe('#DIV/0!');
    expect(errorCode(calc('=SUMIF(A1:A2,">0",B1:B2)', { A1: '1', A2: '2', B2: '#N/A' }))).toBe(
      '#N/A',
    );
  });
});

describe('statistical', () => {
  it.each([
    ['=AVERAGE(A1:A6)', 35 / 3],
    ['=AVERAGE(2,4,"6")', 4],
    ['=MIN(A1:A6)', 5],
    ['=MAX(A1:A6,25)', 25],
    ['=MIN(A3:A5)', 0],
    ['=MAX(A3)', 0],
    ['=COUNT(A1:A6)', 3],
    ['=COUNT(1,"2","x",TRUE)', 3],
    ['=COUNTA(A1:A6)', 5],
    ['=COUNTA(1,"",A5)', 2],
    ['=COUNTBLANK(A1:A6)', 1],
    ['=COUNTIF(A1:A6,">=10")', 2],
    ['=COUNTIF(A1:A6,"te*")', 1],
    ['=COUNTIF(A1:A6,TRUE)', 1],
    ['=COUNTIF(A1:A6,"")', 1],
    ['=COUNTIF(A1:A6,"<>")', 5],
    ['=COUNTIF(A1:A6,10)', 1],
  ])('%s = %s', (formula, expected) => {
    expect(calc(formula, grid)).toBeCloseTo(expected as number, 10);
  });

  it('AVERAGE of nothing is #DIV/0!', () => {
    expect(errorCode(calc('=AVERAGE(A3:A5)', grid))).toBe('#DIV/0!');
    expect(errorCode(calc('=AVERAGE(A1:A2)', { A1: '#VALUE!' }))).toBe('#VALUE!');
  });
});

describe('logical and info', () => {
  it.each([
    ['=IF(A1>5,"big","small")', 'big'],
    ['=IF(A6>5,"big","small")', 'small'],
    ['=IF(FALSE,1)', false],
    ['=IF(TRUE,,1)', 0],
    ['=IF(1,"yes")', 'yes'],
    ['=IFERROR(1/0,"oops")', 'oops'],
    ['=IFERROR(7,"oops")', 7],
    ['=AND(TRUE,1,A1:A2)', true],
    ['=AND(TRUE,FALSE)', false],
    ['=OR(FALSE,0,B1)', true],
    ['=OR(A3:A3,FALSE)', false],
    ['=NOT(0)', true],
    ['=NOT("true")', false],
    ['=ISBLANK(A5)', true],
    ['=ISBLANK(A3)', false],
    ['=ISNUMBER(A1)', true],
    ['=ISTEXT(A3)', true],
    ['=ISERROR(1/0)', true],
    ['=ISERROR(1)', false],
    ['=ISNA(#N/A)', true],
    ['=ISNA(1/0)', false],
  ])('%s = %s', (formula, expected) => {
    expect(calc(formula, grid)).toBe(expected);
  });

  it('IF and CHOOSE only evaluate the selected branch', () => {
    // The unselected branch would be an error if evaluated.
    expect(calc('=IF(TRUE,1,1/0)')).toBe(1);
    expect(calc('=CHOOSE(2,1/0,"two",#N/A)')).toBe('two');
  });

  it('reports logical errors', () => {
    expect(errorCode(calc('=IF("maybe",1,2)'))).toBe('#VALUE!');
    expect(errorCode(calc('=AND(A3)', grid))).toBe('#VALUE!');
    expect(errorCode(calc('=AND("x")'))).toBe('#VALUE!');
    expect(errorCode(calc('=OR(A1:A2)', { A1: '#N/A' }))).toBe('#N/A');
    expect(errorCode(calc('=NOT("x")'))).toBe('#VALUE!');
    expect(errorCode(calc('=AND(A5)', grid))).toBe('#VALUE!');
  });
});

describe('text', () => {
  it.each([
    ['=CONCAT("a",1,TRUE)', 'a1TRUE'],
    ['=CONCAT(B1:B3)', '123'],
    ['=CONCATENATE("x","y")', 'xy'],
    ['=LEN("héllo")', 5],
    ['=LEN(A5)', 0],
    ['=LEFT("spreadsheet",6)', 'spread'],
    ['=LEFT("abc")', 'a'],
    ['=RIGHT("spreadsheet",5)', 'sheet'],
    ['=RIGHT("abc",10)', 'abc'],
    ['=MID("spreadsheet",7,5)', 'sheet'],
    ['=MID("abc",5,2)', ''],
    ['=UPPER("MiXed")', 'MIXED'],
    ['=LOWER("MiXed")', 'mixed'],
    ['=TRIM("  a   b  ")', 'a b'],
    ['=LEN(12.5)', 4],
  ])('%s = %s', (formula, expected) => {
    expect(calc(formula, grid)).toBe(expected);
  });

  it('reports text errors', () => {
    expect(errorCode(calc('=LEFT("abc",-1)'))).toBe('#VALUE!');
    expect(errorCode(calc('=LEFT("abc","x")'))).toBe('#VALUE!');
    expect(errorCode(calc('=LEFT(1/0)'))).toBe('#DIV/0!');
    expect(errorCode(calc('=MID("abc",0,1)'))).toBe('#VALUE!');
    expect(errorCode(calc('=MID(1/0,1,1)'))).toBe('#DIV/0!');
    expect(errorCode(calc('=MID("a","x",1)'))).toBe('#VALUE!');
    expect(errorCode(calc('=MID("a",1,"x")'))).toBe('#VALUE!');
    expect(errorCode(calc('=UPPER(1/0)'))).toBe('#DIV/0!');
    expect(errorCode(calc('=CONCAT("a",#N/A)'))).toBe('#N/A');
    expect(errorCode(calc('=CONCAT(A1:A2)', { A1: 'x', A2: '#REF!' }))).toBe('#REF!');
  });

  it('limits concatenated text length', () => {
    const big = 'x'.repeat(8000);
    expect(errorCode(calc(`=CONCAT(A1,A1,A1,A1,A1)`, { A1: big }))).toBe('#VALUE!');
  });
});

describe('lookup', () => {
  const table = {
    D1: '1',
    E1: 'one',
    D2: '5',
    E2: 'five',
    D3: '10',
    E3: 'ten',
    D4: '20',
    E4: 'twenty',
    G1: 'apple',
    G2: 'Banana',
    G3: 'cherry',
    H1: '30',
    H2: '20',
    H3: '10',
  };

  it.each([
    ['=VLOOKUP(5,D1:E4,2,FALSE)', 'five'],
    ['=VLOOKUP(7,D1:E4,2)', 'five'],
    ['=VLOOKUP(7,D1:E4,2,TRUE)', 'five'],
    ['=VLOOKUP(100,D1:E4,2)', 'twenty'],
    ['=VLOOKUP(10,D1:E4,1,0)', 10],
    ['=HLOOKUP("apple",G1:H3,3,FALSE)', 'cherry'],
    ['=MATCH(10,D1:D4,0)', 3],
    ['=MATCH(12,D1:D4)', 3],
    ['=MATCH(12,D1:D4,1)', 3],
    ['=MATCH(15,H1:H3,-1)', 2],
    ['=MATCH("banana",G1:G3,0)', 2],
    ['=MATCH("ch*",G1:G3,0)', 3],
    ['=MATCH(20,D4:E4,0)', 1],
    ['=INDEX(D1:E4,3,2)', 'ten'],
    ['=INDEX(D1:D4,2)', 5],
    ['=INDEX(D1:E1,2)', 'one'],
    ['=SUM(INDEX(D1:E4,0,1))', 36],
    ['=CONCAT(INDEX(D1:E4,2,0))', '5five'],
    ['=SUM(INDEX(D1:D4,0,0))', 36],
    ['=INDEX(D1:E4,MATCH(10,D1:D4,0),2)', 'ten'],
    ['=CHOOSE(3,"a","b","c")', 'c'],
  ])('%s = %s', (formula, expected) => {
    expect(calc(formula, table)).toBe(expected);
  });

  it('HLOOKUP searches the first row', () => {
    expect(
      calc('=HLOOKUP("b",A1:C2,2,FALSE)', { A1: 'a', B1: 'b', C1: 'c', A2: '1', B2: '2', C2: '3' }),
    ).toBe(2);
    expect(
      calc('=HLOOKUP("bz",A1:C2,2)', { A1: 'a', B1: 'b', C1: 'c', A2: '1', B2: '2', C2: '3' }),
    ).toBe(2);
  });

  it('returns lookup errors', () => {
    expect(errorCode(calc('=VLOOKUP(0,D1:E4,2)', table))).toBe('#N/A');
    expect(errorCode(calc('=VLOOKUP(6,D1:E4,2,FALSE)', table))).toBe('#N/A');
    expect(errorCode(calc('=VLOOKUP(5,D1:E4,3,FALSE)', table))).toBe('#REF!');
    expect(errorCode(calc('=VLOOKUP(5,D1:E4,0,FALSE)', table))).toBe('#VALUE!');
    expect(errorCode(calc('=VLOOKUP(1/0,D1:E4,2)', table))).toBe('#DIV/0!');
    expect(errorCode(calc('=VLOOKUP(5,D1:E4,"x")', table))).toBe('#VALUE!');
    expect(errorCode(calc('=VLOOKUP(5,D1:E4,2,"maybe")', table))).toBe('#VALUE!');
    expect(errorCode(calc('=MATCH(1,D1:E4,0)', table))).toBe('#N/A');
    expect(errorCode(calc('=MATCH("zzz",G1:G3,0)', table))).toBe('#N/A');
    expect(errorCode(calc('=MATCH(1/0,G1:G3,0)', table))).toBe('#DIV/0!');
    expect(errorCode(calc('=MATCH(1,G1:G3,"x")', table))).toBe('#VALUE!');
    expect(errorCode(calc('=INDEX(D1:E4,5,1)', table))).toBe('#REF!');
    expect(errorCode(calc('=INDEX(D1:E4,-1)', table))).toBe('#REF!');
    expect(errorCode(calc('=INDEX(D1:E4,"x")', table))).toBe('#VALUE!');
    expect(errorCode(calc('=INDEX(D1:E4,1,"x")', table))).toBe('#VALUE!');
    expect(errorCode(calc('=CHOOSE(4,"a","b","c")'))).toBe('#VALUE!');
    expect(errorCode(calc('=CHOOSE("x","a")'))).toBe('#VALUE!');
  });

  it('INDEX of a scalar treats it as a 1x1 range', () => {
    expect(evalRaw('=INDEX(7,1,1)')).toBe(7);
  });

  it('approximate MATCH skips blanks and errors safely', () => {
    expect(calc('=MATCH(4,A1:A4)', { A1: '1', A2: '#N/A', A3: '3', A4: '5' })).toBeTypeOf('number');
  });
});

describe('registry', () => {
  it('exposes a sorted catalog with at least 40 functions', () => {
    const catalog = listFunctions();
    expect(catalog.length).toBeGreaterThanOrEqual(40);
    const names = catalog.map((f) => f.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(new Set(names).size).toBe(names.length);
    for (const fn of catalog) {
      expect(fn.signature.startsWith(fn.name)).toBe(true);
      expect(fn.description.length).toBeGreaterThan(5);
      expect(fn.minArgs).toBeLessThanOrEqual(fn.maxArgs);
    }
  });

  it('looks functions up case-insensitively', () => {
    expect(getFunction('vlookup')?.name).toBe('VLOOKUP');
    expect(getFunction('nope')).toBeUndefined();
  });
});
