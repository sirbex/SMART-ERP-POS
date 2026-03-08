/**
 * Audit Routes
 * Created: November 23, 2025
 * Purpose: Express routes for audit trail API
 */

import express from 'express';
import { AuditController } from './auditController.js';
import { requirePermission } from '../../rbac/middleware.js';

const router = express.Router();
const auditController = new AuditController();

// All audit routes require system.audit_read permission (ADMIN/MANAGER only)
router.use(requirePermission('system.audit_read'));

// =====================================================
// AUDIT LOG ROUTES
// =====================================================

/**
 * GET /api/audit/logs
 * Get audit logs with filters and pagination
 * Query params: entityType, action, userId, startDate, endDate, page, limit, etc.
 */
router.get('/logs', auditController.getAuditLogs.bind(auditController));

/**
 * GET /api/audit/entity/:entityType/:identifier
 * Get audit trail for a specific entity
 * Examples:
 * - /api/audit/entity/SALE/SALE-2025-0001
 * - /api/audit/entity/INVOICE/INV-00123
 * - /api/audit/entity/SALE/uuid-here
 */
router.get('/entity/:entityType/:identifier', auditController.getEntityAuditTrail.bind(auditController));

// =====================================================
// SESSION ROUTES
// =====================================================

/**
 * GET /api/audit/sessions/active
 * Get currently active user sessions
 */
router.get('/sessions/active', auditController.getActiveSessions.bind(auditController));

/**
 * GET /api/audit/sessions/user/:userId
 * Get session history for a specific user
 * Query params: limit (default 10)
 */
router.get('/sessions/user/:userId', auditController.getUserSessions.bind(auditController));

/**
 * POST /api/audit/sessions/force-logout-idle
 * Force logout idle sessions (admin only)
 * Body: { idleMinutes: number }
 */
router.post('/sessions/force-logout-idle', auditController.forceLogoutIdleSessions.bind(auditController));

// =====================================================
// FAILED TRANSACTION ROUTES
// =====================================================

/**
 * GET /api/audit/failed-transactions/summary
 * Get failed transaction summary for dashboard
 * Query params: days (default 30)
 */
router.get('/failed-transactions/summary', auditController.getFailedTransactionSummary.bind(auditController));

export default router;
