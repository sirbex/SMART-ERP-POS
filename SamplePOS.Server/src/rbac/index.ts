export { RbacService, RbacError } from './service.js';
export { RbacRepository } from './repository.js';
export { RbacController } from './controller.js';
export { createRbacRoutes } from './routes.js';
export {
  initializeRbacMiddleware,
  getRbacService,
  attachRbacService,
  loadAuthorizationContext,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
} from './middleware.js';
export {
  PERMISSIONS,
  PERMISSION_KEYS,
  SYSTEM_ROLES,
  isValidPermissionKey,
  getPermission,
  getPermissionsByModule,
  getAllPermissions,
} from './permissions.js';
export {
  CreateRoleSchema,
  UpdateRoleSchema,
  AssignUserRoleSchema,
  RemoveUserRoleSchema,
  RoleIdParamSchema,
  UserIdParamSchema,
  PermissionCheckSchema,
  ScopeTypeSchema,
} from './validation.js';
export type {
  CreateRoleInput,
  UpdateRoleInput,
  AssignUserRoleInput,
  RemoveUserRoleInput,
  RoleIdParam,
  UserIdParam,
  PermissionCheckInput,
} from './validation.js';
export type {
  Permission,
  PermissionModule,
  PermissionAction,
  Role,
  RolePermission,
  UserRole,
  RbacAuditLog,
  RbacAuditAction,
  EffectivePermission,
  AuthorizationContext,
} from './types.js';
export { seedRbacTables } from './seed.js';
