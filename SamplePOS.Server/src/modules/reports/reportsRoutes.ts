// Reports Routes - Express router for reports endpoints
// Updated: 2025-11-09 to support 5 new sales analysis reports

import { Router } from 'express';
import { Pool } from 'pg';
import { reportsController } from './reportsController.js';
import { authenticate } from '../../middleware/auth.js';

// Debug: Log available controller methods
console.log('🔍 reportsController methods:', Object.keys(reportsController));

export function createReportsRouter(pool: Pool) {
  const router = Router();

  // Apply authentication to all routes
  router.use(authenticate);

  // GET /api/reports/system-settings - Get system settings for report formatting
  router.get('/system-settings', (req, res) => reportsController.getSystemSettings(req, res, pool));

  // Unified POST endpoint for report generation (used by frontend)
  // Delegates to controller's generateReport method which handles routing based on reportType
  router.post('/generate', (req, res) => reportsController.generateReport(req, res, pool));

  // GET /api/reports/types - List available report types
  router.get('/types', (req, res) => reportsController.getReportTypes(req, res));

  // Individual GET endpoints for direct API access
  // Inventory Reports
  router.get('/inventory-valuation', (req, res) =>
    reportsController.getInventoryValuation(req, res, pool)
  );

  router.get('/inventory-adjustments', (req, res) =>
    reportsController.getInventoryAdjustments(req, res, pool)
  );

  router.get('/low-stock', (req, res) =>
    reportsController.getLowStock(req, res, pool)
  );

  router.get('/expiring-items', (req, res) =>
    reportsController.getExpiringItems(req, res, pool)
  );

  // Sales Reports
  router.get('/sales', (req, res) =>
    reportsController.getSalesReport(req, res, pool)
  );

  router.get('/best-selling', (req, res) =>
    reportsController.getBestSelling(req, res, pool)
  );

  router.get('/profit-loss', (req, res) =>
    reportsController.getProfitLoss(req, res, pool)
  );

  // Supplier Reports
  router.get('/supplier-cost', (req, res) =>
    reportsController.getSupplierCostAnalysis(req, res, pool)
  );

  router.get('/goods-received', (req, res) =>
    reportsController.getGoodsReceived(req, res, pool)
  );

  // Payment Reports
  router.get('/payments', (req, res) =>
    reportsController.getPaymentReport(req, res, pool)
  );

  router.get('/customer-payments', (req, res) =>
    reportsController.getCustomerPayments(req, res, pool)
  );

  // Audit Reports
  router.get('/deleted-items', (req, res) =>
    reportsController.getDeletedItems(req, res, pool)
  );

  // New Enhanced Reports
  router.get('/purchase-order-summary', (req, res) =>
    reportsController.getPurchaseOrderSummary(req, res, pool)
  );

  router.get('/stock-movement-analysis', (req, res) =>
    reportsController.getStockMovementAnalysis(req, res, pool)
  );

  router.get('/customer-account-statement', (req, res) =>
    reportsController.getCustomerAccountStatement(req, res, pool)
  );

  router.get('/profit-margin', (req, res) =>
    reportsController.getProfitMarginByProduct(req, res, pool)
  );

  router.get('/daily-cash-flow', (req, res) =>
    reportsController.getDailyCashFlow(req, res, pool)
  );

  router.get('/supplier-payment-status', (req, res) =>
    reportsController.getSupplierPaymentStatus(req, res, pool)
  );

  router.get('/top-customers', (req, res) =>
    reportsController.getTopCustomers(req, res, pool)
  );

  router.get('/customer-aging', (req, res) =>
    reportsController.getCustomerAging(req, res, pool)
  );

  router.get('/stock-aging', (req, res) =>
    reportsController.getStockAging(req, res, pool)
  );

  router.get('/waste-damage', (req, res) =>
    reportsController.getWasteDamage(req, res, pool)
  );

  router.get('/reorder-recommendations', (req, res) =>
    reportsController.getReorderRecommendations(req, res, pool)
  );

  router.get('/business-position', (req, res) =>
    reportsController.getBusinessPositionReport(req, res, pool)
  );

  // New Sales Analysis Reports
  router.get('/sales-by-category', (req, res) =>
    reportsController.getSalesByCategory(req, res, pool)
  );

  router.get('/sales-by-payment-method', (req, res) =>
    reportsController.getSalesByPaymentMethod(req, res, pool)
  );

  router.get('/hourly-sales-analysis', (req, res) =>
    reportsController.getHourlySalesAnalysis(req, res, pool)
  );

  router.get('/sales-comparison', (req, res) =>
    reportsController.getSalesComparison(req, res, pool)
  );

  router.get('/customer-purchase-history', (req, res) =>
    reportsController.getCustomerPurchaseHistory(req, res, pool)
  );

  // Sales Summary by Date Report
  router.get('/sales-summary-by-date', (req, res) =>
    reportsController.getSalesSummaryByDateReport(req, res, pool)
  );

  // Sales Details Report
  router.get('/sales-details', (req, res) =>
    reportsController.getSalesDetailsReport(req, res, pool)
  );

  // Sales by Cashier Report
  router.get('/sales-by-cashier', (req, res) =>
    reportsController.getSalesByCashierReport(req, res, pool)
  );

  // ===========================================================================
  // CASH REGISTER SESSION REPORTS
  // ===========================================================================

  // Cash Register Session Summary (single session)
  router.get('/cash-register/session/:sessionId', (req, res) =>
    reportsController.getCashRegisterSessionSummary(req, res, pool)
  );

  // Cash Register Movement Breakdown (across sessions)
  router.get('/cash-register/movement-breakdown', (req, res) =>
    reportsController.getCashRegisterMovementBreakdown(req, res, pool)
  );

  // Cash Register Session History (list of sessions)
  router.get('/cash-register/session-history', (req, res) =>
    reportsController.getCashRegisterSessionHistory(req, res, pool)
  );

  return router;
}

