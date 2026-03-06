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
import { pool as globalPool } from '../../db/pool.js';
import { AuditLogQuerySchema } from '../../../../shared/zod/audit.js';
import * as auditService from './auditService.js';
import { ValidationError } from '../../middleware/errorHandler.js';

// Async wrapper — catches thrown errors and forwards to Express error handler
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

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
    const { entityType, identifier } = req.params;

    if (!entityType || !identifier) {
      throw new ValidationError('Entity type and identifier are required');
    }

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
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!userId) {
      throw new ValidationError('User ID is required');
    }

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
    const days = parseInt(req.query.days as string) || 30;

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
    const idleMinutes = parseInt(req.body.idleMinutes as string) || 15;

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
