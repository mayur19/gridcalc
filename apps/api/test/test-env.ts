import { loadConfig, type AppConfig } from '../src/config/env.js';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres:///gridcalc_test?host=/tmp';

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    SESSION_SECRET: 'test-secret-test-secret-test-secret-123',
    LOG_LEVEL: 'silent',
    LOGIN_IP_RATE_LIMIT_MAX: '1000',
    REGISTER_RATE_LIMIT_MAX: '1000',
    APP_ORIGIN: 'http://localhost:5107',
    ...overrides,
  });
}
