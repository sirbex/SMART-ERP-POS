import type { Request, Response } from 'express';
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
    const {
      actorUserId,
      targetUserId,
      targetRoleId,
      action,
      fromDate,
      toDate,
      limit,
      offset,
    } = req.query;

    const result = await this.service.getAuditLogs({
      actorUserId: actorUserId as string | undefined,
      targetUserId: targetUserId as string | undefined,
      targetRoleId: targetRoleId as string | undefined,
      action: action as string as RbacAuditAction | undefined,
      fromDate: fromDate as string | undefined,
      toDate: toDate as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      success: true,
      data: result.logs,
      pagination: {
        total: result.total,
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0,
      },
    });
  }

  async checkPermission(req: Request, res: Response): Promise<void> {
    const userId = requireAuth(req);
    const { permissionKey, scopeType, scopeId } = req.query;

    if (!permissionKey || typeof permissionKey !== 'string') {
      throw new ValidationError('permissionKey is required');
    }

    const hasPermission = await this.service.checkPermission(
      userId,
      permissionKey,
      scopeType as string | undefined,
      scopeId as string | undefined
    );

    res.json({ success: true, data: { hasPermission } });
  }
}
