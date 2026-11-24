import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/pool.js';
import { ok, fail } from '../../http/envelope.js';

export function registerHealthRoutes(app: FastifyInstance, db: Db, version: string): void {
  app.get('/api/v1/health/live', async () => ok({ status: 'ok', version }));

  app.get('/api/v1/health/ready', async (request, reply) => {
    try {
      const { rows } = await db.query<{ migrations: number }>(
        'SELECT count(*)::int AS migrations FROM schema_migrations',
      );
      return ok({ status: 'ready', database: 'ok', migrations: rows[0]?.migrations ?? 0 });
    } catch (error) {
      request.log.warn({ err: error }, 'readiness check failed');
      return reply
        .status(503)
        .send(fail({ code: 'INTERNAL', message: 'Database is not reachable or not migrated' }));
    }
  });
}
