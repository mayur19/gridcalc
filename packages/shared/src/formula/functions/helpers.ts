import { parseNumericText, toNumber } from '../coercion.js';
import {
  isError,
  isRange,
  makeError,
  type ErrorValue,
  type EvalValue,
  type RangeValue,
  type Scalar,
} from '../values.js';

/**
 * Collects numeric arguments the way aggregate functions (SUM, AVERAGE, MIN...) expect:
 * - direct scalar arguments are coerced (TRUE -> 1, "3" -> 3, non-numeric text -> #VALUE!)
 * - cells inside ranges count only when they hold numbers; text, booleans and blanks are skipped
 * - any error encountered is returned immediately (leftmost error wins)
 */
export function collectNumbers(args: readonly EvalValue[]): number[] | ErrorValue {
  const numbers: number[] = [];
  for (const arg of args) {
    if (isRange(arg)) {
      for (const row of arg.rows) {
        for (const cell of row) {
          if (isError(cell)) return cell;
          if (typeof cell === 'number') numbers.push(cell);
        }
      }
      continue;
    }
    if (arg === null) continue;
    const n = toNumber(arg);
    if (isError(n)) return n;
    numbers.push(n);
  }
  return numbers;
}

export function finite(n: number): number | ErrorValue {
  return Number.isFinite(n) ? n : makeError('#NUM!', 'Result is not a finite number');
}

export function asRange(value: EvalValue): RangeValue {
  return isRange(value) ? value : { kind: 'range', rows: [[value]] };
}

export function isNumericLike(value: Scalar): boolean {
  return (
    typeof value === 'number' || (typeof value === 'string' && parseNumericText(value) !== null)
  );
}

/** Rounds half away from zero at the given number of decimal digits (negative digits allowed). */
export function roundHalfAwayFromZero(n: number, digits: number): number {
  const factor = 10 ** digits;
  const shifted = Number((Math.abs(n) * factor).toPrecision(15));
  return (Math.sign(n) * Math.round(shifted)) / factor;
}
