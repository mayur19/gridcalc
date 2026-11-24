import type { AstNode } from '../ast.js';
import type { EvalValue } from '../values.js';

export type FunctionCategory = 'math' | 'statistical' | 'logical' | 'text' | 'lookup' | 'info';

interface BaseSpec {
  readonly name: string;
  readonly category: FunctionCategory;
  readonly minArgs: number;
  readonly maxArgs: number;
  readonly signature: string;
  readonly description: string;
}

/** Eager functions receive fully evaluated arguments (ranges stay as RangeValue). */
export interface EagerFunctionSpec extends BaseSpec {
  readonly kind: 'eager';
  readonly impl: (args: readonly EvalValue[]) => EvalValue;
}

/** Lazy functions (IF, IFERROR, CHOOSE) decide which arguments to evaluate. */
export interface LazyFunctionSpec extends BaseSpec {
  readonly kind: 'lazy';
  readonly impl: (args: readonly AstNode[], evaluateArg: (node: AstNode) => EvalValue) => EvalValue;
}

export type FunctionSpec = EagerFunctionSpec | LazyFunctionSpec;

export const VARIADIC = 255;
