/**
 * Runtime value model of the formula language.
 *
 * A scalar is a JS primitive (number, string, boolean), `null` for an empty cell,
 * or an ErrorValue. Ranges evaluate to a RangeValue (row-major 2D array).
 */
export const ERROR_CODES = [
  '#DIV/0!',
  '#VALUE!',
  '#REF!',
  '#NAME?',
  '#N/A',
  '#NUM!',
  '#NULL!',
  '#CYCLE!',
  '#ERROR!',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorValue {
  readonly kind: 'error';
  readonly code: ErrorCode;
  readonly message?: string;
}

export type Scalar = number | string | boolean | null | ErrorValue;

export interface RangeValue {
  readonly kind: 'range';
  readonly rows: readonly (readonly Scalar[])[];
}

export type EvalValue = Scalar | RangeValue;

export function makeError(code: ErrorCode, message?: string): ErrorValue {
  return message === undefined
    ? Object.freeze({ kind: 'error', code })
    : Object.freeze({ kind: 'error', code, message });
}

export function isError(value: unknown): value is ErrorValue {
  return (
    typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'error'
  );
}

export function isRange(value: EvalValue): value is RangeValue {
  return typeof value === 'object' && value !== null && value.kind === 'range';
}

export function isErrorCode(text: string): text is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(text);
}

/** Structural equality used by the recalculation engine to detect changed values. */
export function scalarEquals(a: Scalar, b: Scalar): boolean {
  if (isError(a) || isError(b)) {
    return isError(a) && isError(b) && a.code === b.code;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a === b || (Number.isNaN(a) && Number.isNaN(b));
  }
  return a === b;
}

/** Flattens a value into a list of scalars (row-major for ranges). */
export function flatten(value: EvalValue): Scalar[] {
  if (!isRange(value)) return [value];
  const out: Scalar[] = [];
  for (const row of value.rows) {
    for (const cell of row) out.push(cell);
  }
  return out;
}

export function rangeDimensions(range: RangeValue): { rows: number; cols: number } {
  return { rows: range.rows.length, cols: range.rows[0]?.length ?? 0 };
}
