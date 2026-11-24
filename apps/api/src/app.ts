import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from './config/env.js';
import type { Db } from './db/pool.js';
import { registerErrorHandling } from './http/error-handler.js';
import { registerSecurityHeaders } from './http/security-headers.js';
import { registerAuth } from './modules/auth/auth.plugin.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import './modules/auth/auth.types.js';
import { registerFormulaRoutes } from './modules/formulas/formulas.routes.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { registerPendingRoutes } from './modules/pending/pending.routes.js';
import { EngineCache } from './modules/workbooks/engine-cache.js';
import { WorkbookService } from './modules/workbooks/workbook.service.js';
import { registerWorkbookRoutes } from './modules/workbooks/workbooks.routes.js';

export const APP_VERSION = '0.1.0';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

/** Hop counts become a predicate (trust the closest n hops); lists/false pass through. */
export function toFastifyTrustProxy(
  value: AppConfig['TRUST_PROXY'],
): boolean | string[] | ((address: string, hop: number) => boolean) {
  if (typeof value === 'number') return (_address: string, hop: number) => hop < value;
  return value;
}

export interface AppDeps {
  readonly config: AppConfig;
  readonly db: Db;
}

/** Composition root: wires config, database, modules and cross-cutting HTTP concerns. */
export async function buildApp({ config, db }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: config.BODY_LIMIT_BYTES,
    trustProxy: toFastifyTrustProxy(config.TRUST_PROXY),
    genReqId: (request) => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();
    },
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.headers["x-csrf-token"]',
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
    },
  });

  await app.register(cookie);
  registerSecurityHeaders(app);
  registerErrorHandling(app);

  const authService = new AuthService(db, config);
  registerAuth(app, authService, config);

  registerHealthRoutes(app, db, APP_VERSION);
  registerAuthRoutes(app, authService, config);
  registerFormulaRoutes(app);
  registerWorkbookRoutes(
    app,
    new WorkbookService(db, new EngineCache(config.ENGINE_CACHE_SIZE), config),
  );
  registerPendingRoutes(app);

  return app;
}
