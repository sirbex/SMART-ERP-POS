import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../rbac/middleware.js';
import { pool as globalPool } from '../db/pool.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as businessReportService from '../services/businessReportService.js';

const router = Router();

router.use(authenticate);

/**
 * @route GET /api/reports/business-performance
 * @desc Ledger-based Management P&L Report
 *       Section 1: Money In (settlement accounts)
 *       Section 2: Revenue by Product Category (GL → sale_items → products)
 *       Section 3: Cost & Stock Impact (COGS + adjustments)
 *       Section 4: Expenses by GL Account (6xxx/7xxx)
 *       Section 5: Net Business Position (summary)
 */
router.get(
  '/business-performance',
  requirePermission('reports.financial_view'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const {
      start_date,
      end_date,
      payment_method,
      transaction_type,
      include_stock_adjustments,
      include_expenses,
    } = req.query;

    const report = await businessReportService.getBusinessPerformanceReport(
      {
        startDate: start_date as string | undefined,
        endDate: end_date as string | undefined,
        paymentMethod: payment_method as string | undefined,
        transactionType: transaction_type as string | undefined,
        includeStockAdjustments: include_stock_adjustments !== 'false',
        includeExpenses: include_expenses !== 'false',
      },
      pool
    );

    res.json({ success: true, data: report });
  })
);

export default router;
