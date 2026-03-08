/**
 * Audit Controller
 * Created: November 23, 2025
 * Purpose: HTTP handlers for audit trail endpoints
 * 
 * CRITICAL RULES:
 * - Validation ONLY - no business logic
 * - Call service layer for operations
 * - Return standard { success, data?, error? } format
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { AuditLogQuerySchema } from '../../../../shared/zod/audit.js';
import * as auditService from './auditService.js';
import { ValidationError, asyncHandler } from '../../middleware/errorHandler.js';

// Zod schemas for audit endpoints
const EntityAuditTrailParamsSchema = z.object({
  entityType: z.string().min(1),
  identifier: z.string().min(1),
});
const UserSessionsParamsSchema = z.object({ userId: z.string().uuid() });
const UserSessionsQuerySchema = z.object({
  limit: z.string().optional().transform(v => v ? parseInt(v) : 10),
});
const FailedTransactionQuerySchema = z.object({
  days: z.string().optional().transform(v => v ? parseInt(v) : 30),
});
const ForceLogoutBodySchema = z.object({
  idleMinutes: z.union([z.number().int().positive(), z.string().transform(Number)]).optional().default(15),
});

export class AuditController {
  /**
   * Get audit logs with filters and pagination
   * GET /api/audit/logs
   */
  getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    // Validate query parameters — throws ZodError on failure (caught by global handler)
    const filters = AuditLogQuerySchema.parse(req.query);

    const result = await auditService.getAuditLogs(pool, filters);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  });

  /**
   * Get audit trail for a specific entity
   * GET /api/audit/entity/:entityType/:identifier
   */
  getEntityAuditTrail = asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { entityType, identifier } = EntityAuditTrailParamsSchema.parse(req.params);

    const trail = await auditService.getEntityAuditTrail(
      pool,
      entityType.toUpperCase(),
      identifier
    );

    res.json({
      success: true,
      data: trail,
    });
  });

  /**
   * Get active user sessions
   * GET /api/audit/sessions/active
   */
  getActiveSessions = asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const sessions = await auditService.getActiveSessions(pool);

    res.json({
      success: true,
      data: sessions,
    });
  });

  /**
   * Get user session history
   * GET /api/audit/sessions/user/:userId
   */
  getUserSessions = asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { userId } = UserSessionsParamsSchema.parse(req.params);
    const { limit } = UserSessionsQuerySchema.parse(req.query);

    const sessions = await auditService.getUserSessions(pool, userId, limit);

    res.json({
      success: true,
      data: sessions,
    });
  });

  /**
   * Get failed transaction summary
   * GET /api/audit/failed-transactions/summary
   */
  getFailedTransactionSummary = asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { days } = FailedTransactionQuerySchema.parse(req.query);

    const summary = await auditService.getFailedTransactionSummary(pool, days);

    res.json({
      success: true,
      data: summary,
    });
  });

  /**
   * Force logout idle sessions (admin only)
   * POST /api/audit/sessions/force-logout-idle
   */
  forceLogoutIdleSessions = asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { idleMinutes } = ForceLogoutBodySchema.parse(req.body);

    // TODO: Add admin role check here
    const count = await auditService.forceLogoutIdleSessions(pool, idleMinutes);

    res.json({
      success: true,
      data: {
        loggedOutCount: count,
        message: `${count} idle sessions were logged out`,
      },
    });
  });
}
