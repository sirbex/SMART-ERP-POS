import { z } from 'zod';
import { PERMISSION_KEYS } from './permissions.js';

export const ScopeTypeSchema = z.enum(['global', 'organization', 'branch', 'warehouse']);

export const CreateRoleSchema = z.object({
  name: z.string().min(2).max(100).regex(/^[a-zA-Z0-9_\-\s]+$/, 'Name can only contain letters, numbers, underscores, hyphens, and spaces'),
  description: z.string().min(1).max(500),
  permissionKeys: z.array(z.string()).min(1, 'At least one permission is required').refine(
    (keys) => keys.every(key => PERMISSION_KEYS.includes(key)),
    { message: 'Invalid permission key provided' }
  ),
});

export const UpdateRoleSchema = z.object({
  name: z.string().min(2).max(100).regex(/^[a-zA-Z0-9_\-\s]+$/).optional(),
  description: z.string().min(1).max(500).optional(),
  permissionKeys: z.array(z.string()).min(1).refine(
    (keys) => keys.every(key => PERMISSION_KEYS.includes(key)),
    { message: 'Invalid permission key provided' }
  ).optional(),
});

export const AssignUserRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
  scopeType: ScopeTypeSchema.nullable().optional(),
  scopeId: z.string().uuid().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const RemoveUserRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
  scopeType: ScopeTypeSchema.nullable().optional(),
  scopeId: z.string().uuid().nullable().optional(),
});

export const RoleIdParamSchema = z.object({
  roleId: z.string().uuid(),
});

export const UserIdParamSchema = z.object({
  userId: z.string().uuid(),
});

export const PermissionCheckSchema = z.object({
  permissionKey: z.string().refine(
    (key) => PERMISSION_KEYS.includes(key),
    { message: 'Invalid permission key' }
  ),
  scopeType: ScopeTypeSchema.nullable().optional(),
  scopeId: z.string().uuid().nullable().optional(),
});

export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
export type AssignUserRoleInput = z.infer<typeof AssignUserRoleSchema>;
export type RemoveUserRoleInput = z.infer<typeof RemoveUserRoleSchema>;
export type RoleIdParam = z.infer<typeof RoleIdParamSchema>;
export type UserIdParam = z.infer<typeof UserIdParamSchema>;
export type PermissionCheckInput = z.infer<typeof PermissionCheckSchema>;
