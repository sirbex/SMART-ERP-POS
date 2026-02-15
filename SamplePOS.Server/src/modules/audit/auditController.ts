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

import { Request, Response } from 'express';
import { Pool } from 'pg';
import pool from '../../db/pool.js';
import { AuditLogQuerySchema } from '../../../../shared/zod/audit.js';
import * as auditService from './auditService.js';
import logger from '../../utils/logger.js';

export class AuditController {
  /**
   * Get audit logs with filters and pagination
   * GET /api/audit/logs
   */
  async getAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      // Validate query parameters
      const validation = AuditLogQuerySchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: validation.error.format(),
        });
        return;
      }

      const filters = validation.data;
      const result = await auditService.getAuditLogs(pool, filters);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error: any) {
      console.error('[AUDIT] Failed to get audit logs:', error);
      logger.error('Failed to get audit logs', { error: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve audit logs',
      });
    }
  }

  /**
   * Get audit trail for a specific entity
   * GET /api/audit/entity/:entityType/:identifier
   */
  async getEntityAuditTrail(req: Request, res: Response): Promise<void> {
    try {
      const { entityType, identifier } = req.params;

      if (!entityType || !identifier) {
        res.status(400).json({
          success: false,
          error: 'Entity type and identifier are required',
        });
        return;
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
    } catch (error: any) {
      logger.error('Failed to get entity audit trail', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve audit trail',
      });
    }
  }

  /**
   * Get active user sessions
   * GET /api/audit/sessions/active
   */
  async getActiveSessions(req: Request, res: Response): Promise<void> {
    try {
      const sessions = await auditService.getActiveSessions(pool);

      res.json({
        success: true,
        data: sessions,
      });
    } catch (error: any) {
      logger.error('Failed to get active sessions', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve active sessions',
      });
    }
  }

  /**
   * Get user session history
   * GET /api/audit/sessions/user/:userId
   */
  async getUserSessions(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      const sessions = await auditService.getUserSessions(pool, userId, limit);

      res.json({
        success: true,
        data: sessions,
      });
    } catch (error: any) {
      logger.error('Failed to get user sessions', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve user sessions',
      });
    }
  }

  /**
   * Get failed transaction summary
   * GET /api/audit/failed-transactions/summary
   */
  async getFailedTransactionSummary(req: Request, res: Response): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 30;

      const summary = await auditService.getFailedTransactionSummary(pool, days);

      res.json({
        success: true,
        data: summary,
      });
    } catch (error: any) {
      logger.error('Failed to get failed transaction summary', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve failed transaction summary',
      });
    }
  }

  /**
   * Force logout idle sessions (admin only)
   * POST /api/audit/sessions/force-logout-idle
   */
  async forceLogoutIdleSessions(req: Request, res: Response): Promise<void> {
    try {
      const pool = req.app.locals.pool as Pool;
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
    } catch (error: any) {
      logger.error('Failed to force logout idle sessions', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to force logout idle sessions',
      });
    }
  }
}
