import { useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { createClientAuthorization, type ClientAuthorizationService } from './authorizationService';

export function useAuthorization(): ClientAuthorizationService | null {
  const { user, permissions } = useAuth();
  return useMemo(
    () => createClientAuthorization(user, permissions),
    [user, permissions]
  );
}

/** Check a single permission synchronously */
export function useHasPermission(permissionKey: string): boolean {
  const authz = useAuthorization();
  return authz?.hasPermission(permissionKey) ?? false;
}

/** Check any of the given permissions */
export function useHasAnyPermission(permissionKeys: string[]): boolean {
  const authz = useAuthorization();
  if (!authz) return false;
  return permissionKeys.some((key) => authz.hasPermission(key));
}

import type { UserRole } from '../types';

/** Check permissions synchronously. First argument (roles) is ignored — migration compat only. */
export function useCanAccess(
  _requiredRoles?: UserRole[],
  requiredPermissions?: string[]
): boolean {
  const authz = useAuthorization();
  if (!authz) return false;
  if (!requiredPermissions || requiredPermissions.length === 0) return true;
  return requiredPermissions.some((key) => authz.hasPermission(key));
}
