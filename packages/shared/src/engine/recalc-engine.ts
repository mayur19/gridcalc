import { parseCellInput, MAX_RAW_LENGTH, type CellContent } from '../formula/cell-input.js';
import { collectPrecedents } from '../formula/dependencies.js';
import { evaluateToScalar, type EvaluationContext } from '../formula/evaluator.js';
import { MAX_COLS, MAX_ROWS } from '../formula/references.js';
import { makeError, scalarEquals, type Scalar } from '../formula/values.js';
import { cellKey, parseCellKey, type CellKey } from '../graph/cell-key.js';
import { DependencyGraph } from '../graph/dependency-graph.js';

/**
 * Workbook recalculation engine: owns the cell store and dependency graph for one
 * workbook and recalculates incrementally after edits.
 *
 * Ownership model (ADR-0006): an engine instance is single-writer. Its internal maps are
 * mutated in place for performance, but nothing mutable escapes: every value returned to
 * callers is a fresh, frozen ComputedCell.
 */
export interface SheetMeta {
  readonly id: string;
  readonly name: string;
}

export interface CellEdit {
  readonly sheetId: string;
  readonly row: number;
  readonly col: number;
  readonly raw: string;
}

export interface ComputedCell {
  readonly sheetId: string;
  readonly row: number;
  readonly col: number;
  readonly raw: string;
  readonly value: Scalar;
  readonly isFormula: boolean;
}

export interface RecalcResult {
  /** Edited cells plus every recalculated cell whose value changed. */
  readonly changed: readonly ComputedCell[];
  /** Number of formulas evaluated (size of the dirty set). */
  readonly evaluated: number;
  /** Cells currently participating in a reference cycle among those evaluated. */
  readonly cycles: readonly ComputedCell[];
}

interface CellRecord {
  readonly raw: string;
  readonly content: CellContent;
  readonly value: Scalar;
}

const CYCLE_ERROR = makeError('#CYCLE!', 'Circular reference');

export class RecalcEngine {
  private readonly sheetNames = new Map<string, string>();
  private readonly sheetIdsByName = new Map<string, string>();
  private readonly cells = new Map<CellKey, CellRecord>();
  private readonly graph = new DependencyGraph();
  /** Formulas referencing sheet names that do not exist yet, keyed by lower-case name. */
  private readonly waitingOnSheet = new Map<string, Set<CellKey>>();

  /** Builds an engine and performs a full calculation of every formula. */
  static create(sheets: readonly SheetMeta[], cells: readonly CellEdit[]): RecalcEngine {
    const engine = new RecalcEngine();
    sheets.forEach((sheet) => engine.registerSheet(sheet));
    for (const cell of cells) {
      assertValidEdit(cell);
      if (!engine.sheetNames.has(cell.sheetId))
        throw new Error(`Unknown sheet id '${cell.sheetId}'`);
      engine.store(cell);
    }
    const formulas = new Set<CellKey>();
    for (const [key, record] of engine.cells) {
      if (record.content.kind === 'formula') formulas.add(key);
    }
    engine.evaluateDirty(formulas);
    return engine;
  }

  /** Adds a sheet; formulas that referenced its name before it existed are recalculated. */
  addSheet(sheet: SheetMeta): RecalcResult {
    this.registerSheet(sheet);
    const waiting = this.waitingOnSheet.get(sheet.name.toLowerCase()) ?? new Set<CellKey>();
    this.waitingOnSheet.delete(sheet.name.toLowerCase());
    for (const key of waiting) this.bind(key);
    const dirty = new Set([...waiting, ...this.graph.collectDirty(waiting)]);
    return this.finish(dirty, new Set(), this.snapshotValues(dirty));
  }

  /** Applies a batch of edits atomically and recalculates only what they affect. */
  applyEdits(edits: readonly CellEdit[]): RecalcResult {
    for (const edit of edits) {
      assertValidEdit(edit);
      if (!this.sheetNames.has(edit.sheetId)) throw new Error(`Unknown sheet id '${edit.sheetId}'`);
    }
    const lastEdit = new Map<CellKey, CellEdit>();
    for (const edit of edits) lastEdit.set(cellKey(edit.sheetId, edit.row, edit.col), edit);

    const edited = new Set(lastEdit.keys());
    for (const edit of lastEdit.values()) this.store(edit);
    // Storing only touches edited cells, so every other value is still the pre-edit value.
    const dirty = this.graph.collectDirty(edited);
    for (const key of edited) {
      if (this.cells.get(key)?.content.kind === 'formula') dirty.add(key);
    }
    return this.finish(dirty, edited, this.snapshotValues(dirty));
  }

  getCell(sheetId: string, row: number, col: number): ComputedCell | null {
    const key = cellKey(sheetId, row, col);
    const record = this.cells.get(key);
    return record ? toComputed(key, record) : null;
  }

  getValue(sheetId: string, row: number, col: number): Scalar {
    return this.cells.get(cellKey(sheetId, row, col))?.value ?? null;
  }

  sheetCells(sheetId: string): ComputedCell[] {
    const out: ComputedCell[] = [];
    for (const [key, record] of this.cells) {
      if (parseCellKey(key).sheetId === sheetId) out.push(toComputed(key, record));
    }
    return out.sort((a, b) => a.row - b.row || a.col - b.col);
  }

  stats(): {
    cells: number;
    sheets: number;
    formulas: number;
    cellEdges: number;
    rangeEdges: number;
  } {
    return { cells: this.cells.size, sheets: this.sheetNames.size, ...this.graph.stats() };
  }

  // ---------------------------------------------------------------- internals

  private registerSheet(sheet: SheetMeta): void {
    const lower = sheet.name.toLowerCase();
    const existing = this.sheetIdsByName.get(lower);
    if (existing !== undefined && existing !== sheet.id) {
      throw new Error(`Duplicate sheet name '${sheet.name}'`);
    }
    this.sheetNames.set(sheet.id, sheet.name);
    this.sheetIdsByName.set(lower, sheet.id);
  }

  private resolveSheet = (name: string): string | null =>
    this.sheetIdsByName.get(name.toLowerCase()) ?? null;

  /** Writes the raw content of one cell and rebinds its graph edges (no evaluation). */
  private store(edit: CellEdit): void {
    const key = cellKey(edit.sheetId, edit.row, edit.col);
    this.unwait(key);
    this.graph.removeFormula(key);
    const content = parseCellInput(edit.raw);
    if (content.kind === 'empty') {
      this.cells.delete(key);
      return;
    }
    const value = initialValue(content);
    this.cells.set(key, { raw: edit.raw, content, value });
    if (content.kind === 'formula') this.bind(key);
  }

  private bind(key: CellKey): void {
    const record = this.cells.get(key);
    if (!record || record.content.kind !== 'formula') return;
    const { sheetId } = parseCellKey(key);
    const precedents = collectPrecedents(record.content.ast, sheetId, this.resolveSheet);
    this.graph.setPrecedents(key, precedents.cells, precedents.ranges);
    for (const name of precedents.unresolvedSheets) {
      const lower = name.toLowerCase();
      const set = this.waitingOnSheet.get(lower) ?? new Set<CellKey>();
      set.add(key);
      this.waitingOnSheet.set(lower, set);
    }
  }

  private unwait(key: CellKey): void {
    for (const [name, set] of this.waitingOnSheet) {
      if (set.delete(key) && set.size === 0) this.waitingOnSheet.delete(name);
    }
  }

  private snapshotValues(keys: Iterable<CellKey>): Map<CellKey, Scalar> {
    const snapshot = new Map<CellKey, Scalar>();
    for (const key of keys) snapshot.set(key, this.cells.get(key)?.value ?? null);
    return snapshot;
  }

  private finish(
    dirty: Set<CellKey>,
    edited: ReadonlySet<CellKey>,
    before: ReadonlyMap<CellKey, Scalar>,
  ): RecalcResult {
    const cyclic = this.evaluateDirty(dirty);
    const changed = new Map<CellKey, ComputedCell>();
    for (const key of edited) changed.set(key, this.computedOrEmpty(key));
    for (const key of dirty) {
      if (changed.has(key)) continue;
      const now = this.cells.get(key)?.value ?? null;
      if (!scalarEquals(before.get(key) ?? null, now)) {
        changed.set(key, this.computedOrEmpty(key));
      }
    }
    return {
      changed: [...changed.values()],
      evaluated: dirty.size,
      cycles: [...cyclic].map((key) => this.computedOrEmpty(key)),
    };
  }

  /** Evaluates the given formula cells in dependency order; returns the cyclic subset. */
  private evaluateDirty(dirty: ReadonlySet<CellKey>): ReadonlySet<CellKey> {
    const plan = this.graph.planRecalc(dirty);
    for (const key of plan.order) {
      const record = this.cells.get(key);
      if (!record || record.content.kind !== 'formula') continue;
      const value = plan.cyclic.has(key)
        ? CYCLE_ERROR
        : evaluateToScalar(record.content.ast, this.contextFor(key));
      this.cells.set(key, { ...record, value });
    }
    return plan.cyclic;
  }

  private contextFor(key: CellKey): EvaluationContext {
    return {
      currentSheetId: parseCellKey(key).sheetId,
      resolveSheet: this.resolveSheet,
      getCellValue: (sheetId, row, col) =>
        this.cells.get(cellKey(sheetId, row, col))?.value ?? null,
    };
  }

  private computedOrEmpty(key: CellKey): ComputedCell {
    const record = this.cells.get(key);
    if (record) return toComputed(key, record);
    const { sheetId, row, col } = parseCellKey(key);
    return Object.freeze({ sheetId, row, col, raw: '', value: null, isFormula: false });
  }
}

function initialValue(content: CellContent): Scalar {
  switch (content.kind) {
    case 'value':
      return content.value;
    case 'invalid-formula':
      return makeError('#ERROR!', content.message);
    default:
      return null;
  }
}

function toComputed(key: CellKey, record: CellRecord): ComputedCell {
  const { sheetId, row, col } = parseCellKey(key);
  return Object.freeze({
    sheetId,
    row,
    col,
    raw: record.raw,
    value: record.value,
    isFormula: record.content.kind === 'formula' || record.content.kind === 'invalid-formula',
  });
}

function assertValidEdit(edit: CellEdit): void {
  if (!Number.isInteger(edit.row) || edit.row < 0 || edit.row >= MAX_ROWS) {
    throw new RangeError(`Row out of bounds: ${edit.row}`);
  }
  if (!Number.isInteger(edit.col) || edit.col < 0 || edit.col >= MAX_COLS) {
    throw new RangeError(`Column out of bounds: ${edit.col}`);
  }
  if (edit.raw.length > MAX_RAW_LENGTH) {
    throw new RangeError(`Cell content exceeds ${MAX_RAW_LENGTH} characters`);
  }
}
