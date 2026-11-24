import { describe, expect, it } from 'vitest';
import {
  createSheetSchema,
  patchCellsSchema,
  registerSchema,
  MAX_EDITS_PER_REQUEST,
} from '../src/index.js';

const uuid = '3f1b6f8e-8d3c-4b8e-9a51-2a0f3c9b7d11';

describe('schemas', () => {
  it('validates registration input', () => {
    const ok = registerSchema.safeParse({
      organizationName: 'Acme',
      displayName: 'Ada',
      email: ' ADA@Example.com ',
      password: 'correct horse battery',
    });
    expect(ok.success && ok.data.email).toBe('ada@example.com');
    expect(
      registerSchema.safeParse({
        organizationName: 'A',
        displayName: '',
        email: 'x',
        password: 'short',
      }).success,
    ).toBe(false);
  });

  it('rejects illegal sheet names', () => {
    expect(createSheetSchema.safeParse({ name: 'Q1 Plan' }).success).toBe(true);
    expect(createSheetSchema.safeParse({ name: 'a/b' }).success).toBe(false);
    expect(createSheetSchema.safeParse({ name: "it's" }).success).toBe(false);
  });

  it('bounds cell edit batches', () => {
    const edit = { sheetId: uuid, row: 0, col: 0, raw: '=1' };
    expect(patchCellsSchema.safeParse({ baseRevision: 0, edits: [edit] }).success).toBe(true);
    expect(patchCellsSchema.safeParse({ baseRevision: 0, edits: [] }).success).toBe(false);
    expect(
      patchCellsSchema.safeParse({
        baseRevision: 0,
        edits: Array(MAX_EDITS_PER_REQUEST + 1).fill(edit),
      }).success,
    ).toBe(false);
    expect(
      patchCellsSchema.safeParse({ baseRevision: 0, edits: [{ ...edit, row: 1_048_576 }] }).success,
    ).toBe(false);
  });
});
