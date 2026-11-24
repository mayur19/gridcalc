import type { FastifyError, FastifyInstance } from 'fastify';
import { AppError } from './errors.js';
import { fail } from './envelope.js';

/** Central error and 404 handlers: every failure leaves as the standard JSON envelope. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      if (error.status >= 500) request.log.error({ err: error }, error.message);
      const body =
        error.details === undefined
          ? { code: error.code, message: error.message }
          : { code: error.code, message: error.message, details: error.details };
      return reply.status(error.status).send(fail(body));
    }
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply
        .status(413)
        .send(fail({ code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' }));
    }
    if (
      error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' ||
      error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' ||
      (error.statusCode === 400 && error instanceof SyntaxError)
    ) {
      return reply.status(400).send(fail({ code: 'VALIDATION_FAILED', message: error.message }));
    }
    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      return reply
        .status(error.statusCode)
        .send(fail({ code: 'VALIDATION_FAILED', message: error.message }));
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply
      .status(500)
      .send(fail({ code: 'INTERNAL', message: 'An unexpected error occurred' }));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send(
      fail({
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url.split('?')[0]} not found`,
      }),
    ),
  );
}
