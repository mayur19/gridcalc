import { parseA1 } from './references.js';
import { ERROR_CODES, type ErrorCode } from './values.js';

/**
 * Lexer for the gridcalc formula language (the text after the leading "=").
 * Single pass, O(n) in the length of the input, no backtracking beyond one
 * character of lookahead.
 */
export type TokenType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'error'
  | 'cell'
  | 'sheet'
  | 'function'
  | 'name'
  | 'operator'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'eof';

export interface Token {
  readonly type: TokenType;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** Normalized payload: numeric value, unquoted string, upper-cased name, sheet name, ... */
  readonly value?: string | number | boolean;
}

export class FormulaSyntaxError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
    this.name = 'FormulaSyntaxError';
  }
}

export const MAX_FORMULA_LENGTH = 8192;

const TWO_CHAR_OPERATORS = new Set(['<=', '>=', '<>']);
const ONE_CHAR_OPERATORS = new Set(['+', '-', '*', '/', '^', '&', '=', '<', '>', '%', ':']);
const WORD_START = /[A-Za-z_$\\]/;
const WORD_CHAR = /[A-Za-z0-9_.$\\]/;
const NUMBER_PATTERN = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const WHITESPACE = /\s/;

export function tokenize(input: string): Token[] {
  if (input.length > MAX_FORMULA_LENGTH) {
    throw new FormulaSyntaxError(`Formula exceeds ${MAX_FORMULA_LENGTH} characters`, 0);
  }
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < input.length) {
    const ch = input[pos] as string;
    if (WHITESPACE.test(ch)) {
      pos += 1;
      continue;
    }
    const token = readToken(input, pos);
    tokens.push(token);
    pos = token.end;
  }
  tokens.push({ type: 'eof', text: '', start: input.length, end: input.length });
  return tokens;
}

function readToken(input: string, pos: number): Token {
  const ch = input[pos] as string;
  if (ch === '"') return readString(input, pos);
  if (ch === "'") return readQuotedSheet(input, pos);
  if (ch === '#') return readError(input, pos);
  if (/[0-9.]/.test(ch)) return readNumber(input, pos);
  if (WORD_START.test(ch)) return readWord(input, pos);
  if (ch === '(') return { type: 'lparen', text: ch, start: pos, end: pos + 1 };
  if (ch === ')') return { type: 'rparen', text: ch, start: pos, end: pos + 1 };
  if (ch === ',') return { type: 'comma', text: ch, start: pos, end: pos + 1 };
  const two = input.slice(pos, pos + 2);
  if (TWO_CHAR_OPERATORS.has(two)) {
    return { type: 'operator', text: two, start: pos, end: pos + 2, value: two };
  }
  if (ONE_CHAR_OPERATORS.has(ch)) {
    return { type: 'operator', text: ch, start: pos, end: pos + 1, value: ch };
  }
  throw new FormulaSyntaxError(`Unexpected character '${ch}'`, pos);
}

function readString(input: string, start: number): Token {
  let pos = start + 1;
  let value = '';
  while (pos < input.length) {
    const ch = input[pos] as string;
    if (ch === '"') {
      if (input[pos + 1] === '"') {
        value += '"';
        pos += 2;
        continue;
      }
      return { type: 'string', text: input.slice(start, pos + 1), start, end: pos + 1, value };
    }
    value += ch;
    pos += 1;
  }
  throw new FormulaSyntaxError('Unterminated string literal', start);
}

function readQuotedSheet(input: string, start: number): Token {
  let pos = start + 1;
  let name = '';
  while (pos < input.length) {
    const ch = input[pos] as string;
    if (ch === "'") {
      if (input[pos + 1] === "'") {
        name += "'";
        pos += 2;
        continue;
      }
      if (input[pos + 1] !== '!') {
        throw new FormulaSyntaxError("Quoted sheet name must be followed by '!'", pos + 1);
      }
      if (name.length === 0) throw new FormulaSyntaxError('Empty sheet name', start);
      return { type: 'sheet', text: input.slice(start, pos + 2), start, end: pos + 2, value: name };
    }
    name += ch;
    pos += 1;
  }
  throw new FormulaSyntaxError('Unterminated quoted sheet name', start);
}

function readError(input: string, start: number): Token {
  const upper = input.slice(start, start + 8).toUpperCase();
  const code = [...ERROR_CODES]
    .sort((a, b) => b.length - a.length)
    .find((candidate) => upper.startsWith(candidate)) as ErrorCode | undefined;
  if (!code) throw new FormulaSyntaxError('Unknown error literal', start);
  return { type: 'error', text: code, start, end: start + code.length, value: code };
}

function readNumber(input: string, start: number): Token {
  const match = NUMBER_PATTERN.exec(input.slice(start));
  if (!match) throw new FormulaSyntaxError(`Unexpected character '${input[start]}'`, start);
  const text = match[0];
  return { type: 'number', text, start, end: start + text.length, value: Number(text) };
}

function readWord(input: string, start: number): Token {
  let pos = start;
  while (pos < input.length && WORD_CHAR.test(input[pos] as string)) pos += 1;
  const text = input.slice(start, pos);
  const next = input[pos];
  if (next === '!') {
    return { type: 'sheet', text: input.slice(start, pos + 1), start, end: pos + 1, value: text };
  }
  if (next === '(' && !text.includes('$')) {
    return { type: 'function', text, start, end: pos, value: text.toUpperCase() };
  }
  const upper = text.toUpperCase();
  if (upper === 'TRUE' || upper === 'FALSE') {
    return { type: 'boolean', text, start, end: pos, value: upper === 'TRUE' };
  }
  if (parseA1(text)) {
    return { type: 'cell', text, start, end: pos, value: text.toUpperCase() };
  }
  if (text.includes('$')) {
    throw new FormulaSyntaxError(`Invalid reference '${text}'`, start);
  }
  return { type: 'name', text, start, end: pos, value: upper };
}
