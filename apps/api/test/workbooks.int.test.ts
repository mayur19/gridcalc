import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  createTestContext,
  registerClient,
  type Client,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let owner: Client;

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await registerClient(ctx.app, 'Workbook Org');
});
afterAll(async () => ctx.close());

async function createWorkbook(client: Client, name = 'Budget') {
  const res = await client.request('POST', '/api/v1/workbooks', { name });
  expect(res.statusCode).toBe(201);
  return res.json().data as {
    id: string;
    revision: number;
    sheets: { id: string; name: string }[];
  };
}

const cellsUrl = (wb: string) => `/api/v1/workbooks/${wb}/cells`;

describe('workbooks', () => {
  it('creates a workbook with a default sheet and lists it', async () => {
    const wb = await createWorkbook(owner, 'Forecast');
    expect(wb.revision).toBe(1);
    expect(wb.sheets.map((s) => s.name)).toEqual(['Sheet1']);
    const list = await owner.request('GET', '/api/v1/workbooks?limit=100');
    expect(list.statusCode).toBe(200);
    expect(list.json().data.map((w: { id: string }) => w.id)).toContain(wb.id);
    expect(list.json().meta).toMatchObject({ limit: 100, offset: 0 });
    const one = await owner.request('GET', `/api/v1/workbooks/${wb.id}`);
    expect(one.json().data.sheets).toHaveLength(1);
  });

  it('validates ids, bodies and query strings', async () => {
    expect((await owner.request('GET', '/api/v1/workbooks/not-a-uuid')).statusCode).toBe(400);
    expect((await owner.request('POST', '/api/v1/workbooks', { name: '' })).statusCode).toBe(400);
    expect((await owner.request('GET', '/api/v1/workbooks?limit=1000')).statusCode).toBe(400);
    const missing = await owner.request(
      'GET',
      '/api/v1/workbooks/00000000-0000-4000-8000-000000000000',
    );
    expect(missing.statusCode).toBe(404);
  });
});

describe('cell editing and recalculation', () => {
  it('persists values, computes formulas and returns only changed cells', async () => {
    const wb = await createWorkbook(owner);
    const sheetId = wb.sheets[0]!.id;
    const first = await owner.request('PATCH', cellsUrl(wb.id), {
      baseRevision: wb.revision,
      edits: [
        { sheetId, row: 0, col: 0, raw: '10' },
        { sheetId, row: 1, col: 0, raw: '32' },
        { sheetId, row: 2, col: 0, raw: '=SUM(A1:A2)' },
        { sheetId, row: 3, col: 0, raw: '=A3*2' },
      ],
    });
    expect(first.statusCode).toBe(200);
    const data = first.json().data;
    expect(data.revision).toBe(2);
    expect(data.changed.find((c: { row: number }) => c.row === 3).value).toEqual({
      type: 'number',
      value: 84,
    });

    const second = await owner.request('PATCH', cellsUrl(wb.id), {
      baseRevision: 2,
      edits: [{ sheetId, row: 0, col: 0, raw: '20' }],
    });
    const changed = second
      .json()
      .data.changed.map((c: { row: number; value: { value: number } }) => [c.row, c.value.value]);
    expect(changed).toEqual([
      [0, 20],
      [2, 52],
      [3, 104],
    ]);
    expect(second.json().data.evaluated).toBe(2);

    const read = await owner.request('GET', `/api/v1/workbooks/${wb.id}/sheets/${sheetId}/cells`);
    expect(read.json().meta).toMatchObject({ revision: 3, count: 4 });
    expect(read.json().data[2]).toMatchObject({
      raw: '=SUM(A1:A2)',
      value: { type: 'number', value: 52 },
    });

    const windowed = await owner.request(
      'GET',
      `/api/v1/workbooks/${wb.id}/sheets/${sheetId}/cells?range=A3:B4`,
    );
    expect(windowed.json().data).toHaveLength(2);

    const revisions = await ctx.db.query(
      'SELECT revision, kind, edit_count FROM workbook_revisions WHERE workbook_id = $1 ORDER BY revision',
      [wb.id],
    );
    expect(revisions.rows.map((r) => r.kind)).toEqual(['workbook.created', 'cells', 'cells']);
  });

  it('clears cells, stores errors and reports cycles', async () => {
    const wb = await createWorkbook(owner);
    const sheetId = wb.sheets[0]!.id;
    await owner.request('PATCH', cellsUrl(wb.id), {
      baseRevision: 1,
      edits: [
        { sheetId, row: 0, col: 0, raw: '5' },
        { sheetId, row: 0, col: 1, raw: '=A1/0' },
        { sheetId, row: 0, col: 2, raw: '=D1' },
        { sheetId, row: 0, col: 3, raw: '=C1' },
        { sheetId, row: 0, col: 4, raw: '=1+' },
      ],
    });
    const read = await owner.request('GET', `/api/v1/workbooks/${wb.id}/sheets/${sheetId}/cells`);
    const values = read.json().data.map((c: { value: { value: unknown } }) => c.value.value);
    expect(values).toEqual([5, '#DIV/0!', '#CYCLE!', '#CYCLE!', '#ERROR!']);

    const cleared = await owner.request('PATCH', cellsUrl(wb.id), {
      baseRevision: 2,
      edits: [
        { sheetId, row: 0, col: 0, raw: '' },
        { sheetId, row: 0, col: 3, raw: '7' },
      ],
    });
    expect(cleared.json().data.cycles).toBe(0);
    const after = await owner.request('GET', `/api/v1/workbooks/${wb.id}/sheets/${sheetId}/cells`);
    expect(after.json().data.map((c: { raw: string }) => c.raw)).toEqual([
      '=A1/0',
      '=D1',
      '7',
      '=1+',
    ]);
    expect(after.json().data[1].value).toEqual({ type: 'number', value: 7 });
  });

  it('rejects stale revisions with 409 and the current revision', async () => {
    const wb = await createWorkbook(owner);
    const sheetId = wb.sheets[0]!.id;
    await owner.request('PATCH', cellsUrl(wb.id), {
      baseRevision: 1,
      edits: [{ sheetId, row: 0, col: 0, raw: '1' }],
    });
    const stale = await owner.request('PATCH', cellsUrl(wb.id), {
      baseRevision: 1,
      edits: [{ sheetId, row: 0, col: 0, raw: '2' }],
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toMatchObject({
      code: 'REVISION_CONFLICT',
      details: { currentRevision: 2 },
    });
  });

  it('serializes concurrent writers: exactly one wins per revision', async () => {
    const wb = await createWorkbook(owner);
    const sheetId = wb.sheets[0]!.id;
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        owner.request('PATCH', cellsUrl(wb.id), {
          baseRevision: 1,
          edits: [{ sheetId, row: 0, col: 0, raw: String(i) }],
        }),
      ),
    );
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([200, 409, 409, 409, 409]);
  });

  it('rebuilds from Postgres when the cached engine is stale', async () => {
    const wb = await createWorkbook(owner);
    const sheetId = wb.sheets[0]!.id;
    await owner.request('PATCH', cellsUrl(wb.id), {
      baseRevision: 1,
      edits: [{ sheetId, row: 0, col: 1, raw: '=A1*3' }],
    });
    // Simulate another API instance committing revision 3 behind this process's back.
    await ctx.db.query(
      `INSERT INTO cells (sheet_id, row_idx, col_idx, workbook_id, raw, value_type, value, updated_revision)
       VALUES ($1, 0, 0, $2, '4', 'number', '{"type":"number","value":4}', 3)`,
      [sheetId, wb.id],
    );
    await ctx.db.query('UPDATE workbooks SET revision = 3 WHERE id = $1', [wb.id]);
    const res = await owner.request('PATCH', cellsUrl(wb.id), {
      baseRevision: 3,
      edits: [{ sheetId, row: 0, col: 2, raw: '=B1+1' }],
    });
    expect(res.json().data.changed[0].value).toEqual({ type: 'number', value: 13 });
  });

  it('rejects edits to sheets of other workbooks and invalid ranges', async () => {
    const a = await createWorkbook(owner);
    const b = await createWorkbook(owner);
    const res = await owner.request('PATCH', cellsUrl(a.id), {
      baseRevision: 1,
      edits: [{ sheetId: b.sheets[0]!.id, row: 0, col: 0, raw: '1' }],
    });
    expect(res.statusCode).toBe(400);
    const bad = await owner.request(
      'GET',
      `/api/v1/workbooks/${a.id}/sheets/${a.sheets[0]!.id}/cells?range=nope`,
    );
    expect(bad.statusCode).toBe(400);
    const huge = await owner.request(
      'GET',
      `/api/v1/workbooks/${a.id}/sheets/${a.sheets[0]!.id}/cells?range=A1:Z100000`,
    );
    expect(huge.statusCode).toBe(400);
    const wrongSheet = await owner.request(
      'GET',
      `/api/v1/workbooks/${a.id}/sheets/${b.sheets[0]!.id}/cells`,
    );
    expect(wrongSheet.statusCode).toBe(404);
  });

  it('enforces the per-workbook cell limit and leaves state unchanged', async () => {
    const small = await createTestContext({ MAX_CELLS_PER_WORKBOOK: '3' });
    try {
      const client = await registerClient(small.app);
      const res = await client.request('POST', '/api/v1/workbooks', { name: 'Tiny' });
      const wb = res.json().data;
      const sheetId = wb.sheets[0].id;
      const edits = Array.from({ length: 4 }, (_, i) => ({
        sheetId,
        row: i,
        col: 0,
        raw: String(i),
      }));
      const tooMany = await client.request('PATCH', cellsUrl(wb.id), { baseRevision: 1, edits });
      expect(tooMany.statusCode).toBe(413);
      const ok = await client.request('PATCH', cellsUrl(wb.id), {
        baseRevision: 1,
        edits: edits.slice(0, 2),
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().data.revision).toBe(2);
    } finally {
      await small.close();
    }
  });
});

describe('sheets', () => {
  it('adds a sheet and recalculates formulas that were waiting for it', async () => {
    const wb = await createWorkbook(owner);
    const sheetId = wb.sheets[0]!.id;
    await owner.request('PATCH', cellsUrl(wb.id), {
      baseRevision: 1,
      edits: [{ sheetId, row: 0, col: 0, raw: '=Rates!A1+1' }],
    });
    const res = await owner.request('POST', `/api/v1/workbooks/${wb.id}/sheets`, { name: 'Rates' });
    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.sheet).toMatchObject({ name: 'Rates', position: 1 });
    expect(data.revision).toBe(3);
    expect(data.changed[0].value).toEqual({ type: 'number', value: 1 });

    const edit = await owner.request('PATCH', cellsUrl(wb.id), {
      baseRevision: 3,
      edits: [{ sheetId: data.sheet.id, row: 0, col: 0, raw: '41' }],
    });
    expect(
      edit.json().data.changed.map((c: { value: { value: number } }) => c.value.value),
    ).toEqual([41, 42]);

    const dup = await owner.request('POST', `/api/v1/workbooks/${wb.id}/sheets`, { name: 'rates' });
    expect(dup.statusCode).toBe(409);
    const invalid = await owner.request('POST', `/api/v1/workbooks/${wb.id}/sheets`, {
      name: 'a/b',
    });
    expect(invalid.statusCode).toBe(400);
  });
});

describe('authorization and tenancy', () => {
  it('lets viewers read but not write, and editors write', async () => {
    const wb = await createWorkbook(owner);
    const viewer = await addMember(ctx, owner, 'viewer');
    const editor = await addMember(ctx, owner, 'editor');
    expect((await viewer.request('GET', `/api/v1/workbooks/${wb.id}`)).statusCode).toBe(200);
    const denied = await viewer.request('PATCH', cellsUrl(wb.id), {
      baseRevision: 1,
      edits: [{ sheetId: wb.sheets[0]!.id, row: 0, col: 0, raw: '1' }],
    });
    expect(denied.statusCode).toBe(403);
    expect((await viewer.request('POST', '/api/v1/workbooks', { name: 'x' })).statusCode).toBe(403);
    const allowed = await editor.request('PATCH', cellsUrl(wb.id), {
      baseRevision: 1,
      edits: [{ sheetId: wb.sheets[0]!.id, row: 0, col: 0, raw: '1' }],
    });
    expect(allowed.statusCode).toBe(200);
  });

  it('isolates organizations', async () => {
    const wb = await createWorkbook(owner);
    const outsider = await registerClient(ctx.app, 'Other Org');
    expect((await outsider.request('GET', `/api/v1/workbooks/${wb.id}`)).statusCode).toBe(404);
    expect(
      (
        await outsider.request('PATCH', cellsUrl(wb.id), {
          baseRevision: 1,
          edits: [{ sheetId: wb.sheets[0]!.id, row: 0, col: 0, raw: '1' }],
        })
      ).statusCode,
    ).toBe(404);
    const list = await outsider.request('GET', '/api/v1/workbooks');
    expect(list.json().data).toEqual([]);
  });

  it('requires authentication', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/workbooks' });
    expect(res.statusCode).toBe(401);
  });
});
