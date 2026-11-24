import type { Permission, Role } from '../rbac/permissions.js';

export interface AuthContext {
  readonly sessionId: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly role: Role;
  readonly permissions: readonly Permission[];
  readonly csrfToken: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}
