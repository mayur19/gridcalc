import { loginSchema, registerSchema } from '@gridcalc/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { AppError } from '../../http/errors.js';
import { ok } from '../../http/envelope.js';
import { parseInput } from '../../http/validate.js';
import type { AuthContext } from './auth.types.js';
import { clearSessionCookies, requireAuth, setSessionCookies } from './auth.plugin.js';
import type { AuthService, ClientInfo } from './auth.service.js';
import { normalizeIp } from './client-ip.js';
import { LoginThrottle } from './login-throttle.js';
import { FixedWindowRateLimiter } from './rate-limiter.js';

function clientInfo(request: FastifyRequest): ClientInfo {
  return {
    userAgent: request.headers['user-agent'] ?? null,
    ipAddress: request.ip || null,
    requestId: request.id,
  };
}

/** Public projection of the auth context (never includes the session id). */
export function presentSession(auth: AuthContext) {
  return {
    user: { id: auth.userId, email: auth.email, displayName: auth.displayName },
    organization: { id: auth.organizationId, name: auth.organizationName },
    role: auth.role,
    permissions: auth.permissions,
    csrfToken: auth.csrfToken,
  };
}

export function registerAuthRoutes(
  app: FastifyInstance,
  service: AuthService,
  config: AppConfig,
): void {
  const windowMs = config.LOGIN_RATE_LIMIT_WINDOW_SEC * 1000;
  const registerLimiter = new FixedWindowRateLimiter(config.REGISTER_RATE_LIMIT_MAX, windowMs);
  const throttle = new LoginThrottle({
    ipMax: config.LOGIN_IP_RATE_LIMIT_MAX,
    windowMs,
    freeFailures: config.LOGIN_RATE_LIMIT_MAX,
    maxEmailsPerIp: config.LOGIN_MAX_EMAILS_PER_IP,
    onWarn: (message, details) => app.log.warn(details, message),
  });

  app.post('/api/v1/auth/register', async (request, reply) => {
    const input = parseInput(registerSchema, request.body);
    const decision = registerLimiter.hit(normalizeIp(request.ip));
    if (!decision.allowed) {
      reply.header('retry-after', String(decision.retryAfterSeconds));
      throw new AppError('RATE_LIMITED', 'Too many attempts, try again later');
    }
    const session = await service.register(input, clientInfo(request));
    setSessionCookies(reply, session, config);
    return reply.status(201).send(ok(presentSession(session.auth)));
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const input = parseInput(loginSchema, request.body);
    const decision = throttle.check(request.ip, input.email);
    if (!decision.allowed) {
      reply.header('retry-after', String(decision.retryAfterSeconds));
      throw new AppError('RATE_LIMITED', 'Too many login attempts, try again later');
    }
    // The attempt was reserved synchronously by check(); only success clears it.
    const session = await service.login(input, clientInfo(request));
    throttle.recordSuccess(input.email);
    setSessionCookies(reply, session, config);
    return reply.send(ok(presentSession(session.auth)));
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const auth = requireAuth(request);
    await service.logout(auth, request.id);
    clearSessionCookies(reply, config);
    return reply.status(200).send(ok({ signedOut: true }));
  });

  app.get('/api/v1/auth/me', async (request) => ok(presentSession(requireAuth(request))));
}
