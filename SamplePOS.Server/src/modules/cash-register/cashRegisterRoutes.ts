/**
 * Cash Register Routes
 * 
 * REST API endpoints for cash register management.
 * Follows existing route patterns with Zod validation.
 */

import express from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { cashRegisterService } from './cashRegisterService.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const CreateRegisterSchema = z.object({
    name: z.string().min(1).max(100),
    location: z.string().max(255).optional()
});

const UpdateRegisterSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    location: z.string().max(255).optional().nullable().transform(val => val ?? undefined),
    isActive: z.boolean().optional()
});

const OpenSessionSchema = z.object({
    registerId: z.string().uuid(),
    openingFloat: z.number().nonnegative(),
    blindCountEnabled: z.boolean().optional().default(false), // QuickBooks/Odoo: hide expected
    varianceThreshold: z.number().nonnegative().optional().default(0) // Auto-approve below this
});

const CloseSessionSchema = z.object({
    actualClosing: z.number().nonnegative(),
    varianceReason: z.string().max(500).optional(),
    notes: z.string().max(1000).optional(),
    denominationBreakdown: z.record(z.string(), z.number()).optional() // Cash by denomination
});

const RecordMovementSchema = z.object({
    sessionId: z.string().uuid(),
    movementType: z.enum([
        'CASH_IN', 'CASH_IN_FLOAT', 'CASH_IN_PAYMENT', 'CASH_IN_OTHER',
        'CASH_OUT', 'CASH_OUT_BANK', 'CASH_OUT_EXPENSE', 'CASH_OUT_OTHER'
    ]),
    amount: z.number().positive(),
    reason: z.string().max(255).optional(),
    approvedBy: z.string().uuid().optional(),
    paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'CREDIT', 'OTHER']).optional(),
    // For customer payments - link to invoice
    invoiceId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional()
});

const SessionQuerySchema = z.object({
    registerId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    status: z.enum(['OPEN', 'CLOSED', 'RECONCILED']).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    limit: z.coerce.number().positive().max(100).optional(),
    offset: z.coerce.number().nonnegative().optional()
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

router.get('/health', (_req, res) => {
    res.json({
        success: true,
        data: {
            status: 'healthy',
            module: 'cash-register',
            timestamp: new Date().toISOString()
        }
    });
});

// =============================================================================
// REGISTER ENDPOINTS
// =============================================================================

/**
 * GET /api/cash-registers
 * Get all registers with current session status
 * Managers/admins see all registers; staff see active only (with session info)
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const user = req.user as { role: string };
        const isManager = ['ADMIN', 'MANAGER'].includes(user.role);

        // Always include session status so the Open Register dialog knows availability
        const registersWithStatus = await cashRegisterService.getRegistersWithStatus();

        // Staff only see active registers (already filtered in query)
        // Managers see all (need to include inactive too)
        const registers = isManager
            ? await cashRegisterService.getAllRegisters()
            : [];

        // Merge: for managers, enrich all registers with session info
        if (isManager && registers.length > 0) {
            const statusMap = new Map(registersWithStatus.map(r => [r.id, r]));
            const enriched = registers.map(reg => {
                const status = statusMap.get(reg.id);
                return {
                    ...reg,
                    currentSessionId: status?.currentSessionId || null,
                    currentSessionNumber: status?.currentSessionNumber || null,
                    currentSessionUserId: status?.currentSessionUserId || null,
                    currentSessionUserName: status?.currentSessionUserName || null,
                    currentSessionOpenedAt: status?.currentSessionOpenedAt || null,
                };
            });
            return res.json({ success: true, data: enriched });
        }

        res.json({
            success: true,
            data: registersWithStatus
        });
    } catch (error) {
        logger.error('Error getting registers:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get registers'
        });
    }
});

/**
 * GET /api/cash-registers/:id
 * Get register by ID
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const register = await cashRegisterService.getRegisterById(req.params.id);

        if (!register) {
            return res.status(404).json({
                success: false,
                error: 'Register not found'
            });
        }

        res.json({
            success: true,
            data: register
        });
    } catch (error) {
        logger.error('Error getting register:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get register'
        });
    }
});

/**
 * POST /api/cash-registers
 * Create a new register (admin/manager only)
 */
router.post('/', authenticate, requirePermission('pos.create'), async (req, res) => {
    try {
        const data = CreateRegisterSchema.parse(req.body);
        const user = req.user as { id: string };

        const register = await cashRegisterService.createRegister(data, user.id);

        res.status(201).json({
            success: true,
            data: register,
            message: 'Register created successfully'
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                details: error.errors
            });
        }
        logger.error('Error creating register:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create register'
        });
    }
});

/**
 * PUT /api/cash-registers/:id
 * Update a register (admin/manager only)
 */
router.put('/:id', authenticate, requirePermission('pos.create'), async (req, res) => {
    try {
        const data = UpdateRegisterSchema.parse(req.body);
        const user = req.user as { id: string };

        const register = await cashRegisterService.updateRegister(req.params.id, data, user.id);

        if (!register) {
            return res.status(404).json({
                success: false,
                error: 'Register not found'
            });
        }

        res.json({
            success: true,
            data: register,
            message: 'Register updated successfully'
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                details: error.errors
            });
        }
        logger.error('Error updating register:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update register'
        });
    }
});

// =============================================================================
// SESSION ENDPOINTS
// =============================================================================

/**
 * GET /api/cash-registers/sessions/current
 * Get current user's open session
 */
router.get('/sessions/current', authenticate, async (req, res) => {
    try {
        const user = req.user as { id: string };
        const session = await cashRegisterService.getUserOpenSession(user.id);

        res.json({
            success: true,
            data: session // null if no open session
        });
    } catch (error) {
        logger.error('Error getting current session:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get current session'
        });
    }
});

/**
 * GET /api/cash-registers/sessions
 * Get sessions with filters
 */
router.get('/sessions', authenticate, async (req, res) => {
    try {
        const filters = SessionQuerySchema.parse(req.query);
        const result = await cashRegisterService.getSessions(filters);

        res.json({
            success: true,
            data: result.sessions,
            pagination: {
                total: result.total,
                limit: filters.limit || 50,
                offset: filters.offset || 0
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                details: error.errors
            });
        }
        logger.error('Error getting sessions:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get sessions'
        });
    }
});

/**
 * GET /api/cash-registers/sessions/:id
 * Get session by ID
 */
router.get('/sessions/:id', authenticate, async (req, res) => {
    try {
        const session = await cashRegisterService.getSessionById(req.params.id);

        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        res.json({
            success: true,
            data: session
        });
    } catch (error) {
        logger.error('Error getting session:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get session'
        });
    }
});

/**
 * GET /api/cash-registers/sessions/:id/summary
 * Get full session summary with movements
 */
router.get('/sessions/:id/summary', authenticate, async (req, res) => {
    try {
        const summary = await cashRegisterService.getSessionSummary(req.params.id);

        if (!summary) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        logger.error('Error getting session summary:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get session summary'
        });
    }
});

/**
 * POST /api/cash-registers/sessions/open
 * Open a new register session
 */
router.post('/sessions/open', authenticate, async (req, res) => {
    try {
        const data = OpenSessionSchema.parse(req.body);
        const user = req.user as { id: string };

        const session = await cashRegisterService.openSession({
            ...data,
            userId: user.id
        });

        res.status(201).json({
            success: true,
            data: session,
            message: 'Session opened successfully'
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                details: error.errors
            });
        }

        // Handle known business errors
        if (error instanceof Error &&
            ['REGISTER_NOT_FOUND', 'REGISTER_INACTIVE', 'REGISTER_BUSY', 'USER_HAS_SESSION']
                .some(code => error.message.includes(code))) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        logger.error('Error opening session:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to open session'
        });
    }
});

/**
 * POST /api/cash-registers/sessions/:id/close
 * Close a register session
 */
router.post('/sessions/:id/close', authenticate, async (req, res) => {
    try {
        const data = CloseSessionSchema.parse(req.body);
        const user = req.user as { id: string };

        const session = await cashRegisterService.closeSession({
            sessionId: req.params.id,
            ...data
        }, user.id);

        res.json({
            success: true,
            data: session,
            message: 'Session closed successfully'
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                details: error.errors
            });
        }

        if (error instanceof Error &&
            ['SESSION_NOT_FOUND', 'SESSION_NOT_OPEN'].some(code => error.message.includes(code))) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        logger.error('Error closing session:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to close session'
        });
    }
});

/**
 * POST /api/cash-registers/sessions/:id/reconcile
 * Reconcile a closed session (manager only)
 */
router.post(
    '/sessions/:id/reconcile',
    authenticate,
    requirePermission('pos.approve'),
    async (req, res) => {
        try {
            const user = req.user as { id: string };
            const session = await cashRegisterService.reconcileSession(req.params.id, user.id);

            res.json({
                success: true,
                data: session,
                message: 'Session reconciled successfully'
            });
        } catch (error) {
            if (error instanceof Error &&
                ['SESSION_NOT_FOUND', 'SESSION_NOT_CLOSED'].some(code => error.message.includes(code))) {
                return res.status(400).json({
                    success: false,
                    error: error.message
                });
            }

            logger.error('Error reconciling session:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to reconcile session'
            });
        }
    }
);

/**
 * POST /api/cash-registers/sessions/:id/force-close
 * Force-close a stale/abandoned session (admin/manager only)
 * Used when a cashier left without closing, blocking the register
 */
router.post(
    '/sessions/:id/force-close',
    authenticate,
    requirePermission('pos.approve'),
    async (req, res) => {
        try {
            const user = req.user as { id: string };
            const session = await cashRegisterService.forceCloseSession(req.params.id, user.id);

            res.json({
                success: true,
                data: session,
                message: 'Session force-closed successfully'
            });
        } catch (error) {
            if (error instanceof Error &&
                ['SESSION_NOT_FOUND', 'SESSION_NOT_OPEN'].some(code => error.message.includes(code))) {
                return res.status(400).json({
                    success: false,
                    error: error.message
                });
            }

            logger.error('Error force-closing session:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to force-close session'
            });
        }
    }
);

// =============================================================================
// MOVEMENT ENDPOINTS
// =============================================================================

/**
 * GET /api/cash-registers/sessions/:id/movements
 * Get movements for a session
 */
router.get('/sessions/:id/movements', authenticate, async (req, res) => {
    try {
        const movements = await cashRegisterService.getSessionMovements(req.params.id);

        res.json({
            success: true,
            data: movements
        });
    } catch (error) {
        logger.error('Error getting session movements:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get movements'
        });
    }
});

/**
 * POST /api/cash-registers/movements
 * Record a cash movement (cash in/out)
 */
router.post('/movements', authenticate, async (req, res) => {
    try {
        const data = RecordMovementSchema.parse(req.body);
        const user = req.user as { id: string };

        // For CASH_OUT types over a threshold, require approval
        // (This is a simplified check - in production, use a configurable threshold)
        const CASH_OUT_APPROVAL_THRESHOLD = 100000; // UGX
        const isCashOutType = data.movementType.startsWith('CASH_OUT');
        if (isCashOutType &&
            data.amount > CASH_OUT_APPROVAL_THRESHOLD &&
            !data.approvedBy) {
            return res.status(400).json({
                success: false,
                error: `Cash out over ${CASH_OUT_APPROVAL_THRESHOLD.toLocaleString()} UGX requires manager approval`
            });
        }

        const movement = await cashRegisterService.recordMovement({
            ...data,
            userId: user.id
        });

        res.status(201).json({
            success: true,
            data: movement,
            message: 'Movement recorded successfully'
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                details: error.errors
            });
        }

        if (error instanceof Error &&
            ['SESSION_NOT_FOUND', 'SESSION_NOT_OPEN'].some(code => error.message.includes(code))) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        logger.error('Error recording movement:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to record movement'
        });
    }
});

// =============================================================================
// REPORT ENDPOINTS (QuickBooks/Odoo Standard)
// =============================================================================

/**
 * GET /api/cash-registers/sessions/:id/x-report
 * Generate X-Report (interim report - session stays OPEN)
 * 
 * QuickBooks/Odoo equivalent: Interim cash register report
 */
router.get('/sessions/:id/x-report', authenticate, async (req, res) => {
    try {
        const report = await cashRegisterService.generateXReport(req.params.id);

        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        if (error instanceof Error &&
            ['SESSION_NOT_FOUND', 'SESSION_NOT_OPEN'].some(code => error.message.includes(code))) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        logger.error('Error generating X-Report:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate X-Report'
        });
    }
});

const ZReportSchema = z.object({
    actualClosing: z.number().nonnegative(),
    denominationBreakdown: z.record(z.string(), z.number()).optional(),
    varianceReason: z.string().max(500).optional()
});

/**
 * POST /api/cash-registers/sessions/:id/z-report
 * Generate Z-Report (end of day - closes session)
 * 
 * QuickBooks/Odoo equivalent: End-of-day closing report
 */
router.post('/sessions/:id/z-report', authenticate, async (req, res) => {
    try {
        const data = ZReportSchema.parse(req.body);
        const user = req.user as { id: string };

        const report = await cashRegisterService.generateZReport(
            req.params.id,
            data.actualClosing,
            data.denominationBreakdown,
            data.varianceReason,
            user.id
        );

        res.json({
            success: true,
            data: report,
            message: 'Z-Report generated and session closed'
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                details: error.errors
            });
        }

        if (error instanceof Error &&
            ['SESSION_NOT_FOUND', 'SESSION_NOT_OPEN'].some(code => error.message.includes(code))) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        logger.error('Error generating Z-Report:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate Z-Report'
        });
    }
});

/**
 * POST /api/cash-registers/sessions/:id/approve-variance
 * Approve a cash variance (manager only)
 * 
 * QuickBooks/Odoo equivalent: Variance sign-off
 */
router.post(
    '/sessions/:id/approve-variance',
    authenticate,
    requirePermission('pos.approve'),
    async (req, res) => {
        try {
            const user = req.user as { id: string };
            const { notes } = req.body;

            const session = await cashRegisterService.approveVariance(
                req.params.id,
                user.id,
                notes
            );

            res.json({
                success: true,
                data: session,
                message: 'Variance approved'
            });
        } catch (error) {
            if (error instanceof Error &&
                ['SESSION_NOT_FOUND', 'SESSION_NOT_CLOSED'].some(code => error.message.includes(code))) {
                return res.status(400).json({
                    success: false,
                    error: error.message
                });
            }

            logger.error('Error approving variance:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to approve variance'
            });
        }
    }
);

export default router;
