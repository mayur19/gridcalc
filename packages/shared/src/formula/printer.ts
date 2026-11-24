import type { AstNode } from './ast.js';
import { formatA1 } from './references.js';

/**
 * Serializes an AST back to canonical formula text (without "=").
 * Used for normalization and will be the output stage of reference rewriting
 * (insert/delete rows and columns, copy/paste) which re-prints adjusted ASTs.
 * Parentheses are emitted conservatively around every nested binary expression.
 */
export function printFormula(node: AstNode): string {
  switch (node.type) {
    case 'number':
      return String(node.value);
    case 'string':
      return `"${node.value.replace(/"/g, '""')}"`;
    case 'boolean':
      return node.value ? 'TRUE' : 'FALSE';
    case 'error':
      return node.code;
    case 'missing':
      return '';
    case 'cell':
      return sheetPrefix(node.sheet) + formatA1(node.ref);
    case 'range':
      return `${sheetPrefix(node.sheet)}${formatA1(node.start)}:${formatA1(node.end)}`;
    case 'name':
      return node.name;
    case 'unary':
      return `${node.op}${wrap(node.operand)}`;
    case 'percent':
      return `${wrap(node.operand)}%`;
    case 'binary':
      return `${wrap(node.left)}${node.op}${wrap(node.right)}`;
    case 'call':
      return `${node.name}(${node.args.map(printFormula).join(',')})`;
  }
}

function wrap(node: AstNode): string {
  const text = printFormula(node);
  return node.type === 'binary' || node.type === 'unary' ? `(${text})` : text;
}

function sheetPrefix(sheet: string | null): string {
  if (sheet === null) return '';
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(sheet) ? `${sheet}!` : `'${sheet.replace(/'/g, "''")}'!`;
}
