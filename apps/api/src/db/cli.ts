import pino from 'pino';
import { createPool } from './pool.js';
import { runMigrations } from './migrate.js';
import { seedDemoData } from './seed.js';

/** `tsx src/db/cli.ts <migrate|seed|reset>`; only DATABASE_URL is required. */
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

async function main(command: string | undefined): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const db = createPool(url, 2);
  try {
    switch (command) {
      case 'migrate': {
        const applied = await runMigrations(db, logger);
        logger.info(
          { applied: applied.length },
          applied.length ? 'migrations applied' : 'database is up to date',
        );
        break;
      }
      case 'seed':
        await seedDemoData(db, logger);
        break;
      case 'reset':
        if (process.env.NODE_ENV === 'production')
          throw new Error('Refusing to reset a production database');
        await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        await runMigrations(db, logger);
        await seedDemoData(db, logger);
        break;
      default:
        throw new Error('Usage: cli.ts <migrate|seed|reset>');
    }
  } finally {
    await db.end();
  }
}

main(process.argv[2]).catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
