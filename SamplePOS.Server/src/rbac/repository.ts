import type { Pool, PoolClient } from 'pg';
import type { Role, RolePermission, UserRole, RbacAuditLog, RbacAuditAction, EffectivePermission } from './types.js';

export class RbacRepository {
  constructor(private pool: Pool) { }

  private getClient(): Pool | PoolClient {
    return this.pool;
  }

  async createRole(
    client: Pool | PoolClient,
    data: {
      name: string;
      description: string;
      createdBy: string;
    }
  ): Promise<Role> {
    const result = await client.query<Role>(
      `INSERT INTO rbac_roles (name, description, version, is_system_role, is_active, created_by, updated_by)
       VALUES ($1, $2, 1, false, true, $3, $3)
       RETURNING id, name, description, version, is_system_role as "isSystemRole", is_active as "isActive",
                 created_at as "createdAt", updated_at as "updatedAt", created_by as "createdBy", updated_by as "updatedBy"`,
      [data.name, data.description, data.createdBy]
    );
    return result.rows[0];
  }

  async updateRole(
    client: Pool | PoolClient,
    roleId: string,
    data: {
      name?: string;
      description?: string;
      updatedBy: string;
    }
  ): Promise<Role | null> {
    const setClauses: string[] = ['version = version + 1', 'updated_by = $2', 'updated_at = NOW()'];
    const params: unknown[] = [roleId, data.updatedBy];
    let paramIndex = 3;

    if (data.name !== undefined) {
      setClauses.push(`name = $${paramIndex}`);
      params.push(data.name);
      paramIndex++;
    }

    if (data.description !== undefined) {
      setClauses.push(`description = $${paramIndex}`);
      params.push(data.description);
      paramIndex++;
    }

    const result = await client.query<Role>(
      `UPDATE rbac_roles SET ${setClauses.join(', ')}
       WHERE id = $1 AND is_active = true AND is_system_role = false
       RETURNING id, name, description, version, is_system_role as "isSystemRole", is_active as "isActive",
                 created_at as "createdAt", updated_at as "updatedAt", created_by as "createdBy", updated_by as "updatedBy"`,
      params
    );
    return result.rows[0] || null;
  }

  async softDeleteRole(client: Pool | PoolClient, roleId: string, deletedBy: string): Promise<boolean> {
    const result = await client.query(
      `UPDATE rbac_roles SET is_active = false, updated_by = $2, updated_at = NOW(), version = version + 1
       WHERE id = $1 AND is_active = true AND is_system_role = false`,
      [roleId, deletedBy]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getRoleById(roleId: string): Promise<Role | null> {
    const result = await this.pool.query<Role>(
      `SELECT id, name, description, version, is_system_role as "isSystemRole", is_active as "isActive",
              created_at as "createdAt", updated_at as "updatedAt", created_by as "createdBy", updated_by as "updatedBy"
       FROM rbac_roles WHERE id = $1`,
      [roleId]
    );
    return result.rows[0] || null;
  }

  async getRoleByName(name: string): Promise<Role | null> {
    const result = await this.pool.query<Role>(
      `SELECT id, name, description, version, is_system_role as "isSystemRole", is_active as "isActive",
              created_at as "createdAt", updated_at as "updatedAt", created_by as "createdBy", updated_by as "updatedBy"
       FROM rbac_roles WHERE LOWER(name) = LOWER($1) AND is_active = true`,
      [name]
    );
    return result.rows[0] || null;
  }

  async getAllActiveRoles(): Promise<(Role & { permissionCount: number })[]> {
    const result = await this.pool.query<Role & { permissionCount: number }>(
      `SELECT r.id, r.name, r.description, r.version, r.is_system_role as "isSystemRole", r.is_active as "isActive",
              r.created_at as "createdAt", r.updated_at as "updatedAt", r.created_by as "createdBy", r.updated_by as "updatedBy",
              COALESCE(COUNT(rp.permission_key), 0)::int as "permissionCount"
       FROM rbac_roles r
       LEFT JOIN rbac_role_permissions rp ON rp.role_id = r.id
       WHERE r.is_active = true
       GROUP BY r.id
       ORDER BY r.name`
    );
    return result.rows;
  }

  async setRolePermissions(
    client: Pool | PoolClient,
    roleId: string,
    permissionKeys: string[],
    grantedBy: string
  ): Promise<void> {
    await client.query('DELETE FROM rbac_role_permissions WHERE role_id = $1', [roleId]);

    if (permissionKeys.length > 0) {
      for (const permissionKey of permissionKeys) {
        await client.query(
          `INSERT INTO rbac_role_permissions (role_id, permission_key, granted_at, granted_by)
           VALUES ($1, $2, NOW(), $3)
           ON CONFLICT (role_id, permission_key) DO NOTHING`,
          [roleId, permissionKey, grantedBy]
        );
      }
    }
  }

  async getRolePermissions(roleId: string): Promise<string[]> {
    const result = await this.pool.query<{ permission_key: string }>(
      `SELECT permission_key FROM rbac_role_permissions WHERE role_id = $1 ORDER BY permission_key`,
      [roleId]
    );
    return result.rows.map(row => row.permission_key);
  }

  async assignUserRole(
    client: Pool | PoolClient,
    data: {
      userId: string;
      roleId: string;
      scopeType: 'global' | 'organization' | 'branch' | 'warehouse' | null;
      scopeId: string | null;
      assignedBy: string;
      expiresAt: string | null;
    }
  ): Promise<UserRole> {
    const result = await client.query<UserRole>(
      `INSERT INTO rbac_user_roles (user_id, role_id, scope_type, scope_id, assigned_by, expires_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (user_id, role_id, COALESCE(scope_type, ''), COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'))
       DO UPDATE SET is_active = true, assigned_at = NOW(), assigned_by = EXCLUDED.assigned_by, expires_at = EXCLUDED.expires_at
       RETURNING id, user_id as "userId", role_id as "roleId", scope_type as "scopeType", scope_id as "scopeId",
                 assigned_at as "assignedAt", assigned_by as "assignedBy", expires_at as "expiresAt", is_active as "isActive"`,
      [data.userId, data.roleId, data.scopeType, data.scopeId, data.assignedBy, data.expiresAt]
    );
    return result.rows[0];
  }

  async removeUserRole(
    client: Pool | PoolClient,
    userId: string,
    roleId: string,
    scopeType: string | null,
    scopeId: string | null
  ): Promise<boolean> {
    const result = await client.query(
      `UPDATE rbac_user_roles SET is_active = false
       WHERE user_id = $1 AND role_id = $2
         AND (scope_type = $3 OR (scope_type IS NULL AND $3 IS NULL))
         AND (scope_id = $4 OR (scope_id IS NULL AND $4 IS NULL))
         AND is_active = true`,
      [userId, roleId, scopeType, scopeId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getUserRoles(userId: string): Promise<(UserRole & { roleName: string })[]> {
    const result = await this.pool.query<UserRole & { roleName: string }>(
      `SELECT ur.id, ur.user_id as "userId", ur.role_id as "roleId", r.name as "roleName",
              ur.scope_type as "scopeType", ur.scope_id as "scopeId",
              ur.assigned_at as "assignedAt", ur.assigned_by as "assignedBy",
              ur.expires_at as "expiresAt", ur.is_active as "isActive"
       FROM rbac_user_roles ur
       JOIN rbac_roles r ON r.id = ur.role_id AND r.is_active = true
       WHERE ur.user_id = $1 AND ur.is_active = true
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
       ORDER BY r.name`,
      [userId]
    );
    return result.rows;
  }

  async getUserEffectivePermissions(userId: string): Promise<EffectivePermission[]> {
    const result = await this.pool.query<EffectivePermission>(
      `SELECT DISTINCT rp.permission_key as "permissionKey", r.id as "roleId", r.name as "roleName",
              ur.scope_type as "scopeType", ur.scope_id as "scopeId"
       FROM rbac_user_roles ur
       JOIN rbac_roles r ON r.id = ur.role_id AND r.is_active = true
       JOIN rbac_role_permissions rp ON rp.role_id = r.id
       WHERE ur.user_id = $1 AND ur.is_active = true
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
       ORDER BY rp.permission_key`,
      [userId]
    );
    return result.rows;
  }

  async userHasPermission(
    userId: string,
    permissionKey: string,
    scopeType?: string | null,
    scopeId?: string | null
  ): Promise<boolean> {
    console.log(`[RBAC Repository] userHasPermission(${userId}, ${permissionKey})`);
    const result = await this.pool.query<{ has_permission: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM rbac_user_roles ur
         JOIN rbac_roles r ON r.id = ur.role_id AND r.is_active = true
         JOIN rbac_role_permissions rp ON rp.role_id = r.id
         WHERE ur.user_id = $1 AND ur.is_active = true
           AND rp.permission_key = $2
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
           AND (
             ur.scope_type IS NULL
             OR (ur.scope_type = $3 AND (ur.scope_id = $4 OR ur.scope_id IS NULL))
           )
       ) as has_permission`,
      [userId, permissionKey, scopeType || null, scopeId || null]
    );
    console.log(`[RBAC Repository] Result:`, result.rows[0]);
    return result.rows[0]?.has_permission ?? false;
  }

  async createAuditLog(
    client: Pool | PoolClient,
    data: {
      actorUserId: string;
      targetUserId?: string | null;
      targetRoleId?: string | null;
      action: RbacAuditAction;
      previousState?: Record<string, unknown> | null;
      newState?: Record<string, unknown> | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    }
  ): Promise<RbacAuditLog> {
    const result = await client.query<RbacAuditLog>(
      `INSERT INTO rbac_audit_logs (actor_user_id, target_user_id, target_role_id, action, previous_state, new_state, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, actor_user_id as "actorUserId", target_user_id as "targetUserId", target_role_id as "targetRoleId",
                 action, previous_state as "previousState", new_state as "newState",
                 ip_address as "ipAddress", user_agent as "userAgent", timestamp`,
      [
        data.actorUserId,
        data.targetUserId || null,
        data.targetRoleId || null,
        data.action,
        data.previousState ? JSON.stringify(data.previousState) : null,
        data.newState ? JSON.stringify(data.newState) : null,
        data.ipAddress || null,
        data.userAgent || null,
      ]
    );
    return result.rows[0];
  }

  async getAuditLogs(options: {
    actorUserId?: string;
    targetUserId?: string;
    targetRoleId?: string;
    action?: RbacAuditAction;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: RbacAuditLog[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (options.actorUserId) {
      conditions.push(`actor_user_id = $${paramIndex++}`);
      params.push(options.actorUserId);
    }
    if (options.targetUserId) {
      conditions.push(`target_user_id = $${paramIndex++}`);
      params.push(options.targetUserId);
    }
    if (options.targetRoleId) {
      conditions.push(`target_role_id = $${paramIndex++}`);
      params.push(options.targetRoleId);
    }
    if (options.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(options.action);
    }
    if (options.fromDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(options.fromDate);
    }
    if (options.toDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(options.toDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM rbac_audit_logs ${whereClause}`,
      params
    );

    const result = await this.pool.query<RbacAuditLog>(
      `SELECT id, actor_user_id as "actorUserId", target_user_id as "targetUserId", target_role_id as "targetRoleId",
              action, previous_state as "previousState", new_state as "newState",
              ip_address as "ipAddress", user_agent as "userAgent", timestamp
       FROM rbac_audit_logs ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    return {
      logs: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  async checkRoleInUse(roleId: string): Promise<boolean> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM rbac_user_roles WHERE role_id = $1 AND is_active = true`,
      [roleId]
    );
    return parseInt(result.rows[0].count, 10) > 0;
  }

  async beginTransaction(): Promise<PoolClient> {
    const client = await this.pool.connect();
    await client.query('BEGIN');
    return client;
  }

  async commitTransaction(client: PoolClient): Promise<void> {
    await client.query('COMMIT');
    client.release();
  }

  async rollbackTransaction(client: PoolClient): Promise<void> {
    await client.query('ROLLBACK');
    client.release();
  }
}
