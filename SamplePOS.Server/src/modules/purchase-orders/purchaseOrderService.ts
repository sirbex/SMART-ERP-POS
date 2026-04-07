import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import {
  purchaseOrderRepository,
  CreatePOData,
  CreatePOItemData,
  PurchaseOrder,
  PurchaseOrderItem,
} from './purchaseOrderRepository.js';
import {
  PurchaseOrderBusinessRules,
  InventoryBusinessRules,
} from '../../middleware/businessRules.js';
import logger from '../../utils/logger.js';
import { Money } from '../../utils/money.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import * as documentFlowService from '../document-flow/documentFlowService.js';
import { checkMaintenanceMode } from '../../utils/maintenanceGuard.js';

export interface CreatePOInput {
  supplierId: string;
  orderDate: string;
  expectedDate?: string | null;
  notes?: string | null;
  createdBy: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitCost: number;
    uomId?: string | null;
  }[];
}

export interface UpdateDraftPOInput {
  supplierId?: string;
  expectedDate?: string | null;
  notes?: string | null;
  items?: {
    productId: string;
    productName: string;
    quantity: number;
    unitCost: number;
    uomId?: string | null;
  }[];
}

export const purchaseOrderService = {
  /**
   * Create purchase order with items and validation (ATOMIC TRANSACTION)
   * @param pool - Database connection pool
   * @param input - PO creation data (supplier, dates, items with quantities/costs)
   * @returns Created PO with auto-generated po_number and items
   * @throws Error if validation fails or supplier inactive
   * 
   * Business Rules Enforced:
   * - BR-PO-001: Supplier must exist and be active
   * - BR-PO-002: PO must have at least one item
   * - BR-PO-003: Unit cost must be non-negative
   * - BR-PO-005: Expected date must be >= order date
   * - BR-PO-007: Lead time validation against supplier settings
   * - BR-INV-002: Quantity must be positive
   * 
   * Cost Normalization:
   * - Detects UoM multipliers (e.g., pack of 12 cost → base unit cost)
   * - Automatically divides inflated costs by integer factors (2-200)
   * - Ensures base unit consistency across system
   * 
   * Transaction Flow:
   * 1. Validate supplier existence and active status
   * 2. Validate PO has items
   * 3. Normalize unit costs to base unit
   * 4. Validate expected delivery date and lead time
   * 5. Create PO header with DRAFT status
   * 6. Create PO items
   * 7. Commit transaction atomically
   * 
   * Financial Precision: Uses Decimal.js for all cost calculations
   */
  async createPO(pool: Pool, input: CreatePOInput): Promise<{ po: PurchaseOrder; items: PurchaseOrderItem[] }> {
    return UnitOfWork.run(pool, async (client) => {
      // Maintenance mode guard (replaces trg_maintenance_check_po)
      await checkMaintenanceMode(client);

      // BR-PO-001: Validate supplier exists and is active
      await PurchaseOrderBusinessRules.validateSupplierExists(client, input.supplierId);
      logger.info('BR-PO-001: Supplier validation passed', { supplierId: input.supplierId });

      // BR-PO-002: Validate PO has items
      PurchaseOrderBusinessRules.validatePOItems(input.items);
      logger.info('BR-PO-002: PO items validation passed', { itemCount: input.items.length });

      // Validate each item
      for (const item of input.items) {
        // BR-INV-002: Validate positive quantity
        InventoryBusinessRules.validatePositiveQuantity(item.quantity, 'PO item');

        // Server-side normalization: ensure unitCost is base unit cost
        // If it looks like a UoM multiple of product base cost, normalize it
        const productRes = await client.query('SELECT cost_price FROM product_valuation WHERE product_id = $1', [
          item.productId,
        ]);
        if (productRes.rows.length > 0) {
          const baseCost = Money.parseDb(productRes.rows[0].cost_price).toNumber();
          if (baseCost > 0 && item.unitCost > 0) {
            const ratio = item.unitCost / baseCost;
            const rounded = Math.round(ratio);
            const isIntegerish = Math.abs(ratio - rounded) < 1e-6;
            if (isIntegerish && rounded >= 2 && rounded <= 200) {
              logger.info(
                `Normalizing unit cost for ${item.productName}: ${item.unitCost} → ${item.unitCost / rounded} (factor: ${rounded})`
              );
              item.unitCost = item.unitCost / rounded;
            }
          }
        }

        // BR-PO-003: Validate non-negative unit cost (using Decimal for precision)
        const unitCostDecimal = new Decimal(item.unitCost);
        PurchaseOrderBusinessRules.validateUnitCost(Money.toNumber(unitCostDecimal));
        logger.info('BR-PO-003: Unit cost validation passed', {
          productId: item.productId,
          unitCost: unitCostDecimal.toString(),
        });
      }

      // BR-PO-005: Validate expected date if provided
      if (input.expectedDate) {
        PurchaseOrderBusinessRules.validateExpectedDate(input.expectedDate);
        logger.info('BR-PO-005: Expected date validation passed', {
          expectedDate: input.expectedDate,
        });
      }

      // Calculate total for additional validations
      const totalAmount = Money.toNumber(input.items.reduce(
        (sum, item) => sum.plus(new Decimal(item.quantity).times(item.unitCost)),
        new Decimal(0)
      ));

      // BR-PO-007 & BR-PO-011: Validate supplier lead time
      if (input.expectedDate) {
        await PurchaseOrderBusinessRules.validateLeadTime(
          client,
          input.supplierId,
          input.orderDate,
          input.expectedDate
        );
        logger.info('BR-PO-011: Lead time validation passed');
      }

      // BR-PO-009: Check for duplicate PO (warning only)
      await PurchaseOrderBusinessRules.validateDuplicatePO(
        client,
        input.supplierId,
        totalAmount,
        input.createdBy,
        24
      );

      // BR-PO-012: Validate minimum order value
      await PurchaseOrderBusinessRules.validateMinimumOrderValue(
        client,
        input.supplierId,
        totalAmount
      );
      logger.info('BR-PO-012: Minimum order value validation passed', { totalAmount });

      // Create PO
      const poData: CreatePOData = {
        supplierId: input.supplierId,
        orderDate: input.orderDate,
        expectedDate: input.expectedDate || null,
        notes: input.notes || null,
        createdBy: input.createdBy,
      };

      const po = await purchaseOrderRepository.createPO(client, poData);

      // Create PO items with Decimal precision
      const poItems: CreatePOItemData[] = input.items.map((item) => ({
        purchaseOrderId: po.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitCost: Money.toNumber(new Decimal(item.unitCost)), // Bank-grade precision
        uomId: item.uomId || null,
      }));

      const items = await purchaseOrderRepository.addPOItems(client, poItems);

      // Update PO total
      await purchaseOrderRepository.updatePOTotal(client, po.id);

      // Get updated PO
      const updatedPO = await purchaseOrderRepository.getPOById(client, po.id);

      logger.info('Purchase order created successfully', { poId: po.id, itemCount: items.length });
      return updatedPO!;
    });
  },

  /**
   * Update a DRAFT purchase order (SAP ME22N / Odoo draft edit pattern)
   * Allows full header + item replacement while PO is in DRAFT status.
   * 
   * Business Rules: Same as createPO (supplier validation, item validation, etc.)
   * Transaction: Atomic — all-or-nothing via UnitOfWork
   */
  async updateDraftPO(
    pool: Pool,
    id: string,
    input: UpdateDraftPOInput
  ): Promise<{ po: PurchaseOrder; items: PurchaseOrderItem[] }> {
    return UnitOfWork.run(pool, async (client) => {
      await checkMaintenanceMode(client);

      // Fetch existing PO — must be DRAFT
      const existing = await purchaseOrderRepository.getPOById(client, id);
      if (!existing) {
        throw new Error(`Purchase order ${id} not found`);
      }
      if (existing.po.status !== 'DRAFT') {
        throw new Error('Can only edit purchase orders in DRAFT status');
      }

      // Validate supplier if changed
      const supplierId = input.supplierId || existing.po.supplierId;
      if (input.supplierId) {
        await PurchaseOrderBusinessRules.validateSupplierExists(client, input.supplierId);
      }

      // Validate expected date if provided
      if (input.expectedDate) {
        PurchaseOrderBusinessRules.validateExpectedDate(input.expectedDate);
      }

      // Update header fields
      if (input.supplierId || input.expectedDate !== undefined || input.notes !== undefined) {
        await purchaseOrderRepository.updatePOHeader(client, id, {
          supplierId: input.supplierId,
          expectedDate: input.expectedDate,
          notes: input.notes,
        });
      }

      // If items are provided, replace all items (delete + re-insert)
      if (input.items && input.items.length > 0) {
        // Validate each item
        for (const item of input.items) {
          InventoryBusinessRules.validatePositiveQuantity(item.quantity, 'PO item');

          // Cost normalization (same as createPO)
          const productRes = await client.query(
            'SELECT cost_price FROM product_valuation WHERE product_id = $1',
            [item.productId]
          );
          if (productRes.rows.length > 0) {
            const baseCost = Money.parseDb(productRes.rows[0].cost_price).toNumber();
            if (baseCost > 0 && item.unitCost > 0) {
              const ratio = item.unitCost / baseCost;
              const rounded = Math.round(ratio);
              const isIntegerish = Math.abs(ratio - rounded) < 1e-6;
              if (isIntegerish && rounded >= 2 && rounded <= 200) {
                logger.info(
                  `Normalizing unit cost for ${item.productName}: ${item.unitCost} → ${item.unitCost / rounded} (factor: ${rounded})`
                );
                item.unitCost = item.unitCost / rounded;
              }
            }
          }

          const unitCostDecimal = new Decimal(item.unitCost);
          PurchaseOrderBusinessRules.validateUnitCost(Money.toNumber(unitCostDecimal));
        }

        // Validate total and business rules
        const totalAmount = Money.toNumber(input.items.reduce(
          (sum, item) => sum.plus(new Decimal(item.quantity).times(item.unitCost)),
          new Decimal(0)
        ));

        if (input.expectedDate) {
          await PurchaseOrderBusinessRules.validateLeadTime(
            client,
            supplierId,
            existing.po.orderDate,
            input.expectedDate
          );
        }

        await PurchaseOrderBusinessRules.validateMinimumOrderValue(client, supplierId, totalAmount);

        // Delete existing items and re-insert
        await client.query(
          'DELETE FROM purchase_order_items WHERE purchase_order_id = $1',
          [id]
        );

        const poItems: CreatePOItemData[] = input.items.map((item) => ({
          purchaseOrderId: id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitCost: Money.toNumber(new Decimal(item.unitCost)),
          uomId: item.uomId || null,
        }));

        await purchaseOrderRepository.addPOItems(client, poItems);
      }

      // Update total
      await purchaseOrderRepository.updatePOTotal(client, id);

      // Return updated PO
      const updatedPO = await purchaseOrderRepository.getPOById(client, id);
      logger.info('Purchase order updated successfully', { poId: id });
      return updatedPO!;
    });
  },

  /**
   * Get PO by ID
   */
  async getPOById(pool: Pool, id: string): Promise<{ po: PurchaseOrder; items: PurchaseOrderItem[] }> {
    const result = await purchaseOrderRepository.getPOById(pool, id);

    if (!result) {
      throw new Error(`Purchase order ${id} not found`);
    }

    return result;
  },

  /**
   * List purchase orders
   */
  async listPOs(
    pool: Pool,
    page: number = 1,
    limit: number = 50,
    filters?: { status?: string; supplierId?: string }
  ): Promise<{ pos: PurchaseOrder[]; total: number }> {
    return purchaseOrderRepository.listPOs(pool, page, limit, filters);
  },

  /**
   * Update PO status with validation
   */
  async updatePOStatus(pool: Pool, id: string, newStatus: string): Promise<PurchaseOrder> {
    // Maintenance mode guard (replaces trg_maintenance_check_po)
    await checkMaintenanceMode(pool);

    // Validate status transition
    const validStatuses = ['DRAFT', 'PENDING', 'COMPLETED', 'CANCELLED'];

    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    // Get current PO
    const result = await purchaseOrderRepository.getPOById(pool, id);

    if (!result) {
      throw new Error(`Purchase order ${id} not found`);
    }

    const currentStatus = result.po.status;

    // BR-PO-004: Validate PO status allows modification
    const allowedCurrentStatuses = newStatus === 'CANCELLED' ? ['DRAFT', 'PENDING'] : ['DRAFT'];

    if (!allowedCurrentStatuses.includes(currentStatus)) {
      throw new Error(`Cannot change status from ${currentStatus} to ${newStatus}`);
    }

    logger.info('BR-PO-004: PO status transition validation passed', {
      poId: id,
      currentStatus,
      newStatus,
    });

    return purchaseOrderRepository.updatePOStatus(pool, id, newStatus);
  },

  /**
   * Cancel purchase order
   */
  async cancelPO(pool: Pool, id: string): Promise<PurchaseOrder> {
    return this.updatePOStatus(pool, id, 'CANCELLED');
  },

  /**
   * Submit purchase order (DRAFT -> PENDING)
   */
  async submitPO(pool: Pool, id: string): Promise<PurchaseOrder> {
    return this.updatePOStatus(pool, id, 'PENDING');
  },

  /**
   * Delete purchase order (only if DRAFT)
   */
  async deletePO(pool: Pool, id: string): Promise<void> {
    const result = await purchaseOrderRepository.getPOById(pool, id);

    if (!result) {
      throw new Error(`Purchase order ${id} not found`);
    }

    if (result.po.status !== 'DRAFT') {
      throw new Error('Can only delete purchase orders in DRAFT status');
    }

    return purchaseOrderRepository.deletePO(pool, id);
  },

  /**
   * Send PO to supplier and auto-create goods receipt draft
   * This implements the workflow: PO Sent → Awaiting Delivery → Goods Receipt
   */
  async sendPOToSupplier(pool: Pool, id: string, userId: string): Promise<{ po: PurchaseOrder & { sent_date: Date }; goodsReceipt: { id: string; receiptNumber: string; status: string; message: string } }> {
    return UnitOfWork.run(pool, async (client) => {
      // Maintenance mode guard (replaces trg_maintenance_check_po)
      await checkMaintenanceMode(client);

      // Get PO with items
      const poResult = await purchaseOrderRepository.getPOById(client, id);

      if (!poResult) {
        throw new Error(`Purchase order ${id} not found`);
      }

      const { po, items } = poResult;

      // Validate PO is in PENDING status
      if (po.status !== 'PENDING') {
        throw new Error('Purchase order must be in PENDING status to send to supplier');
      }

      // Update PO with sent_date
      await client.query(
        'UPDATE purchase_orders SET sent_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      // Auto-create DRAFT goods receipt for receiving
      const grNumber = await this.generateGRNumber(client);

      const grResult = await client.query(
        `INSERT INTO goods_receipts (
          receipt_number, purchase_order_id, received_by_id, status
        ) VALUES ($1, $2, $3, 'DRAFT')
        RETURNING *`,
        [grNumber, id, userId]
      );

      const goodsReceipt = grResult.rows[0];

      // Create GR items from PO items (with 0 received quantity initially)
      // SAP/Odoo pattern: each GR line links back to its specific PO line via po_item_id
      const grItems = items.map((item: PurchaseOrderItem & { product_id?: string; unit_price?: number }) => ({
        goods_receipt_id: goodsReceipt.id,
        product_id: item.product_id || item.productId,
        received_quantity: 0,
        cost_price: item.unit_price ?? item.unitCost,
        po_item_id: item.id,  // Link GR line to specific PO line item
      }));

      const grItemPlaceholders = grItems
        .map((_, index) => {
          const offset = index * 5;
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
        })
        .join(', ');

      const grItemValues = grItems.flatMap((item) => [
        item.goods_receipt_id,
        item.product_id,
        item.received_quantity,
        item.cost_price,
        item.po_item_id,
      ]);

      await client.query(
        `INSERT INTO goods_receipt_items (
          goods_receipt_id, product_id, received_quantity, cost_price, po_item_id
        ) VALUES ${grItemPlaceholders}`,
        grItemValues
      );

      logger.info('PO sent to supplier and goods receipt created', {
        poId: id,
        grId: goodsReceipt.id,
        grNumber,
      });

      return {
        po: { ...po, sent_date: new Date() },
        goodsReceipt: {
          id: goodsReceipt.id,
          receiptNumber: grNumber,
          status: 'DRAFT',
          message: 'Goods receipt draft created. Confirm quantities when delivery arrives.',
        },
      };
    });
  },

  /**
   * Generate Goods Receipt number (GR-YYYY-NNNN format)
   */
  async generateGRNumber(pool: Pool | PoolClient): Promise<string> {
    const year = new Date().getFullYear();
    const result = await pool.query(
      `SELECT receipt_number FROM goods_receipts 
       WHERE receipt_number LIKE $1 
       ORDER BY receipt_number DESC 
       LIMIT 1`,
      [`GR-${year}-%`]
    );

    if (result.rows.length === 0) {
      return `GR-${year}-0001`;
    }

    const lastNumber = result.rows[0].receipt_number;
    const sequence = parseInt(lastNumber.split('-')[2]) + 1;
    return `GR-${year}-${sequence.toString().padStart(4, '0')}`;
  },

  /**
   * Create supplier invoice after goods receipt is finalized
   */
  async createSupplierInvoice(
    pool: Pool,
    data: {
      purchaseOrderId: string;
      goodsReceiptId: string;
      invoiceNumber: string;
      invoiceDate: Date;
      dueDate: Date;
      supplierId: string;
      totalAmount: number;
      paymentTerms?: string;
      notes?: string;
      createdBy: string;
    }
  ): Promise<Record<string, unknown>> {
    return UnitOfWork.run(pool, async (client) => {
      // Create invoice
      const result = await client.query(
        `INSERT INTO supplier_invoices (
          invoice_number, supplier_id, purchase_order_id, goods_receipt_id,
          invoice_date, due_date, total_amount, outstanding_amount,
          payment_terms, notes, created_by_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, 'PENDING')
        RETURNING *`,
        [
          data.invoiceNumber,
          data.supplierId,
          data.purchaseOrderId,
          data.goodsReceiptId,
          data.invoiceDate,
          data.dueDate,
          data.totalAmount,
          data.paymentTerms,
          data.notes,
          data.createdBy,
        ]
      );

      logger.info('Supplier invoice created', { invoiceId: result.rows[0].id });

      // Document Flow: PO → Supplier Invoice
      await documentFlowService.linkDocuments(client, 'PURCHASE_ORDER', data.purchaseOrderId, 'SUPPLIER_INVOICE', result.rows[0].id as string, 'CREATED_FROM');
      // Document Flow: GR → Supplier Invoice
      await documentFlowService.linkDocuments(client, 'GOODS_RECEIPT', data.goodsReceiptId, 'SUPPLIER_INVOICE', result.rows[0].id as string, 'CREATED_FROM');

      return result.rows[0] as Record<string, unknown>;
    });
  },

  /**
   * Record payment for supplier invoice
   */
  async recordPayment(
    pool: Pool,
    data: {
      invoiceId: string;
      supplierId: string;
      amount: number;
      paymentMethod: string;
      paymentDate: Date;
      referenceNumber?: string;
      notes?: string;
      createdBy: string;
    }
  ): Promise<Record<string, unknown>> {
    return UnitOfWork.run(pool, async (client) => {
      // Generate payment number
      const paymentNumber = await this.generatePaymentNumber(client);

      // Create payment record
      const result = await client.query(
        `INSERT INTO payments (
          payment_number, invoice_id, supplier_id, payment_date,
          amount, payment_method, reference_number, notes, created_by_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'COMPLETED')
        RETURNING *`,
        [
          paymentNumber,
          data.invoiceId,
          data.supplierId,
          data.paymentDate,
          data.amount,
          data.paymentMethod,
          data.referenceNumber,
          data.notes,
          data.createdBy,
        ]
      );

      // Trigger will automatically update invoice outstanding amount and status

      logger.info('Payment recorded', { paymentId: result.rows[0].id, amount: data.amount });

      return result.rows[0] as Record<string, unknown>;
    });
  },

  /**
   * Generate Payment number (PAY-YYYY-NNNN format)
   */
  async generatePaymentNumber(pool: Pool | PoolClient): Promise<string> {
    const year = new Date().getFullYear();
    const result = await pool.query(
      `SELECT payment_number FROM payments 
       WHERE payment_number LIKE $1 
       ORDER BY payment_number DESC 
       LIMIT 1`,
      [`PAY-${year}-%`]
    );

    if (result.rows.length === 0) {
      return `PAY-${year}-0001`;
    }

    const lastNumber = result.rows[0].payment_number;
    const sequence = parseInt(lastNumber.split('-')[2]) + 1;
    return `PAY-${year}-${sequence.toString().padStart(4, '0')}`;
  },
};
