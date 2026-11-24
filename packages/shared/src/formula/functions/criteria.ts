import { compareScalars, parseNumericText } from '../coercion.js';
import { isError, type Scalar } from '../values.js';

/**
 * Criteria matching for SUMIF / COUNTIF (and later AVERAGEIF, *IFS).
 * Supported forms: 5, "5", ">5", "<=10", "<>x", "=abc", "a*", "?b", "~*" (escaped wildcard),
 * "" (matches blanks), "<>" (matches non-blanks).
 */
export type Predicate = (value: Scalar) => boolean;

type Operator = '=' | '<>' | '<' | '>' | '<=' | '>=';

const OPERATOR_PATTERN = /^(<=|>=|<>|=|<|>)?([\s\S]*)$/;

export function buildCriteria(criteria: Scalar): Predicate {
  if (isError(criteria)) return (value) => isError(value) && value.code === criteria.code;
  if (typeof criteria === 'number') return numberEquals(criteria);
  if (typeof criteria === 'boolean') return (value) => value === criteria;
  if (criteria === null) return (value) => value === null || value === '';
  const [, rawOp, operand = ''] = OPERATOR_PATTERN.exec(criteria) as RegExpExecArray;
  const op = (rawOp ?? '=') as Operator;
  return buildOperatorPredicate(op, operand);
}

function buildOperatorPredicate(op: Operator, operand: string): Predicate {
  if (operand === '') {
    if (op === '=') return (value) => value === null || value === '';
    if (op === '<>') return (value) => value !== null && value !== '';
  }
  const numeric = parseNumericText(operand);
  if (numeric !== null) return numericPredicate(op, numeric);
  const upper = operand.toUpperCase();
  if ((upper === 'TRUE' || upper === 'FALSE') && (op === '=' || op === '<>')) {
    const bool = upper === 'TRUE';
    return op === '=' ? (value) => value === bool : (value) => value !== bool;
  }
  if (op === '=' || op === '<>') {
    const matcher = wildcardMatcher(operand);
    return op === '='
      ? (value) => typeof value === 'string' && matcher(value)
      : (value) => !(typeof value === 'string' && matcher(value));
  }
  return (value) => typeof value === 'string' && satisfies(op, compareScalars(value, operand));
}

function numberEquals(target: number): Predicate {
  return (value) => {
    if (typeof value === 'number') return compareScalars(value, target) === 0;
    if (typeof value === 'string') {
      const parsed = parseNumericText(value);
      return parsed !== null && compareScalars(parsed, target) === 0;
    }
    return false;
  };
}

function numericPredicate(op: Operator, target: number): Predicate {
  if (op === '=') return numberEquals(target);
  if (op === '<>') {
    const equals = numberEquals(target);
    return (value) => !equals(value);
  }
  return (value) => typeof value === 'number' && satisfies(op, compareScalars(value, target));
}

function satisfies(op: Operator, cmp: number): boolean {
  switch (op) {
    case '<':
      return cmp < 0;
    case '>':
      return cmp > 0;
    case '<=':
      return cmp <= 0;
    case '>=':
      return cmp >= 0;
    case '=':
      return cmp === 0;
    case '<>':
      return cmp !== 0;
  }
}

/** Case-insensitive whole-string match with * (any run), ? (one char) and ~ escapes. */
export function wildcardMatcher(pattern: string): (text: string) => boolean {
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i] as string;
    if (ch === '~' && i + 1 < pattern.length) {
      source += escapeRegex(pattern[i + 1] as string);
      i += 1;
    } else if (ch === '*') {
      source += '[\\s\\S]*';
    } else if (ch === '?') {
      source += '[\\s\\S]';
    } else {
      source += escapeRegex(ch);
    }
  }
  const regex = new RegExp(`^${source}$`, 'i');
  return (text) => regex.test(text);
}

export function hasWildcard(pattern: string): boolean {
  return /[*?~]/.test(pattern);
}

function escapeRegex(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
