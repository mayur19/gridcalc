import { toNumber, toScalar } from '../coercion.js';
import { flatten, isError, makeError, type EvalValue } from '../values.js';
import { buildCriteria } from './criteria.js';
import { asRange, collectNumbers, finite, roundHalfAwayFromZero } from './helpers.js';
import { VARIADIC, type FunctionSpec } from './types.js';

type NumberOp = (n: number) => number | ReturnType<typeof makeError>;

function unaryNumeric(name: string, description: string, op: NumberOp): FunctionSpec {
  return {
    name,
    category: 'math',
    kind: 'eager',
    minArgs: 1,
    maxArgs: 1,
    signature: `${name}(number)`,
    description,
    impl: ([arg]) => {
      const n = toNumber(arg as EvalValue);
      if (isError(n)) return n;
      const result = op(n);
      return isError(result) ? result : finite(result);
    },
  };
}

type RoundMode = 'nearest' | 'up' | 'down';

function rounding(name: string, mode: RoundMode, description: string): FunctionSpec {
  return {
    name,
    category: 'math',
    kind: 'eager',
    minArgs: 1,
    maxArgs: 2,
    signature: `${name}(number, [num_digits])`,
    description,
    impl: ([value, digitsArg = 0]) => {
      const n = toNumber(value as EvalValue);
      if (isError(n)) return n;
      const digitsRaw = toNumber(digitsArg);
      if (isError(digitsRaw)) return digitsRaw;
      const digits = Math.trunc(digitsRaw);
      if (mode === 'nearest') return roundHalfAwayFromZero(n, digits);
      const factor = 10 ** digits;
      const shifted = Number((Math.abs(n) * factor).toPrecision(15));
      const magnitude = mode === 'up' ? Math.ceil(shifted) : Math.floor(shifted);
      return (Math.sign(n) * magnitude) / factor;
    },
  };
}

const sum: FunctionSpec = {
  name: 'SUM',
  category: 'math',
  kind: 'eager',
  minArgs: 1,
  maxArgs: VARIADIC,
  signature: 'SUM(number1, [number2], ...)',
  description: 'Adds all numbers in the arguments and ranges.',
  impl: (args) => {
    const numbers = collectNumbers(args);
    return isError(numbers) ? numbers : finite(numbers.reduce((acc, n) => acc + n, 0));
  },
};

const product: FunctionSpec = {
  name: 'PRODUCT',
  category: 'math',
  kind: 'eager',
  minArgs: 1,
  maxArgs: VARIADIC,
  signature: 'PRODUCT(number1, [number2], ...)',
  description: 'Multiplies all numbers in the arguments and ranges.',
  impl: (args) => {
    const numbers = collectNumbers(args);
    if (isError(numbers)) return numbers;
    return numbers.length === 0 ? 0 : finite(numbers.reduce((acc, n) => acc * n, 1));
  },
};

const mod: FunctionSpec = {
  name: 'MOD',
  category: 'math',
  kind: 'eager',
  minArgs: 2,
  maxArgs: 2,
  signature: 'MOD(number, divisor)',
  description: 'Remainder after division; the result has the sign of the divisor.',
  impl: ([a, b]) => {
    const n = toNumber(a as EvalValue);
    if (isError(n)) return n;
    const d = toNumber(b as EvalValue);
    if (isError(d)) return d;
    if (d === 0) return makeError('#DIV/0!', 'MOD divisor is zero');
    return finite(n - d * Math.floor(n / d));
  },
};

const power: FunctionSpec = {
  name: 'POWER',
  category: 'math',
  kind: 'eager',
  minArgs: 2,
  maxArgs: 2,
  signature: 'POWER(number, power)',
  description: 'Raises a number to a power.',
  impl: ([a, b]) => {
    const base = toNumber(a as EvalValue);
    if (isError(base)) return base;
    const exp = toNumber(b as EvalValue);
    if (isError(exp)) return exp;
    return powerOf(base, exp);
  },
};

export function powerOf(base: number, exp: number): number | ReturnType<typeof makeError> {
  if (base === 0 && exp < 0) return makeError('#DIV/0!', 'Zero raised to a negative power');
  if (base === 0 && exp === 0) return makeError('#NUM!', '0^0 is undefined');
  return finite(base ** exp);
}

const pi: FunctionSpec = {
  name: 'PI',
  category: 'math',
  kind: 'eager',
  minArgs: 0,
  maxArgs: 0,
  signature: 'PI()',
  description: 'The constant pi to 15 digits.',
  impl: () => Math.PI,
};

const sumif: FunctionSpec = {
  name: 'SUMIF',
  category: 'math',
  kind: 'eager',
  minArgs: 2,
  maxArgs: 3,
  signature: 'SUMIF(range, criteria, [sum_range])',
  description: 'Sums cells (or the matching cells of sum_range) that satisfy the criteria.',
  impl: ([rangeArg, criteriaArg, sumRangeArg]) => {
    const range = asRange(rangeArg as EvalValue);
    const criteria = toScalar(criteriaArg as EvalValue);
    const predicate = buildCriteria(criteria);
    const sumRange = sumRangeArg === undefined ? range : asRange(sumRangeArg);
    let total = 0;
    range.rows.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (!predicate(cell)) return;
        const target = sumRange.rows[r]?.[c] ?? null;
        if (typeof target === 'number') total += target;
        else if (isError(target)) total = Number.NaN;
      }),
    );
    if (Number.isNaN(total)) {
      const err = flatten(sumRange).find(isError);
      return err ?? makeError('#VALUE!');
    }
    return finite(total);
  },
};

export const mathFunctions: readonly FunctionSpec[] = [
  sum,
  product,
  mod,
  power,
  pi,
  sumif,
  unaryNumeric('ABS', 'Absolute value of a number.', Math.abs),
  unaryNumeric('INT', 'Rounds a number down to the nearest integer.', Math.floor),
  unaryNumeric('SQRT', 'Positive square root.', (n) =>
    n < 0 ? makeError('#NUM!', 'SQRT of a negative number') : Math.sqrt(n),
  ),
  rounding('ROUND', 'nearest', 'Rounds half away from zero to num_digits.'),
  rounding('ROUNDUP', 'up', 'Rounds away from zero to num_digits.'),
  rounding('ROUNDDOWN', 'down', 'Rounds toward zero to num_digits.'),
];
