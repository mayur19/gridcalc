import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createPool } from './db/pool.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createPool(config.DATABASE_URL, config.DB_POOL_MAX);
  const app = await buildApp({ config, db });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await db.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.API_HOST, port: config.API_PORT });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
