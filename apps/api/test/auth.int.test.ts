import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REGISTRATION_REJECTED_MESSAGE } from '../src/modules/auth/auth.service.js';
import {
  clientFrom,
  cookieHeader,
  createTestContext,
  ORIGIN,
  PASSWORD,
  registerClient,
  uniqueEmail,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());

const post = (url: string, payload: object, headers: Record<string, string> = { origin: ORIGIN }) =>
  ctx.app.inject({ method: 'POST', url, payload, headers });

describe('registration', () => {
  it('creates an organization, owner session and audit event', async () => {
    const email = uniqueEmail('owner');
    const res = await post('/api/v1/auth/register', {
      organizationName: 'Acme Analytics',
      displayName: 'Ada',
      email: email.toUpperCase(),
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data).toMatchObject({
      user: { email },
      organization: { name: 'Acme Analytics' },
      role: 'owner',
    });
    expect(body.data.permissions).toContain('org:manage');
    const session = res.cookies.find((c) => c.name === 'gc_session');
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    const csrf = res.cookies.find((c) => c.name === 'gc_csrf');
    expect(csrf?.httpOnly).toBeFalsy();
    expect(csrf?.value).toBe(body.data.csrfToken);
    const audit = await ctx.db.query('SELECT action FROM audit_events WHERE organization_id = $1', [
      body.data.organization.id,
    ]);
    expect(audit.rows.map((r) => r.action)).toContain('organization.registered');
    const stored = await ctx.db.query('SELECT password_hash FROM users WHERE email = $1', [email]);
    expect(stored.rows[0].password_hash).toMatch(/^scrypt\$/);
  });

  it('does not reveal whether an email is already registered', async () => {
    const client = await registerClient(ctx.app);
    const res = await post('/api/v1/auth/register', {
      organizationName: 'Other',
      displayName: 'B',
      email: client.email,
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({
      code: 'REGISTRATION_REJECTED',
      message: REGISTRATION_REJECTED_MESSAGE,
    });
    expect(res.body).not.toMatch(/exist|taken|already registered/i);
  });

  it('validates input', async () => {
    const res = await post('/api/v1/auth/register', {
      organizationName: 'A',
      email: 'nope',
      password: 'short',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
    expect(res.json().error.details.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects cross-origin requests', async () => {
    const res = await post(
      '/api/v1/auth/register',
      { organizationName: 'Evil', displayName: 'E', email: uniqueEmail(), password: PASSWORD },
      { origin: 'https://evil.example' },
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('registration rate limit', () => {
  it('limits registrations per IP', async () => {
    const limited = await createTestContext({ REGISTER_RATE_LIMIT_MAX: '2' });
    try {
      const attempt = () =>
        limited.app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          headers: { origin: ORIGIN },
          payload: {
            organizationName: 'Rate',
            displayName: 'R',
            email: uniqueEmail(),
            password: PASSWORD,
          },
        });
      expect((await attempt()).statusCode).toBe(201);
      expect((await attempt()).statusCode).toBe(201);
      const third = await attempt();
      expect(third.statusCode).toBe(429);
      expect(third.headers['retry-after']).toBeDefined();
    } finally {
      await limited.close();
    }
  });
});

describe('login, me, logout', () => {
  it('signs in, returns the session and signs out', async () => {
    const owner = await registerClient(ctx.app, 'Login Org');
    const login = await post('/api/v1/auth/login', { email: owner.email, password: PASSWORD });
    expect(login.statusCode).toBe(200);
    const client = clientFrom(ctx.app, login, owner.email);

    const me = await client.request('GET', '/api/v1/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().data).toMatchObject({ user: { email: owner.email }, role: 'owner' });
    expect(me.json().data.sessionId).toBeUndefined();

    const logout = await client.request('POST', '/api/v1/auth/logout');
    expect(logout.statusCode).toBe(200);
    expect(logout.cookies.find((c) => c.name === 'gc_session')?.value).toBe('');
    const after = await client.request('GET', '/api/v1/auth/me');
    expect(after.statusCode).toBe(401);
    expect(after.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects bad credentials with a generic message', async () => {
    const owner = await registerClient(ctx.app);
    const wrong = await post('/api/v1/auth/login', {
      email: owner.email,
      password: 'wrong password!!',
    });
    const unknown = await post('/api/v1/auth/login', {
      email: uniqueEmail(),
      password: 'wrong password!!',
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().error.message).toBe(unknown.json().error.message);
  });

  it('requires a CSRF token for mutating requests with a session', async () => {
    const client = await registerClient(ctx.app);
    const missing = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: client.cookie, origin: ORIGIN },
    });
    expect(missing.statusCode).toBe(403);
    expect(missing.json().error.code).toBe('CSRF_TOKEN_INVALID');
    const wrong = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/workbooks',
      headers: { cookie: client.cookie, 'x-csrf-token': 'nope', origin: ORIGIN },
      payload: { name: 'x' },
    });
    expect(wrong.statusCode).toBe(403);
  });

  it('ignores forged or expired session cookies', async () => {
    const forged = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: 'gc_session=forged' },
    });
    expect(forged.statusCode).toBe(401);
    const client = await registerClient(ctx.app);
    await ctx.db.query(
      `UPDATE sessions SET expires_at = now() - interval '1 minute'
        WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [client.email],
    );
    expect((await client.request('GET', '/api/v1/auth/me')).statusCode).toBe(401);
  });

  it('touches last_seen_at at most once per minute', async () => {
    const client = await registerClient(ctx.app);
    await ctx.db.query(
      `UPDATE sessions SET last_seen_at = now() - interval '10 minutes' WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [client.email],
    );
    await client.request('GET', '/api/v1/auth/me');
    const { rows } = await ctx.db.query(
      `SELECT now() - last_seen_at < interval '1 minute' AS fresh FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [client.email],
    );
    expect(rows[0].fresh).toBe(true);
  });

  it('refuses login for users without a membership', async () => {
    const client = await registerClient(ctx.app);
    await ctx.db.query(
      'DELETE FROM memberships WHERE user_id = (SELECT id FROM users WHERE email = $1)',
      [client.email],
    );
    const res = await post('/api/v1/auth/login', { email: client.email, password: PASSWORD });
    expect(res.statusCode).toBe(403);
  });
});

describe('login throttling', () => {
  it('backs off per email after repeated failures, even from different IPs', async () => {
    const limited = await createTestContext({ LOGIN_RATE_LIMIT_MAX: '2' });
    try {
      const owner = await registerClient(limited.app);
      const attempt = (password: string, ip: string) =>
        limited.app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          remoteAddress: ip,
          headers: { origin: ORIGIN },
          payload: { email: owner.email, password },
        });
      expect((await attempt('bad password 1', '10.0.0.1')).statusCode).toBe(401);
      expect((await attempt('bad password 2', '10.0.0.2')).statusCode).toBe(401);
      expect((await attempt('bad password 3', '10.0.0.3')).statusCode).toBe(401);
      const locked = await attempt(PASSWORD, '10.0.0.4');
      expect(locked.statusCode).toBe(429);
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await limited.close();
    }
  });

  it('counts parallel bad logins before any password check completes', async () => {
    const limited = await createTestContext({ LOGIN_RATE_LIMIT_MAX: '2' });
    try {
      const owner = await registerClient(limited.app);
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          limited.app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            remoteAddress: `10.20.0.${i + 1}`,
            headers: { origin: ORIGIN },
            payload: { email: owner.email, password: `parallel guess ${i}` },
          }),
        ),
      );
      const codes = results.map((r) => r.statusCode);
      expect(codes.filter((c) => c === 401)).toHaveLength(3);
      expect(codes.filter((c) => c === 429)).toHaveLength(7);
    } finally {
      await limited.close();
    }
  });

  it('limits attempts per IP across different emails (password spraying)', async () => {
    const limited = await createTestContext({ LOGIN_IP_RATE_LIMIT_MAX: '3' });
    try {
      const spray = (email: string) =>
        limited.app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          remoteAddress: '10.9.9.9',
          headers: { origin: ORIGIN },
          payload: { email, password: 'Spring2026!!!' },
        });
      for (let i = 0; i < 3; i += 1) expect((await spray(uniqueEmail())).statusCode).toBe(401);
      expect((await spray(uniqueEmail())).statusCode).toBe(429);
    } finally {
      await limited.close();
    }
  });

  it('ignores X-Forwarded-For unless TRUST_PROXY is configured', async () => {
    const limited = await createTestContext({ LOGIN_IP_RATE_LIMIT_MAX: '1' });
    try {
      const attempt = (forwarded: string) =>
        limited.app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          remoteAddress: '10.1.1.1',
          headers: { origin: ORIGIN, 'x-forwarded-for': forwarded },
          payload: { email: uniqueEmail(), password: 'whatever-password' },
        });
      expect((await attempt('1.1.1.1')).statusCode).toBe(401);
      // A spoofed header must not reset the per-IP counter.
      expect((await attempt('2.2.2.2')).statusCode).toBe(429);
    } finally {
      await limited.close();
    }
  });

  it('honours X-Forwarded-For from a trusted proxy hop', async () => {
    const proxied = await createTestContext({ LOGIN_IP_RATE_LIMIT_MAX: '1', TRUST_PROXY: '1' });
    try {
      const attempt = (forwarded: string) =>
        proxied.app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          remoteAddress: '127.0.0.1',
          headers: { origin: ORIGIN, 'x-forwarded-for': forwarded },
          payload: { email: uniqueEmail(), password: 'whatever-password' },
        });
      expect((await attempt('3.3.3.3')).statusCode).toBe(401);
      expect((await attempt('4.4.4.4')).statusCode).toBe(401);
      expect((await attempt('3.3.3.3')).statusCode).toBe(429);
    } finally {
      await proxied.close();
    }
  });
});

describe('cookies helper', () => {
  it('serializes response cookies', async () => {
    const res = await post('/api/v1/auth/register', {
      organizationName: 'Cookie Org',
      displayName: 'C',
      email: uniqueEmail(),
      password: PASSWORD,
    });
    expect(cookieHeader(res)).toMatch(/gc_session=.+; gc_csrf=.+/);
  });
});
