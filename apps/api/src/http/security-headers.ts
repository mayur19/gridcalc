import type { FastifyInstance } from 'fastify';

/** Conservative security headers for a JSON API (no third-party resources are ever served). */
export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('cross-origin-resource-policy', 'same-origin');
    reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    reply.header('cache-control', 'no-store');
    return payload;
  });
}
