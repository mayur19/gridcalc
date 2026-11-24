import type { AstNode } from './ast.js';
import { parseNumericText } from './coercion.js';
import { tryParseFormula } from './parser.js';
import { isErrorCode, makeError, type Scalar } from './values.js';

/**
 * Classifies what a user typed into a cell.
 *  ""           -> empty
 *  "=..."       -> formula (parsed; syntax errors become #ERROR! with a message)
 *  "'text"      -> literal text (leading apostrophe forces text)
 *  "12", "1e3", "5%" -> number
 *  "TRUE"/"FALSE" (any case) -> boolean
 *  "#N/A" etc.  -> error literal
 *  anything else -> text
 */
export type CellContent =
  | { readonly kind: 'empty' }
  | { readonly kind: 'value'; readonly value: Scalar }
  | { readonly kind: 'formula'; readonly ast: AstNode }
  | {
      readonly kind: 'invalid-formula';
      readonly message: string;
      readonly position: number;
    };

export const MAX_RAW_LENGTH = 8192;

export function parseCellInput(raw: string): CellContent {
  if (raw === '') return { kind: 'empty' };
  if (raw.startsWith('=') && raw.length > 1) {
    const result = tryParseFormula(raw.slice(1));
    return result.ok
      ? { kind: 'formula', ast: result.ast }
      : { kind: 'invalid-formula', message: result.message, position: result.position + 1 };
  }
  if (raw.startsWith("'")) return { kind: 'value', value: raw.slice(1) };
  const numeric = parseNumericText(raw);
  if (numeric !== null) return { kind: 'value', value: numeric };
  const upper = raw.trim().toUpperCase();
  if (upper === 'TRUE' || upper === 'FALSE') return { kind: 'value', value: upper === 'TRUE' };
  if (isErrorCode(upper)) return { kind: 'value', value: makeError(upper) };
  return { kind: 'value', value: raw };
}
