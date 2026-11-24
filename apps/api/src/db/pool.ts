import pg from 'pg';

export type Db = pg.Pool;
export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

// Return bigint columns (revision counters) as JS numbers; values stay far below 2^53.
pg.types.setTypeParser(20, (value) => Number(value));

export function createPool(connectionString: string, max = 10): Db {
  return new pg.Pool({ connectionString, max, idleTimeoutMillis: 30_000 });
}

/** Runs `work` inside BEGIN/COMMIT, rolling back on any error. */
export async function withTransaction<T>(
  db: Db,
  work: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
