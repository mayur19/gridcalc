import {
  evaluate,
  parseA1,
  parseFormula,
  RecalcEngine,
  type EvalValue,
  type Scalar,
} from '../src/index.js';

export const SHEET1 = 'sheet-1';
export const SHEET2 = 'sheet-2';

/** Builds a two-sheet engine from a map of "A1" / "Data!B2" -> raw input. */
export function buildEngine(cells: Record<string, string>): RecalcEngine {
  return RecalcEngine.create(
    [
      { id: SHEET1, name: 'Sheet1' },
      { id: SHEET2, name: 'Data' },
    ],
    Object.entries(cells).map(([address, raw]) => ({ ...locate(address), raw })),
  );
}

export function locate(address: string): { sheetId: string; row: number; col: number } {
  const [sheetPart, cellPart] = address.includes('!') ? address.split('!') : ['Sheet1', address];
  const ref = parseA1(cellPart as string);
  if (!ref) throw new Error(`bad address ${address}`);
  return { sheetId: sheetPart === 'Data' ? SHEET2 : SHEET1, row: ref.row, col: ref.col };
}

export function valueAt(engine: RecalcEngine, address: string): Scalar {
  const { sheetId, row, col } = locate(address);
  return engine.getValue(sheetId, row, col);
}

/** Evaluates a single formula (with leading "=") against optional cell inputs. */
export function calc(formula: string, cells: Record<string, string> = {}): Scalar {
  const engine = buildEngine({ ...cells, Z1000: formula });
  return valueAt(engine, 'Z1000');
}

/** Evaluates a formula without the engine; useful to observe ranges returned by functions. */
export function evalRaw(formula: string, values: Record<string, Scalar> = {}): EvalValue {
  return evaluate(parseFormula(formula.replace(/^=/, '')), {
    currentSheetId: SHEET1,
    resolveSheet: (name) =>
      name.toLowerCase() === 'data' ? SHEET2 : name.toLowerCase() === 'sheet1' ? SHEET1 : null,
    getCellValue: (sheetId, row, col) => {
      const key = Object.keys(values).find((address) => {
        const loc = locate(address);
        return loc.sheetId === sheetId && loc.row === row && loc.col === col;
      });
      return key === undefined ? null : (values[key] as Scalar);
    },
  });
}

export function errorCode(value: unknown): string | undefined {
  return typeof value === 'object' && value !== null && 'code' in value
    ? String((value as { code: string }).code)
    : undefined;
}
