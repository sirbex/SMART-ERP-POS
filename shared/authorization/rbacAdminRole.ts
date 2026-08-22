/**
 * SSOT — RBAC role names that map to legacy ADMIN / full floor override.
 * Used by user legacy-role sync and restaurant check ownership.
 */

/** System / common admin RBAC role names (case-insensitive). */
export const SYSTEM_ADMIN_RBAC_ROLE_NAMES = [
  'super administrator',
  'administrator',
  'admin',
] as const;

export function isSystemAdminRbacRoleName(roleName: string | null | undefined): boolean {
  if (!roleName) return false;
  const name = roleName.trim().toLowerCase();
  if ((SYSTEM_ADMIN_RBAC_ROLE_NAMES as readonly string[]).includes(name)) return true;
  if (name.includes('administrator')) return true;
  return false;
}

/** Map RBAC role display name → legacy users.role ADMIN when applicable. */
export function rbacRoleNameMapsToLegacyAdmin(rbacRoleName: string | null | undefined): boolean {
  return isSystemAdminRbacRoleName(rbacRoleName);
}
