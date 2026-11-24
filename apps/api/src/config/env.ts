import { z } from 'zod';

/** Environment configuration, validated once at startup. Fails fast with a readable message. */
const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/**
 * TRUST_PROXY: `false` (default, direct exposure), a hop count (`1` behind one nginx),
 * or a comma-separated list of proxy IPs/CIDRs (`10.0.0.0/8,127.0.0.1`). Never `true`:
 * trusting every hop lets any client spoof X-Forwarded-For and evade IP rate limits.
 */
const PROXY_ENTRY = /^[0-9a-fA-F:.]+(\/\d{1,3})?$/;
export const trustProxySchema = z
  .string()
  .trim()
  .default('false')
  .transform((value, ctx): false | number | string[] => {
    if (value === '' || value === 'false' || value === '0') return false;
    if (/^\d+$/.test(value)) return Number(value);
    const entries = value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (value === 'true' || entries.some((entry) => !PROXY_ENTRY.test(entry))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'TRUST_PROXY must be false, a hop count, or a list of proxy IPs/CIDRs',
      });
      return z.NEVER;
    }
    return entries;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4107),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  APP_ORIGIN: z.string().url().default('http://localhost:5107'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(12),
  COOKIE_SECURE: booleanString.default('false'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: trustProxySchema,
  /** Failed logins per email before progressive backoff starts. */
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),
  LOGIN_RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().min(1).default(900),
  /** Login attempts per client IP per window (catches password spraying across many emails). */
  LOGIN_IP_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(50),
  /** Registrations per client IP per window. */
  REGISTER_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),
  /** Distinct emails one client IP (IPv6: /64) may try per window. */
  LOGIN_MAX_EMAILS_PER_IP: z.coerce.number().int().min(1).default(20),
  ENGINE_CACHE_SIZE: z.coerce.number().int().min(0).max(1000).default(16),
  MAX_CELLS_PER_WORKBOOK: z.coerce.number().int().min(1).default(200_000),
  BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(4 * 1024 * 1024),
});

export type AppConfig = Readonly<z.infer<typeof envSchema>>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  if (parsed.data.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (!parsed.data.COOKIE_SECURE) problems.push('COOKIE_SECURE must be true in production');
    // Force an explicit decision: a wrong guess either breaks IP limits or lets clients spoof IPs.
    if (source.TRUST_PROXY === undefined || source.TRUST_PROXY.trim() === '') {
      problems.push(
        'TRUST_PROXY must be set explicitly in production (false, a hop count or proxy IPs/CIDRs)',
      );
    }
    if (problems.length > 0) {
      throw new Error(
        `Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
      );
    }
  }
  return Object.freeze(parsed.data);
}
