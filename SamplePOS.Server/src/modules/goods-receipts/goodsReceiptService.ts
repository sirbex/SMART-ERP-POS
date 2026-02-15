import { Pool } from 'pg';
import Decimal from 'decimal.js';
import {
  goodsReceiptRepository,
  CreateGRData,
  CreateGRItemData,
  UpdateGRItemData,
} from './goodsReceiptRepository.js';
import { purchaseOrderRepository } from '../purchase-orders/purchaseOrderRepository.js';
import { inventoryRepository } from '../inventory/inventoryRepository.js';
import * as supplierPaymentRepository from '../supplier-payments/supplierPaymentRepository.js';
import * as costLayerService from '../../services/costLayerService.js';
import * as pricingService from '../../services/pricingService.js';
import * as glEntryService from '../../services/glEntryService.js';
import logger from '../../utils/logger.js';
import {
  InventoryBusinessRules,
  PurchaseOrderBusinessRules,
} from '../../middleware/businessRules.js';

// Alert shape consumed by controller for finalize response
export interface CostPriceChangeAlert {
  productId: string;
  productName: string;
  previousCost: number;
  newCost: number;
  changeAmount: number;
  changePercentage: number;
  batchNumber?: string | null;
}

export const goodsReceiptService = {
  /**
   * Create goods receipt with items (DRAFT state, manual or from PO)
   * @param pool - Database connection pool
   * @param data - GR creation data (PO linkage, items with batches/expiry, receipt date)
   * @returns Created GR with items and auto-generated manual PO (if supplier provided)
   * @throws Error if validation fails or PO not found
   * 
   * Receipt Modes:
   * - **From Purchase Order**: Link to existing PO, validate item references
   * - **Manual Receipt**: Auto-generate "manual" PO if supplierId provided (no PO reference)
   * 
   * Business Rules:
   * - BR-INV-002: Received quantity must be positive
   * - BR-INV-005: Batch/expiry tracking for perishables
   * - Manual receipts auto-create PO with source='MANUAL' flag
   * 
   * Transaction Flow:
   * 1. If manual (no PO), create auto-generated manual PO
   * 2. Create GR header with DRAFT status
   * 3. Validate and insert GR items with batch/expiry
   * 4. Link GR items to PO items (if applicable)
   * 5. Commit transaction atomically
   * 
   * Note: GR remains DRAFT until finalize(), which updates inventory and cost layers
   */
  async createGR(
    pool: Pool,
    data: Omit<CreateGRData, 'notes'> & { notes?: string | null; supplierId?: string | null } & {
      items: Array<{
        poItemId?: string | null;
        productId: string;
        productName: string;
        orderedQuantity: number;
        receivedQuantity: number;
        unitCost: number;
        batchNumber?: string | null;
        expiryDate?: Date | null;
      }>;
    }
  ): Promise<{ gr: any; items: any[]; manualPO?: any }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let purchaseOrderId = data.purchaseOrderId || null;
      let manualPO = null;

      // If supplierId provided without purchaseOrderId, create auto-generated manual PO
      if (!purchaseOrderId && data.supplierId) {
        logger.info(`Creating manual PO for supplier ${data.supplierId}`);

        // Prepare PO items from GR items
        const poItems = data.items.map((item) => ({
          purchaseOrderId: '', // Will be set by createManualPO
          productId: item.productId,
          productName: item.productName,
          quantity: item.receivedQuantity, // For manual receipts, ordered = received
          unitCost: item.unitCost,
        }));

        // Create manual PO with items
        const poResult = await purchaseOrderRepository.createManualPO(client as any, {
          supplierId: data.supplierId,
          orderDate: data.receiptDate,
          expectedDate: data.receiptDate, // Same as receipt date for manual
          notes: data.notes || `Auto-generated from manual goods receipt`,
          createdBy: data.receivedBy,
          items: poItems,
        });

        manualPO = poResult.po;
        purchaseOrderId = manualPO.id;

        logger.info(`Created manual PO ${manualPO.poNumber} for manual goods receipt`);

        // Update items with poItemId references
        data.items.forEach((grItem, index) => {
          grItem.poItemId = poResult.items[index]?.id || null;
          grItem.orderedQuantity = grItem.receivedQuantity; // Set ordered = received for manual
        });
      }

      // Create GR header (now with purchaseOrderId from manual PO if created)
      const gr = await goodsReceiptRepository.createGR(client as any, {
        purchaseOrderId: purchaseOrderId,
        receiptDate: data.receiptDate,
        notes: data.notes ?? null,
        receivedBy: data.receivedBy,
        source: data.supplierId && !data.purchaseOrderId ? 'MANUAL' : 'PURCHASE_ORDER',
      });

      // Validate and insert items
      const itemsToInsert: CreateGRItemData[] = [];
      for (const it of data.items) {
        const orderedQty = it.orderedQuantity;
        const receivedQty = it.receivedQuantity;
        let unitCost = it.unitCost;
        const expiry = it.expiryDate ?? null;

        // BR-INV-011: Validate item completeness
        InventoryBusinessRules.validateGRItemCompleteness({
          productId: it.productId,
          receivedQuantity: receivedQty,
          unitCost: unitCost,
          batchNumber: it.batchNumber || null,
          expiryDate: expiry,
        });
        logger.info('BR-INV-011: GR item completeness validation passed', {
          productId: it.productId,
        });

        // Server-side normalization: ensure unitCost is base unit cost
        // If it looks like a UoM multiple of product base cost, normalize it
        const productRes = await client.query('SELECT cost_price FROM products WHERE id = $1', [
          it.productId,
        ]);
        if (productRes.rows.length > 0) {
          const baseCost = Number(productRes.rows[0].cost_price || 0);
          if (baseCost > 0 && unitCost > 0) {
            const ratio = unitCost / baseCost;
            const rounded = Math.round(ratio);
            const isIntegerish = Math.abs(ratio - rounded) < 1e-6;
            if (isIntegerish && rounded >= 2 && rounded <= 200) {
              logger.info(
                `Normalizing unit cost for ${it.productName}: ${unitCost} → ${unitCost / rounded} (factor: ${rounded})`
              );
              unitCost = unitCost / rounded;
            }
          }
        }

        // BR-INV-002: Validate positive quantity
        InventoryBusinessRules.validatePositiveQuantity(
          Math.max(receivedQty, 0),
          'goods receipt item'
        );

        // BR-PO-003: Validate unit cost
        PurchaseOrderBusinessRules.validateUnitCost(unitCost);

        // BR-PO-006: Validate received vs ordered quantity (if linked to PO)
        if (purchaseOrderId && !manualPO) {
          PurchaseOrderBusinessRules.validateReceivedQuantity(orderedQty, receivedQty, false);
          logger.info('BR-PO-006: Received quantity validation passed', {
            orderedQty,
            receivedQty,
          });

          // BR-PO-008: Check quantity variance
          const qtyVariance = PurchaseOrderBusinessRules.validateQuantityVariance(
            orderedQty,
            receivedQty,
            5
          );
          if (qtyVariance.exceeded) {
            logger.warn('BR-PO-008: Quantity variance threshold exceeded', qtyVariance);
          }

          // BR-PO-007: Check cost variance (if base cost exists)
          if (productRes.rows.length > 0 && productRes.rows[0].cost_price) {
            const costVariance = PurchaseOrderBusinessRules.validateCostVariance(
              Number(productRes.rows[0].cost_price),
              unitCost,
              10
            );
            if (costVariance.exceeded) {
              logger.warn('BR-PO-007: Cost variance threshold exceeded', costVariance);
            }
          }
        }

        // BR-INV-003: Validate expiry date
        if (expiry) {
          InventoryBusinessRules.validateExpiryDate(expiry, false);
          logger.info('BR-INV-003: Expiry date validation passed', {
            expiryDate: expiry.toISOString().split('T')[0],
          });

          // BR-INV-008: Reject short expiry items
          InventoryBusinessRules.validateShortExpiry(expiry, 7);
          logger.info('BR-INV-008: Short expiry validation passed');

          // BR-INV-007: Warn if expiring soon
          const expiryWarning = InventoryBusinessRules.validateExpiryWarning(expiry, 30);
          if (expiryWarning) {
            logger.warn('BR-INV-007: Item expiring within 30 days', {
              productName: it.productName,
              expiryDate: expiry.toISOString().split('T')[0],
            });
          }

          // BR-INV-010: Check batch expiry sequence
          await InventoryBusinessRules.validateBatchExpirySequence(
            client as any,
            it.productId,
            expiry
          );
        }

        // BR-PO-010: Validate batch number uniqueness
        if (it.batchNumber) {
          await PurchaseOrderBusinessRules.validateBatchNumber(
            client as any,
            it.productId,
            it.batchNumber
          );
        }

        // BR-INV-009: Check if receiving would exceed max stock
        await InventoryBusinessRules.validateMaxStockLevel(
          client as any,
          it.productId,
          receivedQty
        );

        itemsToInsert.push({
          goodsReceiptId: gr.id,
          poItemId: it.poItemId || null,
          productId: it.productId,
          productName: it.productName,
          orderedQuantity: orderedQty,
          receivedQuantity: receivedQty,
          unitCost,
          batchNumber: it.batchNumber ?? null,
          expiryDate: expiry,
        });
      }

      const items = await goodsReceiptRepository.addGRItems(client as any, itemsToInsert);

      await client.query('COMMIT');

      // Return via repository to include joins/aliases if needed
      const full = await goodsReceiptRepository.getGRById(pool, gr.id);

      return {
        ...full,
        manualPO: manualPO
          ? {
            id: manualPO.id,
            poNumber: manualPO.poNumber,
            supplierId: manualPO.supplierId,
            status: manualPO.status,
            totalAmount: manualPO.totalAmount,
          }
          : undefined,
      } as any;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // Finalize a goods receipt: create batches, stock movements, cost layers, pricing updates
  async finalizeGR(pool: Pool, id: string): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const grResult = await goodsReceiptRepository.getGRById(client as any, id);
      if (!grResult) throw new Error(`Goods receipt ${id} not found`);

      const { gr, items } = grResult as any;
      // High-level validations before side effects
      if (gr.status === 'COMPLETED') throw new Error('Goods receipt is already completed');

      // Must have items
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Cannot finalize a goods receipt with no items');
      }

      // Every item must have positive received quantity (no zero or negative lines)
      const nonPositiveLines = items
        .map((raw: any) => ({
          name: raw.productName ?? raw.product_name ?? 'Unknown product',
          qty: Number(raw.receivedQuantity ?? raw.received_quantity ?? 0),
        }))
        .filter((x: any) => !Number.isFinite(x.qty) || x.qty <= 0);
      if (nonPositiveLines.length > 0) {
        const names = nonPositiveLines.map((x: any) => x.name).join(', ');
        throw new Error(`All items must have received quantity > 0. Fix: ${names}`);
      }

      // Collect per-item validation errors (do not mutate state yet)
      const preValidationErrors: string[] = [];
      for (const raw of items as any[]) {
        const productName: string = raw.productName ?? raw.product_name ?? 'Unknown product';
        const receivedQty: number = Number(raw.receivedQuantity ?? raw.received_quantity ?? 0);
        const unitCost: number = Number(raw.unitCost ?? raw.unit_cost ?? raw.cost_price ?? 0);
        const expiryRaw = raw.expiryDate ?? raw.expiry_date ?? null;
        const expiryDate: Date | null = expiryRaw ? new Date(expiryRaw) : null;

        if (receivedQty <= 0)
          preValidationErrors.push(`${productName}: received quantity must be greater than 0`);
        if (!Number.isFinite(unitCost) || unitCost < 0)
          preValidationErrors.push(`${productName}: unit cost cannot be negative`);
        if (expiryDate && expiryDate < new Date())
          preValidationErrors.push(`${productName}: expiry date cannot be in the past`);
      }

      if (preValidationErrors.length > 0) {
        throw new Error(`Validation failed: ${preValidationErrors.join('; ')}`);
      }

      const grNumber: string | undefined = gr.grNumber ?? gr.gr_number ?? gr.receipt_number;
      const receivedBy: string | undefined = gr.receivedBy ?? gr.received_by ?? gr.received_by_id;

      const alerts: CostPriceChangeAlert[] = [];
      // Collect cost layer data to process AFTER main transaction commits
      // This prevents nested transactions and connection pool exhaustion
      const costLayerData: Array<{
        productId: string;
        quantity: number;
        unitCost: number;
        goodsReceiptId: string;
        batchNumber: string;
      }> = [];

      for (const raw of items as any[]) {
        const productId: string = raw.productId ?? raw.product_id;
        const productName: string = raw.productName ?? raw.product_name;
        const poItemId: string | undefined = raw.poItemId ?? raw.po_item_id ?? undefined;
        const orderedQty: number = Number(raw.orderedQuantity ?? raw.ordered_quantity ?? 0);
        const receivedQty: number = Number(raw.receivedQuantity ?? raw.received_quantity ?? 0);
        const unitCost: number = Number(raw.unitCost ?? raw.unit_cost ?? raw.cost_price ?? 0);

        // Generate human-readable batch number: BATCH-YYYYMMDD-001
        let batchNumber: string = raw.batchNumber ?? raw.batch_number;
        if (!batchNumber) {
          const today = new Date();
          const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
          const prefix = `BATCH-${dateStr}-`;

          // Single atomic query to get next sequence number
          // Extract numeric suffix and find max, then add 1
          const seqResult = await client.query(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(batch_number FROM $2) AS INTEGER)), 0) + 1 AS next_seq
             FROM inventory_batches 
             WHERE batch_number LIKE $1`,
            [`${prefix}%`, `${prefix.replace(/-/g, '\\-')}(\\d+)`]
          );
          const seqNum = (seqResult.rows[0]?.next_seq || 1).toString().padStart(3, '0');
          batchNumber = `${prefix}${seqNum}`;
        }

        const expiryRaw = raw.expiryDate ?? raw.expiry_date ?? null;
        const expiryDate: Date | null = expiryRaw ? new Date(expiryRaw) : null;

        if (receivedQty <= 0) continue;

        // Validate business rules
        InventoryBusinessRules.validatePositiveQuantity(receivedQty, 'goods receipt item');
        PurchaseOrderBusinessRules.validateUnitCost(unitCost);
        // Only validate against ordered quantity if this GR is linked to a PO and we have an ordered quantity reference
        if (gr.purchaseOrderId && (raw.orderedQuantity != null || raw.ordered_quantity != null)) {
          PurchaseOrderBusinessRules.validateReceivedQuantity(orderedQty, receivedQty, false);
        }
        if (expiryDate) InventoryBusinessRules.validateExpiryDate(expiryDate, false);

        // Check previous cost for alert
        const prodRes = await client.query('SELECT name, cost_price FROM products WHERE id = $1', [
          productId,
        ]);
        const previousCostNum: number = prodRes.rows.length
          ? Number(prodRes.rows[0].cost_price || 0)
          : 0;

        if (Number.isFinite(previousCostNum) && previousCostNum !== unitCost) {
          const prev = new Decimal(previousCostNum);
          const next = new Decimal(unitCost);
          const changeAmount = next.minus(prev);
          const changePct = prev.eq(0) ? new Decimal(100) : changeAmount.div(prev).times(100);
          alerts.push({
            productId,
            productName,
            previousCost: prev.toNumber(),
            newCost: next.toNumber(),
            changeAmount: changeAmount.toNumber(),
            changePercentage: changePct.toNumber(),
            batchNumber,
          });
        }

        // Create inventory batch for received quantity
        const batch = await inventoryRepository.createBatch(client as any, {
          productId,
          batchNumber,
          quantity: receivedQty,
          expiryDate,
          costPrice: unitCost,
          goodsReceiptId: gr.id,
          goodsReceiptItemId: raw.id ?? raw.itemId ?? null,
          purchaseOrderId: gr.purchaseOrderId ?? null,
          purchaseOrderItemId: poItemId ?? null,
        });

        // Record stock movement (RECEIVE)
        // Generate movement number
        const movementNumberResult = await client.query(
          `SELECT 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
           LPAD((COALESCE(MAX(CAST(SUBSTRING(movement_number FROM 10) AS INTEGER)), 0) + 1)::TEXT, 4, '0') 
           AS movement_number
           FROM stock_movements 
           WHERE movement_number LIKE 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'`
        );
        const movementNumber =
          movementNumberResult.rows[0]?.movement_number || `MOV-${new Date().getFullYear()}-0001`;

        await client.query(
          `INSERT INTO stock_movements (
            movement_number, product_id, batch_id, movement_type, quantity, unit_cost,
            reference_type, reference_id, notes, created_by_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            movementNumber,
            productId,
            batch.id,
            'GOODS_RECEIPT',
            receivedQty,
            unitCost,
            'GOODS_RECEIPT',
            gr.id,
            `GR ${grNumber || gr.id} - Batch ${batchNumber}`,
            receivedBy || null,
          ]
        );

        // Update PO item received quantity if mapped
        if (poItemId) {
          logger.info('Updating PO item received quantity', {
            poItemId,
            receivedQty,
            productId,
            productName,
          });
          await goodsReceiptRepository.updatePOItemReceivedQuantity(
            client as any,
            poItemId,
            receivedQty
          );
          logger.info('PO item received quantity updated successfully', { poItemId });
        } else {
          logger.warn('No PO item ID found for GR item', { productId, productName });
        }

        // Collect cost layer data - will be processed AFTER transaction commits
        // This avoids nested transactions which cause connection pool exhaustion and deadlocks
        costLayerData.push({
          productId,
          quantity: receivedQty,
          unitCost,
          goodsReceiptId: gr.id,
          batchNumber,
        });
      }

      // Complete the GR
      await goodsReceiptRepository.finalizeGR(client as any, id);

      // If PO fully received, mark completed
      const fully = await goodsReceiptRepository.isPOFullyReceived(
        client as any,
        gr.purchaseOrderId
      );
      if (fully) {
        await purchaseOrderRepository.updatePOStatus(
          client as any,
          gr.purchaseOrderId,
          'COMPLETED'
        );
      }

      // ============================================================
      // CREATE SUPPLIER INVOICE for payment tracking
      // This creates a payable in the supplier payments module
      // IDEMPOTENCY: Check if invoice already exists for this GR
      // ============================================================
      const totalAmount = items.reduce((sum: number, item: any) => {
        const qty = Number(item.receivedQuantity ?? item.received_quantity ?? 0);
        const cost = Number(item.unitCost ?? item.unit_cost ?? item.cost_price ?? 0);
        return sum + (qty * cost);
      }, 0);

      if (totalAmount > 0) {
        const supplierId = gr.supplierId ?? gr.supplier_id;
        const grNumber = gr.grNumber ?? gr.gr_number ?? gr.receipt_number ?? id;
        const receiptDate = gr.receiptDate ?? gr.receipt_date ?? new Date().toISOString().split('T')[0];

        // IDEMPOTENCY CHECK: Don't create duplicate invoice for same GR
        const existingInvoice = await client.query(
          `SELECT "Id" FROM supplier_invoices 
           WHERE "InternalReferenceNumber" = $1 AND deleted_at IS NULL`,
          [grNumber]
        );

        if (existingInvoice.rows.length > 0) {
          logger.info('Supplier invoice already exists for GR, skipping creation', {
            grId: id,
            grNumber,
            existingInvoiceId: existingInvoice.rows[0].Id,
          });
        } else {
          // Get supplier payment terms for due date calculation
          const supplierResult = await client.query(
            'SELECT "DefaultPaymentTerms" FROM suppliers WHERE "Id" = $1',
            [supplierId]
          );
          const paymentTermsDays = supplierResult.rows[0]?.DefaultPaymentTerms ?? 30;

          // Calculate due date based on payment terms
          const invoiceDate = new Date(receiptDate);
          const dueDate = new Date(invoiceDate);
          dueDate.setDate(dueDate.getDate() + paymentTermsDays);

          try {
            await supplierPaymentRepository.createInvoice(client as any, {
              supplierId,
              supplierInvoiceNumber: grNumber, // Use GR number as reference
              invoiceDate: invoiceDate.toISOString().split('T')[0],
              dueDate: dueDate.toISOString().split('T')[0],
              subtotal: totalAmount,
              taxAmount: 0,
              totalAmount,
              notes: `Auto-created from Goods Receipt ${grNumber}`,
            });

            logger.info('Supplier invoice created from GR', {
              grId: id,
              grNumber,
              supplierId,
              totalAmount,
            });
          } catch (invoiceError: any) {
            logger.error('Failed to create supplier invoice from GR', {
              grId: id,
              error: invoiceError.message,
            });
            // Don't fail the GR finalization if invoice creation fails
            // The invoice can be created manually
          }
        }
      }

      await client.query('COMMIT');

      // ============================================================
      // POST-COMMIT: Create cost layers and update pricing
      // Done after commit to avoid nested transactions and deadlocks
      // ============================================================
      for (const costData of costLayerData) {
        try {
          await costLayerService.createCostLayer(costData as any);
          await pricingService.onCostChange(costData.productId);
        } catch (err: any) {
          // CRITICAL: Cost layer creation failed - GR exists but cost valuation incomplete
          // This affects FIFO/AVCO costing for future sales
          logger.error('CRITICAL: Cost layer creation failed - REQUIRES MANUAL REMEDIATION', {
            grId: id,
            grNumber: gr.gr_number,
            productId: costData.productId,
            quantity: costData.quantity,
            unitCost: costData.unitCost,
            error: err.message,
            remediation: 'Manually create cost layer via system management or re-process GR',
          });
          // Note: Not throwing - GR is committed with inventory updates
          // Missing cost layer affects costing, not inventory quantity
        }
      }

      // ============================================================
      // GL POSTING: Handled by database trigger (trg_post_goods_receipt_to_ledger)
      // The trigger fires on INSERT/UPDATE and posts to ledger_transactions
      // This ensures atomicity - if GR exists, GL entry exists
      // DO NOT add glEntryService calls here - it causes duplicate entries
      // ============================================================

      // Reload completed GR outside transaction
      const finalized = await goodsReceiptRepository.getGRById(pool, id);
      return {
        ...finalized,
        costPriceChangeAlerts: alerts.length > 0 ? alerts : null,
        hasAlerts: alerts.length > 0,
        alertSummary:
          alerts.length > 0 ? `${alerts.length} product(s) with cost price changes` : null,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /** Get GR by ID */
  async getGRById(pool: Pool, id: string): Promise<any> {
    const result = await goodsReceiptRepository.getGRById(pool, id);
    if (!result) throw new Error(`Goods receipt ${id} not found`);
    return result;
  },

  /** List GRs */
  async listGRs(
    pool: Pool,
    page: number = 1,
    limit: number = 50,
    filters?: { status?: string; purchaseOrderId?: string }
  ): Promise<any> {
    return goodsReceiptRepository.listGRs(pool, page, limit, filters);
  },

  /** Update a GR item (DRAFT only) */
  async updateGRItem(
    pool: Pool,
    grId: string,
    itemId: string,
    data: UpdateGRItemData
  ): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await goodsReceiptRepository.getGRItemWithParent(client as any, itemId);
      if (!existing) throw new Error(`Goods receipt item ${itemId} not found`);
      const { item, gr } = existing as any;

      if (gr.id !== grId) throw new Error('Item does not belong to the specified goods receipt');
      if (gr.status !== 'DRAFT')
        throw new Error('Cannot update items of a finalized goods receipt');

      if (data.receivedQuantity !== undefined) {
        InventoryBusinessRules.validatePositiveQuantity(
          data.receivedQuantity,
          'goods receipt item'
        );
        PurchaseOrderBusinessRules.validateReceivedQuantity(
          item.ordered_quantity ?? item.orderedQuantity,
          data.receivedQuantity,
          false
        );
      }

      // Server-side normalization for unitCost
      let normalizedUnitCost = data.unitCost;
      if (data.unitCost !== undefined) {
        PurchaseOrderBusinessRules.validateUnitCost(data.unitCost);

        // Check if unitCost is a UoM multiple of product base cost
        const productId = item.product_id || item.productId;
        const productRes = await client.query('SELECT cost_price FROM products WHERE id = $1', [
          productId,
        ]);
        if (productRes.rows.length > 0) {
          const baseCost = Number(productRes.rows[0].cost_price || 0);
          if (baseCost > 0 && data.unitCost > 0) {
            const ratio = data.unitCost / baseCost;
            const rounded = Math.round(ratio);
            const isIntegerish = Math.abs(ratio - rounded) < 1e-6;
            if (isIntegerish && rounded >= 2 && rounded <= 200) {
              logger.info(
                `Normalizing unit cost for item ${itemId}: ${data.unitCost} → ${data.unitCost / rounded} (factor: ${rounded})`
              );
              normalizedUnitCost = data.unitCost / rounded;
            }
          }
        }
      }

      if (data.expiryDate) {
        InventoryBusinessRules.validateExpiryDate(data.expiryDate, false);
      }

      const updateData = { ...data };
      if (normalizedUnitCost !== undefined) {
        updateData.unitCost = normalizedUnitCost;
      }

      const updated = await goodsReceiptRepository.updateGRItem(client as any, itemId, updateData);
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /** Hydrate a DRAFT GR's items from its Purchase Order (for GRs created without items) */
  async hydrateFromPO(pool: Pool, grId: string): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const grResult = await goodsReceiptRepository.getGRById(client as any, grId);
      if (!grResult) throw new Error(`Goods receipt ${grId} not found`);
      const { gr, items } = grResult as any;

      if (gr.status !== 'DRAFT') {
        throw new Error('Can only hydrate items for DRAFT goods receipts');
      }

      if (Array.isArray(items) && items.length > 0) {
        // Already has items; return as-is
        await client.query('COMMIT');
        return grResult;
      }

      // Load PO with items (includes product_name alias via repository)
      const poDetail = await purchaseOrderRepository.getPOById(client as any, gr.purchaseOrderId);
      if (!poDetail) throw new Error(`Purchase order ${gr.purchaseOrderId} not found`);

      const toInsert: CreateGRItemData[] = (poDetail.items || []).map((poi: any) => ({
        goodsReceiptId: gr.id,
        poItemId: poi.id,
        productId: poi.product_id ?? poi.productId,
        productName: poi.product_name ?? poi.productName ?? 'Unknown Product',
        orderedQuantity: Number(poi.ordered_quantity ?? poi.quantity ?? 0),
        receivedQuantity: 0,
        unitCost: Number(poi.unit_price ?? poi.unitCost ?? 0),
        batchNumber: null,
        expiryDate: null,
      }));

      if (toInsert.length === 0) {
        await client.query('COMMIT');
        return { gr, items: [] };
      }

      await goodsReceiptRepository.addGRItems(client as any, toInsert);

      await client.query('COMMIT');
      const refreshed = await goodsReceiptRepository.getGRById(pool, grId);
      return refreshed as any;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};
