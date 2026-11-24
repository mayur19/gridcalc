/** Role-based access control skeleton. Roles are per organization membership. */
export const ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'workbook:read',
  'workbook:create',
  'workbook:write',
  'workbook:delete',
  'workbook:share',
  'member:manage',
  'audit:read',
  'org:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== 'org:manage'),
  editor: ['workbook:read', 'workbook:create', 'workbook:write'],
  viewer: ['workbook:read'],
};

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
