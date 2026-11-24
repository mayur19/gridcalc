import { describe, expect, it } from 'vitest';
import { RecalcEngine, type Scalar } from '../src/index.js';
import { buildEngine, errorCode, locate, SHEET1, SHEET2, valueAt } from './helpers.js';

const edit = (address: string, raw: string) => ({ ...locate(address), raw });

describe('RecalcEngine full calculation', () => {
  it('computes formulas regardless of insertion order', () => {
    const engine = buildEngine({ C1: '=B1*2', B1: '=A1+1', A1: '10' });
    expect(valueAt(engine, 'C1')).toBe(22);
    expect(engine.stats()).toMatchObject({ cells: 3, sheets: 2, formulas: 2 });
  });

  it('exposes computed cells and sheet listings', () => {
    const engine = buildEngine({ B2: '=A1', A1: 'x', 'Data!A1': '1' });
    expect(engine.getCell(SHEET1, 1, 1)).toEqual({
      sheetId: SHEET1,
      row: 1,
      col: 1,
      raw: '=A1',
      value: 'x',
      isFormula: true,
    });
    expect(engine.getCell(SHEET1, 9, 9)).toBeNull();
    expect(engine.sheetCells(SHEET1).map((c) => c.raw)).toEqual(['x', '=A1']);
    expect(engine.sheetCells(SHEET2)).toHaveLength(1);
  });

  it('stores syntax errors as #ERROR! with a message', () => {
    const engine = buildEngine({ A1: '=1+', B1: '=A1' });
    expect(valueAt(engine, 'A1')).toMatchObject({
      code: '#ERROR!',
      message: 'Unexpected end of formula',
    });
    expect(errorCode(valueAt(engine, 'B1'))).toBe('#ERROR!');
    expect(engine.getCell(SHEET1, 0, 0)?.isFormula).toBe(true);
  });

  it('rejects unknown sheets, duplicate sheet names and out-of-bounds edits', () => {
    expect(() =>
      RecalcEngine.create([{ id: 'a', name: 'S' }], [{ sheetId: 'b', row: 0, col: 0, raw: '1' }]),
    ).toThrow('Unknown sheet');
    expect(() =>
      RecalcEngine.create(
        [
          { id: 'a', name: 'S' },
          { id: 'b', name: 's' },
        ],
        [],
      ),
    ).toThrow('Duplicate sheet');
    const engine = buildEngine({});
    expect(() => engine.applyEdits([{ sheetId: SHEET1, row: -1, col: 0, raw: '1' }])).toThrow(
      RangeError,
    );
    expect(() => engine.applyEdits([{ sheetId: SHEET1, row: 0, col: 99_999, raw: '1' }])).toThrow(
      RangeError,
    );
    expect(() =>
      engine.applyEdits([{ sheetId: SHEET1, row: 0, col: 0, raw: 'x'.repeat(9000) }]),
    ).toThrow(RangeError);
    expect(() => engine.applyEdits([{ sheetId: 'missing', row: 0, col: 0, raw: '1' }])).toThrow(
      'Unknown sheet',
    );
  });
});

describe('RecalcEngine incremental recalculation', () => {
  it('recalculates only the dirty subgraph and reports changed cells', () => {
    const engine = buildEngine({ A1: '1', A2: '=A1*10', A3: '=A2+1', B1: '5', B2: '=B1*2' });
    const result = engine.applyEdits([edit('A1', '2')]);
    expect(result.evaluated).toBe(2);
    expect(result.changed.map((c) => [c.row, c.col, c.value])).toEqual([
      [0, 0, 2],
      [1, 0, 20],
      [2, 0, 21],
    ]);
    expect(valueAt(engine, 'B2')).toBe(10);
  });

  it('omits recalculated cells whose value did not change', () => {
    const engine = buildEngine({ A1: '1', A2: '=A1>0', A3: '=IF(A2,"pos","neg")' });
    const result = engine.applyEdits([edit('A1', '5')]);
    expect(result.evaluated).toBe(2);
    expect(result.changed).toHaveLength(1);
  });

  it('propagates through ranges', () => {
    const engine = buildEngine({ A1: '1', A2: '2', A3: '3', B1: '=SUM(A1:A3)', C1: '=B1*2' });
    engine.applyEdits([edit('A2', '20')]);
    expect(valueAt(engine, 'B1')).toBe(24);
    expect(valueAt(engine, 'C1')).toBe(48);
  });

  it('propagates across sheets', () => {
    const engine = buildEngine({ 'Data!A1': '3', A1: '=Data!A1^2' });
    const result = engine.applyEdits([edit('Data!A1', '4')]);
    expect(valueAt(engine, 'A1')).toBe(16);
    expect(result.changed.map((c) => c.sheetId)).toEqual([SHEET2, SHEET1]);
  });

  it('handles clearing cells and turning formulas into values', () => {
    const engine = buildEngine({ A1: '7', B1: '=A1', C1: '=B1+1' });
    let result = engine.applyEdits([edit('A1', '')]);
    expect(result.changed[0]).toMatchObject({ raw: '', value: null });
    expect(valueAt(engine, 'C1')).toBe(1);
    result = engine.applyEdits([edit('B1', '100')]);
    expect(valueAt(engine, 'C1')).toBe(101);
    engine.applyEdits([edit('A1', '1')]);
    expect(valueAt(engine, 'C1')).toBe(101);
    expect(engine.stats().formulas).toBe(1);
  });

  it('applies the last edit when a batch touches a cell twice', () => {
    const engine = buildEngine({ B1: '=A1*2' });
    const result = engine.applyEdits([edit('A1', '1'), edit('A1', '3')]);
    expect(valueAt(engine, 'B1')).toBe(6);
    expect(result.changed.filter((c) => c.col === 0)).toHaveLength(1);
  });

  it('applies multi-cell batches atomically in dependency order', () => {
    const engine = buildEngine({});
    engine.applyEdits([edit('C1', '=A1+B1'), edit('A1', '=B1*2'), edit('B1', '5')]);
    expect(valueAt(engine, 'C1')).toBe(15);
  });
});

describe('cycles', () => {
  it('marks every member of a cycle with #CYCLE! and recovers when broken', () => {
    const engine = buildEngine({ A1: '1', B1: '=A1+1', C1: '=B1+1', D1: '=C1*2' });
    const result = engine.applyEdits([edit('A1', '=C1')]);
    expect(result.cycles.map((c) => c.col).sort()).toEqual([0, 1, 2]);
    for (const address of ['A1', 'B1', 'C1'])
      expect(errorCode(valueAt(engine, address))).toBe('#CYCLE!');
    expect(errorCode(valueAt(engine, 'D1'))).toBe('#CYCLE!');

    const fixed = engine.applyEdits([edit('A1', '10')]);
    expect(fixed.cycles).toHaveLength(0);
    expect(valueAt(engine, 'D1')).toBe(24);
  });

  it('detects self references, including through ranges', () => {
    const engine = buildEngine({ A1: '=A1+1', B5: '=SUM(B1:B10)' });
    expect(errorCode(valueAt(engine, 'A1'))).toBe('#CYCLE!');
    expect(errorCode(valueAt(engine, 'B5'))).toBe('#CYCLE!');
  });

  it('lets IFERROR contain a cycle error downstream', () => {
    const engine = buildEngine({ A1: '=B1', B1: '=A1', C1: '=IFERROR(A1,"cycle")' });
    expect(valueAt(engine, 'C1')).toBe('cycle');
  });
});

describe('sheets', () => {
  it('rebinds formulas that referenced a sheet before it existed', () => {
    const engine = buildEngine({ A1: "='Q1 Plan'!B2+1", A2: '=A1*2' });
    expect(errorCode(valueAt(engine, 'A1'))).toBe('#REF!');
    engine.applyEdits([]);
    const result = engine.addSheet({ id: 'sheet-3', name: 'Q1 Plan' });
    expect(valueAt(engine, 'A1')).toBe(1);
    expect(valueAt(engine, 'A2')).toBe(2);
    expect(result.changed).toHaveLength(2);
    engine.applyEdits([{ sheetId: 'sheet-3', row: 1, col: 1, raw: '41' }]);
    expect(valueAt(engine, 'A2')).toBe(84);
  });

  it('stops waiting when the referencing formula is replaced', () => {
    const engine = buildEngine({ A1: '=Later!A1' });
    engine.applyEdits([edit('A1', '5')]);
    const result = engine.addSheet({ id: 'sheet-3', name: 'Later' });
    expect(result.changed).toHaveLength(0);
    expect(valueAt(engine, 'A1')).toBe(5);
  });
});

/**
 * Property test: after any sequence of random edits, incremental recalculation must
 * produce exactly the values a from-scratch full calculation produces.
 */
describe('incremental == full recalculation (randomized)', () => {
  const ROWS = 6;
  const COLS = 4;
  const letters = 'ABCD';

  function rng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
  }

  function randomRaw(next: () => number): string {
    const ref = () => `${letters[Math.floor(next() * COLS)]}${1 + Math.floor(next() * ROWS)}`;
    const roll = next();
    if (roll < 0.15) return '';
    if (roll < 0.4) return String(Math.floor(next() * 100) - 20);
    if (roll < 0.55) return `=${ref()}+${ref()}`;
    if (roll < 0.65) return `=SUM(${ref()}:${ref()})`;
    if (roll < 0.75) return `=IF(${ref()}>10,${ref()},${ref()}*2)`;
    if (roll < 0.82) return `=Data!${ref()}-1`;
    if (roll < 0.9) return `=${ref()}/${ref()}`;
    return `=IFERROR(${ref()},0)&"x"`;
  }

  const snapshot = (engine: RecalcEngine) => {
    const out: Record<string, Scalar | string> = {};
    for (const sheetId of [SHEET1, SHEET2]) {
      for (const c of engine.sheetCells(sheetId)) {
        const v = c.value;
        out[`${sheetId}:${c.row}:${c.col}`] = typeof v === 'object' && v !== null ? v.code : v;
      }
    }
    return out;
  };

  it.each(Array.from({ length: 25 }, (_, i) => i + 1))('seed %i', (seed) => {
    const next = rng(seed);
    const engine = buildEngine({});
    const raws = new Map<string, { sheetId: string; row: number; col: number; raw: string }>();
    for (let step = 0; step < 60; step += 1) {
      const batch = Array.from({ length: 1 + Math.floor(next() * 3) }, () => ({
        sheetId: next() < 0.8 ? SHEET1 : SHEET2,
        row: Math.floor(next() * ROWS),
        col: Math.floor(next() * COLS),
        raw: randomRaw(next),
      }));
      engine.applyEdits(batch);
      batch.forEach((e) => raws.set(`${e.sheetId}:${e.row}:${e.col}`, e));
      const full = RecalcEngine.create(
        [
          { id: SHEET1, name: 'Sheet1' },
          { id: SHEET2, name: 'Data' },
        ],
        [...raws.values()].filter((e) => e.raw !== ''),
      );
      expect(snapshot(engine)).toEqual(snapshot(full));
    }
  });
});
