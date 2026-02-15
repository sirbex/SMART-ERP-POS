/**
 * Payments Controller - HTTP handlers for split payment endpoints
 * 
 * ARCHITECTURE: Controller layer - HTTP handling, validation, calls service
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { paymentsService } from './paymentsService.js';

// Payment validation (simplified for now)
interface PaymentSegment {
  method: string;
  amount: number;
  reference?: string;
  notes?: string;
}
import { z } from 'zod';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

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
  async getPaymentMethods(req: Request, res: Response, pool: Pool) {
    try {
      const methods = await paymentsService.getPaymentMethods(pool);

      res.json({
        success: true,
        data: methods,
      });
    } catch (error: any) {
      console.error('Error fetching payment methods:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch payment methods',
      });
    }
  },

  /**
   * POST /api/payments/process-split
   * Process a split payment for a sale
   */
  async processSplitPayment(req: Request, res: Response, pool: Pool) {
    try {
      // Validate request body
      const validation = ProcessSplitPaymentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: validation.error.errors,
        });
      }

      const { saleId, saleNumber, totalAmount, payments, customerId } = validation.data;
      const user = (req as any).user; // From JWT middleware

      // Build audit context
      const auditContext = {
        userId: user?.id || '00000000-0000-0000-0000-000000000000',
        userName: user?.fullName || user?.name || 'System',
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
        return res.status(400).json({
          success: false,
          error: 'Invalid payment distribution',
          details: validationResult.errors,
        });
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
    } catch (error: any) {
      console.error('Error processing split payment:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to process split payment',
      });
    }
  },

  /**
   * GET /api/payments/sale/:saleId
   * Get payment breakdown for a sale
   */
  async getSalePayments(req: Request, res: Response, pool: Pool) {
    try {
      const { saleId } = req.params;

      if (!saleId) {
        return res.status(400).json({
          success: false,
          error: 'Sale ID required',
        });
      }

      const breakdown = await paymentsService.getSalePaymentBreakdown(pool, saleId);

      res.json({
        success: true,
        data: breakdown,
      });
    } catch (error: any) {
      console.error('Error fetching sale payments:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch sale payments',
      });
    }
  },

  /**
   * GET /api/payments/customer/:customerId/balance
   * Get customer current credit balance
   */
  async getCustomerBalance(req: Request, res: Response, pool: Pool) {
    try {
      const { customerId } = req.params;

      if (!customerId) {
        return res.status(400).json({
          success: false,
          error: 'Customer ID required',
        });
      }

      const balance = await paymentsService.getCustomerCreditBalance(pool, customerId);

      res.json({
        success: true,
        data: { balance },
      });
    } catch (error: any) {
      console.error('Error fetching customer balance:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch customer balance',
      });
    }
  },

  /**
   * GET /api/payments/customer/:customerId/history
   * Get customer credit transaction history
   */
  async getCustomerCreditHistory(req: Request, res: Response, pool: Pool) {
    try {
      const { customerId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!customerId) {
        return res.status(400).json({
          success: false,
          error: 'Customer ID required',
        });
      }

      const history = await paymentsService.getCustomerCreditHistory(pool, customerId, limit);

      res.json({
        success: true,
        data: history,
      });
    } catch (error: any) {
      console.error('Error fetching credit history:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch credit history',
      });
    }
  },

  /**
   * POST /api/payments/customer/:customerId/payment
   * Record a customer credit payment
   */
  async recordCustomerPayment(req: Request, res: Response, pool: Pool) {
    try {
      const { customerId } = req.params;
      const userId = (req as any).user?.id;

      if (!customerId) {
        return res.status(400).json({
          success: false,
          error: 'Customer ID required',
        });
      }

      // Validate request body
      const validation = RecordCustomerPaymentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: validation.error.errors,
        });
      }

      const { amount, paymentMethod, reference, notes } = validation.data;

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
    } catch (error: any) {
      console.error('Error recording customer payment:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to record customer payment',
      });
    }
  },
};
