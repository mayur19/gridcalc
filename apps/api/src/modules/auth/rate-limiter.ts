/**
 * Fixed-window in-memory rate limiter (per process). Adequate for a single API instance;
 * a Postgres-backed limiter for multi-instance deployments is planned (GC-012).
 */
export interface RateDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

interface Window {
  readonly startedAt: number;
  readonly count: number;
}

export class FixedWindowRateLimiter {
  private windows = new Map<string, Window>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  hit(key: string): RateDecision {
    const now = this.now();
    this.prune(now);
    const current = this.windows.get(key);
    const window =
      current && now - current.startedAt < this.windowMs
        ? { startedAt: current.startedAt, count: current.count + 1 }
        : { startedAt: now, count: 1 };
    this.windows.set(key, window);
    const allowed = window.count <= this.max;
    return {
      allowed,
      remaining: Math.max(0, this.max - window.count),
      retryAfterSeconds: allowed ? 0 : Math.ceil((window.startedAt + this.windowMs - now) / 1000),
    };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  private prune(now: number): void {
    if (this.windows.size < 10_000) return;
    this.windows = new Map([...this.windows].filter(([, w]) => now - w.startedAt < this.windowMs));
  }
}
