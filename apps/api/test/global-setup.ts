import pino from 'pino';
import { createPool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { TEST_DATABASE_URL } from './test-env.js';

/** Recreates the test schema once per run and applies all migrations. */
export default async function setup(): Promise<void> {
  const db = createPool(TEST_DATABASE_URL, 2);
  try {
    await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    await runMigrations(db, pino({ level: 'silent' }));
  } finally {
    await db.end();
  }
}
