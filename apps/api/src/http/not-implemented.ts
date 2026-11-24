import type { FastifyReply } from 'fastify';
import { fail } from './envelope.js';

/** Response for registered-but-pending endpoints; the ticket points at docs/planning/backlog.md. */
export function sendNotImplemented(
  reply: FastifyReply,
  ticket: string,
  summary: string,
): FastifyReply {
  return reply.status(501).send(
    fail({
      code: 'NOT_IMPLEMENTED',
      message: `${summary} is planned but not implemented yet`,
      details: { ticket },
    }),
  );
}
