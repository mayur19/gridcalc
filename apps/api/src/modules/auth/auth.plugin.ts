import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { AppError, forbidden, unauthenticated } from '../../http/errors.js';
import { hasPermission, type Permission } from '../rbac/permissions.js';
import type { AuthService, IssuedSession } from './auth.service.js';
import type { AuthContext } from './auth.types.js';
import { safeEqual } from './tokens.js';

export const SESSION_COOKIE = 'gc_session';
export const CSRF_COOKIE = 'gc_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Routes that create a session cannot require one; they are protected by the Origin check. */
const CSRF_EXEMPT = new Set(['/api/v1/auth/login', '/api/v1/auth/register']);

/**
 * Resolves the session cookie on every request, then enforces:
 *  - Origin allow-list on mutating requests (blocks cross-site form posts / fetches)
 *  - CSRF double-submit: header must equal the session's token (also mirrored in a readable cookie)
 */
export function registerAuth(app: FastifyInstance, auth: AuthService, config: AppConfig): void {
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request) => {
    request.auth = await auth.resolve(request.cookies[SESSION_COOKIE]);
    if (!MUTATING.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== config.APP_ORIGIN) {
      throw new AppError('FORBIDDEN', 'Cross-origin request rejected');
    }
    const path = request.url.split('?')[0] ?? '';
    if (CSRF_EXEMPT.has(path) || !request.auth) return;
    const header = request.headers[CSRF_HEADER];
    if (typeof header !== 'string' || !safeEqual(header, request.auth.csrfToken)) {
      throw new AppError('CSRF_TOKEN_INVALID', 'Missing or invalid CSRF token');
    }
  });
}

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthenticated();
  return request.auth;
}

export function requirePermission(permission: Permission): preHandlerHookHandler {
  return async (request: FastifyRequest) => {
    const auth = requireAuth(request);
    if (!hasPermission(auth.role, permission)) throw forbidden();
  };
}

export function setSessionCookies(
  reply: FastifyReply,
  session: IssuedSession,
  config: AppConfig,
): void {
  const base = {
    path: '/',
    sameSite: 'lax' as const,
    secure: config.COOKIE_SECURE,
    expires: session.expiresAt,
  };
  reply.setCookie(SESSION_COOKIE, session.token, { ...base, httpOnly: true });
  reply.setCookie(CSRF_COOKIE, session.auth.csrfToken, { ...base, httpOnly: false });
}

export function clearSessionCookies(reply: FastifyReply, config: AppConfig): void {
  const base = { path: '/', sameSite: 'lax' as const, secure: config.COOKIE_SECURE };
  reply.clearCookie(SESSION_COOKIE, { ...base, httpOnly: true });
  reply.clearCookie(CSRF_COOKIE, base);
}
