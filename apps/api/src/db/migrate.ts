import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from 'pino';
import type { PoolClient } from 'pg';
import type { Db } from './pool.js';

/**
 * Forward-only plain-SQL migration runner (ADR-0004).
 * Files `NNNN_description.sql` are applied in lexical order, each in its own transaction,
 * guarded by a session advisory lock so concurrent deploys cannot race. Applied checksums are
 * verified on every run: editing an applied migration is an error.
 */
const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;
const MIGRATION_LOCK_KEY = 4107_0001;

export function defaultMigrationsDir(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/db -> ../../migrations ; dist -> ../migrations
  return path.basename(here) === 'db'
    ? path.resolve(here, '../../migrations')
    : path.resolve(here, '../migrations');
}

export interface MigrationFile {
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

export async function loadMigrations(
  dir: string = defaultMigrationsDir(),
): Promise<readonly MigrationFile[]> {
  const entries = (await readdir(dir)).filter((file) => MIGRATION_FILE.test(file)).sort();
  return Promise.all(
    entries.map(async (name) => {
      const sql = await readFile(path.join(dir, name), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    }),
  );
}

export async function runMigrations(
  db: Db,
  logger: Pick<Logger, 'info'>,
  dir?: string,
): Promise<readonly string[]> {
  const migrations = await loadMigrations(dir);
  const client = await db.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        text PRIMARY KEY,
        checksum    text NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )`);
    const applied = new Map(
      (
        await client.query<{ name: string; checksum: string }>(
          'SELECT name, checksum FROM schema_migrations',
        )
      ).rows.map((row) => [row.name, row.checksum] as const),
    );
    const newlyApplied: string[] = [];
    for (const migration of migrations) {
      const existing = applied.get(migration.name);
      if (existing !== undefined) {
        if (existing !== migration.checksum) {
          throw new Error(
            `Migration ${migration.name} was modified after being applied; add a new migration instead`,
          );
        }
        continue;
      }
      await applyOne(client, migration);
      logger.info({ migration: migration.name }, 'migration applied');
      newlyApplied.push(migration.name);
    }
    return newlyApplied;
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    client.release();
  }
}

async function applyOne(client: PoolClient, migration: MigrationFile): Promise<void> {
  try {
    await client.query('BEGIN');
    await client.query(migration.sql);
    await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
      migration.name,
      migration.checksum,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`, {
      cause: error,
    });
  }
}
