import { describe, expect, it } from 'vitest';
import { cellKey, DependencyGraph, parseCellKey, type CellKey } from '../src/index.js';
import { WIDE_RANGE_COLUMNS } from '../src/graph/range-index.js';

const S = 's1';
const k = (row: number, col = 0): CellKey => cellKey(S, row, col);
const cell = (row: number, col = 0) => ({ sheetId: S, row, col });
const range = (top: number, left: number, bottom: number, right: number, sheetId = S) => ({
  sheetId,
  top,
  left,
  bottom,
  right,
});

describe('cell keys', () => {
  it('round-trips, including sheet ids that contain the separator', () => {
    expect(parseCellKey(cellKey('a|b', 3, 4))).toEqual({ sheetId: 'a|b', row: 3, col: 4 });
  });
});

describe('DependencyGraph', () => {
  it('tracks direct cell and range dependents', () => {
    const g = new DependencyGraph();
    g.setPrecedents(k(10), [cell(0), cell(1)], []);
    g.setPrecedents(k(11), [], [range(0, 0, 5, 0)]);
    expect([...g.directDependents(k(0))].sort()).toEqual([k(10), k(11)].sort());
    expect([...g.directDependents(k(3))]).toEqual([k(11)]);
    expect([...g.directDependents(k(6))]).toEqual([]);
    expect(g.precedentsOf(k(10))).toEqual([k(0), k(1)]);
    expect(g.stats()).toEqual({ formulas: 2, cellEdges: 2, rangeEdges: 1 });
  });

  it('replaces and removes precedents', () => {
    const g = new DependencyGraph();
    g.setPrecedents(k(10), [cell(0)], [range(0, 1, 9, 1)]);
    g.setPrecedents(k(10), [cell(1)], []);
    expect(g.directDependents(k(0)).size).toBe(0);
    expect(g.directDependents(cellKey(S, 2, 1)).size).toBe(0);
    expect([...g.directDependents(k(1))]).toEqual([k(10)]);
    g.removeFormula(k(10));
    g.removeFormula(k(99));
    expect(g.directDependents(k(1)).size).toBe(0);
    expect(g.stats().formulas).toBe(0);
  });

  it('indexes wide ranges separately', () => {
    const g = new DependencyGraph();
    g.setPrecedents(k(50), [], [range(0, 0, 0, WIDE_RANGE_COLUMNS + 10)]);
    expect([...g.directDependents(cellKey(S, 0, WIDE_RANGE_COLUMNS + 5))]).toEqual([k(50)]);
    expect(g.directDependents(cellKey(S, 1, 3)).size).toBe(0);
    expect(g.directDependents(cellKey('other', 0, 3)).size).toBe(0);
    g.removeFormula(k(50));
    expect(g.directDependents(cellKey(S, 0, 3)).size).toBe(0);
  });

  it('collects the transitive dirty set', () => {
    const g = new DependencyGraph();
    // A1 -> A2 -> A3 -> A4, and A1 -> B1
    g.setPrecedents(k(1), [cell(0)], []);
    g.setPrecedents(k(2), [cell(1)], []);
    g.setPrecedents(k(3), [cell(2)], []);
    g.setPrecedents(k(0, 1), [cell(0)], []);
    expect([...g.collectDirty([k(0)])].sort()).toEqual([k(1), k(2), k(3), k(0, 1)].sort());
    expect([...g.collectDirty([k(2)])]).toEqual([k(3)]);
  });

  it('orders a diamond topologically', () => {
    const g = new DependencyGraph();
    // top=A1 ; left=B1(A1) ; right=C1(A1) ; bottom=D1(B1,C1)
    g.setPrecedents(k(0, 1), [cell(0, 0)], []);
    g.setPrecedents(k(0, 2), [cell(0, 0)], []);
    g.setPrecedents(k(0, 3), [cell(0, 1), cell(0, 2)], []);
    const plan = g.planRecalc(g.collectDirty([k(0, 0)]));
    expect(plan.cyclic.size).toBe(0);
    const pos = (key: CellKey) => plan.order.indexOf(key);
    expect(pos(k(0, 3))).toBeGreaterThan(pos(k(0, 1)));
    expect(pos(k(0, 3))).toBeGreaterThan(pos(k(0, 2)));
  });

  it('detects cycles and self references', () => {
    const g = new DependencyGraph();
    g.setPrecedents(k(0), [cell(1)], []);
    g.setPrecedents(k(1), [cell(2)], []);
    g.setPrecedents(k(2), [cell(0)], []);
    g.setPrecedents(k(3), [cell(2)], []); // downstream of the cycle, not part of it
    g.setPrecedents(k(5), [], [range(4, 0, 6, 0)]); // self-reference through a range
    const plan = g.planRecalc(new Set([k(0), k(1), k(2), k(3), k(5)]));
    expect([...plan.cyclic].sort()).toEqual([k(0), k(1), k(2), k(5)].sort());
    expect(plan.order.indexOf(k(3))).toBeGreaterThan(plan.order.indexOf(k(2)));
  });

  it('handles a 100k-long chain without recursion limits', () => {
    const g = new DependencyGraph();
    const n = 100_000;
    for (let i = 1; i < n; i += 1) g.setPrecedents(k(i), [cell(i - 1)], []);
    const dirty = g.collectDirty([k(0)]);
    expect(dirty.size).toBe(n - 1);
    const plan = g.planRecalc(dirty);
    expect(plan.order[0]).toBe(k(1));
    expect(plan.order.at(-1)).toBe(k(n - 1));
    expect(plan.cyclic.size).toBe(0);
  });
});
