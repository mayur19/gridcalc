import type { AstNode, BinaryOperator } from './ast.js';
import { compareScalars, roundSignificant, toNumber, toScalar, toText } from './coercion.js';
import { powerOf } from './functions/math.js';
import { getFunction } from './functions/registry.js';
import { normalizeRange, rangeArea, type CellRef } from './references.js';
import { isError, makeError, type ErrorValue, type EvalValue, type Scalar } from './values.js';

/**
 * Tree-walking evaluator. Pure with respect to its context: the only way it reads
 * workbook state is through EvaluationContext, which makes it trivially testable
 * and lets the recalculation engine control ordering.
 */
export interface EvaluationContext {
  readonly currentSheetId: string;
  /** Maps a sheet name used in a formula to a sheet id, or null when no such sheet exists. */
  resolveSheet(name: string): string | null;
  getCellValue(sheetId: string, row: number, col: number): Scalar;
}

/** Guard against accidental whole-sheet materialization (e.g. A1:XFD1048576). */
export const MAX_RANGE_CELLS = 2_000_000;

export function evaluate(node: AstNode, ctx: EvaluationContext): EvalValue {
  switch (node.type) {
    case 'number':
    case 'string':
    case 'boolean':
      return node.value;
    case 'error':
      return makeError(node.code);
    case 'missing':
      return null;
    case 'cell':
      return evaluateCell(node.sheet, node.ref, ctx);
    case 'range':
      return evaluateRange(node.sheet, node.start, node.end, ctx);
    case 'name':
      return makeError('#NAME?', `Unknown name '${node.name}'`);
    case 'unary':
      return evaluateUnary(node.op, evaluate(node.operand, ctx));
    case 'percent': {
      const n = toNumber(evaluate(node.operand, ctx));
      return isError(n) ? n : n / 100;
    }
    case 'binary':
      return evaluateBinary(node.op, evaluate(node.left, ctx), evaluate(node.right, ctx));
    case 'call':
      return evaluateCall(node.name, node.args, ctx);
  }
}

/** Evaluates a formula to the single value stored in its cell. */
export function evaluateToScalar(node: AstNode, ctx: EvaluationContext): Scalar {
  return toScalar(evaluate(node, ctx));
}

function resolveSheetId(sheet: string | null, ctx: EvaluationContext): string | ErrorValue {
  if (sheet === null) return ctx.currentSheetId;
  return ctx.resolveSheet(sheet) ?? makeError('#REF!', `Unknown sheet '${sheet}'`);
}

function evaluateCell(sheet: string | null, ref: CellRef, ctx: EvaluationContext): Scalar {
  const sheetId = resolveSheetId(sheet, ctx);
  if (isError(sheetId)) return sheetId;
  return ctx.getCellValue(sheetId, ref.row, ref.col);
}

function evaluateRange(
  sheet: string | null,
  start: CellRef,
  end: CellRef,
  ctx: EvaluationContext,
): EvalValue {
  const sheetId = resolveSheetId(sheet, ctx);
  if (isError(sheetId)) return sheetId;
  const range = normalizeRange(sheetId, start, end);
  if (rangeArea(range) > MAX_RANGE_CELLS) {
    return makeError('#NUM!', `Ranges are limited to ${MAX_RANGE_CELLS} cells`);
  }
  const rows: Scalar[][] = [];
  for (let r = range.top; r <= range.bottom; r += 1) {
    const row: Scalar[] = [];
    for (let c = range.left; c <= range.right; c += 1) {
      row.push(ctx.getCellValue(sheetId, r, c));
    }
    rows.push(row);
  }
  return { kind: 'range', rows };
}

function evaluateUnary(op: '+' | '-', operand: EvalValue): EvalValue {
  const n = toNumber(operand);
  if (isError(n)) return n;
  return op === '-' ? -n : n;
}

export function evaluateBinary(
  op: BinaryOperator,
  leftValue: EvalValue,
  rightValue: EvalValue,
): Scalar {
  const left = toScalar(leftValue);
  const right = toScalar(rightValue);
  if (isError(left)) return left;
  if (isError(right)) return right;
  if (op === '&') {
    const l = toText(left) as string;
    const r = toText(right) as string;
    return l + r;
  }
  if (op === '=' || op === '<>' || op === '<' || op === '>' || op === '<=' || op === '>=') {
    return compare(op, compareScalars(left, right));
  }
  const l = toNumber(left);
  if (isError(l)) return l;
  const r = toNumber(right);
  if (isError(r)) return r;
  return arithmetic(op, l, r);
}

function compare(op: '=' | '<>' | '<' | '>' | '<=' | '>=', cmp: number): boolean {
  switch (op) {
    case '=':
      return cmp === 0;
    case '<>':
      return cmp !== 0;
    case '<':
      return cmp < 0;
    case '>':
      return cmp > 0;
    case '<=':
      return cmp <= 0;
    case '>=':
      return cmp >= 0;
  }
}

function arithmetic(op: '+' | '-' | '*' | '/' | '^', l: number, r: number): Scalar {
  let result: number;
  switch (op) {
    case '+':
      result = l + r;
      break;
    case '-':
      // Subtraction is rounded to 15 significant digits so 0.3 - 0.1 - 0.2 yields 0.
      result = roundSignificant(l - r);
      break;
    case '*':
      result = l * r;
      break;
    case '/':
      if (r === 0) return makeError('#DIV/0!', 'Division by zero');
      result = l / r;
      break;
    case '^':
      return powerOf(l, r);
  }
  return Number.isFinite(result) ? result : makeError('#NUM!', 'Result is not a finite number');
}

function evaluateCall(name: string, args: readonly AstNode[], ctx: EvaluationContext): EvalValue {
  const spec = getFunction(name);
  if (!spec) return makeError('#NAME?', `Unknown function '${name}'`);
  if (args.length < spec.minArgs || args.length > spec.maxArgs) {
    return makeError('#VALUE!', `${spec.name} expects ${arityText(spec.minArgs, spec.maxArgs)}`);
  }
  if (spec.kind === 'lazy') {
    return spec.impl(args, (arg) => evaluate(arg, ctx));
  }
  // A bare cell reference argument behaves like a 1x1 range (so SUM(A1) ignores text in A1),
  // whereas a literal argument is coerced (so SUM("x") is #VALUE!).
  return spec.impl(
    args.map((arg) => {
      const value = evaluate(arg, ctx);
      return arg.type === 'cell' && !isError(value)
        ? { kind: 'range', rows: [[value as Scalar]] }
        : value;
    }),
  );
}

function arityText(min: number, max: number): string {
  if (min === max) return `${min} argument${min === 1 ? '' : 's'}`;
  return max >= 255
    ? `at least ${min} argument${min === 1 ? '' : 's'}`
    : `${min} to ${max} arguments`;
}
