import type { Request, Response } from 'express';
import { z } from 'zod';
import { RbacService } from './service.js';
import type { RbacAuditAction } from './types.js';
import {
  CreateRoleSchema,
  UpdateRoleSchema,
  AssignUserRoleSchema,
  RemoveUserRoleSchema,
  RoleIdParamSchema,
  UserIdParamSchema,
} from './validation.js';
import { UnauthorizedError, ValidationError } from '../middleware/errorHandler.js';

const AuditLogsQuerySchema = z.object({
  actorUserId: z.string().uuid().optional(),
  targetUserId: z.string().uuid().optional(),
  targetRoleId: z.string().uuid().optional(),
  action: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});

const CheckPermissionQuerySchema = z.object({
  permissionKey: z.string().min(1),
  scopeType: z.string().optional(),
  scopeId: z.string().optional(),
});

function getClientInfo(req: Request): { ipAddress: string | undefined; userAgent: string | undefined } {
  return {
    ipAddress: req.ip || req.socket.remoteAddress || undefined,
    userAgent: req.headers['user-agent'] || undefined,
  };
}

function requireAuth(req: Request): string {
  if (!req.user?.id) {
    throw new UnauthorizedError('Authentication required');
  }
  return req.user.id;
}

export class RbacController {
  constructor(private service: RbacService) { }

  async getPermissionCatalog(_req: Request, res: Response): Promise<void> {
    const permissions = await this.service.getPermissionCatalog();
    res.json({ success: true, data: permissions });
  }

  async createRole(req: Request, res: Response): Promise<void> {
    const userId = requireAuth(req);
    const input = CreateRoleSchema.parse(req.body);
    const { ipAddress, userAgent } = getClientInfo(req);
    const role = await this.service.createRole(input, userId, ipAddress, userAgent);
    res.status(201).json({ success: true, data: role });
  }

  async updateRole(req: Request, res: Response): Promise<void> {
    const userId = requireAuth(req);
    const { roleId } = RoleIdParamSchema.parse(req.params);
    const input = UpdateRoleSchema.parse(req.body);
    const { ipAddress, userAgent } = getClientInfo(req);
    const role = await this.service.updateRole(roleId, input, userId, ipAddress, userAgent);
    res.json({ success: true, data: role });
  }

  async deleteRole(req: Request, res: Response): Promise<void> {
    const userId = requireAuth(req);
    const { roleId } = RoleIdParamSchema.parse(req.params);
    const { ipAddress, userAgent } = getClientInfo(req);
    await this.service.deleteRole(roleId, userId, ipAddress, userAgent);
    res.json({ success: true, message: 'Role deleted successfully' });
  }

  async getRole(req: Request, res: Response): Promise<void> {
    const { roleId } = RoleIdParamSchema.parse(req.params);
    const role = await this.service.getRole(roleId);
    res.json({ success: true, data: role });
  }

  async getAllRoles(_req: Request, res: Response): Promise<void> {
    const roles = await this.service.getAllRoles();
    res.json({ success: true, data: roles });
  }

  async assignRoleToUser(req: Request, res: Response): Promise<void> {
    const userId = requireAuth(req);
    const input = AssignUserRoleSchema.parse(req.body);
    const { ipAddress, userAgent } = getClientInfo(req);
    const userRole = await this.service.assignRoleToUser(input, userId, ipAddress, userAgent);
    res.status(201).json({ success: true, data: userRole });
  }

  async removeRoleFromUser(req: Request, res: Response): Promise<void> {
    const userId = requireAuth(req);
    const input = RemoveUserRoleSchema.parse(req.body);
    const { ipAddress, userAgent } = getClientInfo(req);
    await this.service.removeRoleFromUser(input, userId, ipAddress, userAgent);
    res.json({ success: true, message: 'Role removed from user successfully' });
  }

  async getUserRoles(req: Request, res: Response): Promise<void> {
    const { userId } = UserIdParamSchema.parse(req.params);
    const roles = await this.service.getUserRoles(userId);
    res.json({ success: true, data: roles });
  }

  async getUserPermissions(req: Request, res: Response): Promise<void> {
    const { userId } = UserIdParamSchema.parse(req.params);
    const permissions = await this.service.getUserEffectivePermissions(userId);
    res.json({ success: true, data: permissions });
  }

  async getMyPermissions(req: Request, res: Response): Promise<void> {
    const userId = requireAuth(req);
    const permissions = await this.service.getUserEffectivePermissions(userId);
    res.json({ success: true, data: permissions });
  }

  async getMyRoles(req: Request, res: Response): Promise<void> {
    const userId = requireAuth(req);
    const roles = await this.service.getUserRoles(userId);
    res.json({ success: true, data: roles });
  }

  async getAuditLogs(req: Request, res: Response): Promise<void> {
    const query = AuditLogsQuerySchema.parse(req.query);

    const result = await this.service.getAuditLogs({
      actorUserId: query.actorUserId,
      targetUserId: query.targetUserId,
      targetRoleId: query.targetRoleId,
      action: query.action as RbacAuditAction | undefined,
      fromDate: query.fromDate,
      toDate: query.toDate,
      limit: query.limit,
      offset: query.offset,
    });

    res.json({
      success: true,
      data: result.logs,
      pagination: {
        total: result.total,
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
      },
    });
  }

  async checkPermission(req: Request, res: Response): Promise<void> {
    const userId = requireAuth(req);
    const { permissionKey, scopeType, scopeId } = CheckPermissionQuerySchema.parse(req.query);

    const hasPermission = await this.service.checkPermission(
      userId,
      permissionKey,
      scopeType,
      scopeId
    );

    res.json({ success: true, data: { hasPermission } });
  }
}
