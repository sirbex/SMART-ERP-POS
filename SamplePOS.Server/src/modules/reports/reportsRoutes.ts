// Reports Routes - Express router for reports endpoints
// Updated: 2025-11-09 to support 5 new sales analysis reports

import { Router } from 'express';
import { Pool } from 'pg';
import { reportsController } from './reportsController.js';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { demandForecastService } from './demandForecastService.js';
import { demandForecastRepository } from './demandForecastRepository.js';

// Debug: Log available controller methods
console.log('🔍 reportsController methods:', Object.keys(reportsController));

export function createReportsRouter(pool: Pool) {
  const router = Router();

  // Apply authentication to all routes
  router.use(authenticate);

  router.get('/system-settings', asyncHandler(async (req, res) => reportsController.getSystemSettings(req, res, pool)));
  router.post('/generate', asyncHandler(async (req, res) => reportsController.generateReport(req, res, pool)));
  router.get('/types', asyncHandler(async (req, res) => reportsController.getReportTypes(req, res)));

  // Inventory Reports
  router.get('/inventory-valuation', asyncHandler(async (req, res) => reportsController.getInventoryValuation(req, res, pool)));
  router.get('/inventory-adjustments', asyncHandler(async (req, res) => reportsController.getInventoryAdjustments(req, res, pool)));
  router.get('/low-stock', asyncHandler(async (req, res) => reportsController.getLowStock(req, res, pool)));
  router.get('/expiring-items', asyncHandler(async (req, res) => reportsController.getExpiringItems(req, res, pool)));

  // Sales Reports
  router.get('/sales', asyncHandler(async (req, res) => reportsController.getSalesReport(req, res, pool)));
  router.get('/best-selling', asyncHandler(async (req, res) => reportsController.getBestSelling(req, res, pool)));
  router.get('/profit-loss', asyncHandler(async (req, res) => reportsController.getProfitLoss(req, res, pool)));

  // Supplier Reports
  router.get('/supplier-cost', asyncHandler(async (req, res) => reportsController.getSupplierCostAnalysis(req, res, pool)));
  router.get('/goods-received', asyncHandler(async (req, res) => reportsController.getGoodsReceived(req, res, pool)));

  // Payment Reports
  router.get('/payments', asyncHandler(async (req, res) => reportsController.getPaymentReport(req, res, pool)));
  router.get('/customer-payments', asyncHandler(async (req, res) => reportsController.getCustomerPayments(req, res, pool)));

  // Audit Reports
  router.get('/deleted-items', asyncHandler(async (req, res) => reportsController.getDeletedItems(req, res, pool)));

  // Enhanced Reports
  router.get('/purchase-order-summary', asyncHandler(async (req, res) => reportsController.getPurchaseOrderSummary(req, res, pool)));
  router.get('/stock-movement-analysis', asyncHandler(async (req, res) => reportsController.getStockMovementAnalysis(req, res, pool)));
  router.get('/customer-account-statement', asyncHandler(async (req, res) => reportsController.getCustomerAccountStatement(req, res, pool)));
  router.get('/profit-margin', asyncHandler(async (req, res) => reportsController.getProfitMarginByProduct(req, res, pool)));
  router.get('/daily-cash-flow', asyncHandler(async (req, res) => reportsController.getDailyCashFlow(req, res, pool)));
  router.get('/supplier-payment-status', asyncHandler(async (req, res) => reportsController.getSupplierPaymentStatus(req, res, pool)));
  router.get('/top-customers', asyncHandler(async (req, res) => reportsController.getTopCustomers(req, res, pool)));
  router.get('/customer-aging', asyncHandler(async (req, res) => reportsController.getCustomerAging(req, res, pool)));
  router.get('/stock-aging', asyncHandler(async (req, res) => reportsController.getStockAging(req, res, pool)));
  router.get('/waste-damage', asyncHandler(async (req, res) => reportsController.getWasteDamage(req, res, pool)));
  router.get('/reorder-recommendations', asyncHandler(async (req, res) => reportsController.getReorderRecommendations(req, res, pool)));
  router.get('/business-position', asyncHandler(async (req, res) => reportsController.getBusinessPositionReport(req, res, pool)));

  // Sales Analysis Reports
  router.get('/sales-by-category', asyncHandler(async (req, res) => reportsController.getSalesByCategory(req, res, pool)));
  router.get('/sales-by-payment-method', asyncHandler(async (req, res) => reportsController.getSalesByPaymentMethod(req, res, pool)));
  router.get('/hourly-sales-analysis', asyncHandler(async (req, res) => reportsController.getHourlySalesAnalysis(req, res, pool)));
  router.get('/sales-comparison', asyncHandler(async (req, res) => reportsController.getSalesComparison(req, res, pool)));
  router.get('/customer-purchase-history', asyncHandler(async (req, res) => reportsController.getCustomerPurchaseHistory(req, res, pool)));

  // Additional Sales Reports
  router.get('/sales-summary-by-date', asyncHandler(async (req, res) => reportsController.getSalesSummaryByDateReport(req, res, pool)));
  router.get('/sales-details', asyncHandler(async (req, res) => reportsController.getSalesDetailsReport(req, res, pool)));
  router.get('/sales-by-cashier', asyncHandler(async (req, res) => reportsController.getSalesByCashierReport(req, res, pool)));

  // Cash Register Session Reports
  router.get('/cash-register/session/:sessionId', asyncHandler(async (req, res) => reportsController.getCashRegisterSessionSummary(req, res, pool)));
  router.get('/cash-register/movement-breakdown', asyncHandler(async (req, res) => reportsController.getCashRegisterMovementBreakdown(req, res, pool)));
  router.get('/cash-register/session-history', asyncHandler(async (req, res) => reportsController.getCashRegisterSessionHistory(req, res, pool)));

  // ── Demand Forecasting (Self-Learning Engine) ────────
  // Manual trigger: run daily demand stats refresh now
  router.post('/demand-forecast/refresh-daily', asyncHandler(async (req, res) => {
    const result = await demandForecastService.runDailyUpdate(pool);
    res.json({ success: true, data: result });
  }));

  // Manual trigger: run monthly seasonality refresh now
  router.post('/demand-forecast/refresh-monthly', asyncHandler(async (req, res) => {
    const result = await demandForecastService.runMonthlyUpdate(pool);
    res.json({ success: true, data: result });
  }));

  // Get learned demand stats for a specific product
  router.get('/demand-forecast/product/:productId', asyncHandler(async (req, res) => {
    const stats = await demandForecastRepository.getStatsForProduct(pool, req.params.productId);
    const currentMonth = new Date().getMonth() + 1;
    const seasonality = await demandForecastRepository.getSeasonalityForMonth(pool, currentMonth);
    res.json({
      success: true,
      data: {
        demandStats: stats,
        seasonalIndex: seasonality.get(req.params.productId) ?? null,
        currentMonth,
      },
    });
  }));

  // Get forecast run history
  router.get('/demand-forecast/runs', asyncHandler(async (req, res) => {
    const limit = parseInt(String(req.query.limit || '20'), 10);
    const runs = await demandForecastRepository.getRecentRuns(pool, limit);
    res.json({ success: true, data: runs });
  }));

  return router;
}