import type { AstNode } from './ast.js';
import { normalizeRange, type CellAddress, type RangeAddress } from './references.js';

/**
 * Static precedent extraction: which cells and ranges can a formula read?
 * Lazy functions (IF, CHOOSE) are treated conservatively: every branch is a precedent,
 * so the dependency graph is a superset of the dynamic one and never misses a recalc.
 */
export interface Precedents {
  readonly cells: readonly CellAddress[];
  readonly ranges: readonly RangeAddress[];
  /** Sheet names referenced that do not exist (the formula evaluates to #REF!). */
  readonly unresolvedSheets: readonly string[];
}

export function collectPrecedents(
  ast: AstNode,
  currentSheetId: string,
  resolveSheet: (name: string) => string | null,
): Precedents {
  const cells: CellAddress[] = [];
  const ranges: RangeAddress[] = [];
  const unresolved = new Set<string>();

  const sheetIdFor = (sheet: string | null): string | null => {
    if (sheet === null) return currentSheetId;
    const id = resolveSheet(sheet);
    if (id === null) unresolved.add(sheet);
    return id;
  };

  const visit = (node: AstNode): void => {
    switch (node.type) {
      case 'cell': {
        const sheetId = sheetIdFor(node.sheet);
        if (sheetId !== null) cells.push({ sheetId, row: node.ref.row, col: node.ref.col });
        return;
      }
      case 'range': {
        const sheetId = sheetIdFor(node.sheet);
        if (sheetId !== null) ranges.push(normalizeRange(sheetId, node.start, node.end));
        return;
      }
      case 'unary':
      case 'percent':
        visit(node.operand);
        return;
      case 'binary':
        visit(node.left);
        visit(node.right);
        return;
      case 'call':
        node.args.forEach(visit);
        return;
      default:
        return;
    }
  };

  visit(ast);
  return { cells, ranges, unresolvedSheets: [...unresolved] };
}
