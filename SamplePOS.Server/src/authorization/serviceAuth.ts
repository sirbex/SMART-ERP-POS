/**
 * Permission checks for service-layer code without an Express Request.
 * Delegates to AuthorizationService — single source of truth.
 */

import type { Pool } from 'pg';
import { AuthorizationService, AuthorizationDeniedError } from './authorizationService.js';
import { BusinessError } from '../middleware/errorHandler.js';

async function resolveLegacyRole(pool: Pool, userId: string, legacyRole?: string | null): Promise<string | undefined> {
  if (legacyRole) return legacyRole;
  const result = await pool.query<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [userId]);
  return result.rows[0]?.role;
}

export async function userHasPermission(
  pool: Pool,
  userId: string,
  permissionKey: string,
  legacyRole?: string | null
): Promise<boolean> {
  const role = await resolveLegacyRole(pool, userId, legacyRole);
  const authz = AuthorizationService.fromPool(pool);
  return authz.hasPermission({ id: userId, legacyRole: role }, permissionKey);
}

export async function assertUserPermission(
  pool: Pool,
  userId: string,
  permissionKey: string,
  options?: {
    legacyRole?: string | null;
    errorCode?: string;
    message?: string;
  }
): Promise<void> {
  const allowed = await userHasPermission(pool, userId, permissionKey, options?.legacyRole);
  if (!allowed) {
    throw new BusinessError(
      options?.message ?? `Missing permission: ${permissionKey}`,
      options?.errorCode ?? 'ERR_PERMISSION_DENIED',
      { userId, permissionKey }
    );
  }
}

export async function assertUserPermissionOrThrow(
  pool: Pool,
  userId: string,
  permissionKey: string,
  legacyRole?: string | null
): Promise<void> {
  const role = await resolveLegacyRole(pool, userId, legacyRole);
  const authz = AuthorizationService.fromPool(pool);
  try {
    await authz.authorize({ id: userId, legacyRole: role }, { permission: permissionKey });
  } catch (err) {
    if (err instanceof AuthorizationDeniedError) {
      throw new BusinessError(authz.getDeniedReason(err.result), 'ERR_PERMISSION_DENIED', {
        userId,
        permissionKey,
      });
    }
    throw err;
  }
}
