const express = require('express');
const router = express.Router();

/**
 * Multi-UOM Purchase and Sales Routes
 * These routes support multi-unit-of-measure functionality with FIFO inventory management
 */

module.exports = (models, sequelize) => {
  const PurchaseController = require('../controllers/PurchaseController');
  const SalesController = require('../controllers/SalesController');

  const purchaseController = new PurchaseController(models, sequelize);
  const salesController = new SalesController(models, sequelize);

  // ==================== Purchase Routes ====================

  /**
   * Receive a purchase order with Multi-UOM support
   * POST /api/purchases/receive
   * Body: {
   *   purchaseId, productId, uom, quantity, unitCost,
   *   discount: { type, value }, taxes: [], landedCosts: [],
   *   supplierInvoice, currency, exchangeRate, receivedAt
   * }
   */
  router.post('/purchases/receive', (req, res) => {
    purchaseController.receivePurchase(req, res);
  });

  /**
   * Preview landed cost allocation
   * POST /api/purchases/preview-landed-cost
   * Body: {
   *   items: [{productId, uom, quantity, unitCost, discount, taxes}],
   *   landedCosts: [{type, amount, description}],
   *   allocationMethod: 'quantity' | 'value'
   * }
   */
  router.post('/purchases/preview-landed-cost', (req, res) => {
    purchaseController.previewLandedCost(req, res);
  });

  // ==================== Sales / POS Routes ====================

  /**
   * Record a sale with Multi-UOM and FIFO COGS calculation
   * POST /api/sales
   * Body: {
   *   saleId, productId, uom, quantity, pricePerUom, customerId
   * }
   */
  router.post('/sales', (req, res) => {
    salesController.recordSale(req, res);
  });

  /**
   * Preview a sale (check stock and calculate COGS without committing)
   * POST /api/sales/preview
   * Body: {
   *   productId, uom, quantity, pricePerUom
   * }
   */
  router.post('/sales/preview', (req, res) => {
    salesController.previewSale(req, res);
  });

  // ==================== Product UOM Routes ====================

  /**
   * Get all UOMs for a product
   * GET /api/products/:productId/uoms
   * Query params: uomType (optional) - 'purchase', 'sale', 'stock', 'all'
   */
  router.get('/products/:productId/uoms', (req, res) => {
    purchaseController.getProductUOMs(req, res);
  });

  // ==================== Inventory / Stock Routes ====================

  /**
   * Get available stock for a product
   * GET /api/products/:productId/stock
   * Query params: uom (optional) - to get stock in specific UOM
   */
  router.get('/products/:productId/stock', (req, res) => {
    salesController.getProductStock(req, res);
  });

  /**
   * Get FIFO batch details for a product
   * GET /api/products/:productId/batches
   * Query params: includeEmpty (optional) - 'true' to include empty batches
   */
  router.get('/products/:productId/batches', (req, res) => {
    salesController.getProductBatches(req, res);
  });

  return router;
};
