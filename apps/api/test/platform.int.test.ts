import pino from 'pino';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations, loadMigrations } from '../src/db/migrate.js';
import { createPool } from '../src/db/pool.js';
import { seedDemoData, DEMO_PASSWORD, DEMO_USERS } from '../src/db/seed.js';
import { PENDING_ROUTES } from '../src/modules/pending/pending.routes.js';
import {
  createTestContext,
  ORIGIN,
  registerClient,
  type Client,
  type TestContext,
} from './helpers.js';
import { TEST_DATABASE_URL } from './test-env.js';

let ctx: TestContext;
let client: Client;
const silent = pino({ level: 'silent' });

beforeAll(async () => {
  ctx = await createTestContext();
  client = await registerClient(ctx.app, 'Platform Org');
});
afterAll(async () => ctx.close());

describe('health', () => {
  it('reports liveness and readiness', async () => {
    const live = await ctx.app.inject({ method: 'GET', url: '/api/v1/health/live' });
    expect(live.json()).toEqual({ data: { status: 'ok', version: '0.1.0' }, error: null });
    expect(live.headers['x-content-type-options']).toBe('nosniff');
    expect(live.headers['x-request-id']).toBeDefined();
    const ready = await ctx.app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(ready.json().data).toMatchObject({ status: 'ready', migrations: 2 });
  });

  it('returns 503 when the database is unreachable', async () => {
    const broken = createPool('postgres://nobody@127.0.0.1:1/none', 1);
    const { buildApp } = await import('../src/app.js');
    const { testConfig } = await import('./test-env.js');
    const app = await buildApp({ config: testConfig(), db: broken });
    const res = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(res.statusCode).toBe(503);
    await app.close();
    await broken.end();
  });

  it('echoes well-formed request ids', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
      headers: { 'x-request-id': 'req-12345678' },
    });
    expect(res.headers['x-request-id']).toBe('req-12345678');
  });
});

describe('error envelope', () => {
  it('returns 404 envelopes for unknown routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope?x=1' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      data: null,
      error: { code: 'NOT_FOUND', message: 'Route GET /api/v1/nope not found' },
    });
  });

  it('maps malformed JSON and oversized bodies', async () => {
    const bad = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      payload: '{nope',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('VALIDATION_FAILED');
    const small = await createTestContext({ BODY_LIMIT_BYTES: '1024' });
    const big = await small.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      payload: JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(5000) }),
    });
    expect(big.statusCode).toBe(413);
    await small.close();
  });

  it('rejects unsupported media types', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/xml', origin: ORIGIN },
      payload: '<x/>',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });
});

describe('pending endpoints', () => {
  it('registers every pending route and answers 501 with a ticket', async () => {
    expect(PENDING_ROUTES.length).toBeGreaterThanOrEqual(60);
    for (const route of PENDING_ROUTES) {
      const url = route.url
        .replace(':workbookId', '00000000-0000-4000-8000-000000000001')
        .replace(':sheetId', '00000000-0000-4000-8000-000000000002')
        .replace(/:([a-zA-Z]+)/g, '1');
      const res = await client.request(
        route.method,
        url,
        route.method === 'GET' || route.method === 'DELETE' ? undefined : {},
      );
      expect(res.statusCode, `${route.method} ${url}`).toBe(501);
      expect(res.json().error).toMatchObject({
        code: 'NOT_IMPLEMENTED',
        details: { ticket: route.ticket },
      });
    }
  });

  it('still requires authentication for pending routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/members' });
    expect(res.statusCode).toBe(401);
    const reset = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset',
      headers: { origin: ORIGIN },
      payload: {},
    });
    expect(reset.statusCode).toBe(501);
  });
});

describe('formula tooling', () => {
  it('lists the function catalog', async () => {
    const res = await client.request('GET', '/api/v1/formulas/functions');
    expect(res.json().meta.count).toBeGreaterThanOrEqual(40);
    expect(res.json().data.find((f: { name: string }) => f.name === 'VLOOKUP').category).toBe(
      'lookup',
    );
  });

  it('parses formulas into a normalized form with references', async () => {
    const ok = await client.request('POST', '/api/v1/formulas/parse', {
      formula: '=sum(a1:b2, Data!C3)*2',
    });
    expect(ok.json().data).toMatchObject({
      valid: true,
      normalized: '=SUM(A1:B2,Data!C3)*2',
      references: {
        cells: [{ sheet: 'Data', row: 2, col: 2 }],
        ranges: [{ sheet: null, top: 0, left: 0, bottom: 1, right: 1 }],
      },
    });
    const bad = await client.request('POST', '/api/v1/formulas/parse', { formula: 'SUM(1' });
    expect(bad.json().data).toMatchObject({ valid: false, position: 5 });
  });
});

describe('migrations', () => {
  it('is idempotent and detects edited migrations', async () => {
    const db = createPool(TEST_DATABASE_URL, 2);
    try {
      expect(await runMigrations(db, silent)).toEqual([]);
      const files = await loadMigrations();
      expect(files.map((f) => f.name)).toEqual([
        '0001_foundation.sql',
        '0002_workbooks_and_cells.sql',
      ]);
      const dir = await mkdtemp(path.join(tmpdir(), 'gc-mig-'));
      await writeFile(path.join(dir, '0001_foundation.sql'), '-- edited');
      await expect(runMigrations(db, silent, dir)).rejects.toThrow('was modified');
    } finally {
      await db.end();
    }
  });

  it('wraps a failing migration in a descriptive error and rolls it back', async () => {
    const db = createPool(TEST_DATABASE_URL, 2);
    try {
      const dir = await mkdtemp(path.join(tmpdir(), 'gc-mig-'));
      for (const file of await loadMigrations())
        await writeFile(path.join(dir, file.name), file.sql);
      await writeFile(
        path.join(dir, '0099_broken.sql'),
        'CREATE TABLE gc_tmp (id int); SELECT nope_fn();',
      );
      await expect(runMigrations(db, silent, dir)).rejects.toThrow(
        'Migration 0099_broken.sql failed',
      );
      const { rows } = await db.query(`SELECT to_regclass('gc_tmp') AS t`);
      expect(rows[0].t).toBeNull();
    } finally {
      await db.end();
    }
  });
});

describe('seed', () => {
  it('creates demo users and a calculated workbook once', async () => {
    await seedDemoData(ctx.db, silent);
    await seedDemoData(ctx.db, silent);
    const users = await ctx.db.query('SELECT email FROM users WHERE email = ANY($1)', [
      DEMO_USERS.map((u) => u.email),
    ]);
    expect(users.rowCount).toBe(3);
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: DEMO_USERS[0].email, password: DEMO_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    const { rows } = await ctx.db.query(
      `SELECT c.raw, c.value FROM cells c JOIN workbooks w ON w.id = c.workbook_id
        WHERE w.name = 'Quarterly budget FY26' AND c.raw LIKE '=INDEX%'`,
    );
    expect(rows[0].value).toEqual({ type: 'string', value: 'Salaries' });
    const errors = await ctx.db.query(
      `SELECT count(*)::int AS n FROM cells WHERE value_type = 'error' AND raw = '=B2/0'`,
    );
    expect(errors.rows[0].n).toBeGreaterThanOrEqual(1);
  });
});
