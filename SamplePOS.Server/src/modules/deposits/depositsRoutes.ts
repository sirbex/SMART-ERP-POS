/**
 * Deposits Routes - API endpoints for customer deposits
 * Part of the SamplePOS hybrid architecture
 */

import express from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import * as depositsService from './depositsService.js';
import { authenticate } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Validation schemas
const CreateDepositSchema = z.object({
    customerId: z.string().uuid('Invalid customer ID'),
    amount: z.number().positive('Amount must be positive'),
    paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER']),
    reference: z.string().optional(),
    notes: z.string().optional()
});

const ApplyDepositSchema = z.object({
    customerId: z.string().uuid('Invalid customer ID'),
    saleId: z.string().uuid('Invalid sale ID'),
    amount: z.number().positive('Amount must be positive')
});

/**
 * GET /api/deposits
 * Get all deposits with pagination
 */
router.get('/', async (req, res) => {
    try {
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
    } catch (error: any) {
        logger.error('Error fetching deposits', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/deposits/:id
 * Get deposit by ID
 */
router.get('/:id', async (req, res) => {
    try {
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
    } catch (error: any) {
        logger.error('Error fetching deposit', { id: req.params.id, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/deposits/customer/:customerId
 * Get all deposits for a customer
 */
router.get('/customer/:customerId', async (req, res) => {
    try {
        const status = req.query.status as 'ACTIVE' | 'DEPLETED' | 'REFUNDED' | 'CANCELLED' | undefined;
        const deposits = await depositsService.getCustomerDeposits(
            pool,
            req.params.customerId,
            status
        );

        res.json({
            success: true,
            data: deposits
        });
    } catch (error: any) {
        logger.error('Error fetching customer deposits', {
            customerId: req.params.customerId,
            error: error.message
        });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/deposits/customer/:customerId/balance
 * Get customer's deposit balance (for POS checkout)
 */
router.get('/customer/:customerId/balance', async (req, res) => {
    try {
        logger.info('Fetching deposit balance for customer', { customerId: req.params.customerId });

        const balance = await depositsService.getCustomerDepositBalance(
            pool,
            req.params.customerId
        );

        logger.info('Deposit balance result', { customerId: req.params.customerId, balance });

        res.json({
            success: true,
            data: balance
        });
    } catch (error: any) {
        logger.error('Error fetching customer deposit balance', {
            customerId: req.params.customerId,
            error: error.message
        });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/deposits
 * Create a new deposit
 */
router.post('/', async (req, res) => {
    try {
        const parsed = CreateDepositSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: parsed.error.errors
            });
        }

        const user = (req as any).user;
        const deposit = await depositsService.createDeposit(pool, {
            ...parsed.data,
            createdBy: user?.id
        });

        res.status(201).json({
            success: true,
            data: deposit,
            message: `Deposit ${deposit.depositNumber} created successfully`
        });
    } catch (error: any) {
        logger.error('Error creating deposit', { error: error.message });
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/deposits/apply
 * Apply deposits to a sale
 */
router.post('/apply', async (req, res) => {
    try {
        const parsed = ApplyDepositSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: parsed.error.errors
            });
        }

        const user = (req as any).user;
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
    } catch (error: any) {
        logger.error('Error applying deposit', { error: error.message });
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/deposits/:id/refund
 * Refund a deposit
 */
router.post('/:id/refund', async (req, res) => {
    try {
        const reason = req.body.reason;
        const deposit = await depositsService.refundDeposit(pool, req.params.id, reason);

        res.json({
            success: true,
            data: deposit,
            message: `Deposit ${deposit.depositNumber} refunded successfully`
        });
    } catch (error: any) {
        logger.error('Error refunding deposit', { id: req.params.id, error: error.message });
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/deposits/sale/:saleId/applications
 * Get deposit applications for a sale
 */
router.get('/sale/:saleId/applications', async (req, res) => {
    try {
        const applications = await depositsService.getSaleDepositApplications(
            pool,
            req.params.saleId
        );

        res.json({
            success: true,
            data: applications
        });
    } catch (error: any) {
        logger.error('Error fetching sale deposit applications', {
            saleId: req.params.saleId,
            error: error.message
        });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
