import type { AstNode } from '../ast.js';
import { toBoolean, toScalar } from '../coercion.js';
import { isError, isRange, makeError, type EvalValue, type Scalar } from '../values.js';
import { VARIADIC, type FunctionSpec } from './types.js';

const ifFn: FunctionSpec = {
  name: 'IF',
  category: 'logical',
  kind: 'lazy',
  minArgs: 2,
  maxArgs: 3,
  signature: 'IF(condition, value_if_true, [value_if_false])',
  description: 'Returns one value when the condition is TRUE and another when it is FALSE.',
  impl: (args, evaluateArg) => {
    const condition = toBoolean(evaluateArg(args[0] as AstNode));
    if (isError(condition)) return condition;
    if (condition) return valueOrZero(evaluateArg(args[1] as AstNode));
    return args.length < 3 ? false : valueOrZero(evaluateArg(args[2] as AstNode));
  },
};

/** An omitted IF branch (IF(A1,,1)) yields 0 rather than blank. */
function valueOrZero(value: EvalValue): EvalValue {
  return value === null ? 0 : value;
}

const iferror: FunctionSpec = {
  name: 'IFERROR',
  category: 'logical',
  kind: 'lazy',
  minArgs: 2,
  maxArgs: 2,
  signature: 'IFERROR(value, value_if_error)',
  description: 'Returns value_if_error when value is any error, otherwise value.',
  impl: (args, evaluateArg) => {
    const value = evaluateArg(args[0] as AstNode);
    return isError(value) ? evaluateArg(args[1] as AstNode) : value;
  },
};

function collectBooleans(args: readonly EvalValue[]): boolean[] | ReturnType<typeof makeError> {
  const out: boolean[] = [];
  for (const arg of args) {
    if (isRange(arg)) {
      for (const row of arg.rows) {
        for (const cell of row) {
          if (isError(cell)) return cell;
          if (typeof cell === 'boolean') out.push(cell);
          else if (typeof cell === 'number') out.push(cell !== 0);
        }
      }
      continue;
    }
    if (arg === null) continue;
    const b = toBoolean(arg);
    if (isError(b)) return b;
    out.push(b);
  }
  return out;
}

function logicalFold(name: 'AND' | 'OR'): FunctionSpec {
  return {
    name,
    category: 'logical',
    kind: 'eager',
    minArgs: 1,
    maxArgs: VARIADIC,
    signature: `${name}(logical1, [logical2], ...)`,
    description:
      name === 'AND' ? 'TRUE when every argument is TRUE.' : 'TRUE when any argument is TRUE.',
    impl: (args) => {
      const values = collectBooleans(args);
      if (isError(values)) return values;
      if (values.length === 0) return makeError('#VALUE!', `${name} received no logical values`);
      return name === 'AND' ? values.every(Boolean) : values.some(Boolean);
    },
  };
}

const not: FunctionSpec = {
  name: 'NOT',
  category: 'logical',
  kind: 'eager',
  minArgs: 1,
  maxArgs: 1,
  signature: 'NOT(logical)',
  description: 'Reverses a logical value.',
  impl: ([arg]) => {
    const b = toBoolean(arg as EvalValue);
    return isError(b) ? b : !b;
  },
};

function predicate(
  name: string,
  description: string,
  test: (value: Scalar) => boolean,
): FunctionSpec {
  return {
    name,
    category: 'info',
    kind: 'eager',
    minArgs: 1,
    maxArgs: 1,
    signature: `${name}(value)`,
    description,
    impl: ([arg]) => test(toScalar(arg as EvalValue)),
  };
}

export const logicalFunctions: readonly FunctionSpec[] = [
  ifFn,
  iferror,
  logicalFold('AND'),
  logicalFold('OR'),
  not,
  predicate('ISBLANK', 'TRUE when the value refers to an empty cell.', (v) => v === null),
  predicate('ISNUMBER', 'TRUE when the value is a number.', (v) => typeof v === 'number'),
  predicate('ISTEXT', 'TRUE when the value is text.', (v) => typeof v === 'string'),
  predicate('ISERROR', 'TRUE when the value is any error.', (v) => isError(v)),
  predicate(
    'ISNA',
    'TRUE when the value is the #N/A error.',
    (v) => isError(v) && v.code === '#N/A',
  ),
];
