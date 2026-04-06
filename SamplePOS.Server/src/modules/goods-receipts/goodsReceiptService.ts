import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { Money } from '../../utils/money.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import {
  goodsReceiptRepository,
  CreateGRData,
  CreateGRItemData,
  UpdateGRItemData,
  GoodsReceipt,
  GoodsReceiptItem,
} from './goodsReceiptRepository.js';
import { purchaseOrderRepository } from '../purchase-orders/purchaseOrderRepository.js';
import { inventoryRepository } from '../inventory/inventoryRepository.js';
import * as supplierPaymentRepository from '../supplier-payments/supplierPaymentRepository.js';
import * as costLayerService from '../../services/costLayerService.js';
import * as pricingService from '../../services/pricingService.js';
import * as glEntryService from '../../services/glEntryService.js';
import * as supplierProductPriceRepository from '../suppliers/supplierProductPriceRepository.js';
import { recalculateOutstandingBalance as recalcSupplierBalance } from '../suppliers/supplierRepository.js';
import { batchFetchProducts, type ProductBatchRow } from '../../db/batchFetch.js';
import logger from '../../utils/logger.js';
import * as documentFlowService from '../document-flow/documentFlowService.js';
import {
  InventoryBusinessRules,
  PurchaseOrderBusinessRules,
} from '../../middleware/businessRules.js';
import type { DuplicateStrategy } from '../../../../shared/zod/importSchemas.js';

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

// Service return types — proper contracts, no `any`
export interface CreateGRResult {
  gr: GoodsReceipt;
  items: GoodsReceiptItem[];
  manualPO?: {
    id: string;
    poNumber: string;
    supplierId: string;
    status: string;
    totalAmount: number;
  };
}

export interface FinalizeGRResult {
  gr: GoodsReceipt;
  items: GoodsReceiptItem[];
  costPriceChangeAlerts: CostPriceChangeAlert[] | null;
  hasAlerts: boolean;
  alertSummary: string | null;
  warnings?: string[];
}

export interface ListGRsResult {
  grs: GoodsReceipt[];
  total: number;
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
        expiryDate?: string | null;
      }>;
    }
  ): Promise<CreateGRResult> {
    const txResult = await UnitOfWork.run(pool, async (client) => {
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
        const poResult = await purchaseOrderRepository.createManualPO(client, {
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
      const gr = await goodsReceiptRepository.createGR(client, {
        purchaseOrderId: purchaseOrderId,
        receiptDate: data.receiptDate,
        notes: data.notes ?? null,
        receivedBy: data.receivedBy,
        source: data.supplierId && !data.purchaseOrderId ? 'MANUAL' : 'PURCHASE_ORDER',
      });

      // Validate and insert items
      const itemsToInsert: CreateGRItemData[] = [];

      // ========== BATCH PRE-FETCH (N+1 elimination) ==========
      const grProductIds = data.items.map((it) => it.productId);
      const grProductsMap = await batchFetchProducts(client, grProductIds);

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
        // Uses pre-fetched product data instead of per-item query
        // All arithmetic via Decimal to avoid floating-point precision loss (Tally/SAP pattern)
        const productData = grProductsMap.get(it.productId);
        if (productData) {
          const baseCostDec = Money.parseDb(productData.cost_price);
          const unitCostDec = new Decimal(unitCost);
          if (baseCostDec.greaterThan(0) && unitCostDec.greaterThan(0)) {
            const ratio = unitCostDec.dividedBy(baseCostDec);
            const rounded = ratio.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
            const isIntegerish = ratio.minus(rounded).abs().lessThan('1e-6');
            if (isIntegerish && rounded.gte(2) && rounded.lte(200)) {
              const normalizedCost = unitCostDec.dividedBy(rounded);
              logger.info(
                `Normalizing unit cost for ${it.productName}: ${unitCost} → ${Money.toNumber(normalizedCost)} (factor: ${rounded})`
              );
              unitCost = Money.toNumber(normalizedCost);
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
          if (productData && productData.cost_price) {
            const costVariance = PurchaseOrderBusinessRules.validateCostVariance(
              Money.parseDb(productData.cost_price).toNumber(),
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
            expiryDate: expiry,
          });

          // BR-INV-008: Reject short expiry items
          InventoryBusinessRules.validateShortExpiry(expiry, 7);
          logger.info('BR-INV-008: Short expiry validation passed');

          // BR-INV-007: Warn if expiring soon
          const expiryWarning = InventoryBusinessRules.validateExpiryWarning(expiry, 30);
          if (expiryWarning) {
            logger.warn('BR-INV-007: Item expiring within 30 days', {
              productName: it.productName,
              expiryDate: expiry,
            });
          }

          // BR-INV-010: Check batch expiry sequence
          await InventoryBusinessRules.validateBatchExpirySequence(client, it.productId, expiry);
        }

        // BR-PO-010: Validate batch number uniqueness
        if (it.batchNumber) {
          await PurchaseOrderBusinessRules.validateBatchNumber(
            client,
            it.productId,
            it.batchNumber
          );
        }

        // BR-INV-009: Check if receiving would exceed max stock
        await InventoryBusinessRules.validateMaxStockLevel(client, it.productId, receivedQty);

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

      const items = await goodsReceiptRepository.addGRItems(client, itemsToInsert);

      // Document Flow: PO → Goods Receipt
      if (purchaseOrderId) {
        await documentFlowService.linkDocuments(client, 'PURCHASE_ORDER', purchaseOrderId, 'GOODS_RECEIPT', gr.id, 'FULFILLS');
      }

      return {
        grId: gr.id,
        manualPOData: manualPO
          ? {
            id: manualPO.id,
            poNumber: manualPO.poNumber,
            supplierId: manualPO.supplierId,
            status: manualPO.status,
            totalAmount: manualPO.totalAmount,
          }
          : undefined,
      };
    });

    // Return via repository to include joins/aliases if needed
    const full = await goodsReceiptRepository.getGRById(pool, txResult.grId);
    if (!full) throw new Error(`Goods receipt ${txResult.grId} not found after creation`);

    return {
      gr: full.gr,
      items: full.items,
      manualPO: txResult.manualPOData,
    };
  },

  // Finalize a goods receipt: create batches, stock movements, cost layers, pricing updates
  async finalizeGR(pool: Pool, id: string): Promise<FinalizeGRResult> {
    const { alerts, warnings } = await UnitOfWork.run(pool, async (client) => {
      const warnings: string[] = [];

      const grResult = await goodsReceiptRepository.getGRById(client, id);
      if (!grResult) throw new Error(`Goods receipt ${id} not found`);

      const { gr, items } = grResult;

      // Lock the GR row to prevent double-finalization by concurrent requests
      await client.query(`SELECT id FROM goods_receipts WHERE id = $1 FOR UPDATE`, [id]);

      // High-level validations before side effects
      if (gr.status === 'COMPLETED') throw new Error('Goods receipt is already completed');

      // Must have items
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Cannot finalize a goods receipt with no items');
      }

      // Every item must have positive received quantity (no zero or negative lines)
      const nonPositiveLines = items
        .map((item) => ({
          name: item.productName ?? 'Unknown product',
          qty: Money.parseDb(item.receivedQuantity).toNumber(),
        }))
        .filter((x) => !Number.isFinite(x.qty) || x.qty <= 0);
      if (nonPositiveLines.length > 0) {
        const names = nonPositiveLines.map((x) => x.name).join(', ');
        throw new Error(`All items must have received quantity > 0. Fix: ${names}`);
      }

      // Collect per-item validation errors (do not mutate state yet)
      const preValidationErrors: string[] = [];
      for (const item of items) {
        const productName: string = item.productName ?? 'Unknown product';
        const receivedQty: number = Money.parseDb(item.receivedQuantity).toNumber();
        const unitCost: number = Money.parseDb(item.unitCost).toNumber();
        const expiryDate: string | null = item.expiryDate || null;

        if (receivedQty <= 0)
          preValidationErrors.push(`${productName}: received quantity must be greater than 0`);
        if (!Number.isFinite(unitCost) || unitCost < 0)
          preValidationErrors.push(`${productName}: unit cost cannot be negative`);
        if (expiryDate && expiryDate < new Date().toLocaleDateString('en-CA'))
          preValidationErrors.push(`${productName}: expiry date cannot be in the past`);
      }

      if (preValidationErrors.length > 0) {
        throw new Error(`Validation failed: ${preValidationErrors.join('; ')}`);
      }

      const grNumber: string = gr.grNumber ?? '';
      const receivedBy: string = gr.receivedBy ?? '';

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

      // Tell the fn_log_stock_movement trigger to skip — the app code below
      // already creates proper MOV- stock movements alongside batch inserts.
      // Without this guard the trigger creates duplicate SM- movements for each batch INSERT.
      await client.query("SET LOCAL app.skip_stock_movement_trigger = 'true'");

      for (const item of items) {
        const productId: string = item.productId;
        const productName: string = item.productName;
        const poItemId: string | null = item.poItemId ?? null;
        const orderedQty: number = Money.parseDb(item.orderedQuantity).toNumber();
        const receivedQty: number = Money.parseDb(item.receivedQuantity).toNumber();
        const unitCost: number = Money.parseDb(item.unitCost).toNumber();
        const isBonus: boolean = !!item.isBonus;

        // Bonus stock: cost recorded as 0 for inventory batches (free goods from supplier)
        const effectiveCost: number = isBonus ? 0 : unitCost;

        // Generate human-readable batch number: BATCH-YYYYMMDD-001
        let batchNumber: string = item.batchNumber ?? '';
        if (!batchNumber) {
          const today = new Date();
          const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
          const prefix = `BATCH-${dateStr}-`;

          // Single atomic query to get next sequence number
          // Extract numeric suffix and find max, then add 1
          // Advisory lock prevents concurrent duplicate batch number generation
          await client.query(`SELECT pg_advisory_xact_lock(hashtext('batch_number_seq'))`);
          const seqResult = await client.query(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(batch_number FROM $2) AS INTEGER)), 0) + 1 AS next_seq
             FROM inventory_batches 
             WHERE batch_number LIKE $1`,
            [`${prefix}%`, `${prefix.replace(/-/g, '\\-')}(\\d+)`]
          );
          const seqNum = (seqResult.rows[0]?.next_seq || 1).toString().padStart(3, '0');
          batchNumber = `${prefix}${seqNum}`;
        }

        const expiryDate: string | null = item.expiryDate || null;

        if (receivedQty <= 0) continue;

        // Validate business rules
        InventoryBusinessRules.validatePositiveQuantity(receivedQty, 'goods receipt item');
        PurchaseOrderBusinessRules.validateUnitCost(unitCost);
        // Only validate against ordered quantity if this GR is linked to a PO and we have an ordered quantity reference
        if (gr.purchaseOrderId && item.orderedQuantity != null) {
          PurchaseOrderBusinessRules.validateReceivedQuantity(orderedQty, receivedQty, false);
        }
        if (expiryDate) InventoryBusinessRules.validateExpiryDate(expiryDate, false);

        // Check previous cost for alert
        const prodRes = await client.query(
          'SELECT p.name, pv.cost_price FROM products p LEFT JOIN product_valuation pv ON pv.product_id = p.id WHERE p.id = $1',
          [productId]
        );
        const previousCostNum: number = prodRes.rows.length
          ? Money.parseDb(prodRes.rows[0].cost_price).toNumber()
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
        const batch = await inventoryRepository.createBatch(client, {
          productId,
          batchNumber,
          quantity: receivedQty,
          expiryDate,
          costPrice: effectiveCost,
          goodsReceiptId: gr.id,
          goodsReceiptItemId: item.id ?? null,
          purchaseOrderId: gr.purchaseOrderId ?? null,
          purchaseOrderItemId: poItemId ?? null,
          isBonus,
        });

        // App-layer sync: update BOTH product_inventory and products.quantity_on_hand
        await client.query(
          `WITH new_qty AS (
             SELECT COALESCE(SUM(remaining_quantity), 0) AS qty
             FROM inventory_batches
             WHERE product_id = $1 AND status = 'ACTIVE'
           ), upd_pi AS (
             UPDATE product_inventory
             SET quantity_on_hand = (SELECT qty FROM new_qty),
                 updated_at = CURRENT_TIMESTAMP
             WHERE product_id = $1
           )
           UPDATE products
           SET quantity_on_hand = (SELECT qty FROM new_qty),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [productId]
        );

        // Record stock movement (RECEIVE)
        // Generate movement number
        // Advisory lock prevents concurrent duplicate movement number generation
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('movement_number_seq'))`);
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
            effectiveCost,
            'GOODS_RECEIPT',
            gr.id,
            `GR ${grNumber || gr.id} - Batch ${batchNumber}${isBonus ? ' (BONUS)' : ''}`,
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
          await goodsReceiptRepository.updatePOItemReceivedQuantity(client, poItemId, receivedQty);
          logger.info('PO item received quantity updated successfully', { poItemId });
        } else {
          logger.warn('No PO item ID found for GR item', { productId, productName });
        }

        // Collect cost layer data - will be processed AFTER transaction commits
        // This avoids nested transactions which cause connection pool exhaustion and deadlocks
        // Skip cost layers for bonus items (cost = 0, no cost valuation impact)
        if (!isBonus) {
          costLayerData.push({
            productId,
            quantity: receivedQty,
            unitCost: effectiveCost,
            goodsReceiptId: gr.id,
            batchNumber,
          });
        }
      }

      // ============================================================
      // SUPPLIER PRICE TRACKING
      // Auto-update supplier_product_prices for each product received
      // ============================================================
      const supplierId = gr.supplierId ?? null;
      const receiptDateStr: string = gr.receivedDate ?? '';
      if (supplierId) {
        for (const item of items) {
          // Only track non-bonus items for price history (bonus = free goods, not real pricing)
          if (!item.isBonus && Money.parseDb(item.unitCost).toNumber() > 0) {
            try {
              await supplierProductPriceRepository.upsertSupplierPrice(
                client,
                supplierId,
                item.productId,
                Money.parseDb(item.unitCost).toNumber(),
                receiptDateStr || null
              );
            } catch (priceErr: unknown) {
              const errMsg = priceErr instanceof Error ? priceErr.message : String(priceErr);
              logger.warn('Failed to track supplier price (non-fatal)', {
                supplierId,
                productId: item.productId,
                error: errMsg,
              });
            }
          }
        }
      }

      // Complete the GR
      await goodsReceiptRepository.finalizeGR(client, id);

      // If PO fully received, mark completed
      const fully = await goodsReceiptRepository.isPOFullyReceived(client, gr.purchaseOrderId);
      if (fully) {
        await purchaseOrderRepository.updatePOStatus(client, gr.purchaseOrderId, 'COMPLETED');
      }

      // ============================================================
      // CREATE SUPPLIER INVOICE for payment tracking
      // This creates a payable in the supplier payments module
      // IDEMPOTENCY: Check if invoice already exists for this GR
      // ============================================================
      const totalAmountDec = items.reduce((sum: Decimal, item: GoodsReceiptItem) => {
        if (item.isBonus) return sum; // Bonus items are free, excluded from invoice
        const qty = new Decimal(String(item.receivedQuantity ?? 0));
        const cost = new Decimal(String(item.unitCost ?? 0));
        return sum.plus(qty.times(cost));
      }, new Decimal(0));
      const totalAmount = Money.toNumber(totalAmountDec);

      if (totalAmount > 0 && supplierId) {
        const invoiceGrNumber = grNumber || id;
        const invoiceReceiptDate: string = receiptDateStr;

        // IDEMPOTENCY CHECK: Don't create duplicate invoice for same GR
        const existingInvoice = await client.query(
          `SELECT "Id" FROM supplier_invoices 
           WHERE "InternalReferenceNumber" = $1 AND deleted_at IS NULL`,
          [invoiceGrNumber]
        );

        if (existingInvoice.rows.length > 0) {
          logger.info('Supplier invoice already exists for GR, skipping creation', {
            grId: id,
            grNumber: invoiceGrNumber,
            existingInvoiceId: existingInvoice.rows[0].Id,
          });
        } else {
          // Get supplier payment terms for due date calculation
          const supplierResult = await client.query(
            'SELECT "DefaultPaymentTerms" FROM suppliers WHERE "Id" = $1',
            [supplierId]
          );
          const paymentTermsDays = supplierResult.rows[0]?.DefaultPaymentTerms ?? 30;

          // Calculate invoice date and due date using SQL for timezone safety
          // Avoids JS Date object construction which violates timezone strategy
          const dateCalcResult = await client.query(
            `SELECT 
               COALESCE($1::date, CURRENT_DATE)::text as invoice_date,
               (COALESCE($1::date, CURRENT_DATE) + ($2 || ' days')::interval)::date::text as due_date`,
            [invoiceReceiptDate || null, paymentTermsDays]
          );
          const invoiceDateStr = dateCalcResult.rows[0].invoice_date;
          const dueDateStr = dateCalcResult.rows[0].due_date;

          try {
            const createdInvoice = await supplierPaymentRepository.createInvoice(client, {
              supplierId,
              supplierInvoiceNumber: invoiceGrNumber, // Use GR number as reference
              invoiceDate: invoiceDateStr,
              dueDate: dueDateStr,
              subtotal: totalAmount,
              taxAmount: 0,
              totalAmount,
              notes: `Auto-created from Goods Receipt ${invoiceGrNumber}`,
            });

            // Insert line items from GR items into the invoice
            const invoiceLineItems = items
              .filter((lineItem) => Money.parseDb(lineItem.receivedQuantity).toNumber() > 0)
              .map((lineItem) => ({
                productId: lineItem.productId,
                productName: lineItem.productName ?? 'Unknown product',
                description: `From GR ${invoiceGrNumber}`,
                quantity: Money.parseDb(lineItem.receivedQuantity).toNumber(),
                unitOfMeasure: 'EA',
                unitCost: Money.parseDb(lineItem.unitCost).toNumber(),
                taxRate: 0,
                taxAmount: 0,
              }));

            if (invoiceLineItems.length > 0) {
              await supplierPaymentRepository.createInvoiceLineItems(
                client,
                createdInvoice.id,
                invoiceLineItems
              );
            }

            logger.info('Supplier invoice created from GR with line items', {
              grId: id,
              grNumber: invoiceGrNumber,
              supplierId,
              totalAmount,
              lineItemCount: invoiceLineItems.length,
            });
          } catch (invoiceError: unknown) {
            const errMsg =
              invoiceError instanceof Error ? invoiceError.message : String(invoiceError);
            logger.error('Failed to create supplier invoice from GR', {
              grId: id,
              error: errMsg,
            });
            // Don't fail the GR finalization if invoice creation fails
            // The invoice can be created manually
            warnings.push(
              `Supplier invoice creation failed: ${errMsg}. AP tracking requires manual action.`
            );
          }
        }
      }

      // ============================================================
      // PRE-COMMIT: Create cost layers and update pricing
      // Must run inside transaction for atomicity with inventory changes
      // ============================================================
      for (const costData of costLayerData) {
        try {
          await costLayerService.createCostLayer(costData, undefined, client);
          await pricingService.onCostChange(costData.productId, pool);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          // CRITICAL: Cost layer creation failed - GR exists but cost valuation incomplete
          // This affects FIFO/AVCO costing for future sales
          logger.error('CRITICAL: Cost layer creation failed - REQUIRES MANUAL REMEDIATION', {
            grId: id,
            grNumber,
            productId: costData.productId,
            quantity: costData.quantity,
            unitCost: costData.unitCost,
            error: errMsg,
            remediation: 'Manually create cost layer via system management or re-process GR',
          });
          warnings.push(
            `Cost layer creation failed for product ${costData.productId}: ${errMsg}. Manual remediation required.`
          );
          // Note: Not throwing - cost layer failure should not block GR
          // Missing cost layer affects costing, not inventory quantity
        }
      }

      // ============================================================
      // SUPPLIER BALANCE: Recalculate from source (Odoo compute pattern)
      // Replaces trg_sync_supplier_on_gr_complete / trg_sync_supplier_balance_on_gr
      // ============================================================
      if (supplierId) {
        await recalcSupplierBalance(client, supplierId);
      }

      return { alerts, warnings };
    });

    // ============================================================
    // GL POSTING: Application-layer double-entry (replaces database trigger)
    // Post goods receipt: DR Inventory (1300), CR Accounts Payable (2100)
    // Runs AFTER transaction commits to use finalized data.
    // ============================================================
    // Reload completed GR outside transaction
    const finalized = await goodsReceiptRepository.getGRById(pool, id);
    if (!finalized) throw new Error(`Goods receipt ${id} not found after finalization`);

    // Calculate total value from finalized items (exclude bonus items)
    const grTotalValue = finalized.items.reduce((sum: Decimal, item: GoodsReceiptItem) => {
      if (item.isBonus) return sum;
      const qty = new Decimal(String(item.receivedQuantity ?? 0));
      const cost = new Decimal(String(item.unitCost ?? 0));
      return sum.plus(qty.times(cost));
    }, new Decimal(0));
    const grTotalNum = Money.toNumber(grTotalValue);

    if (grTotalNum > 0) {
      try {
        // Get supplier name for GL description
        const supplierRes = await pool.query(
          'SELECT "CompanyName" FROM suppliers WHERE "Id" = $1',
          [finalized.gr.supplierId]
        );
        const supplierName = supplierRes.rows[0]?.CompanyName || 'Unknown Supplier';

        await glEntryService.recordGoodsReceiptToGL(
          {
            grId: id,
            grNumber: finalized.gr.grNumber || id,
            grDate: finalized.gr.receivedDate || new Date().toLocaleDateString('en-CA'),
            totalAmount: grTotalNum,
            supplierId: finalized.gr.supplierId || '',
            supplierName,
            poNumber: finalized.gr.purchaseOrderId || undefined,
          },
          pool
        );
      } catch (glError: unknown) {
        logger.error('GL posting failed for goods receipt — will propagate error', {
          grId: id,
          error: glError instanceof Error ? glError.message : String(glError),
        });
        throw glError;
      }
    }
    return {
      gr: finalized.gr,
      items: finalized.items,
      costPriceChangeAlerts: alerts.length > 0 ? alerts : null,
      hasAlerts: alerts.length > 0,
      alertSummary:
        alerts.length > 0 ? `${alerts.length} product(s) with cost price changes` : null,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  },

  /** Get GR by ID */
  async getGRById(
    pool: Pool,
    id: string
  ): Promise<{ gr: GoodsReceipt; items: GoodsReceiptItem[]; productUomsMap?: Record<string, unknown[]> }> {
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
  ): Promise<ListGRsResult> {
    return goodsReceiptRepository.listGRs(pool, page, limit, filters);
  },

  /** Update a GR item (DRAFT only) */
  async updateGRItem(
    pool: Pool,
    grId: string,
    itemId: string,
    data: UpdateGRItemData
  ): Promise<GoodsReceiptItem> {
    return UnitOfWork.run(pool, async (client) => {
      const existing = await goodsReceiptRepository.getGRItemWithParent(client, itemId);
      if (!existing) throw new Error(`Goods receipt item ${itemId} not found`);
      const { item, gr } = existing;

      if (gr.id !== grId) throw new Error('Item does not belong to the specified goods receipt');
      if (gr.status !== 'DRAFT')
        throw new Error('Cannot update items of a finalized goods receipt');

      if (data.receivedQuantity !== undefined) {
        InventoryBusinessRules.validatePositiveQuantity(
          data.receivedQuantity,
          'goods receipt item'
        );
        // Only validate against ordered quantity when GR is linked to a PO and we have PO-sourced orderedQuantity
        const orderedQty = Money.parseDb(item.orderedQuantity).toNumber();
        if (gr.purchaseOrderId && orderedQty > 0) {
          PurchaseOrderBusinessRules.validateReceivedQuantity(
            orderedQty,
            data.receivedQuantity,
            false
          );
        }
      }

      // Server-side normalization for unitCost
      let normalizedUnitCost = data.unitCost;
      if (data.unitCost !== undefined) {
        PurchaseOrderBusinessRules.validateUnitCost(data.unitCost);

        // Check if unitCost is a UoM multiple of product base cost
        const productId = item.productId;
        const productRes = await client.query(
          'SELECT cost_price FROM product_valuation WHERE product_id = $1',
          [productId]
        );
        if (productRes.rows.length > 0) {
          const baseCostDec = Money.parseDb(productRes.rows[0].cost_price);
          const unitCostDec = new Decimal(data.unitCost);
          if (baseCostDec.greaterThan(0) && unitCostDec.greaterThan(0)) {
            const ratio = unitCostDec.dividedBy(baseCostDec);
            const rounded = ratio.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
            const isIntegerish = ratio.minus(rounded).abs().lessThan('1e-6');
            if (isIntegerish && rounded.gte(2) && rounded.lte(200)) {
              const normalizedCost = unitCostDec.dividedBy(rounded);
              logger.info(
                `Normalizing unit cost for item ${itemId}: ${data.unitCost} → ${Money.toNumber(normalizedCost)} (factor: ${rounded})`
              );
              normalizedUnitCost = Money.toNumber(normalizedCost);
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

      const updated = await goodsReceiptRepository.updateGRItem(client, itemId, updateData);
      return updated;
    });
  },

  /**
   * Batch update multiple GR items in a single transaction (DRAFT only).
   * Replaces N parallel PUT requests with one.
   */
  async batchUpdateGRItems(
    pool: Pool,
    grId: string,
    items: Array<{
      itemId: string;
      receivedQuantity?: number;
      unitCost?: number;
      batchNumber?: string | null;
      isBonus?: boolean;
      expiryDate?: string | null;
    }>
  ): Promise<GoodsReceiptItem[]> {
    return UnitOfWork.run(pool, async (client) => {
      // Verify GR exists and is DRAFT (one query for the whole batch)
      const grResult = await goodsReceiptRepository.getGRById(client, grId);
      if (!grResult) throw new Error(`Goods receipt ${grId} not found`);
      const { gr, items: existingItems } = grResult;

      if (gr.status !== 'DRAFT')
        throw new Error('Cannot update items of a finalized goods receipt');

      // Build lookup for existing items
      const itemMap = new Map(existingItems.map((it: GoodsReceiptItem) => [it.id, it]));

      // Batch-fetch product valuations for cost normalization
      const productIds = [...new Set(existingItems.map((it: GoodsReceiptItem) => it.productId))];
      const valuationRes = await client.query(
        'SELECT product_id, cost_price FROM product_valuation WHERE product_id = ANY($1)',
        [productIds]
      );
      const valuationMap = new Map(
        valuationRes.rows.map((r: { product_id: string; cost_price: string }) => [r.product_id, r.cost_price])
      );

      const results: GoodsReceiptItem[] = [];

      for (const update of items) {
        const existing = itemMap.get(update.itemId);
        if (!existing) throw new Error(`Goods receipt item ${update.itemId} not found in GR ${grId}`);

        // Validate receivedQuantity
        if (update.receivedQuantity !== undefined) {
          InventoryBusinessRules.validatePositiveQuantity(update.receivedQuantity, 'goods receipt item');
          const orderedQty = Money.parseDb(existing.orderedQuantity).toNumber();
          if (gr.purchaseOrderId && orderedQty > 0) {
            PurchaseOrderBusinessRules.validateReceivedQuantity(orderedQty, update.receivedQuantity, false);
          }
        }

        // Cost normalization
        let normalizedUnitCost = update.unitCost;
        if (update.unitCost !== undefined) {
          PurchaseOrderBusinessRules.validateUnitCost(update.unitCost);
          const baseCostStr = valuationMap.get(existing.productId);
          if (baseCostStr) {
            const baseCostDec = Money.parseDb(baseCostStr);
            const unitCostDec = new Decimal(update.unitCost);
            if (baseCostDec.greaterThan(0) && unitCostDec.greaterThan(0)) {
              const ratio = unitCostDec.dividedBy(baseCostDec);
              const rounded = ratio.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
              const isIntegerish = ratio.minus(rounded).abs().lessThan('1e-6');
              if (isIntegerish && rounded.gte(2) && rounded.lte(200)) {
                normalizedUnitCost = Money.toNumber(unitCostDec.dividedBy(rounded));
              }
            }
          }
        }

        if (update.expiryDate) {
          InventoryBusinessRules.validateExpiryDate(update.expiryDate, false);
        }

        const data: UpdateGRItemData = {};
        if (update.receivedQuantity !== undefined) data.receivedQuantity = update.receivedQuantity;
        if (normalizedUnitCost !== undefined) data.unitCost = normalizedUnitCost;
        if (update.batchNumber !== undefined) data.batchNumber = update.batchNumber ?? undefined;
        if (update.expiryDate !== undefined) data.expiryDate = update.expiryDate ?? undefined;
        if (update.isBonus !== undefined) data.isBonus = update.isBonus;

        // Only update if there's something to change
        if (Object.keys(data).length > 0) {
          const updated = await goodsReceiptRepository.updateGRItem(client, update.itemId, data);
          results.push(updated);
        }
      }

      return results;
    });
  },

  /** Hydrate a DRAFT GR's items from its Purchase Order (for GRs created without items) */
  async hydrateFromPO(
    pool: Pool,
    grId: string
  ): Promise<{ gr: GoodsReceipt; items: GoodsReceiptItem[] }> {
    await UnitOfWork.run(pool, async (client) => {
      const grResult = await goodsReceiptRepository.getGRById(client, grId);
      if (!grResult) throw new Error(`Goods receipt ${grId} not found`);
      const { gr, items } = grResult;

      if (gr.status !== 'DRAFT') {
        throw new Error('Can only hydrate items for DRAFT goods receipts');
      }

      if (Array.isArray(items) && items.length > 0) {
        // Already has items; nothing to do
        return;
      }

      // Load PO with items (includes product_name alias via repository)
      // NOTE: PO items use `SELECT *` which returns snake_case — defensive fallbacks required
      const poDetail = await purchaseOrderRepository.getPOById(client, gr.purchaseOrderId);
      if (!poDetail) throw new Error(`Purchase order ${gr.purchaseOrderId} not found`);

      interface POItemRow {
        id: string;
        product_id?: string;
        productId?: string;
        product_name?: string;
        productName?: string;
        ordered_quantity?: number;
        quantity?: number;
        unit_price?: number;
        unitCost?: number;
      }

      const toInsert: CreateGRItemData[] = ((poDetail.items || []) as POItemRow[]).map((poi) => ({
        goodsReceiptId: gr.id,
        poItemId: poi.id,
        productId: poi.product_id ?? poi.productId ?? '',
        productName: poi.product_name ?? poi.productName ?? 'Unknown Product',
        orderedQuantity: Money.parseDb(poi.ordered_quantity ?? poi.quantity).toNumber(),
        receivedQuantity: 0,
        unitCost: Money.parseDb(poi.unit_price ?? poi.unitCost).toNumber(),
        batchNumber: null,
        expiryDate: null,
      }));

      if (toInsert.length === 0) {
        return;
      }

      await goodsReceiptRepository.addGRItems(client, toInsert);
    });

    const refreshed = await goodsReceiptRepository.getGRById(pool, grId);
    if (!refreshed) throw new Error(`Goods receipt ${grId} not found after hydration`);
    return refreshed;
  },

  // ════════════════════════════════════════════════════════════
  // OPENING BALANCE GRN — ERP Opening Inventory (SAP MB1C / Odoo Adjustment)
  // ════════════════════════════════════════════════════════════

  /**
   * Create an Opening Balance Goods Receipt for imported inventory.
   *
   * Per SAP/Odoo/Tally/QuickBooks best practices, opening stock enters the
   * system through a formal Goods Receipt document with a complete audit trail:
   *   - Inventory batch (FEFO-compatible, source_type = OPENING_BALANCE)
   *   - Stock movement (OPENING_BALANCE type)
   *   - Cost layer (FIFO/AVCO)
   *   - GL journal entry: DR Inventory (1300) / CR Opening Balance Equity (3050)
   *
   * For UPDATE re-imports, computes the VALUE delta (handles qty + cost changes)
   * per SAP revaluation pattern — GL reflects economic change, not absolute qty.
   *
   * @param pool - Database connection pool
   * @param items - Products with inventory data (qty > 0)
   * @param userId - User performing the import
   * @param duplicateStrategy - Controls batch upsert behavior (UPDATE = idempotent)
   */
  async createOpeningBalanceGRN(
    pool: Pool,
    items: Array<{
      productId: string;
      productName: string;
      sku: string;
      quantity: number;
      costPrice: number;
      batchNumber?: string;
      expiryDate?: string | null;
    }>,
    userId: string,
    duplicateStrategy: DuplicateStrategy = 'UPDATE'
  ): Promise<{
    grId: string;
    grNumber: string;
    stockMovements: Array<{
      movementId: string;
      movementNumber: string;
      productId: string;
      quantity: number;
      unitCost: number;
      movementValue: number;
    }>;
    warnings: string[];
  }> {
    if (items.length === 0) {
      return { grId: '', grNumber: '', stockMovements: [], warnings: [] };
    }

    const warnings: string[] = [];
    const stockMovements: Array<{
      movementId: string;
      movementNumber: string;
      productId: string;
      batchNumber: string;
      quantity: number;
      unitCost: number;
      movementValue: number;
    }> = [];
    const costLayerData: Array<{
      productId: string;
      quantity: number;
      unitCost: number;
      goodsReceiptId: string;
      batchNumber: string;
    }> = [];

    const { grId, grNumber } = await UnitOfWork.run(pool, async (client) => {
      // Tell app.skip_stock_movement_trigger — we create movements explicitly
      await client.query("SET LOCAL app.skip_stock_movement_trigger = 'true'");

      // Create GR header (COMPLETED — no draft→finalize cycle for imports)
      const gr = await goodsReceiptRepository.createGR(client, {
        purchaseOrderId: null,
        receiptDate: new Date().toLocaleDateString('en-CA'),
        notes: 'Opening Inventory Import',
        receivedBy: userId,
        source: 'OPENING_BALANCE',
      });

      // Immediately finalize
      await goodsReceiptRepository.finalizeGR(client, gr.id);

      // For UPDATE re-imports, capture existing batch state for delta calculation
      const existingBatchState = new Map<string, { qty: number; cost: number }>();
      if (duplicateStrategy === 'UPDATE') {
        const batchKeys = items.map((it) => ({
          productId: it.productId,
          batchNumber:
            it.batchNumber ||
            `IMP-INIT-${it.sku.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40)}`,
        }));
        const pids = batchKeys.map((k) => k.productId);
        const bns = batchKeys.map((k) => k.batchNumber);
        const existingResult = await client.query(
          `SELECT product_id, batch_number, remaining_quantity, cost_price
           FROM inventory_batches
           WHERE (product_id, batch_number) IN (
             SELECT UNNEST($1::uuid[]), UNNEST($2::text[])
           )`,
          [pids, bns]
        );
        for (const row of existingResult.rows) {
          const key = `${row.product_id}|${row.batch_number}`;
          existingBatchState.set(key, {
            qty: Money.parseDb(row.remaining_quantity).toNumber(),
            cost: Money.parseDb(row.cost_price).toNumber(),
          });
        }
      }

      // Process each item: batch → movement → qty update → cost layer data
      for (const item of items) {
        const batchNumber =
          item.batchNumber ||
          `IMP-INIT-${item.sku.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40)}`;

        // Upsert batch
        const batchConflict =
          duplicateStrategy === 'UPDATE'
            ? `ON CONFLICT (product_id, batch_number) DO UPDATE SET
                quantity = EXCLUDED.quantity,
                remaining_quantity = EXCLUDED.remaining_quantity,
                cost_price = EXCLUDED.cost_price,
                expiry_date = COALESCE(EXCLUDED.expiry_date, inventory_batches.expiry_date)`
            : `ON CONFLICT (product_id, batch_number) DO NOTHING`;

        const batchResult = await client.query(
          `INSERT INTO inventory_batches (
            product_id, batch_number, quantity, remaining_quantity,
            cost_price, expiry_date, source_type, goods_receipt_id
          ) VALUES ($1, $2, $3, $4, $5, $6, 'OPENING_BALANCE', $7)
          ${batchConflict}
          RETURNING id, remaining_quantity, cost_price`,
          [
            item.productId,
            batchNumber,
            item.quantity,
            item.quantity,
            item.costPrice,
            item.expiryDate || null,
            gr.id,
          ]
        );

        if (batchResult.rows.length === 0) continue; // Skipped by DO NOTHING

        const batch = batchResult.rows[0];
        const batchQty = Money.parseDb(batch.remaining_quantity).toNumber();
        const batchCost = Money.parseDb(batch.cost_price).toNumber();

        // Compute value delta for GL posting
        const existingKey = `${item.productId}|${batchNumber}`;
        const oldState = existingBatchState.get(existingKey);
        const oldQty = oldState?.qty ?? 0;
        const oldCost = oldState?.cost ?? 0;

        const oldValue = Money.lineTotal(oldQty, oldCost);
        const newValue = Money.lineTotal(batchQty, batchCost);
        const valueDelta = Money.toNumber(newValue.minus(oldValue));

        if (valueDelta === 0) continue; // No economic change (identical re-import)

        const qtyDelta = batchQty - oldQty;

        // Generate movement number (app-layer, advisory lock)
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('movement_number_seq'))`);
        const movNumResult = await client.query(
          `SELECT 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
           LPAD((COALESCE(MAX(CAST(SUBSTRING(movement_number FROM 10) AS INTEGER)), 0) + 1)::TEXT, 4, '0') 
           AS movement_number
           FROM stock_movements 
           WHERE movement_number LIKE 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'`
        );
        const movementNumber =
          movNumResult.rows[0]?.movement_number || `MOV-${new Date().getFullYear()}-0001`;

        // Create stock movement
        const smResult = await client.query(
          `INSERT INTO stock_movements (
            movement_number, product_id, batch_id, movement_type, quantity, unit_cost,
            reference_type, reference_id, notes, created_by_id
          ) VALUES ($1, $2, $3, 'OPENING_BALANCE'::movement_type, $4, $5,
                    'GOODS_RECEIPT', $6, $7, $8)
          RETURNING id, movement_number`,
          [
            movementNumber,
            item.productId,
            batch.id,
            Math.abs(qtyDelta),
            batchCost,
            gr.id,
            valueDelta > 0
              ? `Opening balance increase (qty ${oldQty}→${batchQty}, cost ${oldCost}→${batchCost})`
              : `Opening balance decrease (qty ${oldQty}→${batchQty}, cost ${oldCost}→${batchCost})`,
            userId,
          ]
        );

        const sm = smResult.rows[0];
        stockMovements.push({
          movementId: sm.id as string,
          movementNumber: sm.movement_number as string,
          productId: item.productId,
          batchNumber,
          quantity: Math.abs(qtyDelta),
          unitCost: batchCost,
          movementValue: valueDelta,
        });

        // Update product_inventory.quantity_on_hand from batch totals
        await client.query(
          `WITH new_qty AS (
             SELECT COALESCE(SUM(remaining_quantity), 0) AS qty
             FROM inventory_batches
             WHERE product_id = $1 AND status = 'ACTIVE'
           ), upd_pi AS (
             UPDATE product_inventory
             SET quantity_on_hand = (SELECT qty FROM new_qty),
                 updated_at = CURRENT_TIMESTAMP
             WHERE product_id = $1
           )
           UPDATE products
           SET quantity_on_hand = (SELECT qty FROM new_qty),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [item.productId]
        );

        // Collect cost layer data (processed inside transaction for atomicity)
        costLayerData.push({
          productId: item.productId,
          quantity: Math.abs(qtyDelta),
          unitCost: batchCost,
          goodsReceiptId: gr.id,
          batchNumber,
        });
      }

      // Create cost layers inside transaction
      for (const costData of costLayerData) {
        try {
          await costLayerService.createCostLayer(
            costData,
            undefined,
            client
          );
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error('Cost layer creation failed for opening balance GRN item', {
            grId: gr.id,
            productId: costData.productId,
            error: errMsg,
          });
          warnings.push(
            `Cost layer failed for product ${costData.productId}: ${errMsg}`
          );
        }
      }

      return { grId: gr.id, grNumber: gr.grNumber || '' };
    });

    // ── GL posting: DR Inventory (1300) / CR Opening Balance Equity (3050) ──
    // Per SAP/Odoo/Tally best practices, runs AFTER transaction commits
    if (stockMovements.length > 0) {
      const productIds = [...new Set(stockMovements.map((sm) => sm.productId))];
      const nameRes = await pool.query(
        `SELECT id, name FROM products WHERE id = ANY($1::uuid[])`,
        [productIds]
      );
      const nameMap = new Map<string, string>();
      for (const r of nameRes.rows) {
        nameMap.set(r.id as string, r.name as string);
      }

      const importDate = new Date().toLocaleDateString('en-CA');
      for (const sm of stockMovements) {
        if (sm.movementValue === 0) continue;
        try {
          await glEntryService.recordOpeningStockToGL(
            {
              movementId: sm.movementId,
              movementNumber: sm.movementNumber,
              movementDate: importDate,
              movementValue: sm.movementValue,
              productId: sm.productId,
              batchNumber: sm.batchNumber,
              productName: nameMap.get(sm.productId) || 'Imported product',
            },
            pool
          );
        } catch (glErr) {
          const errMsg = glErr instanceof Error ? glErr.message : String(glErr);
          logger.error('GL posting failed for opening balance movement', {
            movementId: sm.movementId,
            error: errMsg,
          });
          warnings.push(
            `GL posting failed for movement ${sm.movementNumber}: ${errMsg}`
          );
        }
      }
    }

    return { grId, grNumber, stockMovements, warnings };
  },
};
