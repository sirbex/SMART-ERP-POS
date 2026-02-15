/**
 * RBAC React Query Hooks
 * Custom hooks for RBAC data fetching and mutations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rbacApi } from '../api/rbac';
import type {
  CreateRoleInput,
  UpdateRoleInput,
  AssignUserRoleInput,
  RemoveUserRoleInput,
} from '../types/rbac';
import toast from 'react-hot-toast';

// Query Keys
export const rbacQueryKeys = {
  permissions: ['rbac', 'permissions'] as const,
  roles: ['rbac', 'roles'] as const,
  role: (id: string) => ['rbac', 'roles', id] as const,
  userRoles: (userId: string) => ['rbac', 'users', userId, 'roles'] as const,
  userPermissions: (userId: string) => ['rbac', 'users', userId, 'permissions'] as const,
  myRoles: ['rbac', 'me', 'roles'] as const,
  myPermissions: ['rbac', 'me', 'permissions'] as const,
  auditLogs: (filters?: Record<string, unknown>) => ['rbac', 'audit-logs', filters] as const,
};

// ============ Permission Hooks ============

export function usePermissions() {
  return useQuery({
    queryKey: rbacQueryKeys.permissions,
    queryFn: () => rbacApi.getPermissions(),
    staleTime: 1000 * 60 * 30, // 30 minutes - permissions don't change often
  });
}

// ============ Role Hooks ============

export function useRoles() {
  return useQuery({
    queryKey: rbacQueryKeys.roles,
    queryFn: () => rbacApi.getRoles(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useRole(roleId: string | null) {
  return useQuery({
    queryKey: rbacQueryKeys.role(roleId || ''),
    queryFn: () => rbacApi.getRoleById(roleId!),
    enabled: !!roleId,
    staleTime: 0, // Always refetch to get fresh permissions
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRoleInput) => rbacApi.createRole(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rbacQueryKeys.roles });
      toast.success('Role created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create role');
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ roleId, input }: { roleId: string; input: UpdateRoleInput }) =>
      rbacApi.updateRole(roleId, input),
    onSuccess: (_, { roleId }) => {
      queryClient.invalidateQueries({ queryKey: rbacQueryKeys.roles });
      queryClient.invalidateQueries({ queryKey: rbacQueryKeys.role(roleId) });
      toast.success('Role updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update role');
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roleId: string) => rbacApi.deleteRole(roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rbacQueryKeys.roles });
      toast.success('Role deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete role');
    },
  });
}

// ============ User Role Hooks ============

export function useUserRoles(userId: string | null) {
  return useQuery({
    queryKey: rbacQueryKeys.userRoles(userId || ''),
    queryFn: () => rbacApi.getUserRoles(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useUserPermissions(userId: string | null) {
  return useQuery({
    queryKey: rbacQueryKeys.userPermissions(userId || ''),
    queryFn: () => rbacApi.getUserPermissions(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useAssignRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AssignUserRoleInput) => rbacApi.assignRoleToUser(input),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: rbacQueryKeys.userRoles(userId) });
      queryClient.invalidateQueries({ queryKey: rbacQueryKeys.userPermissions(userId) });
      toast.success('Role assigned successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign role');
    },
  });
}

export function useRemoveRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RemoveUserRoleInput) => rbacApi.removeRoleFromUser(input),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: rbacQueryKeys.userRoles(userId) });
      queryClient.invalidateQueries({ queryKey: rbacQueryKeys.userPermissions(userId) });
      toast.success('Role removed successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove role');
    },
  });
}

// ============ Current User Hooks ============

export function useMyRoles() {
  return useQuery({
    queryKey: rbacQueryKeys.myRoles,
    queryFn: () => rbacApi.getMyRoles(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useMyPermissions() {
  return useQuery({
    queryKey: rbacQueryKeys.myPermissions,
    queryFn: () => rbacApi.getMyPermissions(),
    staleTime: 1000 * 60 * 5,
  });
}

// ============ Audit Hooks ============

export function useRbacAuditLogs(options?: {
  actorUserId?: string;
  targetUserId?: string;
  targetRoleId?: string;
  action?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: rbacQueryKeys.auditLogs(options),
    queryFn: () => rbacApi.getAuditLogs(options),
    staleTime: 1000 * 30, // 30 seconds
  });
}

// ============ Permission Check Hook ============

/**
 * Hook to check if current user has a specific permission
 */
export function useHasPermission(permissionKey: string): boolean {
  const { data: permissions } = useMyPermissions();

  if (!permissions) return false;

  return permissions.some(p => p.permissionKey === permissionKey);
}

/**
 * Hook to check if current user has any of the specified permissions
 */
export function useHasAnyPermission(permissionKeys: string[]): boolean {
  const { data: permissions } = useMyPermissions();

  if (!permissions) return false;

  const userPermKeys = new Set(permissions.map(p => p.permissionKey));
  return permissionKeys.some(key => userPermKeys.has(key));
}

/**
 * Hook to check if current user has all of the specified permissions
 */
export function useHasAllPermissions(permissionKeys: string[]): boolean {
  const { data: permissions } = useMyPermissions();

  if (!permissions) return false;

  const userPermKeys = new Set(permissions.map(p => p.permissionKey));
  return permissionKeys.every(key => userPermKeys.has(key));
}
