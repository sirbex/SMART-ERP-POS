/**
 * Down Payment Clearing Routes — SAP-Style Clearing Endpoints
 */

import express from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import * as clearingService from './clearingService.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const router = express.Router();

router.use(authenticate);

// ── Validation Schemas ──────────────────────────────────────

const ClearingInputSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  invoiceId: z.string().uuid('Invalid invoice ID'),
  depositAllocations: z.array(z.object({
    depositId: z.string().uuid('Invalid deposit ID'),
    amount: z.number().positive('Amount must be positive'),
  })).default([]),
  cashPayment: z.object({
    amount: z.number().positive('Amount must be positive'),
    paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER']),
    referenceNumber: z.string().optional(),
  }).optional(),
  notes: z.string().max(1000).optional(),
}).refine(
  (data) => data.depositAllocations.length > 0 || data.cashPayment,
  { message: 'At least one deposit allocation or cash payment is required' }
);

// ── GET /api/down-payment-clearing/screen/:customerId ───────
// Clearing screen data — open invoices + open deposits

router.get('/screen/:customerId', asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  const { customerId } = req.params;

  const data = await clearingService.getClearingScreenData(pool, customerId);

  res.json({
    success: true,
    data,
  });
}));

// ── POST /api/down-payment-clearing ─────────────────────────
// Process a clearing — the main endpoint

router.post('/',
  requirePermission('accounting.post'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const input = ClearingInputSchema.parse(req.body);

    const result = await clearingService.processClearing(pool, {
      ...input,
      clearedBy: req.user?.id,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: `Clearing completed — ${result.totalCleared.toFixed(2)} applied to invoice`,
    });
  })
);

// ── GET /api/down-payment-clearing ──────────────────────────
// List all clearings (paginated)

router.get('/', asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const customerId = req.query.customerId as string | undefined;

  const result = await clearingService.listClearings(pool, { customerId, page, limit });

  res.json({
    success: true,
    data: result.clearings,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
}));

// ── GET /api/down-payment-clearing/invoice/:invoiceId ───────
// Get clearings for a specific invoice

router.get('/invoice/:invoiceId', asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  const clearings = await clearingService.getClearingsForInvoice(pool, req.params.invoiceId);

  res.json({
    success: true,
    data: clearings,
  });
}));

// ── GET /api/down-payment-clearing/deposit/:depositId ───────
// Get clearings for a specific deposit

router.get('/deposit/:depositId', asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  const clearings = await clearingService.getClearingsForDeposit(pool, req.params.depositId);

  res.json({
    success: true,
    data: clearings,
  });
}));

// ── GET /api/down-payment-clearing/liability-report ─────────
// Deposit liability report — total open deposits per customer

router.get('/liability-report',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const report = await clearingService.getDepositLiabilityReport(pool);

    res.json({
      success: true,
      data: report,
    });
  })
);

export const downPaymentClearingRoutes = router;
export default router;
