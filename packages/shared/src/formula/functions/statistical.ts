import { toScalar } from '../coercion.js';
import { flatten, isError, isRange, makeError, type EvalValue } from '../values.js';
import { buildCriteria } from './criteria.js';
import { asRange, collectNumbers, finite, isNumericLike } from './helpers.js';
import { VARIADIC, type FunctionSpec } from './types.js';

function aggregate(
  name: string,
  description: string,
  reduce: (numbers: number[]) => EvalValue,
): FunctionSpec {
  return {
    name,
    category: 'statistical',
    kind: 'eager',
    minArgs: 1,
    maxArgs: VARIADIC,
    signature: `${name}(number1, [number2], ...)`,
    description,
    impl: (args) => {
      const numbers = collectNumbers(args);
      return isError(numbers) ? numbers : reduce(numbers);
    },
  };
}

const average = aggregate('AVERAGE', 'Arithmetic mean of the numbers.', (numbers) =>
  numbers.length === 0
    ? makeError('#DIV/0!', 'AVERAGE of no numbers')
    : finite(numbers.reduce((a, b) => a + b, 0) / numbers.length),
);

const min = aggregate('MIN', 'Smallest number (0 when there are none).', (numbers) =>
  numbers.length === 0 ? 0 : numbers.reduce((a, b) => (b < a ? b : a)),
);

const max = aggregate('MAX', 'Largest number (0 when there are none).', (numbers) =>
  numbers.length === 0 ? 0 : numbers.reduce((a, b) => (b > a ? b : a)),
);

const count: FunctionSpec = {
  name: 'COUNT',
  category: 'statistical',
  kind: 'eager',
  minArgs: 1,
  maxArgs: VARIADIC,
  signature: 'COUNT(value1, [value2], ...)',
  description: 'Counts numbers; direct numeric text and booleans count, range text does not.',
  impl: (args) =>
    args.reduce<number>((total, arg) => {
      if (isRange(arg)) return total + flatten(arg).filter((v) => typeof v === 'number').length;
      if (typeof arg === 'boolean' || isNumericLike(arg)) return total + 1;
      return total;
    }, 0),
};

const counta: FunctionSpec = {
  name: 'COUNTA',
  category: 'statistical',
  kind: 'eager',
  minArgs: 1,
  maxArgs: VARIADIC,
  signature: 'COUNTA(value1, [value2], ...)',
  description: 'Counts non-empty values, including errors and empty text.',
  impl: (args) =>
    args.reduce<number>((total, arg) => total + flatten(arg).filter((v) => v !== null).length, 0),
};

const countblank: FunctionSpec = {
  name: 'COUNTBLANK',
  category: 'statistical',
  kind: 'eager',
  minArgs: 1,
  maxArgs: 1,
  signature: 'COUNTBLANK(range)',
  description: 'Counts empty cells and cells containing empty text.',
  impl: ([arg]) => flatten(arg as EvalValue).filter((v) => v === null || v === '').length,
};

const countif: FunctionSpec = {
  name: 'COUNTIF',
  category: 'statistical',
  kind: 'eager',
  minArgs: 2,
  maxArgs: 2,
  signature: 'COUNTIF(range, criteria)',
  description: 'Counts cells in the range that satisfy the criteria.',
  impl: ([rangeArg, criteriaArg]) => {
    const predicate = buildCriteria(toScalar(criteriaArg as EvalValue));
    return flatten(asRange(rangeArg as EvalValue)).filter(predicate).length;
  },
};

export const statisticalFunctions: readonly FunctionSpec[] = [
  average,
  min,
  max,
  count,
  counta,
  countblank,
  countif,
];
