/**
 * Deposits Routes - API endpoints for customer deposits
 * Part of the SamplePOS hybrid architecture
 *
 * Route order: static / multi-segment paths MUST be registered before `/:id`.
 */

import express from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import * as depositsService from './depositsService.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import logger from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const router = express.Router();

const CustomerIdParamSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
});

// Apply authentication to all routes
router.use(authenticate);

// Validation schemas
const CreateDepositSchema = z.object({
    customerId: z.string().uuid('Invalid customer ID'),
    amount: z.coerce.number().positive('Amount must be positive'),
    paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER']),
    reference: z.string().optional(),
    notes: z.string().optional()
});

const ApplyDepositSchema = z.object({
    customerId: z.string().uuid('Invalid customer ID'),
    saleId: z.string().uuid('Invalid sale ID'),
    amount: z.coerce.number().positive('Amount must be positive')
});

/**
 * GET /api/deposits
 * Get all deposits with pagination
 */
router.get('/', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const customerId = req.query.customerId as string;

    const result = await depositsService.getAllDeposits(pool, {
        page,
        limit,
        status,
        customerId
    });

    res.json({
        success: true,
        data: result
    });
}));

/**
 * GET /api/deposits/customer/:customerId/balance
 * Get customer's deposit balance (for POS checkout)
 * Registered before /:id so "customer" is never treated as a deposit id.
 */
router.get('/customer/:customerId/balance', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const parsed = CustomerIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            error: 'Invalid customer ID',
            details: parsed.error.flatten(),
        });
    }
    const { customerId } = parsed.data;
    logger.info('Fetching deposit balance for customer', { customerId });

    const balance = await depositsService.getCustomerDepositBalance(
        pool,
        customerId
    );

    logger.info('Deposit balance result', { customerId, balance });

    res.json({
        success: true,
        data: balance
    });
}));

/**
 * GET /api/deposits/customer/:customerId
 * Get all deposits for a customer
 */
router.get('/customer/:customerId', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const parsed = CustomerIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            error: 'Invalid customer ID',
            details: parsed.error.flatten(),
        });
    }
    const { customerId } = parsed.data;
    const status = req.query.status as 'ACTIVE' | 'DEPLETED' | 'REFUNDED' | 'CANCELLED' | undefined;
    const deposits = await depositsService.getCustomerDeposits(
        pool,
        customerId,
        status
    );

    res.json({
        success: true,
        data: deposits
    });
}));

/**
 * GET /api/deposits/sale/:saleId/applications
 * Get deposit applications for a sale
 */
router.get('/sale/:saleId/applications', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const applications = await depositsService.getSaleDepositApplications(
        pool,
        req.params.saleId
    );

    res.json({
        success: true,
        data: applications
    });
}));

/**
 * POST /api/deposits
 * Create a new deposit
 */
router.post('/', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const parsed = CreateDepositSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: parsed.error.errors
        });
    }

    const user = req.user;
    const deposit = await depositsService.createDeposit(pool, {
        ...parsed.data,
        createdBy: user?.id
    });

    res.status(201).json({
        success: true,
        data: deposit,
        message: `Deposit ${deposit.depositNumber} created successfully`
    });
}));

/**
 * POST /api/deposits/apply
 * Apply deposits to a sale
 */
router.post('/apply', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const parsed = ApplyDepositSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: parsed.error.errors
        });
    }

    const user = req.user;
    const result = await depositsService.applyDepositsToSale(
        pool,
        parsed.data.customerId,
        parsed.data.saleId,
        parsed.data.amount,
        user?.id
    );

    res.json({
        success: true,
        data: result,
        message: `Applied ${result.totalApplied.toFixed(2)} from deposits to sale`
    });
}));

/**
 * POST /api/deposits/backfill-gl
 * Backfill GL entries for orphaned deposits (admin only)
 */
router.post('/backfill-gl', requirePermission('accounting.approve'), asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const result = await depositsService.backfillOrphanedDepositGL(pool);

    res.json({
        success: true,
        data: result,
        message: result.backfilled > 0
            ? `Backfilled GL entries for ${result.backfilled} deposit(s)`
            : 'No orphaned deposits found — all deposits have GL entries'
    });
}));

/**
 * GET /api/deposits/:id
 * Get deposit by ID (parametric — register last among GET paths)
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const deposit = await depositsService.getDepositById(pool, req.params.id);

    if (!deposit) {
        return res.status(404).json({
            success: false,
            error: 'Deposit not found'
        });
    }

    res.json({
        success: true,
        data: deposit
    });
}));

/**
 * POST /api/deposits/:id/refund
 * Refund a deposit (requires approval permission)
 */
router.post('/:id/refund', requirePermission('accounting.approve'), asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const reason = req.body.reason;
    const deposit = await depositsService.refundDeposit(pool, req.params.id, reason);

    res.json({
        success: true,
        data: deposit,
        message: `Deposit ${deposit.depositNumber} refunded successfully`
    });
}));

export default router;
