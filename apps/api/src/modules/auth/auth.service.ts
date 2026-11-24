import type { LoginInput, RegisterInput } from '@gridcalc/shared';
import type { AppConfig } from '../../config/env.js';
import { withTransaction, type Db } from '../../db/pool.js';
import { AppError } from '../../http/errors.js';
import { recordAuditEvent } from '../audit/audit.repository.js';
import { permissionsFor } from '../rbac/permissions.js';
import * as repo from './auth.repository.js';
import type { AuthContext } from './auth.types.js';
import { dummyPasswordHash, hashPassword, verifyPassword } from './password.js';
import { randomToken, sessionIdFor } from './tokens.js';

export interface ClientInfo {
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly requestId: string;
}

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: Date;
  readonly auth: AuthContext;
}

const TOUCH_INTERVAL_MS = 60_000;

export const REGISTRATION_REJECTED_MESSAGE =
  'Registration could not be completed. If you already have an account, sign in instead.';

function registrationRejected(): AppError {
  return new AppError('REGISTRATION_REJECTED', REGISTRATION_REJECTED_MESSAGE);
}

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly config: AppConfig,
  ) {}

  async register(input: RegisterInput, client: ClientInfo): Promise<IssuedSession> {
    const passwordHash = await hashPassword(input.password);
    return withTransaction(this.db, async (tx) => {
      if (await repo.findUserByEmail(tx, input.email)) {
        // Generic on purpose: never confirm that an email is registered (GC-009 adds
        // verified sign-up through the local outbox, which removes the remaining signal).
        throw registrationRejected();
      }
      const org = await repo.insertOrganization(tx, input.organizationName);
      const user = await repo.insertUser(tx, {
        email: input.email,
        displayName: input.displayName,
        passwordHash,
      });
      await repo.insertMembership(tx, org.id, user.id, 'owner');
      await recordAuditEvent(tx, {
        organizationId: org.id,
        actorUserId: user.id,
        action: 'organization.registered',
        targetType: 'organization',
        targetId: org.id,
        requestId: client.requestId,
      });
      return this.issue(
        tx,
        {
          userId: user.id,
          email: input.email,
          displayName: input.displayName,
          organizationId: org.id,
          organizationName: org.name,
          role: 'owner',
        },
        client,
      );
    });
  }

  async login(input: LoginInput, client: ClientInfo): Promise<IssuedSession> {
    const user = await repo.findUserByEmail(this.db, input.email);
    const valid = await verifyPassword(
      input.password,
      user?.passwordHash ?? (await dummyPasswordHash()),
    );
    if (!user || !valid) throw new AppError('UNAUTHENTICATED', 'Invalid email or password');
    const membership = await repo.findPrimaryMembership(this.db, user.id);
    if (!membership)
      throw new AppError('FORBIDDEN', 'This account is not a member of any organization');
    return withTransaction(this.db, async (tx) => {
      await repo.markLogin(tx, user.id);
      await recordAuditEvent(tx, {
        organizationId: membership.organizationId,
        actorUserId: user.id,
        action: 'session.created',
        targetType: 'user',
        targetId: user.id,
        metadata: { ip: client.ipAddress },
        requestId: client.requestId,
      });
      return this.issue(
        tx,
        {
          userId: user.id,
          email: user.email,
          displayName: user.displayName,
          ...membership,
        },
        client,
      );
    });
  }

  async logout(auth: AuthContext, requestId: string): Promise<void> {
    await withTransaction(this.db, async (tx) => {
      await repo.deleteSession(tx, auth.sessionId);
      await recordAuditEvent(tx, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: 'session.revoked',
        targetType: 'user',
        targetId: auth.userId,
        requestId,
      });
    });
  }

  /** Resolves a cookie token to an auth context, or null if missing/expired/revoked. */
  async resolve(token: string | undefined): Promise<AuthContext | null> {
    if (!token || token.length > 200) return null;
    const session = await repo.findActiveSession(
      this.db,
      sessionIdFor(this.config.SESSION_SECRET, token),
    );
    if (!session) return null;
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await repo.touchSession(this.db, session.id);
    }
    return {
      sessionId: session.id,
      userId: session.userId,
      email: session.email,
      displayName: session.displayName,
      organizationId: session.organizationId,
      organizationName: session.organizationName,
      role: session.role,
      permissions: permissionsFor(session.role),
      csrfToken: session.csrfToken,
    };
  }

  private async issue(
    tx: Parameters<typeof repo.insertSession>[0],
    identity: Omit<AuthContext, 'sessionId' | 'permissions' | 'csrfToken'>,
    client: ClientInfo,
  ): Promise<IssuedSession> {
    const token = randomToken();
    const csrfToken = randomToken(24);
    const sessionId = sessionIdFor(this.config.SESSION_SECRET, token);
    const expiresAt = new Date(Date.now() + this.config.SESSION_TTL_HOURS * 3_600_000);
    await repo.insertSession(tx, {
      id: sessionId,
      userId: identity.userId,
      organizationId: identity.organizationId,
      csrfToken,
      expiresAt,
      userAgent: client.userAgent?.slice(0, 500) ?? null,
      ipAddress: client.ipAddress,
    });
    return {
      token,
      expiresAt,
      auth: { ...identity, sessionId, csrfToken, permissions: permissionsFor(identity.role) },
    };
  }
}
