import type { Queryable } from '../../db/pool.js';

export interface AuditEventInput {
  readonly organizationId: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly requestId?: string;
}

/** Append-only audit write path. Reading/searching the trail is pending (GC-090). */
export async function recordAuditEvent(db: Queryable, event: AuditEventInput): Promise<void> {
  await db.query(
    `INSERT INTO audit_events (organization_id, actor_user_id, action, target_type, target_id, metadata, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      event.organizationId,
      event.actorUserId,
      event.action,
      event.targetType,
      event.targetId,
      JSON.stringify(event.metadata ?? {}),
      event.requestId ?? null,
    ],
  );
}
