import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import logger from '../utils/logger.js';
import {
  generateProfitAndLoss,
  generateBalanceSheet,
  generateComparativeReports,
} from '../services/reports/financialReports.js';

const router = Router();

// ===================================================================
// GET /api/reports/profit-loss - Generate Profit & Loss Statement
// ===================================================================
router.get(
  '/profit-loss',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Start date and end date are required' });
      }

      const report = await generateProfitAndLoss(new Date(startDate as string), new Date(endDate as string));

      logger.info('P&L report generated', {
        userId: (req as any).user?.id,
        startDate,
        endDate,
      });

      res.json({
        success: true,
        report: {
          period: report.period,
          revenue: report.revenue,
          costOfGoodsSold: report.costOfGoodsSold,
          grossProfit: report.grossProfit,
          grossProfitMargin: report.grossProfitMargin,
          operatingExpenses: report.operatingExpenses,
          operatingIncome: report.operatingIncome,
          operatingMargin: report.operatingMargin,
          otherIncome: report.otherIncome,
          otherExpenses: report.otherExpenses,
          netIncome: report.netIncome,
          netProfitMargin: report.netProfitMargin,
        },
      });
    } catch (error) {
      logger.error('Error generating P&L report:', error);
      next(error);
    }
  }
);

// ===================================================================
// GET /api/reports/balance-sheet - Generate Balance Sheet
// ===================================================================
router.get(
  '/balance-sheet',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { asOfDate } = req.query;

      if (!asOfDate) {
        return res.status(400).json({ error: 'As of date is required' });
      }

      const report = await generateBalanceSheet(new Date(asOfDate as string));

      logger.info('Balance sheet generated', {
        userId: (req as any).user?.id,
        asOfDate,
      });

      res.json({
        success: true,
        report,
      });
    } catch (error) {
      logger.error('Error generating balance sheet:', error);
      next(error);
    }
  }
);

// ===================================================================
// GET /api/reports/comparative - Generate Comparative Reports
// ===================================================================
router.get(
  '/comparative',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentStart, currentEnd, previousStart, previousEnd } = req.query;

      if (!currentStart || !currentEnd || !previousStart || !previousEnd) {
        return res.status(400).json({
          error: 'Current and previous period dates are required',
        });
      }

      const report = await generateComparativeReports(
        new Date(currentStart as string),
        new Date(currentEnd as string),
        new Date(previousStart as string),
        new Date(previousEnd as string)
      );

      logger.info('Comparative reports generated', {
        userId: (req as any).user?.id,
        currentPeriod: `${currentStart} to ${currentEnd}`,
        previousPeriod: `${previousStart} to ${previousEnd}`,
      });

      res.json({
        success: true,
        report,
      });
    } catch (error) {
      logger.error('Error generating comparative reports:', error);
      next(error);
    }
  }
);

export default router;
