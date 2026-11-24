import type { Queryable } from '../../db/pool.js';
import type { Role } from '../rbac/permissions.js';

export interface UserRow {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
}

export interface MembershipRow {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly role: Role;
}

export interface SessionRow {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly csrfToken: string;
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
  readonly email: string;
  readonly displayName: string;
  readonly organizationName: string;
  readonly role: Role;
}

export async function findUserByEmail(db: Queryable, email: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT id, email, display_name AS "displayName", password_hash AS "passwordHash" FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function insertOrganization(
  db: Queryable,
  name: string,
): Promise<{ id: string; name: string }> {
  const { rows } = await db.query<{ id: string; name: string }>(
    'INSERT INTO organizations (name) VALUES ($1) RETURNING id, name',
    [name],
  );
  return rows[0]!;
}

export async function insertUser(
  db: Queryable,
  input: { email: string; displayName: string; passwordHash: string },
): Promise<{ id: string }> {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [input.email, input.displayName, input.passwordHash],
  );
  return rows[0]!;
}

export async function insertMembership(
  db: Queryable,
  organizationId: string,
  userId: string,
  role: Role,
): Promise<void> {
  await db.query('INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, $3)', [
    organizationId,
    userId,
    role,
  ]);
}

/** Slice limitation: a user belongs to exactly one organization (multi-org switching is GC-014). */
export async function findPrimaryMembership(
  db: Queryable,
  userId: string,
): Promise<MembershipRow | null> {
  const { rows } = await db.query<MembershipRow>(
    `SELECT m.organization_id AS "organizationId", o.name AS "organizationName", m.role
       FROM memberships m JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1 ORDER BY m.created_at LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function insertSession(
  db: Queryable,
  session: {
    id: string;
    userId: string;
    organizationId: string;
    csrfToken: string;
    expiresAt: Date;
    userAgent: string | null;
    ipAddress: string | null;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO sessions (id, user_id, organization_id, csrf_token, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      session.id,
      session.userId,
      session.organizationId,
      session.csrfToken,
      session.expiresAt,
      session.userAgent,
      session.ipAddress,
    ],
  );
}

export async function findActiveSession(db: Queryable, id: string): Promise<SessionRow | null> {
  const { rows } = await db.query<SessionRow>(
    `SELECT s.id, s.user_id AS "userId", s.organization_id AS "organizationId", s.csrf_token AS "csrfToken",
            s.expires_at AS "expiresAt", s.last_seen_at AS "lastSeenAt", u.email, u.display_name AS "displayName",
            o.name AS "organizationName", m.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN organizations o ON o.id = s.organization_id
       JOIN memberships m ON m.organization_id = s.organization_id AND m.user_id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [id],
  );
  return rows[0] ?? null;
}

export async function touchSession(db: Queryable, id: string): Promise<void> {
  await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [id]);
}

export async function deleteSession(db: Queryable, id: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE id = $1', [id]);
}

export async function markLogin(db: Queryable, userId: string): Promise<void> {
  await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
}
