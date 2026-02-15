import type { Request, Response } from 'express';
import { RbacService, RbacError } from './service.js';
import {
  CreateRoleSchema,
  UpdateRoleSchema,
  AssignUserRoleSchema,
  RemoveUserRoleSchema,
  RoleIdParamSchema,
  UserIdParamSchema,
} from './validation.js';
import { ZodError } from 'zod';

function handleError(res: Response, error: unknown): void {
  if (error instanceof RbacError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: error.errors,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
}

function getClientInfo(req: Request): { ipAddress: string | undefined; userAgent: string | undefined } {
  return {
    ipAddress: req.ip || req.socket.remoteAddress || undefined,
    userAgent: req.headers['user-agent'] || undefined,
  };
}

export class RbacController {
  constructor(private service: RbacService) { }

  async getPermissionCatalog(req: Request, res: Response): Promise<void> {
    try {
      const permissions = await this.service.getPermissionCatalog();
      res.json({
        success: true,
        data: permissions,
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  async createRole(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const input = CreateRoleSchema.parse(req.body);
      const { ipAddress, userAgent } = getClientInfo(req);

      const role = await this.service.createRole(input, req.user.id, ipAddress, userAgent);

      res.status(201).json({
        success: true,
        data: role,
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  async updateRole(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { roleId } = RoleIdParamSchema.parse(req.params);
      const input = UpdateRoleSchema.parse(req.body);
      const { ipAddress, userAgent } = getClientInfo(req);

      const role = await this.service.updateRole(roleId, input, req.user.id, ipAddress, userAgent);

      res.json({
        success: true,
        data: role,
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  async deleteRole(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { roleId } = RoleIdParamSchema.parse(req.params);
      const { ipAddress, userAgent } = getClientInfo(req);

      await this.service.deleteRole(roleId, req.user.id, ipAddress, userAgent);

      res.json({
        success: true,
        message: 'Role deleted successfully',
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  async getRole(req: Request, res: Response): Promise<void> {
    try {
      const { roleId } = RoleIdParamSchema.parse(req.params);
      const role = await this.service.getRole(roleId);

      res.json({
        success: true,
        data: role,
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  async getAllRoles(req: Request, res: Response): Promise<void> {
    try {
      const roles = await this.service.getAllRoles();

      res.json({
        success: true,
        data: roles,
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  async assignRoleToUser(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const input = AssignUserRoleSchema.parse(req.body);
      const { ipAddress, userAgent } = getClientInfo(req);

      const userRole = await this.service.assignRoleToUser(input, req.user.id, ipAddress, userAgent);

      res.status(201).json({
        success: true,
        data: userRole,
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  async removeRoleFromUser(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const input = RemoveUserRoleSchema.parse(req.body);
      const { ipAddress, userAgent } = getClientInfo(req);

      await this.service.removeRoleFromUser(input, req.user.id, ipAddress, userAgent);

      res.json({
        success: true,
        message: 'Role removed from user successfully',
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  async getUserRoles(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = UserIdParamSchema.parse(req.params);
      const roles = await this.service.getUserRoles(userId);

      res.json({
        success: true,
        data: roles,
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  async getUserPermissions(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = UserIdParamSchema.parse(req.params);
      const permissions = await this.service.getUserEffectivePermissions(userId);

      res.json({
        success: true,
        data: permissions,
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  async getMyPermissions(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const permissions = await this.service.getUserEffectivePermissions(req.user.id);

      res.json({
        success: true,
        data: permissions,
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  async getMyRoles(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const roles = await this.service.getUserRoles(req.user.id);

      res.json({
        success: true,
        data: roles,
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  async getAuditLogs(req: Request, res: Response): Promise<void> {
    try {
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
        action: action as any,
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
    } catch (error) {
      handleError(res, error);
    }
  }

  async checkPermission(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { permissionKey, scopeType, scopeId } = req.query;

      if (!permissionKey || typeof permissionKey !== 'string') {
        res.status(400).json({ success: false, error: 'permissionKey is required' });
        return;
      }

      const hasPermission = await this.service.checkPermission(
        req.user.id,
        permissionKey,
        scopeType as string | undefined,
        scopeId as string | undefined
      );

      res.json({
        success: true,
        data: { hasPermission },
      });
    } catch (error) {
      handleError(res, error);
    }
  }
}
