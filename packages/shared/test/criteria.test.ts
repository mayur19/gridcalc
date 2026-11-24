import { describe, expect, it } from 'vitest';
import { makeError } from '../src/index.js';
import { buildCriteria, hasWildcard, wildcardMatcher } from '../src/formula/functions/criteria.js';

describe('buildCriteria', () => {
  it.each([
    ['>5', 6, true],
    ['>5', 5, false],
    ['>=5', 5, true],
    ['<5', 4, true],
    ['<=5', 6, false],
    ['=5', 5, true],
    ['=5', '5', true],
    ['<>5', 5, false],
    ['<>5', 'x', true],
    ['>5', '9', false],
    ['abc', 'ABC', true],
    ['a*', 'apple', true],
    ['a?c', 'abc', true],
    ['a?c', 'abbc', false],
    ['~*', '*', true],
    ['~*', 'x', false],
    ['<>a*', 'banana', true],
    ['<>a*', 'apple', false],
    ['<>a*', 3, true],
    ['>b', 'c', true],
    ['>b', 'a', false],
    ['>b', 5, false],
    ['TRUE', true, true],
    ['<>FALSE', true, true],
    ['', null, true],
    ['', '', true],
    ['', 'x', false],
    ['=', null, true],
    ['<>', 'x', true],
    ['<>', null, false],
    ['10%', 0.1, true],
  ])('criteria %j vs %j -> %s', (criteria, value, expected) => {
    expect(buildCriteria(criteria)(value)).toBe(expected);
  });

  it('handles non-string criteria', () => {
    expect(buildCriteria(3)(3)).toBe(true);
    expect(buildCriteria(3)('3')).toBe(true);
    expect(buildCriteria(3)('x')).toBe(false);
    expect(buildCriteria(3)(true)).toBe(false);
    expect(buildCriteria(true)(true)).toBe(true);
    expect(buildCriteria(null)(null)).toBe(true);
    expect(buildCriteria(makeError('#N/A'))(makeError('#N/A'))).toBe(true);
    expect(buildCriteria(makeError('#N/A'))(1)).toBe(false);
  });
});

describe('wildcards', () => {
  it('escapes regex metacharacters', () => {
    expect(wildcardMatcher('a.b(c)')('a.b(c)')).toBe(true);
    expect(wildcardMatcher('a.b')('axb')).toBe(false);
    expect(hasWildcard('plain')).toBe(false);
    expect(hasWildcard('pl*n')).toBe(true);
  });
});
