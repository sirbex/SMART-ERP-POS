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
          revenue: report.revenue.toString(),
          cogs: report.cogs.toString(),
          grossProfit: report.grossProfit.toString(),
          grossProfitMargin: report.grossProfitMargin.toString(),
          operatingExpenses: report.operatingExpenses.toString(),
          operatingIncome: report.operatingIncome.toString(),
          operatingMargin: report.operatingMargin.toString(),
          otherIncome: report.otherIncome.toString(),
          otherExpenses: report.otherExpenses.toString(),
          netIncome: report.netIncome.toString(),
          netMargin: report.netMargin.toString(),
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
        report: {
          asOfDate: report.asOfDate,
          assets: {
            currentAssets: report.currentAssets.toString(),
            fixedAssets: report.fixedAssets.toString(),
            totalAssets: report.totalAssets.toString(),
          },
          liabilities: {
            currentLiabilities: report.currentLiabilities.toString(),
            longTermLiabilities: report.longTermLiabilities.toString(),
            totalLiabilities: report.totalLiabilities.toString(),
          },
          equity: {
            totalEquity: report.equity.toString(),
          },
          totalLiabilitiesAndEquity: report.totalLiabilitiesAndEquity.toString(),
          isBalanced: report.isBalanced,
        },
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
        report: {
          profitAndLoss: {
            current: {
              revenue: report.profitAndLoss.current.revenue.toString(),
              netIncome: report.profitAndLoss.current.netIncome.toString(),
              netMargin: report.profitAndLoss.current.netMargin.toString(),
            },
            previous: {
              revenue: report.profitAndLoss.previous.revenue.toString(),
              netIncome: report.profitAndLoss.previous.netIncome.toString(),
              netMargin: report.profitAndLoss.previous.netMargin.toString(),
            },
            change: {
              revenueChange: report.profitAndLoss.change.revenueChange.toString(),
              revenueChangePercent: report.profitAndLoss.change.revenueChangePercent.toString(),
              netIncomeChange: report.profitAndLoss.change.netIncomeChange.toString(),
              netIncomeChangePercent:
                report.profitAndLoss.change.netIncomeChangePercent.toString(),
            },
          },
          balanceSheet: {
            current: {
              totalAssets: report.balanceSheet.current.totalAssets.toString(),
              totalLiabilities: report.balanceSheet.current.totalLiabilities.toString(),
              equity: report.balanceSheet.current.equity.toString(),
            },
            previous: {
              totalAssets: report.balanceSheet.previous.totalAssets.toString(),
              totalLiabilities: report.balanceSheet.previous.totalLiabilities.toString(),
              equity: report.balanceSheet.previous.equity.toString(),
            },
            change: {
              assetsChange: report.balanceSheet.change.assetsChange.toString(),
              assetsChangePercent: report.balanceSheet.change.assetsChangePercent.toString(),
              liabilitiesChange: report.balanceSheet.change.liabilitiesChange.toString(),
              liabilitiesChangePercent:
                report.balanceSheet.change.liabilitiesChangePercent.toString(),
              equityChange: report.balanceSheet.change.equityChange.toString(),
              equityChangePercent: report.balanceSheet.change.equityChangePercent.toString(),
            },
          },
        },
      });
    } catch (error) {
      logger.error('Error generating comparative reports:', error);
      next(error);
    }
  }
);

export default router;
