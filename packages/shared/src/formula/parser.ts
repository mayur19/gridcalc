import type { AstNode, BinaryOperator } from './ast.js';
import { parseA1, type CellRef } from './references.js';
import { FormulaSyntaxError, tokenize, type Token } from './tokenizer.js';
import type { ErrorCode } from './values.js';

/**
 * Pratt (top-down operator precedence) parser.
 *
 * Precedence follows spreadsheet convention, lowest to highest:
 *   comparison (= <> < > <= >=)  10
 *   concatenation (&)            20
 *   additive (+ -)               30
 *   multiplicative (* /)         40
 *   exponent (^, left-assoc)     50
 *   percent (postfix %)          60
 *   unary minus / plus           70   (so -2^2 = 4, as in common spreadsheet tools)
 *   range (:)                    80
 *
 * Nesting depth is bounded (MAX_DEPTH) so a hostile formula cannot exhaust the stack.
 */
export const MAX_DEPTH = 64;
export const MAX_ARGS = 255;

const BINARY_POWER: Readonly<Record<string, number>> = {
  '=': 10,
  '<>': 10,
  '<': 10,
  '>': 10,
  '<=': 10,
  '>=': 10,
  '&': 20,
  '+': 30,
  '-': 30,
  '*': 40,
  '/': 40,
  '^': 50,
};
const PERCENT_POWER = 60;
const PREFIX_POWER = 70;
const RANGE_POWER = 80;

class Parser {
  private index = 0;
  private depth = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parseFormula(): AstNode {
    const node = this.parseExpression(0);
    const next = this.peek();
    if (next.type !== 'eof') {
      throw new FormulaSyntaxError(`Unexpected '${next.text}'`, next.start);
    }
    return node;
  }

  private peek(): Token {
    return this.tokens[this.index] as Token;
  }

  private advance(): Token {
    const token = this.peek();
    if (token.type !== 'eof') this.index += 1;
    return token;
  }

  private expect(type: Token['type'], description: string): Token {
    const token = this.peek();
    if (token.type !== type) {
      const found = token.type === 'eof' ? 'end of formula' : `'${token.text}'`;
      throw new FormulaSyntaxError(`Expected ${description} but found ${found}`, token.start);
    }
    return this.advance();
  }

  private parseExpression(minPower: number): AstNode {
    this.depth += 1;
    if (this.depth > MAX_DEPTH) {
      throw new FormulaSyntaxError(
        `Formula nesting exceeds ${MAX_DEPTH} levels`,
        this.peek().start,
      );
    }
    let left = this.parsePrefix();
    for (;;) {
      const token = this.peek();
      if (token.type !== 'operator') break;
      const op = token.text;
      if (op === ':') {
        if (RANGE_POWER < minPower) break;
        this.advance();
        left = this.parseRange(left, token);
        continue;
      }
      if (op === '%') {
        if (PERCENT_POWER < minPower) break;
        this.advance();
        left = { type: 'percent', operand: left };
        continue;
      }
      const power = BINARY_POWER[op];
      if (power === undefined || power < minPower) break;
      this.advance();
      // All binary operators are left-associative: the right side binds strictly tighter.
      const right = this.parseExpression(power + 1);
      left = { type: 'binary', op: op as BinaryOperator, left, right };
    }
    this.depth -= 1;
    return left;
  }

  private parsePrefix(): AstNode {
    const token = this.advance();
    switch (token.type) {
      case 'number':
        return { type: 'number', value: token.value as number };
      case 'string':
        return { type: 'string', value: token.value as string };
      case 'boolean':
        return { type: 'boolean', value: token.value as boolean };
      case 'error':
        return { type: 'error', code: token.value as ErrorCode };
      case 'cell':
        return { type: 'cell', sheet: null, ref: toRef(token) };
      case 'sheet':
        return this.parseSheetReference(token);
      case 'name':
        return { type: 'name', name: token.value as string };
      case 'function':
        return this.parseCall(token);
      case 'lparen': {
        const inner = this.parseExpression(0);
        this.expect('rparen', "')'");
        return inner;
      }
      case 'operator':
        if (token.text === '-' || token.text === '+') {
          const operand = this.parseExpression(PREFIX_POWER);
          return { type: 'unary', op: token.text, operand };
        }
        break;
      default:
        break;
    }
    const found = token.type === 'eof' ? 'end of formula' : `'${token.text}'`;
    throw new FormulaSyntaxError(`Unexpected ${found}`, token.start);
  }

  private parseSheetReference(sheetToken: Token): AstNode {
    const cellToken = this.expect('cell', 'a cell reference after sheet name');
    return { type: 'cell', sheet: sheetToken.value as string, ref: toRef(cellToken) };
  }

  private parseRange(left: AstNode, colon: Token): AstNode {
    if (left.type !== 'cell') {
      throw new FormulaSyntaxError('Range start must be a cell reference', colon.start);
    }
    const next = this.peek();
    if (next.type === 'sheet') {
      throw new FormulaSyntaxError('Sheet name is only allowed before the range start', next.start);
    }
    const endToken = this.expect('cell', 'a cell reference after ":"');
    return { type: 'range', sheet: left.sheet, start: left.ref, end: toRef(endToken) };
  }

  private parseCall(nameToken: Token): AstNode {
    this.expect('lparen', "'('");
    const args: AstNode[] = [];
    if (this.peek().type === 'rparen') {
      this.advance();
      return { type: 'call', name: nameToken.value as string, args };
    }
    for (;;) {
      const token = this.peek();
      if (token.type === 'comma' || token.type === 'rparen') {
        args.push({ type: 'missing' });
      } else {
        args.push(this.parseExpression(0));
      }
      if (args.length > MAX_ARGS) {
        throw new FormulaSyntaxError(`Too many arguments (max ${MAX_ARGS})`, token.start);
      }
      const separator = this.advance();
      if (separator.type === 'rparen') break;
      if (separator.type !== 'comma') {
        const found = separator.type === 'eof' ? 'end of formula' : `'${separator.text}'`;
        throw new FormulaSyntaxError(`Expected ',' or ')' but found ${found}`, separator.start);
      }
    }
    return { type: 'call', name: nameToken.value as string, args };
  }
}

function toRef(token: Token): CellRef {
  const ref = parseA1(token.text);
  /* c8 ignore next */
  if (!ref) throw new FormulaSyntaxError(`Invalid reference '${token.text}'`, token.start);
  return ref;
}

/** Parses formula text (without the leading "="). Throws FormulaSyntaxError. */
export function parseFormula(source: string): AstNode {
  return new Parser(tokenize(source)).parseFormula();
}

export type ParseResult =
  | { readonly ok: true; readonly ast: AstNode }
  | { readonly ok: false; readonly message: string; readonly position: number };

/** Non-throwing variant for API boundaries and the formula bar. */
export function tryParseFormula(source: string): ParseResult {
  try {
    return { ok: true, ast: parseFormula(source) };
  } catch (error) {
    if (error instanceof FormulaSyntaxError) {
      return { ok: false, message: error.message, position: error.position };
    }
    throw error;
  }
}
