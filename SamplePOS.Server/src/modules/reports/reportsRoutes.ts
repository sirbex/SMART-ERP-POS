// Reports Routes - Express router for reports endpoints
// Updated: 2025-11-09 to support 5 new sales analysis reports

import { Router } from 'express';
import { Pool } from 'pg';
import { reportsController } from './reportsController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { demandForecastService } from './demandForecastService.js';
import { demandForecastRepository } from './demandForecastRepository.js';

// Debug: Log available controller methods
console.log('🔍 reportsController methods:', Object.keys(reportsController));

export function createReportsRouter(pool: Pool) {
  const router = Router();

  // Apply authentication to all routes
  router.use(authenticate);

  // Helper: resolve tenant pool (if multi-tenant) or fall back to factory pool
  const p = (req: import('express').Request) => (req.tenantPool || pool) as Pool;

  router.get(
    '/system-settings',
    asyncHandler(async (req, res) => reportsController.getSystemSettings(req, res, p(req)))
  );
  router.post(
    '/generate',
    asyncHandler(async (req, res) => reportsController.generateReport(req, res, p(req)))
  );
  router.get(
    '/types',
    asyncHandler(async (req, res) => reportsController.getReportTypes(req, res))
  );

  // Inventory Reports
  router.get(
    '/inventory-valuation',
    asyncHandler(async (req, res) => reportsController.getInventoryValuation(req, res, p(req)))
  );
  router.get(
    '/inventory-adjustments',
    asyncHandler(async (req, res) => reportsController.getInventoryAdjustments(req, res, p(req)))
  );
  router.get(
    '/low-stock',
    asyncHandler(async (req, res) => reportsController.getLowStock(req, res, p(req)))
  );
  router.get(
    '/expiring-items',
    asyncHandler(async (req, res) => reportsController.getExpiringItems(req, res, p(req)))
  );

  // Sales Reports
  router.get(
    '/sales',
    asyncHandler(async (req, res) => reportsController.getSalesReport(req, res, p(req)))
  );
  router.get(
    '/best-selling',
    asyncHandler(async (req, res) => reportsController.getBestSelling(req, res, p(req)))
  );
  router.get(
    '/profit-loss',
    requirePermission('reports.read'),
    asyncHandler(async (req, res) => reportsController.getProfitLoss(req, res, p(req)))
  );

  // Supplier Reports
  router.get(
    '/supplier-cost',
    asyncHandler(async (req, res) => reportsController.getSupplierCostAnalysis(req, res, p(req)))
  );
  router.get(
    '/goods-received',
    asyncHandler(async (req, res) => reportsController.getGoodsReceived(req, res, p(req)))
  );

  // Payment Reports
  router.get(
    '/payments',
    asyncHandler(async (req, res) => reportsController.getPaymentReport(req, res, p(req)))
  );
  router.get(
    '/customer-payments',
    asyncHandler(async (req, res) => reportsController.getCustomerPayments(req, res, p(req)))
  );

  // Audit Reports
  router.get(
    '/deleted-items',
    asyncHandler(async (req, res) => reportsController.getDeletedItems(req, res, p(req)))
  );

  // Enhanced Reports
  router.get(
    '/purchase-order-summary',
    asyncHandler(async (req, res) => reportsController.getPurchaseOrderSummary(req, res, p(req)))
  );
  router.get(
    '/stock-movement-analysis',
    asyncHandler(async (req, res) => reportsController.getStockMovementAnalysis(req, res, p(req)))
  );
  router.get(
    '/customer-account-statement',
    asyncHandler(async (req, res) =>
      reportsController.getCustomerAccountStatement(req, res, p(req))
    )
  );
  router.get(
    '/profit-margin',
    requirePermission('reports.read'),
    asyncHandler(async (req, res) => reportsController.getProfitMarginByProduct(req, res, p(req)))
  );
  router.get(
    '/daily-cash-flow',
    requirePermission('reports.read'),
    asyncHandler(async (req, res) => reportsController.getDailyCashFlow(req, res, p(req)))
  );
  router.get(
    '/supplier-payment-status',
    asyncHandler(async (req, res) => reportsController.getSupplierPaymentStatus(req, res, p(req)))
  );
  router.get(
    '/top-customers',
    asyncHandler(async (req, res) => reportsController.getTopCustomers(req, res, p(req)))
  );
  router.get(
    '/customer-aging',
    asyncHandler(async (req, res) => reportsController.getCustomerAging(req, res, p(req)))
  );
  router.get(
    '/stock-aging',
    asyncHandler(async (req, res) => reportsController.getStockAging(req, res, p(req)))
  );
  router.get(
    '/waste-damage',
    asyncHandler(async (req, res) => reportsController.getWasteDamage(req, res, p(req)))
  );
  router.get(
    '/reorder-recommendations',
    asyncHandler(async (req, res) => reportsController.getReorderRecommendations(req, res, p(req)))
  );
  router.get(
    '/business-position',
    requirePermission('reports.read'),
    asyncHandler(async (req, res) => reportsController.getBusinessPositionReport(req, res, p(req)))
  );

  // Sales Analysis Reports
  router.get(
    '/sales-by-category',
    asyncHandler(async (req, res) => reportsController.getSalesByCategory(req, res, p(req)))
  );
  router.get(
    '/sales-by-payment-method',
    asyncHandler(async (req, res) => reportsController.getSalesByPaymentMethod(req, res, p(req)))
  );
  router.get(
    '/hourly-sales-analysis',
    asyncHandler(async (req, res) => reportsController.getHourlySalesAnalysis(req, res, p(req)))
  );
  router.get(
    '/sales-comparison',
    asyncHandler(async (req, res) => reportsController.getSalesComparison(req, res, p(req)))
  );
  router.get(
    '/customer-purchase-history',
    asyncHandler(async (req, res) => reportsController.getCustomerPurchaseHistory(req, res, p(req)))
  );

  // Additional Sales Reports
  router.get(
    '/sales-summary-by-date',
    asyncHandler(async (req, res) =>
      reportsController.getSalesSummaryByDateReport(req, res, p(req))
    )
  );
  router.get(
    '/sales-details',
    asyncHandler(async (req, res) => reportsController.getSalesDetailsReport(req, res, pool))
  );
  router.get(
    '/sales-by-cashier',
    requirePermission('reports.read'),
    asyncHandler(async (req, res) => reportsController.getSalesByCashierReport(req, res, p(req)))
  );

  // Cash Register Session Reports
  router.get(
    '/cash-register/session/:sessionId',
    asyncHandler(async (req, res) =>
      reportsController.getCashRegisterSessionSummary(req, res, p(req))
    )
  );
  router.get(
    '/cash-register/movement-breakdown',
    asyncHandler(async (req, res) =>
      reportsController.getCashRegisterMovementBreakdown(req, res, p(req))
    )
  );
  router.get(
    '/cash-register/session-history',
    asyncHandler(async (req, res) =>
      reportsController.getCashRegisterSessionHistory(req, res, p(req))
    )
  );

  // ── Demand Forecasting (Self-Learning Engine) ────────
  // Manual trigger: run daily demand stats refresh now (admin/manager only)
  router.post(
    '/demand-forecast/refresh-daily',
    requirePermission('admin.update'),
    asyncHandler(async (req, res) => {
      const result = await demandForecastService.runDailyUpdate(p(req));
      res.json({ success: true, data: result });
    })
  );

  // Manual trigger: run monthly seasonality refresh now (admin/manager only)
  router.post(
    '/demand-forecast/refresh-monthly',
    requirePermission('admin.update'),
    asyncHandler(async (req, res) => {
      const result = await demandForecastService.runMonthlyUpdate(p(req));
      res.json({ success: true, data: result });
    })
  );

  // Get learned demand stats for a specific product
  router.get(
    '/demand-forecast/product/:productId',
    asyncHandler(async (req, res) => {
      const stats = await demandForecastRepository.getStatsForProduct(p(req), req.params.productId);
      const currentMonth = new Date().getMonth() + 1;
      const seasonality = await demandForecastRepository.getSeasonalityForMonth(
        p(req),
        currentMonth
      );
      res.json({
        success: true,
        data: {
          demandStats: stats,
          seasonalIndex: seasonality.get(req.params.productId) ?? null,
          currentMonth,
        },
      });
    })
  );

  // Get forecast run history
  router.get(
    '/demand-forecast/runs',
    asyncHandler(async (req, res) => {
      const limit = parseInt(String(req.query.limit || '20'), 10);
      const runs = await demandForecastRepository.getRecentRuns(p(req), limit);
      res.json({ success: true, data: runs });
    })
  );

  return router;
}
