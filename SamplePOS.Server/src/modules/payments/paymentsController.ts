/**
 * Payments Controller - HTTP handlers for split payment endpoints
 * 
 * ARCHITECTURE: Controller layer - HTTP handling, validation, calls service
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { paymentsService } from './paymentsService.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const UuidParamSchema = z.object({ saleId: z.string().uuid('Sale ID must be a valid UUID') });
const CustomerIdParamSchema = z.object({ customerId: z.string().uuid('Customer ID must be a valid UUID') });

const PaymentSegmentSchema = z.object({
  method: z.string().min(1),
  amount: z.number().positive(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

const ProcessSplitPaymentSchema = z.object({
  saleId: z.string().uuid(),
  saleNumber: z.string().optional(), // For audit trail
  totalAmount: z.number().positive(),
  payments: z.array(PaymentSegmentSchema).min(1),
  customerId: z.string().uuid().optional().nullable(),
}).strict();

const RecordCustomerPaymentSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.string().min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
}).strict();

// ============================================================================
// CONTROLLER
// ============================================================================

export const paymentsController = {
  /**
   * GET /api/payments/methods
   * Get all available payment methods
   */
  getPaymentMethods: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const methods = await paymentsService.getPaymentMethods(pool);

    res.json({
      success: true,
      data: methods,
    });
  }),

  /**
   * POST /api/payments/process-split
   * Process a split payment for a sale
   */
  processSplitPayment: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;

    // Validate request body — ZodError caught by global handler
    const { saleId, saleNumber, totalAmount, payments, customerId } = ProcessSplitPaymentSchema.parse(req.body);
    const user = req.user; // From JWT middleware

    // Build audit context
    const auditContext = {
      userId: user?.id || '00000000-0000-0000-0000-000000000000',
      userName: user?.fullName || 'System',
      userRole: user?.role || 'STAFF',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      sessionId: req.cookies?.sessionId || (req.headers['x-session-id'] as string),
    };

    // Validate payment distribution
    const validationResult = paymentsService.validatePayments(
      payments,
      totalAmount,
      customerId
    );

    if (!validationResult.valid) {
      throw new ValidationError(`Invalid payment distribution: ${validationResult.errors?.join(', ')}`);
    }

    // Process split payment
    const result = await paymentsService.processSplitPayment(pool, {
      saleId,
      saleNumber,
      totalAmount,
      payments,
      customerId,
      processedBy: user?.id,
      auditContext,
    });

    res.json({
      success: true,
      data: result,
    });
  }),

  /**
   * GET /api/payments/sale/:saleId
   * Get payment breakdown for a sale
   */
  getSalePayments: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { saleId } = UuidParamSchema.parse(req.params);

    const breakdown = await paymentsService.getSalePaymentBreakdown(pool, saleId);

    res.json({
      success: true,
      data: breakdown,
    });
  }),

  /**
   * GET /api/payments/customer/:customerId/balance
   * Get customer current credit balance
   */
  getCustomerBalance: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { customerId } = CustomerIdParamSchema.parse(req.params);

    const balance = await paymentsService.getCustomerCreditBalance(pool, customerId);

    res.json({
      success: true,
      data: { balance },
    });
  }),

  /**
   * GET /api/payments/customer/:customerId/history
   * Get customer credit transaction history
   */
  getCustomerCreditHistory: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { customerId } = CustomerIdParamSchema.parse(req.params);
    const limit = parseInt(req.query.limit as string) || 50;

    const history = await paymentsService.getCustomerCreditHistory(pool, customerId, limit);

    res.json({
      success: true,
      data: history,
    });
  }),

  /**
   * POST /api/payments/customer/:customerId/payment
   * Record a customer credit payment
   */
  recordCustomerPayment: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { customerId } = CustomerIdParamSchema.parse(req.params);
    const userId = req.user?.id;

    // Validate request body — ZodError caught by global handler
    const { amount, paymentMethod, reference, notes } = RecordCustomerPaymentSchema.parse(req.body);

    const result = await paymentsService.recordCustomerPayment(pool, {
      customerId,
      amount,
      paymentMethod,
      reference,
      notes,
      processedBy: userId,
    });

    res.json({
      success: true,
      data: result,
    });
  }),
};
