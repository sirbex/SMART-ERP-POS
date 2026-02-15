/**
 * RBAC API Client
 * API methods for Role-Based Access Control system
 */

import apiClient from '../utils/api';
import type {
  Permission,
  Role,
  UserRole,
  EffectivePermission,
  RbacAuditLog,
  CreateRoleInput,
  UpdateRoleInput,
  AssignUserRoleInput,
  RemoveUserRoleInput,
} from '../types/rbac';

export const rbacApi = {
  // ============ Permissions ============

  /**
   * Get all available permissions from the catalog
   */
  async getPermissions(): Promise<Permission[]> {
    console.log('[RBAC API] Fetching permissions...');
    const response = await apiClient.get('/rbac/permissions');
    console.log('[RBAC API] Permissions response:', response.data);
    return response.data.data;
  },

  // ============ Roles ============

  /**
   * Get all active roles
   */
  async getRoles(): Promise<Role[]> {
    const response = await apiClient.get('/rbac/roles');
    return response.data.data;
  },

  /**
   * Get role by ID with permissions
   */
  async getRoleById(roleId: string): Promise<Role & { permissions: string[] }> {
    const response = await apiClient.get(`/rbac/roles/${roleId}`);
    return response.data.data;
  },

  /**
   * Create a new role
   */
  async createRole(input: CreateRoleInput): Promise<Role> {
    const response = await apiClient.post('/rbac/roles', input);
    return response.data.data;
  },

  /**
   * Update an existing role
   */
  async updateRole(roleId: string, input: UpdateRoleInput): Promise<Role> {
    const response = await apiClient.put(`/rbac/roles/${roleId}`, input);
    return response.data.data;
  },

  /**
   * Delete a role (soft delete)
   */
  async deleteRole(roleId: string): Promise<void> {
    await apiClient.delete(`/rbac/roles/${roleId}`);
  },

  // ============ User Roles ============

  /**
   * Get roles assigned to a user
   */
  async getUserRoles(userId: string): Promise<UserRole[]> {
    const response = await apiClient.get(`/rbac/users/${userId}/roles`);
    return response.data.data;
  },

  /**
   * Get effective permissions for a user
   */
  async getUserPermissions(userId: string): Promise<EffectivePermission[]> {
    const response = await apiClient.get(`/rbac/users/${userId}/permissions`);
    return response.data.data;
  },

  /**
   * Assign a role to a user
   */
  async assignRoleToUser(input: AssignUserRoleInput): Promise<UserRole> {
    const response = await apiClient.post('/rbac/users/roles', input);
    return response.data.data;
  },

  /**
   * Remove a role from a user
   */
  async removeRoleFromUser(input: RemoveUserRoleInput): Promise<void> {
    await apiClient.delete('/rbac/users/roles', { data: input });
  },

  // ============ Current User ============

  /**
   * Get current user's roles
   */
  async getMyRoles(): Promise<UserRole[]> {
    const response = await apiClient.get('/rbac/me/roles');
    return response.data.data;
  },

  /**
   * Get current user's effective permissions
   */
  async getMyPermissions(): Promise<EffectivePermission[]> {
    const response = await apiClient.get('/rbac/me/permissions');
    return response.data.data;
  },

  // ============ Audit Logs ============

  /**
   * Get RBAC audit logs with filtering
   */
  async getAuditLogs(options?: {
    actorUserId?: string;
    targetUserId?: string;
    targetRoleId?: string;
    action?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: RbacAuditLog[]; total: number }> {
    const response = await apiClient.get('/rbac/audit-logs', { params: options });
    return {
      logs: response.data.data,
      total: response.data.pagination?.total || response.data.data.length,
    };
  },
};

export default rbacApi;
