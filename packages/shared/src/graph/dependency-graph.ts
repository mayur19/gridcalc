import type { CellAddress, RangeAddress } from '../formula/references.js';
import { addressKey, parseCellKey, type CellKey } from './cell-key.js';
import { RangeIndex } from './range-index.js';

/**
 * Directed dependency graph between cells. An edge P -> F means formula cell F reads P
 * (directly or through a range). Only formula cells have outgoing precedent lists.
 *
 * Incremental recalculation (see docs/design/system-design.md):
 *   1. dirty  = transitive dependents of the edited cells       (BFS, O(V_d + E_d))
 *   2. order  = Tarjan SCC over the dirty subgraph, reversed     (O(V_d + E_d), iterative)
 *   3. SCCs with more than one member, or a self-loop, are cycles -> #CYCLE!
 * Only the dirty subgraph is visited, never the whole workbook.
 */
export interface RecalcPlan {
  /** Formula cells in a valid evaluation order (precedents before dependents). */
  readonly order: readonly CellKey[];
  /** Members of reference cycles; they evaluate to #CYCLE!. */
  readonly cyclic: ReadonlySet<CellKey>;
}

export class DependencyGraph {
  private readonly cellPrecedents = new Map<CellKey, readonly CellKey[]>();
  private readonly cellDependents = new Map<CellKey, Set<CellKey>>();
  private readonly rangeIndex = new RangeIndex();

  /** Replaces the precedents of a formula cell. */
  setPrecedents(
    formula: CellKey,
    cells: readonly CellAddress[],
    ranges: readonly RangeAddress[],
  ): void {
    this.removeFormula(formula);
    const keys = [...new Set(cells.map(addressKey))];
    this.cellPrecedents.set(formula, keys);
    for (const key of keys) {
      let dependents = this.cellDependents.get(key);
      if (!dependents) {
        dependents = new Set();
        this.cellDependents.set(key, dependents);
      }
      dependents.add(formula);
    }
    this.rangeIndex.add(formula, ranges);
  }

  /** Removes all outgoing precedent edges of a cell (it became a value or was cleared). */
  removeFormula(formula: CellKey): void {
    const previous = this.cellPrecedents.get(formula);
    if (previous) {
      for (const key of previous) {
        const dependents = this.cellDependents.get(key);
        dependents?.delete(formula);
        if (dependents?.size === 0) this.cellDependents.delete(key);
      }
      this.cellPrecedents.delete(formula);
    }
    this.rangeIndex.remove(formula);
  }

  /** Formulas that read the given cell directly or through a range. */
  directDependents(cell: CellKey): Set<CellKey> {
    const result = new Set<CellKey>(this.cellDependents.get(cell) ?? []);
    this.rangeIndex.formulasCovering(parseCellKey(cell), result);
    return result;
  }

  /** All formulas transitively affected by a change to any of the given cells. */
  collectDirty(changed: Iterable<CellKey>): Set<CellKey> {
    const dirty = new Set<CellKey>();
    const queue: CellKey[] = [...changed];
    for (let i = 0; i < queue.length; i += 1) {
      for (const dependent of this.directDependents(queue[i] as CellKey)) {
        if (!dirty.has(dependent)) {
          dirty.add(dependent);
          queue.push(dependent);
        }
      }
    }
    return dirty;
  }

  /**
   * Orders the dirty formulas for evaluation using an iterative Tarjan SCC traversal
   * (no recursion, so a 100k-long dependency chain cannot overflow the call stack).
   */
  planRecalc(dirty: ReadonlySet<CellKey>): RecalcPlan {
    const successors = (node: CellKey): CellKey[] =>
      [...this.directDependents(node)].filter((d) => dirty.has(d));

    const indexOf = new Map<CellKey, number>();
    const lowLink = new Map<CellKey, number>();
    const onStack = new Set<CellKey>();
    const stack: CellKey[] = [];
    const components: CellKey[][] = [];
    const selfLoops = new Set<CellKey>();
    let counter = 0;

    const open = (node: CellKey): { node: CellKey; next: CellKey[]; i: number } => {
      indexOf.set(node, counter);
      lowLink.set(node, counter);
      counter += 1;
      stack.push(node);
      onStack.add(node);
      const next = successors(node);
      if (next.includes(node)) selfLoops.add(node);
      return { node, next, i: 0 };
    };

    for (const root of dirty) {
      if (indexOf.has(root)) continue;
      const frames = [open(root)];
      while (frames.length > 0) {
        const frame = frames[frames.length - 1] as (typeof frames)[number];
        if (frame.i < frame.next.length) {
          const w = frame.next[frame.i] as CellKey;
          frame.i += 1;
          if (!indexOf.has(w)) {
            frames.push(open(w));
          } else if (onStack.has(w)) {
            lowLink.set(frame.node, Math.min(lowLink.get(frame.node)!, indexOf.get(w)!));
          }
          continue;
        }
        frames.pop();
        const parent = frames[frames.length - 1];
        if (parent) {
          lowLink.set(parent.node, Math.min(lowLink.get(parent.node)!, lowLink.get(frame.node)!));
        }
        if (lowLink.get(frame.node) === indexOf.get(frame.node)) {
          const component: CellKey[] = [];
          let member: CellKey;
          do {
            member = stack.pop() as CellKey;
            onStack.delete(member);
            component.push(member);
          } while (member !== frame.node);
          components.push(component);
        }
      }
    }

    // Tarjan emits components downstream-first; evaluation needs upstream-first.
    const order: CellKey[] = [];
    const cyclic = new Set<CellKey>();
    for (let i = components.length - 1; i >= 0; i -= 1) {
      const component = components[i] as CellKey[];
      if (component.length > 1 || selfLoops.has(component[0] as CellKey)) {
        component.forEach((member) => cyclic.add(member));
      }
      order.push(...component);
    }
    return { order, cyclic };
  }

  precedentsOf(formula: CellKey): readonly CellKey[] {
    return this.cellPrecedents.get(formula) ?? [];
  }

  stats(): { formulas: number; cellEdges: number; rangeEdges: number } {
    let cellEdges = 0;
    for (const list of this.cellPrecedents.values()) cellEdges += list.length;
    return { formulas: this.cellPrecedents.size, cellEdges, rangeEdges: this.rangeIndex.size };
  }
}
