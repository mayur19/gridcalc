import type { CellRef } from './references.js';
import type { ErrorCode } from './values.js';

/** Abstract syntax tree produced by the Pratt parser. All nodes are immutable. */
export type BinaryOperator =
  '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>=';

export type AstNode =
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'error'; readonly code: ErrorCode }
  | { readonly type: 'missing' }
  | { readonly type: 'cell'; readonly sheet: string | null; readonly ref: CellRef }
  | {
      readonly type: 'range';
      readonly sheet: string | null;
      readonly start: CellRef;
      readonly end: CellRef;
    }
  | { readonly type: 'name'; readonly name: string }
  | { readonly type: 'unary'; readonly op: '+' | '-'; readonly operand: AstNode }
  | { readonly type: 'percent'; readonly operand: AstNode }
  | {
      readonly type: 'binary';
      readonly op: BinaryOperator;
      readonly left: AstNode;
      readonly right: AstNode;
    }
  | { readonly type: 'call'; readonly name: string; readonly args: readonly AstNode[] };

export type AstNodeType = AstNode['type'];
