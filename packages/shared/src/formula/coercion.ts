import {
  isError,
  isRange,
  makeError,
  type ErrorValue,
  type EvalValue,
  type Scalar,
} from './values.js';

/**
 * Type coercion rules shared by operators and functions.
 * Every function returns either the coerced value or an ErrorValue; nothing throws.
 */
const NUMERIC_TEXT = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*$/;
const PERCENT_TEXT = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*%\s*$/;

export function parseNumericText(text: string): number | null {
  if (NUMERIC_TEXT.test(text)) return Number(text);
  const percent = PERCENT_TEXT.exec(text);
  if (percent) return Number(percent[1]) / 100;
  return null;
}

/** Collapses a range to a scalar: 1x1 ranges yield their only cell, anything else #VALUE!. */
export function toScalar(value: EvalValue): Scalar {
  if (!isRange(value)) return value;
  if (value.rows.length === 1 && value.rows[0]?.length === 1) {
    return value.rows[0][0] as Scalar;
  }
  return makeError('#VALUE!', 'A multi-cell range cannot be used as a single value');
}

export function toNumber(value: EvalValue): number | ErrorValue {
  const scalar = toScalar(value);
  if (scalar === null) return 0;
  if (typeof scalar === 'number') return scalar;
  if (typeof scalar === 'boolean') return scalar ? 1 : 0;
  if (typeof scalar === 'string') {
    if (scalar === '') return 0;
    const parsed = parseNumericText(scalar);
    return parsed === null
      ? makeError('#VALUE!', `Cannot convert "${scalar}" to a number`)
      : parsed;
  }
  return scalar;
}

export function toText(value: EvalValue): string | ErrorValue {
  const scalar = toScalar(value);
  if (scalar === null) return '';
  if (typeof scalar === 'string') return scalar;
  if (typeof scalar === 'number') return formatGeneral(scalar);
  if (typeof scalar === 'boolean') return scalar ? 'TRUE' : 'FALSE';
  return scalar;
}

export function toBoolean(value: EvalValue): boolean | ErrorValue {
  const scalar = toScalar(value);
  if (scalar === null) return false;
  if (typeof scalar === 'boolean') return scalar;
  if (typeof scalar === 'number') return scalar !== 0;
  if (typeof scalar === 'string') {
    const upper = scalar.toUpperCase();
    if (upper === 'TRUE') return true;
    if (upper === 'FALSE') return false;
    return makeError('#VALUE!', `Cannot convert "${scalar}" to a boolean`);
  }
  return scalar;
}

export function toInteger(value: EvalValue): number | ErrorValue {
  const n = toNumber(value);
  return isError(n) ? n : Math.trunc(n);
}

/**
 * "General" number format: integers print as-is, other values are rounded to
 * 15 significant digits (the precision users expect from a spreadsheet) and
 * trailing zeros are removed. 0.1 + 0.2 renders as "0.3".
 */
export function formatGeneral(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : n < 0 ? '-Infinity' : 'NaN';
  if (Object.is(n, -0) || n === 0) return '0';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const abs = Math.abs(n);
  if (abs >= 1e15 || abs < 1e-9) {
    const [mantissa, exponent] = n.toExponential(14).split('e') as [string, string];
    return `${trimZeros(mantissa)}E${/^[+-]/.test(exponent) ? exponent : `+${exponent}`}`;
  }
  return trimZeros(Number(n.toPrecision(15)).toString());
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/** Rounds to 15 significant digits so comparisons ignore binary floating-point noise. */
export function roundSignificant(n: number): number {
  return Number.isFinite(n) && n !== 0 ? Number(n.toPrecision(15)) : n;
}

/**
 * Total order used by comparison operators, MATCH and sorting:
 * numbers < text < booleans; text compares case-insensitively; empty acts as
 * 0 against numbers, "" against text and FALSE against booleans.
 * Returns negative, zero or positive.
 */
export function compareScalars(
  a: Exclude<Scalar, ErrorValue>,
  b: Exclude<Scalar, ErrorValue>,
): number {
  const left = a === null ? emptyLike(b) : a;
  const right = b === null ? emptyLike(a) : b;
  const rankDiff = typeRank(left) - typeRank(right);
  if (rankDiff !== 0) return rankDiff;
  if (typeof left === 'number' && typeof right === 'number') {
    const l = roundSignificant(left);
    const r = roundSignificant(right);
    return l === r ? 0 : l < r ? -1 : 1;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    const l = left.toLowerCase();
    const r = right.toLowerCase();
    return l === r ? 0 : l < r ? -1 : 1;
  }
  return Number(left) - Number(right);
}

function emptyLike(other: Exclude<Scalar, ErrorValue>): number | string | boolean {
  if (typeof other === 'string') return '';
  if (typeof other === 'boolean') return false;
  return 0;
}

function typeRank(value: number | string | boolean | null): number {
  if (typeof value === 'number' || value === null) return 0;
  if (typeof value === 'string') return 1;
  return 2;
}
