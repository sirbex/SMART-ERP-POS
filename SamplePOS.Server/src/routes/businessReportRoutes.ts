import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { pool as globalPool } from '../db/pool.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as businessReportService from '../services/businessReportService.js';

const router = Router();

router.use(authenticate);

/**
 * @route GET /api/reports/business-performance
 * @desc Business Performance Report by Category
 *       Returns revenue/COGS by product category + expenses by expense category + summary
 */
router.get(
  '/business-performance',
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const { start_date, end_date } = req.query;

    const report = await businessReportService.getBusinessPerformanceReport(
      {
        startDate: start_date as string | undefined,
        endDate: end_date as string | undefined,
      },
      pool
    );

    res.json({ success: true, data: report });
  })
);

export default router;
