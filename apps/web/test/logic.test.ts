import { describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiRequestError, readCookie } from '../src/api/client';
import { cellAlignment, cellName, displayValue } from '../src/pages/workbook/cell-display';
import { applyChanges, sheetFromList } from '../src/pages/workbook/cell-store';
import { actionForKey, move } from '../src/pages/workbook/keyboard';
import { scrollIntoView, visibleSpan } from '../src/pages/workbook/virtualization';
import { findNavItem, NAV_ITEMS } from '../src/routes/navigation';

describe('virtualization', () => {
  it('renders a bounded window regardless of sheet size', () => {
    const span = visibleSpan(24_000, 480, 24, 100_000, 3);
    expect(span).toEqual({ start: 997, end: 1024 });
    expect(span.end - span.start).toBeLessThan(40);
  });

  it('clamps at the edges and handles empty sheets', () => {
    expect(visibleSpan(0, 480, 24, 100_000)).toMatchObject({ start: 0 });
    expect(visibleSpan(10_000_000, 480, 24, 100).end).toBe(99);
    expect(visibleSpan(0, 480, 24, 0)).toEqual({ start: 0, end: -1 });
    expect(visibleSpan(-50, -1, 24, 10)).toEqual({ start: 0, end: 4 });
  });

  it('computes scroll offsets to reveal a cell', () => {
    expect(scrollIntoView(10, 24, 0, 480)).toBeNull();
    expect(scrollIntoView(30, 24, 0, 480)).toBe(31 * 24 - 480);
    expect(scrollIntoView(2, 24, 200, 480)).toBe(48);
  });
});

describe('keyboard', () => {
  const bounds = { rows: 100, cols: 26 };
  const at = { row: 5, col: 5 };
  const mods = { shift: false, ctrl: false };

  it('moves and clamps', () => {
    expect(move({ row: 0, col: 0 }, -1, -1, bounds)).toEqual({ row: 0, col: 0 });
    expect(actionForKey('ArrowDown', mods, at, bounds)).toEqual({
      type: 'move',
      to: { row: 6, col: 5 },
    });
    expect(actionForKey('ArrowUp', mods, at, bounds)).toEqual({
      type: 'move',
      to: { row: 4, col: 5 },
    });
    expect(actionForKey('ArrowLeft', mods, at, bounds)).toEqual({
      type: 'move',
      to: { row: 5, col: 4 },
    });
    expect(actionForKey('ArrowRight', mods, at, bounds)).toEqual({
      type: 'move',
      to: { row: 5, col: 6 },
    });
    expect(actionForKey('Tab', { shift: true, ctrl: false }, at, bounds)).toEqual({
      type: 'move',
      to: { row: 5, col: 4 },
    });
    expect(actionForKey('PageDown', mods, at, bounds)).toEqual({
      type: 'move',
      to: { row: 25, col: 5 },
    });
    expect(actionForKey('PageUp', mods, at, bounds)).toEqual({
      type: 'move',
      to: { row: 0, col: 5 },
    });
    expect(actionForKey('Home', mods, at, bounds)).toEqual({
      type: 'move',
      to: { row: 5, col: 0 },
    });
  });

  it('jumps to edges with ctrl', () => {
    const ctrl = { shift: false, ctrl: true };
    expect(actionForKey('ArrowDown', ctrl, at, bounds)).toEqual({
      type: 'move',
      to: { row: 99, col: 5 },
    });
    expect(actionForKey('ArrowUp', ctrl, at, bounds)).toEqual({
      type: 'move',
      to: { row: 0, col: 5 },
    });
    expect(actionForKey('ArrowLeft', ctrl, at, bounds)).toEqual({
      type: 'move',
      to: { row: 5, col: 0 },
    });
    expect(actionForKey('ArrowRight', ctrl, at, bounds)).toEqual({
      type: 'move',
      to: { row: 5, col: 25 },
    });
    expect(actionForKey('Home', ctrl, at, bounds)).toEqual({
      type: 'move',
      to: { row: 0, col: 0 },
    });
    expect(actionForKey('c', ctrl, at, bounds)).toEqual({ type: 'none' });
  });

  it('starts editing, clears, or ignores', () => {
    expect(actionForKey('Enter', mods, at, bounds)).toEqual({ type: 'edit', initial: null });
    expect(actionForKey('F2', mods, at, bounds)).toEqual({ type: 'edit', initial: null });
    expect(actionForKey('=', mods, at, bounds)).toEqual({ type: 'edit', initial: '=' });
    expect(actionForKey('Delete', mods, at, bounds)).toEqual({ type: 'clear' });
    expect(actionForKey('Backspace', mods, at, bounds)).toEqual({ type: 'clear' });
    expect(actionForKey('Shift', mods, at, bounds)).toEqual({ type: 'none' });
  });
});

describe('cell display', () => {
  it('formats values', () => {
    expect(displayValue(undefined)).toBe('');
    expect(displayValue({ type: 'empty', value: null })).toBe('');
    expect(displayValue({ type: 'number', value: 0.1 + 0.2 })).toBe('0.3');
    expect(displayValue({ type: 'boolean', value: true })).toBe('TRUE');
    expect(displayValue({ type: 'boolean', value: false })).toBe('FALSE');
    expect(displayValue({ type: 'error', value: '#DIV/0!' })).toBe('#DIV/0!');
    expect(displayValue({ type: 'string', value: 'hi' })).toBe('hi');
    expect(cellAlignment({ type: 'number', value: 1 })).toBe('right');
    expect(cellAlignment({ type: 'error', value: '#N/A' })).toBe('center');
    expect(cellAlignment({ type: 'string', value: 'x' })).toBe('left');
    expect(cellAlignment(undefined)).toBe('left');
    expect(cellName(9, 27)).toBe('AB10');
  });
});

describe('cell store', () => {
  const cell = (sheetId: string, row: number, col: number, raw: string) => ({
    sheetId,
    row,
    col,
    raw,
    value: { type: 'string' as const, value: raw },
  });

  it('applies changes immutably and removes cleared cells', () => {
    const before = new Map([['s1', sheetFromList([cell('s1', 0, 0, 'a'), cell('s1', 1, 0, 'b')])]]);
    const after = applyChanges(before, [
      cell('s1', 0, 0, ''),
      cell('s1', 2, 0, 'c'),
      cell('s2', 0, 0, 'x'),
    ]);
    expect(before.get('s1')?.size).toBe(2);
    expect([...after.get('s1')!.keys()]).toEqual(['1:0', '2:0']);
    expect(after.has('s2')).toBe(false);
  });
});

describe('navigation', () => {
  it('marks planned sections with tickets', () => {
    const planned = NAV_ITEMS.filter((item) => item.status === 'planned');
    expect(planned.length).toBeGreaterThanOrEqual(6);
    for (const item of planned) expect(item.ticket).toMatch(/^GC-\d{3}$/);
    expect(findNavItem('/workbooks')?.status).toBe('available');
    expect(findNavItem('/nope')).toBeUndefined();
  });
});

describe('api client', () => {
  const json = (status: number, body: unknown) =>
    vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body } as Response);

  it('reads cookies', () => {
    expect(readCookie('gc_csrf', 'a=1; gc_csrf=abc%3D; b=2')).toBe('abc=');
    expect(readCookie('missing', 'a=1')).toBeNull();
  });

  it('unwraps envelopes and sends the CSRF header on mutations', async () => {
    document.cookie = 'gc_csrf=token123';
    const fetchImpl = json(200, { data: { ok: 1 }, error: null, meta: { total: 1 } });
    const result = await apiRequest('POST', '/api/v1/x', { a: 1 }, fetchImpl);
    expect(result).toEqual({ data: { ok: 1 }, meta: { total: 1 } });
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('token123');
    const get = json(200, { data: 2, error: null });
    expect(await apiRequest('GET', '/x', undefined, get)).toEqual({ data: 2 });
    expect(
      ((get.mock.calls[0]![1] as RequestInit).headers as Record<string, string>)['x-csrf-token'],
    ).toBeUndefined();
  });

  it('throws typed errors', async () => {
    await expect(
      apiRequest(
        'GET',
        '/x',
        undefined,
        json(409, { data: null, error: { code: 'REVISION_CONFLICT', message: 'changed' } }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: 'REVISION_CONFLICT',
    });
    const notJson = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('html');
      },
    } as unknown as Response);
    await expect(apiRequest('GET', '/x', undefined, notJson)).rejects.toMatchObject({
      code: 'UNKNOWN',
      status: 502,
    });
    const offline = vi.fn().mockRejectedValue(new TypeError('failed'));
    await expect(apiRequest('GET', '/x', undefined, offline)).rejects.toBeInstanceOf(
      ApiRequestError,
    );
  });
});
