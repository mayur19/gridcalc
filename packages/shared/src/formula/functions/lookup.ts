import type { AstNode } from '../ast.js';
import { compareScalars, toInteger, toBoolean, toScalar } from '../coercion.js';
import {
  isError,
  makeError,
  rangeDimensions,
  type ErrorValue,
  type EvalValue,
  type Scalar,
} from '../values.js';
import { hasWildcard, wildcardMatcher } from './criteria.js';
import { asRange } from './helpers.js';
import { VARIADIC, type FunctionSpec } from './types.js';

type MatchMode = 1 | 0 | -1;

/**
 * Finds the position of `lookup` in a one-dimensional vector.
 * mode 0  : exact match (linear, O(n)), text supports * ? ~ wildcards.
 * mode 1  : largest value <= lookup in ascending data (binary search, O(log n)).
 * mode -1 : smallest value >= lookup in descending data (binary search, O(log n)).
 * Returns -1 when there is no match.
 */
export function findPosition(vector: readonly Scalar[], lookup: Scalar, mode: MatchMode): number {
  if (isError(lookup)) return -1;
  if (mode === 0) return exactPosition(vector, lookup);
  let lo = 0;
  let hi = vector.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const cell = vector[mid] as Scalar;
    const cmp = isError(cell) || cell === null ? 1 : compareScalars(cell, lookup);
    const acceptable = mode === 1 ? cmp <= 0 : cmp >= 0;
    if (acceptable) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function exactPosition(vector: readonly Scalar[], lookup: Exclude<Scalar, ErrorValue>): number {
  if (typeof lookup === 'string' && hasWildcard(lookup)) {
    const matches = wildcardMatcher(lookup);
    return vector.findIndex((cell) => typeof cell === 'string' && matches(cell));
  }
  return vector.findIndex(
    (cell) =>
      cell !== null &&
      !isError(cell) &&
      typeof cell === typeof lookup &&
      compareScalars(cell, lookup) === 0,
  );
}

function parseMatchMode(value: EvalValue | undefined): MatchMode | ErrorValue {
  if (value === undefined || value === null) return 1;
  const n = toInteger(value);
  if (isError(n)) return n;
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

const notFound = (): ErrorValue => makeError('#N/A', 'Lookup value not found');

const match: FunctionSpec = {
  name: 'MATCH',
  category: 'lookup',
  kind: 'eager',
  minArgs: 2,
  maxArgs: 3,
  signature: 'MATCH(lookup_value, lookup_array, [match_type])',
  description: 'Relative 1-based position of a value in a single row or column.',
  impl: ([lookupArg, arrayArg, modeArg]) => {
    const lookup = toScalar(lookupArg as EvalValue);
    if (isError(lookup)) return lookup;
    const range = asRange(arrayArg as EvalValue);
    const { rows, cols } = rangeDimensions(range);
    if (rows > 1 && cols > 1) return makeError('#N/A', 'lookup_array must be one row or column');
    const vector = rows === 1 ? (range.rows[0] as Scalar[]) : range.rows.map((r) => r[0] as Scalar);
    const mode = parseMatchMode(modeArg);
    if (isError(mode)) return mode;
    const index = findPosition(vector, lookup, mode);
    return index < 0 ? notFound() : index + 1;
  },
};

function tableLookup(orientation: 'V' | 'H'): FunctionSpec {
  const name = `${orientation}LOOKUP`;
  return {
    name,
    category: 'lookup',
    kind: 'eager',
    minArgs: 3,
    maxArgs: 4,
    signature: `${name}(lookup_value, table, ${orientation === 'V' ? 'col' : 'row'}_index, [approximate])`,
    description: `Searches the first ${orientation === 'V' ? 'column' : 'row'} of a table and returns a value from the same ${orientation === 'V' ? 'row' : 'column'}.`,
    impl: ([lookupArg, tableArg, indexArg, approxArg]) => {
      const lookup = toScalar(lookupArg as EvalValue);
      if (isError(lookup)) return lookup;
      const table = asRange(tableArg as EvalValue);
      const index = toInteger(indexArg as EvalValue);
      if (isError(index)) return index;
      const approximate = approxArg === undefined ? true : toBoolean(approxArg);
      if (isError(approximate)) return approximate;
      const { rows, cols } = rangeDimensions(table);
      const span = orientation === 'V' ? cols : rows;
      if (index < 1) return makeError('#VALUE!', 'Index must be >= 1');
      if (index > span) return makeError('#REF!', 'Index is outside the table');
      const keys =
        orientation === 'V' ? table.rows.map((r) => r[0] as Scalar) : (table.rows[0] as Scalar[]);
      const position = findPosition(keys, lookup, approximate ? 1 : 0);
      if (position < 0) return notFound();
      return orientation === 'V'
        ? (table.rows[position]?.[index - 1] ?? null)
        : (table.rows[index - 1]?.[position] ?? null);
    },
  };
}

const index: FunctionSpec = {
  name: 'INDEX',
  category: 'lookup',
  kind: 'eager',
  minArgs: 2,
  maxArgs: 3,
  signature: 'INDEX(array, row_num, [column_num])',
  description:
    'Value at the given 1-based row and column of a range (0 selects a whole row/column).',
  impl: ([arrayArg, rowArg, colArg]) => {
    const range = asRange(arrayArg as EvalValue);
    const dims = rangeDimensions(range);
    let row = toInteger(rowArg as EvalValue);
    if (isError(row)) return row;
    let col = colArg === undefined ? 1 : toInteger(colArg);
    if (isError(col)) return col;
    if (colArg === undefined && dims.rows === 1 && dims.cols > 1) {
      col = row;
      row = 1;
    }
    if (row < 0 || col < 0 || row > dims.rows || col > dims.cols) {
      return makeError('#REF!', 'INDEX position is outside the range');
    }
    if (row === 0 && col === 0) return range;
    if (row === 0) return { kind: 'range', rows: range.rows.map((r) => [r[col - 1] as Scalar]) };
    if (col === 0) return { kind: 'range', rows: [range.rows[row - 1] as Scalar[]] };
    return range.rows[row - 1]?.[col - 1] ?? null;
  },
};

const choose: FunctionSpec = {
  name: 'CHOOSE',
  category: 'lookup',
  kind: 'lazy',
  minArgs: 2,
  maxArgs: VARIADIC,
  signature: 'CHOOSE(index_num, value1, [value2], ...)',
  description: 'Returns the index_num-th value from the list; only that argument is evaluated.',
  impl: (args, evaluateArg) => {
    const position = toInteger(evaluateArg(args[0] as AstNode));
    if (isError(position)) return position;
    if (position < 1 || position >= args.length) {
      return makeError('#VALUE!', 'CHOOSE index is out of range');
    }
    return evaluateArg(args[position] as AstNode);
  },
};

export const lookupFunctions: readonly FunctionSpec[] = [
  match,
  tableLookup('V'),
  tableLookup('H'),
  index,
  choose,
];
