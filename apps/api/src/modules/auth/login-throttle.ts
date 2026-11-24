import { normalizeIp } from './client-ip.js';
import { FixedWindowRateLimiter } from './rate-limiter.js';

/**
 * Login throttling (ADR-0015). Three independent controls:
 *  1. per normalized IP: fixed window over all attempts (password spraying)
 *  2. per normalized IP: cap on distinct emails tried per window (spraying, store flooding)
 *  3. per email: progressive backoff (distributed guessing against one account)
 *
 * Attempts are *reserved synchronously* inside check(), before the caller awaits the
 * password hash: the attempt counts as a failure immediately and recordSuccess() clears
 * it. Parallel requests therefore cannot all pass the check before any failure is counted.
 *
 * The email store is bounded. When full, a resumable sweep cursor walks the whole map
 * dropping expired entries; if every entry is still active, the entry with the least time
 * left is evicted and a warning is logged (never "lock everyone out").
 *
 * Counters are in-process; they must move to Postgres before running more than one API
 * instance (GC-008, see docs/security/threat-model.md).
 */
export interface ThrottleOptions {
  readonly ipMax: number;
  readonly windowMs: number;
  readonly freeFailures: number;
  readonly maxEmailsPerIp?: number;
  readonly maxEntries?: number;
  readonly baseLockMs?: number;
  readonly maxLockMs?: number;
  readonly now?: () => number;
  readonly onWarn?: (message: string, details: Record<string, unknown>) => void;
}

export type ThrottleDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: 'ip' | 'email';
      readonly retryAfterSeconds: number;
    };

interface EmailState {
  readonly failures: number;
  readonly lockedUntil: number;
  readonly lastFailureAt: number;
}

interface IpEmails {
  readonly startedAt: number;
  readonly emails: ReadonlySet<string>;
}

export class LoginThrottle {
  private readonly ipLimiter: FixedWindowRateLimiter;
  private readonly emails = new Map<string, EmailState>();
  private readonly emailsPerIp = new Map<string, IpEmails>();
  private sweepCursor: Iterator<string> | null = null;
  private readonly now: () => number;
  private readonly baseLockMs: number;
  private readonly maxLockMs: number;
  private readonly maxEntries: number;
  private readonly maxEmailsPerIp: number;

  constructor(private readonly options: ThrottleOptions) {
    this.now = options.now ?? Date.now;
    this.baseLockMs = options.baseLockMs ?? 30_000;
    this.maxLockMs = options.maxLockMs ?? 3_600_000;
    this.maxEntries = options.maxEntries ?? 10_000;
    this.maxEmailsPerIp = options.maxEmailsPerIp ?? 20;
    this.ipLimiter = new FixedWindowRateLimiter(options.ipMax, options.windowMs, this.now);
  }

  /** Checks and, when allowed, reserves the attempt (counted as a failure until success). */
  check(rawIp: string, email: string): ThrottleDecision {
    const ip = normalizeIp(rawIp);
    const now = this.now();
    const ipDecision = this.ipLimiter.hit(ip);
    if (!ipDecision.allowed)
      return { allowed: false, reason: 'ip', retryAfterSeconds: ipDecision.retryAfterSeconds };
    if (!this.admitEmailForIp(ip, email, now)) {
      return {
        allowed: false,
        reason: 'ip',
        retryAfterSeconds: Math.ceil(this.options.windowMs / 1000),
      };
    }
    const state = this.current(email, now);
    if (state && state.lockedUntil > now) {
      return {
        allowed: false,
        reason: 'email',
        retryAfterSeconds: Math.ceil((state.lockedUntil - now) / 1000),
      };
    }
    this.reserve(email, state, now);
    return { allowed: true };
  }

  /** Credentials were valid: clear the reserved failure and history for this email. */
  recordSuccess(email: string): void {
    this.emails.delete(email);
  }

  get size(): number {
    return this.emails.size;
  }

  private reserve(email: string, state: EmailState | undefined, now: number): void {
    if (!state) this.makeRoom(now);
    const failures = (state?.failures ?? 0) + 1;
    const over = failures - this.options.freeFailures;
    const lockMs = over > 0 ? Math.min(this.maxLockMs, this.baseLockMs * 2 ** (over - 1)) : 0;
    this.emails.set(email, { failures, lockedUntil: now + lockMs, lastFailureAt: now });
  }

  private admitEmailForIp(ip: string, email: string, now: number): boolean {
    let entry = this.emailsPerIp.get(ip);
    if (!entry || now - entry.startedAt >= this.options.windowMs) {
      if (this.emailsPerIp.size >= this.maxEntries) this.pruneIpEmails(now);
      entry = { startedAt: now, emails: new Set() };
    }
    if (entry.emails.has(email)) return true;
    if (entry.emails.size >= this.maxEmailsPerIp) return false;
    this.emailsPerIp.set(ip, {
      startedAt: entry.startedAt,
      emails: new Set([...entry.emails, email]),
    });
    return true;
  }

  private pruneIpEmails(now: number): void {
    for (const [ip, entry] of this.emailsPerIp) {
      if (now - entry.startedAt >= this.options.windowMs) this.emailsPerIp.delete(ip);
    }
  }

  private isExpired(state: EmailState, now: number): boolean {
    const quiet = Math.max(this.options.windowMs, state.lockedUntil - state.lastFailureAt);
    return now - state.lastFailureAt > quiet;
  }

  /** Failure history decays after a quiet period with no attempts. */
  private current(email: string, now: number): EmailState | undefined {
    const state = this.emails.get(email);
    if (state && this.isExpired(state, now)) {
      this.emails.delete(email);
      return undefined;
    }
    return state;
  }

  /** Ensures one free slot: resumable sweep over the whole map, then least-time-left eviction. */
  private makeRoom(now: number): void {
    if (this.emails.size < this.maxEntries) return;
    let visited = 0;
    const total = this.emails.size;
    while (visited < total) {
      if (!this.sweepCursor) this.sweepCursor = this.emails.keys();
      const next = this.sweepCursor.next();
      if (next.done) {
        this.sweepCursor = null;
        continue;
      }
      visited += 1;
      const state = this.emails.get(next.value);
      if (state && this.isExpired(state, now)) {
        this.emails.delete(next.value);
        return;
      }
    }
    let victim: string | null = null;
    let leastLeft = Number.POSITIVE_INFINITY;
    for (const [key, state] of this.emails) {
      const left = state.lockedUntil - now;
      if (left < leastLeft) {
        leastLeft = left;
        victim = key;
      }
    }
    if (victim !== null) {
      this.emails.delete(victim);
      this.options.onWarn?.(
        'login throttle store full of active entries; evicted entry with least time left',
        {
          size: this.emails.size + 1,
          remainingMs: Math.max(0, leastLeft),
        },
      );
    }
  }
}
