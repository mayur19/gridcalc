import { RecalcEngine } from '@gridcalc/shared';
import { describe, expect, it } from 'vitest';
import { toFastifyTrustProxy } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { AppError } from '../src/http/errors.js';
import { parseInput } from '../src/http/validate.js';
import { normalizeIp } from '../src/modules/auth/client-ip.js';
import { LoginThrottle } from '../src/modules/auth/login-throttle.js';
import { dummyPasswordHash, hashPassword, verifyPassword } from '../src/modules/auth/password.js';
import { FixedWindowRateLimiter } from '../src/modules/auth/rate-limiter.js';
import { randomToken, safeEqual, sessionIdFor } from '../src/modules/auth/tokens.js';
import { hasPermission, permissionsFor } from '../src/modules/rbac/permissions.js';
import { EngineCache } from '../src/modules/workbooks/engine-cache.js';
import { z } from 'zod';

const baseEnv = { DATABASE_URL: 'postgres:///x', SESSION_SECRET: 's'.repeat(40) };

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig(baseEnv);
    expect(config.API_PORT).toBe(4107);
    expect(config.COOKIE_SECURE).toBe(false);
    expect(config.TRUST_PROXY).toBe(false);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('reports every invalid variable', () => {
    expect(() => loadConfig({ SESSION_SECRET: 'short' })).toThrow(
      /DATABASE_URL[\s\S]*SESSION_SECRET/,
    );
  });

  it('requires secure cookies in production', () => {
    expect(() => loadConfig({ ...baseEnv, NODE_ENV: 'production' })).toThrow('COOKIE_SECURE');
    expect(() => loadConfig({ ...baseEnv, NODE_ENV: 'production', COOKIE_SECURE: 'true' })).toThrow(
      'TRUST_PROXY must be set',
    );
    expect(
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'true',
        TRUST_PROXY: 'false',
      }).TRUST_PROXY,
    ).toBe(false);
    expect(
      loadConfig({ ...baseEnv, NODE_ENV: 'production', COOKIE_SECURE: 'true', TRUST_PROXY: '1' })
        .TRUST_PROXY,
    ).toBe(1);
  });

  it('parses TRUST_PROXY as false, a hop count or a proxy list, never true', () => {
    expect(loadConfig({ ...baseEnv, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(loadConfig({ ...baseEnv, TRUST_PROXY: '10.0.0.0/8, 127.0.0.1' }).TRUST_PROXY).toEqual([
      '10.0.0.0/8',
      '127.0.0.1',
    ]);
    expect(loadConfig({ ...baseEnv, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
    expect(() => loadConfig({ ...baseEnv, TRUST_PROXY: 'true' })).toThrow('TRUST_PROXY');
    expect(() => loadConfig({ ...baseEnv, TRUST_PROXY: 'evil.example' })).toThrow('TRUST_PROXY');
  });

  it('maps hop counts to a Fastify predicate', () => {
    const predicate = toFastifyTrustProxy(1) as (address: string, hop: number) => boolean;
    expect(predicate('10.0.0.1', 0)).toBe(true);
    expect(predicate('10.0.0.2', 1)).toBe(false);
    expect(toFastifyTrustProxy(false)).toBe(false);
    expect(toFastifyTrustProxy(['127.0.0.1'])).toEqual(['127.0.0.1']);
  });
});

describe('passwords and tokens', () => {
  it('hashes with scrypt and verifies', async () => {
    const hash = await hashPassword('a long passphrase');
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(await verifyPassword('a long passphrase', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await hashPassword('a long passphrase')).not.toBe(hash);
  });

  it('rejects malformed hashes', async () => {
    expect(await verifyPassword('x', 'bcrypt$whatever')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$a$b$c$d$e')).toBe(false);
    expect(await verifyPassword('x', await dummyPasswordHash())).toBe(false);
  });

  it('derives session ids and compares safely', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessionIdFor('k', token)).toHaveLength(64);
    expect(sessionIdFor('k', token)).not.toBe(sessionIdFor('other', token));
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('FixedWindowRateLimiter', () => {
  it('blocks after max hits and recovers after the window', () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter(2, 1000, () => now);
    expect(limiter.hit('k').allowed).toBe(true);
    expect(limiter.hit('k')).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.hit('k')).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.hit('other').allowed).toBe(true);
    now = 1000;
    expect(limiter.hit('k').allowed).toBe(true);
    limiter.reset('k');
  });

  it('prunes expired windows when large', () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter(1, 10, () => now);
    for (let i = 0; i < 10_001; i += 1) limiter.hit(`k${i}`);
    now = 100;
    expect(limiter.hit('fresh').allowed).toBe(true);
  });
});

describe('normalizeIp', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::FFFF:10.0.0.1', '10.0.0.1'],
    ['2001:db8:abcd:12:1:2:3:4', '2001:db8:abcd:12::/64'],
    ['2001:db8:abcd:12::99', '2001:db8:abcd:12::/64'],
    ['2001:0db8:0000:0012:ffff::1', '2001:db8:0:12::/64'],
    ['::1', '0:0:0:0::/64'],
    ['fe80::1%en0', 'fe80:0:0:0::/64'],
    ['64:ff9b::192.0.2.33', '64:ff9b:0:0::/64'],
    ['not-an-ip', 'not-an-ip'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeIp(input)).toBe(expected);
  });
});

describe('LoginThrottle', () => {
  const opts = { ipMax: 1000, windowMs: 900_000, maxEmailsPerIp: 1000 };

  it('limits attempts per IP across many emails (password spraying)', () => {
    const throttle = new LoginThrottle({ ...opts, ipMax: 3, freeFailures: 5, now: () => 0 });
    expect(throttle.check('1.1.1.1', 'a@x').allowed).toBe(true);
    expect(throttle.check('1.1.1.1', 'b@x').allowed).toBe(true);
    expect(throttle.check('::ffff:1.1.1.1', 'c@x').allowed).toBe(true);
    expect(throttle.check('1.1.1.1', 'd@x')).toMatchObject({ allowed: false, reason: 'ip' });
    expect(throttle.check('2.2.2.2', 'd@x').allowed).toBe(true);
  });

  it('treats a whole IPv6 /64 as one client', () => {
    const throttle = new LoginThrottle({ ...opts, ipMax: 2, freeFailures: 5, now: () => 0 });
    expect(throttle.check('2001:db8:1:2::1', 'a@x').allowed).toBe(true);
    expect(throttle.check('2001:db8:1:2::2', 'b@x').allowed).toBe(true);
    expect(throttle.check('2001:db8:1:2:ffff::3', 'c@x')).toMatchObject({
      allowed: false,
      reason: 'ip',
    });
  });

  it('caps distinct emails per IP per window', () => {
    let now = 0;
    const throttle = new LoginThrottle({
      ...opts,
      maxEmailsPerIp: 2,
      windowMs: 1000,
      freeFailures: 50,
      now: () => now,
    });
    expect(throttle.check('5.5.5.5', 'a@x').allowed).toBe(true);
    expect(throttle.check('5.5.5.5', 'b@x').allowed).toBe(true);
    expect(throttle.check('5.5.5.5', 'a@x').allowed).toBe(true);
    expect(throttle.check('5.5.5.5', 'c@x')).toMatchObject({ allowed: false, reason: 'ip' });
    now = 1000;
    expect(throttle.check('5.5.5.5', 'c@x').allowed).toBe(true);
  });

  it('reserves attempts synchronously so parallel checks cannot all pass', () => {
    const throttle = new LoginThrottle({ ...opts, freeFailures: 2, now: () => 0 });
    const decisions = Array.from({ length: 10 }, (_, i) => throttle.check(`9.9.9.${i}`, 'v@x'));
    expect(decisions.filter((d) => d.allowed)).toHaveLength(3);
    expect(decisions[3]).toMatchObject({ allowed: false, reason: 'email' });
  });

  it('applies progressive per-email backoff and resets on success', () => {
    let now = 0;
    const throttle = new LoginThrottle({
      ...opts,
      freeFailures: 2,
      baseLockMs: 1000,
      now: () => now,
    });
    expect(throttle.check('1', 'v@x').allowed).toBe(true); // 1
    expect(throttle.check('2', 'v@x').allowed).toBe(true); // 2
    expect(throttle.check('3', 'v@x').allowed).toBe(true); // 3 -> lock 1s
    expect(throttle.check('4', 'v@x')).toMatchObject({
      allowed: false,
      reason: 'email',
      retryAfterSeconds: 1,
    });
    now = 1001;
    expect(throttle.check('5', 'v@x').allowed).toBe(true); // 4 -> lock 2s
    expect(throttle.check('6', 'v@x')).toMatchObject({ allowed: false, retryAfterSeconds: 2 });
    now = 3002;
    expect(throttle.check('7', 'v@x').allowed).toBe(true); // 5 -> lock 4s
    expect(throttle.check('8', 'v@x')).toMatchObject({ allowed: false, retryAfterSeconds: 4 });
    throttle.recordSuccess('v@x');
    expect(throttle.check('9', 'v@x').allowed).toBe(true);
  });

  it('caps the lock and forgets history after a quiet window', () => {
    let now = 0;
    const throttle = new LoginThrottle({
      ...opts,
      windowMs: 10_000,
      freeFailures: 0,
      baseLockMs: 1000,
      maxLockMs: 5000,
      now: () => now,
    });
    for (let i = 0; i < 10; i += 1) {
      throttle.check('1', 'c@x');
      now += 6000;
    }
    now = 54_000;
    expect(throttle.check('1', 'c@x')).toMatchObject({ allowed: false, retryAfterSeconds: 5 });
    now = 200_000;
    expect(throttle.check('1', 'c@x').allowed).toBe(true);
    expect(throttle.check('1', 'c@x')).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
  });

  it('sweeps expired entries when the store is full', () => {
    let now = 0;
    const throttle = new LoginThrottle({
      ...opts,
      windowMs: 100,
      freeFailures: 10,
      maxEntries: 3,
      now: () => now,
    });
    for (const email of ['a', 'b', 'c']) throttle.check('1', email);
    now = 500;
    throttle.check('1', 'd');
    expect(throttle.size).toBe(3);
  });

  it('evicts the active entry with the least time left (never locks everyone out)', () => {
    let now = 0;
    const warnings: string[] = [];
    const throttle = new LoginThrottle({
      ...opts,
      freeFailures: 0,
      baseLockMs: 1000,
      maxEntries: 2,
      now: () => now,
      onWarn: (message) => warnings.push(message),
    });
    throttle.check('1', 'long'); // lock 1s
    now = 2000;
    throttle.check('1', 'long'); // lock 2s -> until 4000
    throttle.check('1', 'short'); // lock 1s -> until 3000
    throttle.check('1', 'newcomer'); // store full of active entries: evict "short"
    expect(warnings).toHaveLength(1);
    expect(throttle.size).toBe(2);
    expect(throttle.check('1', 'short').allowed).toBe(true);
    expect(throttle.check('1', 'long')).toMatchObject({ allowed: false });
  });
});

describe('RBAC', () => {
  it('maps roles to permissions', () => {
    expect(hasPermission('owner', 'org:manage')).toBe(true);
    expect(hasPermission('admin', 'org:manage')).toBe(false);
    expect(hasPermission('editor', 'workbook:write')).toBe(true);
    expect(hasPermission('viewer', 'workbook:write')).toBe(false);
    expect(permissionsFor('viewer')).toEqual(['workbook:read']);
  });
});

describe('EngineCache', () => {
  const engine = () => RecalcEngine.create([{ id: 's', name: 'S' }], []);

  it('returns engines only for the matching revision', () => {
    const cache = new EngineCache(2);
    const e = engine();
    cache.set('w1', 3, e);
    expect(cache.get('w1', 3)).toBe(e);
    expect(cache.get('w1', 4)).toBeNull();
    expect(cache.get('w1', 3)).toBeNull();
  });

  it('evicts the least recently used entry', () => {
    const cache = new EngineCache(2);
    cache.set('a', 1, engine());
    cache.set('b', 1, engine());
    cache.get('a', 1);
    cache.set('c', 1, engine());
    expect(cache.get('b', 1)).toBeNull();
    expect(cache.get('a', 1)).not.toBeNull();
    expect(cache.size).toBe(2);
    cache.invalidate('a');
    expect(cache.size).toBe(1);
  });

  it('is disabled with capacity 0', () => {
    const cache = new EngineCache(0);
    cache.set('a', 1, engine());
    expect(cache.size).toBe(0);
  });
});

describe('parseInput', () => {
  it('throws VALIDATION_FAILED with issue paths', () => {
    try {
      parseInput(z.object({ name: z.string() }), { name: 1 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(400);
      expect((error as AppError).details).toEqual([{ path: 'name', message: expect.any(String) }]);
    }
  });
});
