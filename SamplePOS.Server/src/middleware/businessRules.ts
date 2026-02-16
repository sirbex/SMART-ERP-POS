/**
 * Business Rules Middleware - Enterprise-grade validation
 * Enforces complex business logic that goes beyond schema validation
 */

import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import Decimal from 'decimal.js';
import logger from '../utils/logger.js';

// Configure Decimal for financial calculations
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Business rule violation error
 */
export class BusinessRuleViolation extends Error {
  constructor(
    public rule: string,
    public details: string,
    public code: string = 'BUSINESS_RULE_VIOLATION'
  ) {
    super(`Business Rule Violation: ${rule} - ${details}`);
    this.name = 'BusinessRuleViolation';
  }
}

/**
 * Inventory Business Rules
 */
export class InventoryBusinessRules {
  /**
   * BR-INV-001: Cannot sell more than available stock
   */
  static async validateStockAvailability(
    pool: Pool,
    productId: string,
    requestedQuantity: number,
    batchId?: string
  ): Promise<void> {
    const query = batchId
      ? `SELECT 
          COALESCE(SUM(remaining_quantity), 0) as available 
         FROM inventory_batches 
         WHERE product_id = $1 
           AND id = $2 
           AND status = 'ACTIVE' 
           AND remaining_quantity > 0`
      : `SELECT 
          COALESCE(SUM(remaining_quantity), 0) as available 
         FROM inventory_batches 
         WHERE product_id = $1 
           AND status = 'ACTIVE' 
           AND remaining_quantity > 0`;

    const params = batchId ? [productId, batchId] : [productId];
    const result = await pool.query(query, params);

    const available = parseFloat(result.rows[0].available);

    if (available < requestedQuantity) {
      throw new BusinessRuleViolation(
        'BR-INV-001',
        `Insufficient stock. Available: ${available}, Requested: ${requestedQuantity}`,
        'INSUFFICIENT_STOCK'
      );
    }
  }

  /**
   * BR-INV-002: Cannot receive negative quantities
   */
  static validatePositiveQuantity(quantity: number, context: string): void {
    if (quantity <= 0) {
      throw new BusinessRuleViolation(
        'BR-INV-002',
        `Quantity must be positive in ${context}. Received: ${quantity}`,
        'INVALID_QUANTITY'
      );
    }
  }

  /**
   * BR-INV-003: Expiry date must be in the future for goods receipt
   */
  static validateExpiryDate(expiryDate: Date | null, allowPast: boolean = false): void {
    if (!expiryDate) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!allowPast && expiryDate < today) {
      throw new BusinessRuleViolation(
        'BR-INV-003',
        `Expiry date ${expiryDate.toISOString().split('T')[0]} cannot be in the past`,
        'INVALID_EXPIRY_DATE'
      );
    }
  }

  /**
   * BR-INV-004: Cannot modify finalized goods receipts
   */
  static async validateGoodsReceiptStatus(
    pool: Pool,
    grId: string,
    allowedStatuses: string[]
  ): Promise<void> {
    const result = await pool.query('SELECT status FROM goods_receipts WHERE id = $1', [grId]);

    if (result.rows.length === 0) {
      throw new BusinessRuleViolation(
        'BR-INV-004',
        `Goods receipt ${grId} not found`,
        'GR_NOT_FOUND'
      );
    }

    const status = result.rows[0].status;
    if (!allowedStatuses.includes(status)) {
      throw new BusinessRuleViolation(
        'BR-INV-004',
        `Cannot modify goods receipt with status ${status}. Allowed: ${allowedStatuses.join(', ')}`,
        'INVALID_GR_STATUS'
      );
    }
  }

  /**
   * BR-INV-005: Reorder level must be less than maximum stock
   */
  static validateReorderLevel(reorderLevel: number, maxStock: number | null): void {
    if (maxStock && reorderLevel >= maxStock) {
      throw new BusinessRuleViolation(
        'BR-INV-005',
        `Reorder level (${reorderLevel}) must be less than maximum stock (${maxStock})`,
        'INVALID_REORDER_LEVEL'
      );
    }
  }

  /**
   * BR-INV-006: FEFO - Must use oldest expiring batch first
   */
  static async validateFEFOCompliance(
    pool: Pool,
    productId: string,
    selectedBatchId: string
  ): Promise<void> {
    const result = await pool.query(
      `SELECT id, expiry_date, batch_number
       FROM inventory_batches
       WHERE product_id = $1 
         AND status = 'ACTIVE' 
         AND remaining_quantity > 0
         AND expiry_date IS NOT NULL
       ORDER BY expiry_date ASC
       LIMIT 1`,
      [productId]
    );

    if (result.rows.length > 0) {
      const oldestBatch = result.rows[0];
      if (oldestBatch.id !== selectedBatchId) {
        logger.warn('FEFO violation detected', {
          productId,
          selectedBatchId,
          oldestBatchId: oldestBatch.id,
          oldestExpiry: oldestBatch.expiry_date,
        });

        // Warning only - don't throw, but log for audit
        // In strict mode, uncomment to enforce:
        // throw new BusinessRuleViolation(
        //   'BR-INV-006',
        //   `FEFO violation: Must use batch ${oldestBatch.batch_number} expiring ${oldestBatch.expiry_date}`,
        //   'FEFO_VIOLATION'
        // );
      }
    }
  }

  /**
   * BR-INV-007: Expiry date warning (warn if expiring within 30 days)
   */
  static validateExpiryWarning(expiryDate: Date | null, warningDays: number = 30): boolean {
    if (!expiryDate) return false;

    const today = new Date();
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + warningDays);

    if (expiryDate <= warningDate) {
      logger.warn(`BR-INV-007: Item expiring within ${warningDays} days`, {
        expiryDate: expiryDate.toISOString().split('T')[0],
        daysRemaining: Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
      });
      return true;
    }

    return false;
  }

  /**
   * BR-INV-008: Short expiry rejection (reject if expiring within 7 days)
   */
  static validateShortExpiry(expiryDate: Date | null, minimumDays: number = 7): void {
    if (!expiryDate) return;

    const today = new Date();
    const daysRemaining = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysRemaining < minimumDays) {
      throw new BusinessRuleViolation(
        'BR-INV-008',
        `Cannot receive item expiring in ${daysRemaining} days (minimum: ${minimumDays} days)`,
        'SHORT_EXPIRY_REJECTED'
      );
    }
  }

  /**
   * BR-INV-009: Maximum stock level check
   * 
   * STATUS: Disabled - Requires migration 010_add_advanced_inventory_supplier_columns.sql
   * 
   * When enabled, validates that receiving goods won't exceed max_stock_level.
   * Run migration then uncomment validation logic below.
   */
  static async validateMaxStockLevel(
    pool: Pool,
    productId: string,
    additionalQuantity: number
  ): Promise<void> {
    // Validation disabled until max_stock_level column exists
    // Uncomment after running migration 010
    logger.debug('BR-INV-009: Max stock validation skipped (run migration 010 to enable)');
    return;

    /* Uncomment after migration 010:
    const result = await pool.query(
      `SELECT p.name, p.max_stock_level,
              COALESCE(SUM(ib.remaining_quantity), 0) as current_stock
       FROM products p
       LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.status = 'ACTIVE'
       WHERE p.id = $1 AND p.max_stock_level IS NOT NULL
       GROUP BY p.id, p.name, p.max_stock_level`,
      [productId]
    );

    if (result.rows.length > 0) {
      const { name, max_stock_level, current_stock } = result.rows[0];
      const projectedStock = new Decimal(current_stock).plus(additionalQuantity);

      if (projectedStock.greaterThan(new Decimal(max_stock_level))) {
        logger.warn('BR-INV-009: Receiving would exceed maximum stock level', {
          productId,
          productName: name,
          currentStock: current_stock,
          additionalQuantity,
          projectedStock,
          maxStockLevel: max_stock_level,
        });
        // Warning only - allow override with business justification
      }
    }
    */
  }

  /**
   * BR-INV-010: Batch expiry must be later than existing stock
   */
  static async validateBatchExpirySequence(
    pool: Pool,
    productId: string,
    newExpiryDate: Date | null
  ): Promise<void> {
    if (!newExpiryDate) return;

    const result = await pool.query(
      `SELECT MAX(expiry_date) as latest_expiry
       FROM inventory_batches
       WHERE product_id = $1 
         AND status = 'ACTIVE'
         AND expiry_date IS NOT NULL`,
      [productId]
    );

    if (result.rows.length > 0 && result.rows[0].latest_expiry) {
      const latestExpiry = new Date(result.rows[0].latest_expiry);

      if (newExpiryDate < latestExpiry) {
        logger.warn('BR-INV-010: New batch expires before existing stock', {
          productId,
          newExpiryDate: newExpiryDate.toISOString().split('T')[0],
          latestExpiry: latestExpiry.toISOString().split('T')[0],
        });

        // Warning only - valid business case (older stock might be received later)
      }
    }
  }

  /**
   * BR-INV-011: Goods receipt item completeness
   */
  static validateGRItemCompleteness(item: {
    productId: string;
    receivedQuantity: number;
    unitCost: number;
    batchNumber?: string | null;
    expiryDate?: Date | null;
  }): void {
    if (!item.productId || item.productId.trim().length === 0) {
      throw new BusinessRuleViolation(
        'BR-INV-011',
        'Product ID is required for goods receipt item',
        'MISSING_PRODUCT_ID'
      );
    }

    if (!item.receivedQuantity || item.receivedQuantity <= 0) {
      throw new BusinessRuleViolation(
        'BR-INV-011',
        'Received quantity must be positive',
        'INVALID_RECEIVED_QUANTITY'
      );
    }

    if (item.unitCost === undefined || item.unitCost === null || item.unitCost < 0) {
      throw new BusinessRuleViolation(
        'BR-INV-011',
        'Unit cost must be non-negative',
        'INVALID_UNIT_COST'
      );
    }
  }
}

/**
 * Sales Business Rules
 */
export class SalesBusinessRules {
  /**
   * BR-SAL-001: Payment received must be >= total amount (no underpayment)
   * CASH sales MUST have payment amount provided
   */
  static validatePaymentAmount(
    totalAmount: number,
    paymentReceived: number,
    paymentMethod: string
  ): void {
    // CRITICAL: CASH sales must have payment amount
    if (paymentMethod === 'CASH' && (!paymentReceived || paymentReceived <= 0)) {
      throw new BusinessRuleViolation(
        'BR-SAL-001',
        'CASH sales require payment amount. Cannot record cash sale without cash received.',
        'CASH_PAYMENT_REQUIRED'
      );
    }

    if (paymentMethod !== 'CREDIT' && paymentReceived < totalAmount) {
      throw new BusinessRuleViolation(
        'BR-SAL-001',
        `Payment received (${paymentReceived}) is less than total amount (${totalAmount})`,
        'INSUFFICIENT_PAYMENT'
      );
    }
  }

  /**
   * BR-SAL-002: Sale must have at least one item
   */
  static validateSaleItems(items: any[]): void {
    if (!items || items.length === 0) {
      throw new BusinessRuleViolation(
        'BR-SAL-002',
        'Sale must have at least one item',
        'EMPTY_SALE'
      );
    }
  }

  /**
   * BR-SAL-003: Credit sales require customer with credit limit
   */
  static async validateCreditSale(
    pool: Pool,
    customerId: string | null,
    totalAmount: number,
    paymentMethod: string
  ): Promise<void> {
    if (paymentMethod === 'CREDIT') {
      if (!customerId) {
        throw new BusinessRuleViolation(
          'BR-SAL-003',
          'Credit sales require a customer',
          'CREDIT_REQUIRES_CUSTOMER'
        );
      }

      const result = await pool.query(
        `SELECT 
          credit_limit, 
          COALESCE(balance, 0) as current_balance 
         FROM customers 
         WHERE id = $1`,
        [customerId]
      );

      if (result.rows.length === 0) {
        throw new BusinessRuleViolation(
          'BR-SAL-003',
          `Customer ${customerId} not found`,
          'CUSTOMER_NOT_FOUND'
        );
      }

      const { credit_limit, current_balance } = result.rows[0];
      const newBalance = new Decimal(current_balance).plus(totalAmount);

      if (newBalance.greaterThan(credit_limit)) {
        throw new BusinessRuleViolation(
          'BR-SAL-003',
          `Credit limit exceeded. Limit: ${credit_limit}, Current: ${current_balance}, New: ${newBalance.toFixed(2)}`,
          'CREDIT_LIMIT_EXCEEDED'
        );
      }
    }
  }

  /**
   * BR-SAL-004: Selling price must be >= minimum price (if set)
   */
  static async validateMinimumPrice(
    pool: Pool,
    productId: string,
    sellingPrice: number
  ): Promise<void> {
    const result = await pool.query('SELECT min_price FROM products WHERE id = $1', [productId]);

    if (result.rows.length > 0 && result.rows[0].min_price) {
      const minPrice = parseFloat(result.rows[0].min_price);
      if (sellingPrice < minPrice) {
        throw new BusinessRuleViolation(
          'BR-SAL-004',
          `Selling price (${sellingPrice}) is below minimum price (${minPrice})`,
          'BELOW_MINIMUM_PRICE'
        );
      }
    }
  }

  /**
   * BR-SAL-005: Cannot create sale for inactive product
   */
  static async validateProductActive(pool: Pool, productId: string): Promise<void> {
    const result = await pool.query('SELECT is_active FROM products WHERE id = $1', [productId]);

    if (result.rows.length === 0) {
      throw new BusinessRuleViolation(
        'BR-SAL-005',
        `Product ${productId} not found`,
        'PRODUCT_NOT_FOUND'
      );
    }

    if (!result.rows[0].is_active) {
      throw new BusinessRuleViolation(
        'BR-SAL-005',
        `Product ${productId} is inactive`,
        'PRODUCT_INACTIVE'
      );
    }
  }

  /**
   * BR-SAL-006: Discount cannot exceed maximum allowed
   */
  static async validateDiscount(
    pool: Pool,
    productId: string,
    sellingPrice: number,
    originalPrice: number
  ): Promise<void> {
    const result = await pool.query('SELECT max_discount_percentage FROM products WHERE id = $1', [
      productId,
    ]);

    if (result.rows.length > 0 && result.rows[0].max_discount_percentage) {
      const maxDiscount = parseFloat(result.rows[0].max_discount_percentage);
      const actualDiscount = ((originalPrice - sellingPrice) / originalPrice) * 100;

      if (actualDiscount > maxDiscount) {
        throw new BusinessRuleViolation(
          'BR-SAL-006',
          `Discount (${actualDiscount.toFixed(2)}%) exceeds maximum allowed (${maxDiscount}%)`,
          'EXCESSIVE_DISCOUNT'
        );
      }
    }
  }

  /**
   * BR-SAL-007: Profit margin must be positive (cost < selling price)
   */
  static validateProfitMargin(
    costPrice: number,
    sellingPrice: number,
    allowNegative: boolean = false
  ): void {
    if (!allowNegative && sellingPrice < costPrice) {
      logger.warn('Negative profit margin detected', {
        costPrice,
        sellingPrice,
        loss: costPrice - sellingPrice,
      });

      // Warning only in most cases, but can be enforced:
      // throw new BusinessRuleViolation(
      //   'BR-SAL-007',
      //   `Selling price (${sellingPrice}) is below cost (${costPrice})`,
      //   'NEGATIVE_PROFIT'
      // );
    }
  }
}

/**
 * Purchase Order Business Rules
 */
export class PurchaseOrderBusinessRules {
  /**
   * BR-PO-001: Cannot approve PO without active supplier
   */
  static async validateSupplierExists(pool: Pool, supplierId: string): Promise<void> {
    const result = await pool.query(
      'SELECT "Id", "CompanyName", "IsActive" FROM suppliers WHERE "Id" = $1',
      [supplierId]
    );

    if (result.rows.length === 0) {
      throw new BusinessRuleViolation(
        'BR-PO-001',
        `Supplier ${supplierId} not found`,
        'SUPPLIER_NOT_FOUND'
      );
    }

    // Check if supplier is active
    if (result.rows[0].IsActive === false) {
      throw new BusinessRuleViolation(
        'BR-PO-001',
        `Supplier ${result.rows[0].CompanyName} is inactive and cannot be used for new purchase orders`,
        'SUPPLIER_INACTIVE'
      );
    }
  }

  /**
   * BR-PO-002: PO must have at least one item
   */
  static validatePOItems(items: any[]): void {
    if (!items || items.length === 0) {
      throw new BusinessRuleViolation(
        'BR-PO-002',
        'Purchase order must have at least one item',
        'EMPTY_PO'
      );
    }
  }

  /**
   * BR-PO-003: Unit cost must be non-negative
   */
  static validateUnitCost(unitCost: number): void {
    if (unitCost < 0) {
      throw new BusinessRuleViolation(
        'BR-PO-003',
        `Unit cost cannot be negative: ${unitCost}`,
        'NEGATIVE_UNIT_COST'
      );
    }
  }

  /**
   * BR-PO-004: Cannot modify completed or cancelled PO
   */
  static async validatePOStatus(
    pool: Pool,
    poId: string,
    allowedStatuses: string[]
  ): Promise<void> {
    const result = await pool.query('SELECT status FROM purchase_orders WHERE id = $1', [poId]);

    if (result.rows.length === 0) {
      throw new BusinessRuleViolation(
        'BR-PO-004',
        `Purchase order ${poId} not found`,
        'PO_NOT_FOUND'
      );
    }

    const status = result.rows[0].status;
    if (!allowedStatuses.includes(status)) {
      throw new BusinessRuleViolation(
        'BR-PO-004',
        `Cannot modify PO with status ${status}. Allowed: ${allowedStatuses.join(', ')}`,
        'INVALID_PO_STATUS'
      );
    }
  }

  /**
   * BR-PO-005: Expected delivery date must be in future (for new POs)
   */
  static validateExpectedDate(expectedDate: Date | null): void {
    if (expectedDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (expectedDate < today) {
        logger.warn('Expected delivery date is in the past', { expectedDate });
        // Warning only - business may want to allow backdated POs
      }
    }
  }

  /**
   * BR-PO-006: Received quantity cannot exceed ordered quantity
   */
  static validateReceivedQuantity(
    orderedQuantity: number,
    receivedQuantity: number,
    allowOverReceiving: boolean = false
  ): void {
    if (!allowOverReceiving && receivedQuantity > orderedQuantity) {
      throw new BusinessRuleViolation(
        'BR-PO-006',
        `Received quantity (${receivedQuantity}) exceeds ordered quantity (${orderedQuantity})`,
        'OVER_RECEIVING'
      );
    }
  }

  /**
   * BR-PO-007: Cost variance threshold check (warn if >10% variance)
   */
  static validateCostVariance(
    orderedCost: number,
    receivedCost: number,
    thresholdPercentage: number = 10
  ): { exceeded: boolean; variance: number; percentage: number } {
    const variance = new Decimal(receivedCost).minus(orderedCost).abs().toNumber();
    const percentage = orderedCost > 0 ? new Decimal(variance).dividedBy(orderedCost).times(100).toNumber() : 0;

    if (percentage > thresholdPercentage) {
      logger.warn('BR-PO-007: Cost variance threshold exceeded', {
        orderedCost,
        receivedCost,
        variance,
        percentage: percentage.toFixed(2),
        threshold: thresholdPercentage,
      });
    }

    return {
      exceeded: percentage > thresholdPercentage,
      variance,
      percentage,
    };
  }

  /**
   * BR-PO-008: Quantity variance threshold check (warn if >5% variance)
   */
  static validateQuantityVariance(
    orderedQuantity: number,
    receivedQuantity: number,
    thresholdPercentage: number = 5
  ): { exceeded: boolean; variance: number; percentage: number } {
    const variance = Math.abs(receivedQuantity - orderedQuantity);
    const percentage = orderedQuantity > 0 ? (variance / orderedQuantity) * 100 : 0;

    if (percentage > thresholdPercentage) {
      logger.warn('BR-PO-008: Quantity variance threshold exceeded', {
        orderedQuantity,
        receivedQuantity,
        variance,
        percentage: percentage.toFixed(2),
        threshold: thresholdPercentage,
      });
    }

    return {
      exceeded: percentage > thresholdPercentage,
      variance,
      percentage,
    };
  }

  /**
   * BR-PO-009: Duplicate PO detection (same supplier + similar total within 24 hours)
   */
  static async validateDuplicatePO(
    pool: Pool,
    supplierId: string,
    totalAmount: number,
    createdBy: string,
    hoursWindow: number = 24
  ): Promise<void> {
    const threshold = new Decimal(totalAmount).times(0.05); // 5% tolerance
    const minAmount = new Decimal(totalAmount).minus(threshold).toNumber();
    const maxAmount = new Decimal(totalAmount).plus(threshold).toNumber();

    const result = await pool.query(
      `SELECT id, order_number, total_amount, created_at
       FROM purchase_orders
       WHERE supplier_id = $1
         AND created_by_id = $2
         AND total_amount BETWEEN $3 AND $4
         AND created_at > NOW() - INTERVAL '${hoursWindow} hours'
         AND status != 'CANCELLED'
       ORDER BY created_at DESC
       LIMIT 1`,
      [supplierId, createdBy, minAmount, maxAmount]
    );

    if (result.rows.length > 0) {
      const existing = result.rows[0];
      logger.warn('BR-PO-009: Potential duplicate PO detected', {
        existingPO: existing.order_number,
        existingAmount: existing.total_amount,
        newAmount: totalAmount,
        supplierId,
        createdBy,
      });

      // Warning only - don't throw, allow user to proceed
      // Uncomment to enforce strict duplicate prevention:
      // throw new BusinessRuleViolation(
      //   'BR-PO-009',
      //   `Similar PO (${existing.order_number}) created ${Math.round((Date.now() - new Date(existing.created_at).getTime()) / 1000 / 60)} minutes ago`,
      //   'DUPLICATE_PO_DETECTED'
      // );
    }
  }

  /**
   * BR-PO-010: Batch number uniqueness per product
   */
  static async validateBatchNumber(
    pool: Pool,
    productId: string,
    batchNumber: string
  ): Promise<void> {
    if (!batchNumber || batchNumber.trim().length === 0) {
      return; // Batch number is optional
    }

    const result = await pool.query(
      `SELECT id, remaining_quantity, status
       FROM inventory_batches
       WHERE product_id = $1 AND batch_number = $2
       LIMIT 1`,
      [productId, batchNumber]
    );

    if (result.rows.length > 0) {
      const existing = result.rows[0];
      logger.warn('BR-PO-010: Batch number already exists', {
        productId,
        batchNumber,
        existingBatchId: existing.id,
        status: existing.status,
        remainingQty: existing.remaining_quantity,
      });

      // Warning only - same batch might be received in multiple shipments
      // Uncomment to enforce strict uniqueness:
      // throw new BusinessRuleViolation(
      //   'BR-PO-010',
      //   `Batch ${batchNumber} already exists for this product`,
      //   'DUPLICATE_BATCH_NUMBER'
      // );
    }
  }

  /**
   * BR-PO-011: Supplier lead time validation
   * 
   * STATUS: Disabled - Requires migration 010_add_advanced_inventory_supplier_columns.sql
   * 
   * When enabled, warns if expected delivery date doesn't account for supplier lead time.
   * Run migration then uncomment validation logic below.
   */
  static async validateLeadTime(
    pool: Pool,
    supplierId: string,
    orderDate: Date,
    expectedDate: Date | null
  ): Promise<void> {
    // Validation disabled until lead_time_days column exists
    // Uncomment after running migration 010
    logger.debug('BR-PO-011: Lead time validation skipped (run migration 010 to enable)');
    return;

    /* Uncomment after migration 010:
    if (!expectedDate) return;

    const result = await pool.query(
      `SELECT name, lead_time_days FROM suppliers WHERE id = $1`,
      [supplierId]
    );

    if (result.rows.length > 0 && result.rows[0].lead_time_days) {
      const { name, lead_time_days } = result.rows[0];
      const minExpectedDate = new Date(orderDate);
      minExpectedDate.setDate(minExpectedDate.getDate() + lead_time_days);

      if (expectedDate < minExpectedDate) {
        logger.warn('BR-PO-011: Expected date is earlier than supplier lead time', {
          supplierId,
          supplierName: name,
          leadTimeDays: lead_time_days,
          orderDate: orderDate.toISOString().split('T')[0],
          expectedDate: expectedDate.toISOString().split('T')[0],
          minExpectedDate: minExpectedDate.toISOString().split('T')[0],
        });
        // Warning only - allow expedited orders
      }
    }
    */
  }

  /**
   * BR-PO-012: Minimum order value check (if supplier has minimum)
   * 
   * STATUS: Disabled - Requires migration 010_add_advanced_inventory_supplier_columns.sql
   * 
   * When enabled, enforces supplier's minimum order amount requirement.
   * Run migration then uncomment validation logic below.
   */
  static async validateMinimumOrderValue(
    pool: Pool,
    supplierId: string,
    totalAmount: number
  ): Promise<void> {
    // Validation disabled until minimum_order_amount column exists
    // Uncomment after running migration 010
    logger.debug('BR-PO-012: Minimum order validation skipped (run migration 010 to enable)');
    return;

    /* Uncomment after migration 010:
    const result = await pool.query(
      `SELECT name, minimum_order_amount FROM suppliers WHERE id = $1`,
      [supplierId]
    );

    if (result.rows.length > 0 && result.rows[0].minimum_order_amount) {
      const { name, minimum_order_amount } = result.rows[0];
      const minAmount = parseFloat(minimum_order_amount);

      if (totalAmount < minAmount) {
        throw new BusinessRuleViolation(
          'BR-PO-012',
          `Order total ${totalAmount.toFixed(2)} is below supplier minimum ${minAmount.toFixed(2)}`,
          'BELOW_MINIMUM_ORDER',
          { supplierId, supplierName: name, totalAmount, minimumAmount: minAmount }
        );
      }
    }
    */
  }
}

/**
 * Pricing Business Rules
 */
export class PricingBusinessRules {
  /**
   * BR-PRC-001: Cost must be non-negative
   */
  static validateCost(cost: number): void {
    if (cost < 0) {
      throw new BusinessRuleViolation(
        'BR-PRC-001',
        `Cost cannot be negative: ${cost}`,
        'NEGATIVE_COST'
      );
    }
  }

  /**
   * BR-PRC-002: Selling price must be non-negative
   */
  static validateSellingPrice(sellingPrice: number): void {
    if (sellingPrice < 0) {
      throw new BusinessRuleViolation(
        'BR-PRC-002',
        `Selling price cannot be negative: ${sellingPrice}`,
        'NEGATIVE_SELLING_PRICE'
      );
    }
  }

  /**
   * BR-PRC-003: Pricing formula must be valid
   */
  static validatePricingFormula(formula: string): void {
    // Basic validation - formula service will do deeper validation
    if (!formula || formula.trim().length === 0) {
      throw new BusinessRuleViolation(
        'BR-PRC-003',
        'Pricing formula cannot be empty',
        'EMPTY_FORMULA'
      );
    }

    // Check for dangerous patterns
    const dangerousPatterns = ['require', 'import', 'process', 'fs', 'eval', 'Function'];
    for (const pattern of dangerousPatterns) {
      if (formula.includes(pattern)) {
        throw new BusinessRuleViolation(
          'BR-PRC-003',
          `Pricing formula contains forbidden keyword: ${pattern}`,
          'DANGEROUS_FORMULA'
        );
      }
    }
  }

  /**
   * BR-PRC-004: Customer group discount must be 0-100%
   */
  static validateDiscountPercentage(discountPercentage: number): void {
    if (discountPercentage < 0 || discountPercentage > 1) {
      throw new BusinessRuleViolation(
        'BR-PRC-004',
        `Discount percentage must be between 0 and 1 (0-100%). Received: ${discountPercentage}`,
        'INVALID_DISCOUNT_PERCENTAGE'
      );
    }
  }

  /**
   * BR-PRC-005: Pricing tier quantity range must be valid
   */
  static validateQuantityRange(minQuantity: number | null, maxQuantity: number | null): void {
    if (minQuantity !== null && maxQuantity !== null) {
      if (minQuantity >= maxQuantity) {
        throw new BusinessRuleViolation(
          'BR-PRC-005',
          `Min quantity (${minQuantity}) must be less than max quantity (${maxQuantity})`,
          'INVALID_QUANTITY_RANGE'
        );
      }
    }

    if (minQuantity !== null && minQuantity < 0) {
      throw new BusinessRuleViolation(
        'BR-PRC-005',
        'Min quantity cannot be negative',
        'NEGATIVE_MIN_QUANTITY'
      );
    }
  }
}

/**
 * Express middleware to catch and format business rule violations
 */
export function businessRuleErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof BusinessRuleViolation) {
    logger.warn('Business rule violation', {
      rule: err.rule,
      code: err.code,
      details: err.details,
      path: req.path,
      method: req.method,
    });

    res.status(400).json({
      success: false,
      error: err.details,
      code: err.code,
      rule: err.rule,
      type: 'BUSINESS_RULE_VIOLATION',
    });
    return;
  }

  next(err);
}

export default {
  InventoryBusinessRules,
  SalesBusinessRules,
  PurchaseOrderBusinessRules,
  PricingBusinessRules,
  BusinessRuleViolation,
  businessRuleErrorHandler,
};
