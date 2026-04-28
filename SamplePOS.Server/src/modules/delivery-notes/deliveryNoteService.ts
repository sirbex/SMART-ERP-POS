// Delivery Note Service - Business logic for wholesale delivery notes
// Flow: Quotation (WHOLESALE) → Delivery Note(s) → Invoice
// Stock moves at DN posting. Money moves at Invoice.

import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { Money } from '../../utils/money.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { deliveryNoteRepository } from './deliveryNoteRepository.js';
import { deductStockFEFO as sharedDeductStockFEFO } from '../../utils/fefoDeduction.js';
import logger from '../../utils/logger.js';
import { NotFoundError, ValidationError, ConflictError } from '../../middleware/errorHandler.js';
import * as documentFlowService from '../document-flow/documentFlowService.js';
import { recordDeliveryNoteGoodsIssueToGL } from '../../services/glEntryService.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import {
  DeliveryNoteWithLines,
  CreateDeliveryNoteData,
} from './types.js';

export const deliveryNoteService = {
  /**
   * Create a delivery note from a WHOLESALE quotation.
   *
   * Validates:
   * - Quotation exists and has fulfillment_mode = WHOLESALE
   * - Quotation status is ACCEPTED (or DRAFT/SENT — not CANCELLED/CONVERTED)
   * - Lines reference valid quotation items
   * - Delivery qty does not exceed remaining qty (ordered − already delivered)
   *
   * Does NOT move stock — stock moves on POST.
   */
  async createDeliveryNote(
    pool: Pool,
    data: CreateDeliveryNoteData
  ): Promise<DeliveryNoteWithLines> {
    return UnitOfWork.run(pool, async (client: PoolClient) => {
      // ── Validate quotation ───────────────────────────────────
      const qResult = await client.query(
        `SELECT id, quote_number, customer_id, customer_name, fulfillment_mode, status
         FROM quotations WHERE id = $1`,
        [data.quotationId]
      );
      if (qResult.rows.length === 0) {
        throw new NotFoundError('Quotation not found');
      }
      const quotation = qResult.rows[0];

      if (quotation.fulfillment_mode !== 'WHOLESALE') {
        throw new ValidationError(
          `Quotation ${quotation.quote_number} is RETAIL. Delivery notes are only for WHOLESALE quotations.`
        );
      }

      const terminalStatuses = ['CONVERTED', 'CANCELLED', 'REJECTED', 'EXPIRED'];
      if (terminalStatuses.includes(quotation.status)) {
        throw new ConflictError(
          `Cannot create delivery note: quotation ${quotation.quote_number} is ${quotation.status}`
        );
      }

      // Guard: block if quotation is being fulfilled via Distribution SO
      // Use SAVEPOINT so a query failure doesn't poison the transaction
      let distSoCheck: { rows: Array<{ order_number: string }> } = { rows: [] };
      try {
        await client.query('SAVEPOINT dist_so_check');
        distSoCheck = await client.query(
          `SELECT order_number FROM dist_sales_orders
           WHERE id IN (
             SELECT reference_id::uuid FROM document_flow
             WHERE from_entity_id = $1 AND from_entity_type = 'QUOTATION'
             AND to_entity_type = 'ORDER'
           )
           AND status NOT IN ('CANCELLED')
           LIMIT 1`,
          [data.quotationId]
        );
        await client.query('RELEASE SAVEPOINT dist_so_check');
      } catch {
        await client.query('ROLLBACK TO SAVEPOINT dist_so_check');
      }

      if (distSoCheck.rows.length > 0) {
        throw new ConflictError(
          `Quotation ${quotation.quote_number} is being fulfilled via Distribution Sales Order ` +
          `${distSoCheck.rows[0].order_number}. Cannot create delivery notes — use the Distribution module.`
        );
      }

      // ── Load quotation items ─────────────────────────────────
      const qiResult = await client.query(
        `SELECT qi.id, qi.product_id, qi.description, qi.quantity, qi.delivered_quantity,
                qi.unit_price, qi.uom_id, qi.uom_name, qi.unit_cost, qi.product_type,
                COALESCE((
                  SELECT SUM(dnl.quantity_delivered)
                  FROM delivery_note_lines dnl
                  JOIN delivery_notes dn ON dn.id = dnl.delivery_note_id
                  WHERE dnl.quotation_item_id = qi.id
                    AND dn.status IN ('DRAFT', 'PICKED')
                ), 0) AS pending_quantity
         FROM quotation_items qi WHERE qi.quotation_id = $1`,
        [data.quotationId]
      );
      const qiMap = new Map(qiResult.rows.map((r) => [r.id as string, r]));

      // ── Validate each line ───────────────────────────────────
      if (!data.lines || data.lines.length === 0) {
        throw new ValidationError('Delivery note must have at least one line');
      }

      for (const line of data.lines) {
        const qi = qiMap.get(line.quotationItemId);
        if (!qi) {
          throw new NotFoundError(`Quotation item ${line.quotationItemId} not found on this quotation`);
        }

        // Service items don't need delivery
        if (qi.product_type === 'service') {
          throw new ValidationError(
            `Item "${qi.description}" is a service and cannot be delivered via delivery note`
          );
        }

        const ordered = new Decimal(qi.quantity);
        const alreadyDelivered = new Decimal(qi.delivered_quantity);
        const pending = new Decimal(qi.pending_quantity);
        const remaining = ordered.minus(alreadyDelivered).minus(pending);
        const requested = new Decimal(line.quantityDelivered);

        if (requested.greaterThan(remaining)) {
          throw new ValidationError(
            `Cannot deliver ${requested.toFixed(2)} of "${qi.description}". ` +
            `Ordered: ${ordered.toFixed(2)}, Delivered: ${alreadyDelivered.toFixed(2)}, ` +
            `Pending in other DNs: ${pending.toFixed(2)}, ` +
            `Available: ${remaining.toFixed(2)}`
          );
        }
      }

      // ── Create delivery note header ──────────────────────────
      const dn = await deliveryNoteRepository.create(client, {
        quotationId: data.quotationId,
        customerId: quotation.customer_id,
        customerName: quotation.customer_name,
        deliveryDate: data.deliveryDate,
        warehouseNotes: data.warehouseNotes,
        deliveryAddress: data.deliveryAddress,
        driverName: data.driverName,
        vehicleNumber: data.vehicleNumber,
        createdById: data.createdById,
      });
      // Document Flow: Quotation → Delivery Note
      await documentFlowService.linkDocuments(client, 'QUOTATION', data.quotationId, 'DELIVERY_NOTE', dn.id, 'FULFILLS');
      // ── Create lines ─────────────────────────────────────────
      for (const line of data.lines) {
        const qi = qiMap.get(line.quotationItemId)!;

        await deliveryNoteRepository.addLine(client, dn.id, {
          quotationItemId: line.quotationItemId,
          productId: line.productId || qi.product_id,
          batchId: line.batchId || null,
          uomId: line.uomId || qi.uom_id || null,
          uomName: line.uomName || qi.uom_name || null,
          quantityDelivered: line.quantityDelivered,
          unitPrice: line.unitPrice ?? Money.toNumber(Money.parseDb(qi.unit_price)),
          unitCost: line.unitCost ?? (qi.unit_cost ? Money.toNumber(Money.parseDb(qi.unit_cost)) : null),
          description: line.description || qi.description,
        });
      }

      // Recalculate header total
      await deliveryNoteRepository.recalcTotal(client, dn.id);

      // Return full DN with lines
      const result = await deliveryNoteRepository.getById(client, dn.id);
      if (!result) throw new NotFoundError('Failed to retrieve created delivery note');
      return result;
    });
  },

  /**
   * PICK a delivery note — SAP-style pick confirmation.
   *
   * Validates:
   * 1. DN exists and is in DRAFT status
   * 2. Sufficient stock is available for all lines (availability check, no deduction)
   * 3. Quotation item remaining quantities are still valid
   *
   * After picking:
   * - DN transitions to PICKED (immutable lines, but no stock movement yet)
   * - picked_at / picked_by_id recorded
   * - Warehouse staff can proceed to pack and then post goods issue
   */
  async pickDeliveryNote(
    pool: Pool,
    deliveryNoteId: string,
    pickedById: string
  ): Promise<DeliveryNoteWithLines> {
    return UnitOfWork.run(pool, async (client: PoolClient) => {
      // ── Load & validate DN ───────────────────────────────────
      const dnResult = await client.query(
        `SELECT * FROM delivery_notes WHERE id = $1 FOR UPDATE`,
        [deliveryNoteId]
      );
      if (dnResult.rows.length === 0) {
        throw new NotFoundError('Delivery note not found');
      }
      const dn = dnResult.rows[0];
      if (dn.status !== 'DRAFT') {
        throw new ConflictError(
          `Delivery note ${dn.delivery_note_number} is ${dn.status} — only DRAFT can be picked`
        );
      }

      // Load lines
      const linesResult = await client.query(
        `SELECT * FROM delivery_note_lines WHERE delivery_note_id = $1`,
        [deliveryNoteId]
      );
      if (linesResult.rows.length === 0) {
        throw new ValidationError('Delivery note has no lines');
      }

      // ── Validate quotation item remaining quantities ─────────
      for (const line of linesResult.rows) {
        const qiResult = await client.query(
          `SELECT quantity, delivered_quantity, description
           FROM quotation_items WHERE id = $1`,
          [line.quotation_item_id]
        );
        if (qiResult.rows.length === 0) {
          throw new NotFoundError(`Quotation item ${line.quotation_item_id} not found`);
        }
        const qi = qiResult.rows[0];
        const ordered = new Decimal(qi.quantity);
        const alreadyDelivered = new Decimal(qi.delivered_quantity);
        const remaining = ordered.minus(alreadyDelivered);
        const requested = new Decimal(line.quantity_delivered);

        if (requested.greaterThan(remaining)) {
          throw new ValidationError(
            `Cannot deliver ${requested.toFixed(2)} of "${qi.description}". ` +
            `Remaining: ${remaining.toFixed(2)}`
          );
        }
      }

      // ── Stock availability check (no deduction) ──────────────
      for (const line of linesResult.rows) {
        const productId = line.product_id as string;
        const required = new Decimal(line.quantity_delivered);

        if (line.batch_id) {
          // Specific batch — check its remaining qty
          const batchResult = await client.query(
            `SELECT remaining_quantity
             FROM inventory_batches
             WHERE id = $1 AND product_id = $2 AND status = 'ACTIVE'`,
            [line.batch_id, productId]
          );
          if (batchResult.rows.length === 0) {
            throw new NotFoundError(`Batch ${line.batch_id} not found or not active`);
          }
          const available = new Decimal(batchResult.rows[0].remaining_quantity);
          if (required.greaterThan(available)) {
            const pResult = await client.query('SELECT name FROM products WHERE id = $1', [productId]);
            const productName = pResult.rows[0]?.name || productId;
            throw new ValidationError(
              `Insufficient stock for "${productName}": batch has ${available.toFixed(2)} remaining, ` +
              `need ${required.toFixed(2)}`
            );
          }
        } else {
          // FEFO — check total available across active non-expired batches
          const stockResult = await client.query(
            `SELECT COALESCE(SUM(remaining_quantity), 0) AS available
             FROM inventory_batches
             WHERE product_id = $1 AND remaining_quantity > 0 AND status = 'ACTIVE'
               AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)`,
            [productId]
          );
          const available = new Decimal(stockResult.rows[0].available);
          if (required.greaterThan(available)) {
            const pResult = await client.query('SELECT name FROM products WHERE id = $1', [productId]);
            const productName = pResult.rows[0]?.name || productId;
            throw new ValidationError(
              `Insufficient stock for "${productName}": ${available.toFixed(2)} available, ` +
              `need ${required.toFixed(2)}`
            );
          }
        }
      }

      // ── Recalc total ─────────────────────────────────────────
      await deliveryNoteRepository.recalcTotal(client, deliveryNoteId);

      // ── Mark as PICKED ───────────────────────────────────────
      await deliveryNoteRepository.markPicked(client, deliveryNoteId, pickedById);

      const result = await deliveryNoteRepository.getById(client, deliveryNoteId);
      if (!result) throw new NotFoundError('Failed to retrieve picked delivery note');

      logger.info('Delivery note picked (pick confirmed)', {
        deliveryNoteId,
        deliveryNoteNumber: result.deliveryNoteNumber,
        quotationId: dn.quotation_id,
        lineCount: linesResult.rows.length,
        pickedById,
      });

      return result;
    });
  },

  /**
   * POST a delivery note — SAP-style Post Goods Issue (PGI).
   * Moves stock via FEFO batch deduction.
   *
   * For each line:
   * 1. If batch_id specified → deduct from that batch
   * 2. If no batch_id → FEFO auto-select (same as sales)
   * 3. Record stock_movement with type DELIVERY
   * 4. Sync product_inventory aggregate
   * 5. Update quotation_items.delivered_quantity
   *
   * Entire operation is atomic.
   */
  async postDeliveryNote(
    pool: Pool,
    deliveryNoteId: string,
    postedById: string
  ): Promise<DeliveryNoteWithLines> {
    const pgiResult = await UnitOfWork.run(pool, async (client: PoolClient) => {
      // ── Load & validate DN ───────────────────────────────────
      const dnResult = await client.query(
        `SELECT * FROM delivery_notes WHERE id = $1 FOR UPDATE`,
        [deliveryNoteId]
      );
      if (dnResult.rows.length === 0) {
        throw new NotFoundError('Delivery note not found');
      }
      const dn = dnResult.rows[0];
      if (dn.status === 'POSTED') {
        throw new ConflictError(`Delivery note ${dn.delivery_note_number} is already POSTED (Goods Issued)`);
      }
      if (dn.status !== 'DRAFT' && dn.status !== 'PICKED') {
        throw new ConflictError(
          `Delivery note ${dn.delivery_note_number} is ${dn.status} — only DRAFT or PICKED can be posted`
        );
      }

      // Load lines
      const linesResult = await client.query(
        `SELECT * FROM delivery_note_lines WHERE delivery_note_id = $1`,
        [deliveryNoteId]
      );
      if (linesResult.rows.length === 0) {
        throw new ValidationError('Delivery note has no lines');
      }

      // ── Re-validate remaining quantities ─────────────────────
      for (const line of linesResult.rows) {
        const qiResult = await client.query(
          `SELECT quantity, delivered_quantity, description
           FROM quotation_items WHERE id = $1 FOR UPDATE`,
          [line.quotation_item_id]
        );
        if (qiResult.rows.length === 0) {
          throw new NotFoundError(`Quotation item ${line.quotation_item_id} not found`);
        }
        const qi = qiResult.rows[0];
        const ordered = new Decimal(qi.quantity);
        const alreadyDelivered = new Decimal(qi.delivered_quantity);
        const remaining = ordered.minus(alreadyDelivered);
        const requested = new Decimal(line.quantity_delivered);

        if (requested.greaterThan(remaining)) {
          throw new ValidationError(
            `Cannot deliver ${requested.toFixed(2)} of "${qi.description}". ` +
            `Remaining: ${remaining.toFixed(2)}`
          );
        }
      }

      // ── FEFO batch deduction per line (shared utility) ───────
      let totalCost = new Decimal(0);

      for (const line of linesResult.rows) {
        const productId = line.product_id as string;

        // Look up product name for errors
        const pResult = await client.query('SELECT name FROM products WHERE id = $1', [productId]);
        const productName = pResult.rows[0]?.name || productId;

        const fefoResult = await sharedDeductStockFEFO(client, {
          productId,
          quantity: new Decimal(line.quantity_delivered),
          specificBatchId: line.batch_id || undefined,
          movementType: 'DELIVERY',
          referenceType: 'DELIVERY_NOTE',
          referenceId: deliveryNoteId,
          createdById: postedById,
          productName,
        });

        totalCost = totalCost.plus(fefoResult.totalCost);

        // ── Update quotation_items.delivered_quantity ───────────
        await deliveryNoteRepository.syncDeliveredQuantity(client, line.quotation_item_id);
      }

      // ── Recalc total (safe: trigger allows DRAFT→POSTED and PICKED→POSTED) ──
      await deliveryNoteRepository.recalcTotal(client, deliveryNoteId);
      // ── Mark DN as POSTED ────────────────────────────────────
      await deliveryNoteRepository.markPosted(client, deliveryNoteId, postedById);

      // Return final state + accumulated cost
      const result = await deliveryNoteRepository.getById(client, deliveryNoteId);
      if (!result) throw new NotFoundError('Failed to retrieve posted delivery note');

      logger.info('Delivery note posted', {
        deliveryNoteId,
        deliveryNoteNumber: result.deliveryNoteNumber,
        quotationId: dn.quotation_id,
        lineCount: linesResult.rows.length,
        totalAmount: result.totalAmount,
        totalCost: totalCost.toNumber(),
      });

      return { dn: result, totalCost: totalCost.toNumber() };
    });

    // ── Post COGS GL entry after transaction commits ─────────
    // SAP: Goods Issue posts DR COGS / CR Inventory in the same period.
    // GL failure is FATAL (not silently swallowed) — same behaviour as salesService.
    // recordDeliveryNoteGoodsIssueToGL uses idempotency key DN_PGI_COGS-<id>,
    // so a retry after transient failure will not double-post.
    // (Issue #2 forensic audit — GL error was previously ignored, causing silent drift)
    if (pgiResult.totalCost > 0) {
      await recordDeliveryNoteGoodsIssueToGL({
        deliveryNoteId,
        deliveryNoteNumber: pgiResult.dn.deliveryNoteNumber,
        postingDate: getBusinessDate(),
        totalCost: pgiResult.totalCost,
      }, pool);
    }

    return pgiResult.dn;
  },

  /**
   * Get delivery note by ID.
   */
  async getDeliveryNoteById(
    pool: Pool,
    id: string
  ): Promise<DeliveryNoteWithLines> {
    const dn = await deliveryNoteRepository.getById(pool, id);
    if (!dn) throw new NotFoundError(`Delivery note ${id} not found`);
    return dn;
  },

  /**
   * Get delivery note by DN number.
   */
  async getDeliveryNoteByNumber(
    pool: Pool,
    dnNumber: string
  ): Promise<DeliveryNoteWithLines> {
    const dn = await deliveryNoteRepository.getByNumber(pool, dnNumber);
    if (!dn) throw new NotFoundError(`Delivery note ${dnNumber} not found`);
    return dn;
  },

  /**
   * List delivery notes with pagination.
   */
  async listDeliveryNotes(
    pool: Pool,
    page: number,
    limit: number,
    filters?: { quotationId?: string; customerId?: string; status?: string }
  ) {
    return deliveryNoteRepository.list(pool, page, limit, filters);
  },

  /**
   * Get fulfillment status for a quotation — how much of each item has been delivered.
   */
  async getQuotationFulfillment(pool: Pool, quotationId: string) {
    const qResult = await pool.query(
      `SELECT id, fulfillment_mode, status, quote_number
       FROM quotations WHERE id = $1`,
      [quotationId]
    );
    if (qResult.rows.length === 0) throw new NotFoundError('Quotation not found');
    const quotation = qResult.rows[0];

    const itemsResult = await pool.query(
      `SELECT qi.id, qi.product_id, qi.description, qi.quantity, qi.delivered_quantity,
              qi.unit_price, qi.line_total, qi.uom_name,
              COALESCE((
                SELECT SUM(dnl.quantity_delivered)
                FROM delivery_note_lines dnl
                JOIN delivery_notes dn ON dn.id = dnl.delivery_note_id
                WHERE dnl.quotation_item_id = qi.id
                  AND dn.status IN ('DRAFT', 'PICKED')
              ), 0) AS pending_quantity
       FROM quotation_items qi WHERE qi.quotation_id = $1
       ORDER BY qi.line_number`,
      [quotationId]
    );

    const items = itemsResult.rows.map((r) => {
      const ordered = Money.toNumber(Money.parseDb(r.quantity));
      const delivered = Money.toNumber(Money.parseDb(r.delivered_quantity));
      const pending = Money.toNumber(Money.parseDb(r.pending_quantity));
      return {
        quotationItemId: r.id as string,
        productId: r.product_id as string,
        description: r.description as string,
        ordered,
        delivered,
        pending,
        remaining: Money.toNumber(new Decimal(ordered).minus(delivered).minus(pending)),
        unitPrice: Money.toNumber(Money.parseDb(r.unit_price)),
        lineTotal: Money.toNumber(Money.parseDb(r.line_total)),
        uomName: r.uom_name as string | null,
      };
    });

    const allFullyDelivered = items.every((i) => new Decimal(i.delivered).greaterThanOrEqualTo(i.ordered));
    const anyDelivered = items.some((i) => i.delivered > 0);
    const overallStatus: 'NOT_STARTED' | 'PARTIAL' | 'FULFILLED' =
      allFullyDelivered ? 'FULFILLED' : anyDelivered ? 'PARTIAL' : 'NOT_STARTED';

    return {
      quotationId,
      quoteNumber: quotation.quote_number,
      fulfillmentMode: quotation.fulfillment_mode,
      status: quotation.status,
      items,
      overallStatus,
    };
  },

  /**
   * Delete a DRAFT delivery note.
   */
  async deleteDeliveryNote(pool: Pool, id: string): Promise<void> {
    return UnitOfWork.run(pool, async (client: PoolClient) => {
      const dnResult = await client.query(
        `SELECT status, delivery_note_number FROM delivery_notes WHERE id = $1`,
        [id]
      );
      if (dnResult.rows.length === 0) throw new NotFoundError('Delivery note not found');
      if (dnResult.rows[0].status === 'POSTED') {
        throw new ConflictError(
          `Cannot delete POSTED delivery note ${dnResult.rows[0].delivery_note_number}`
        );
      }
      if (dnResult.rows[0].status === 'PICKED') {
        throw new ConflictError(
          `Cannot delete PICKED delivery note ${dnResult.rows[0].delivery_note_number} — revert pick first or post goods issue`
        );
      }
      await deliveryNoteRepository.deleteDraft(client, id);
    });
  },

  /**
   * Generate pick list data for a delivery note.
   * Returns product details with FEFO-suggested batches for warehouse picking.
   */
  async getPickList(
    pool: Pool,
    deliveryNoteId: string
  ): Promise<{
    deliveryNoteNumber: string;
    customerName: string | null;
    deliveryDate: string;
    deliveryAddress: string | null;
    warehouseNotes: string | null;
    status: string;
    lines: Array<{
      description: string | null;
      productName: string;
      quantityRequired: number;
      uomName: string | null;
      suggestedBatches: Array<{
        batchNumber: string;
        expiryDate: string | null;
        availableQty: number;
        pickQty: number;
        location: string | null;
      }>;
    }>;
  }> {
    const dn = await deliveryNoteRepository.getById(pool, deliveryNoteId);
    if (!dn) throw new NotFoundError('Delivery note not found');

    const lines: Array<{
      description: string | null;
      productName: string;
      quantityRequired: number;
      uomName: string | null;
      suggestedBatches: Array<{
        batchNumber: string;
        expiryDate: string | null;
        availableQty: number;
        pickQty: number;
        location: string | null;
      }>;
    }> = [];

    for (const line of dn.lines) {
      // Get product name
      const pResult = await pool.query(
        'SELECT name FROM products WHERE id = $1',
        [line.productId]
      );
      const productName = pResult.rows[0]?.name || 'Unknown';

      const suggestedBatches: Array<{
        batchNumber: string;
        expiryDate: string | null;
        availableQty: number;
        pickQty: number;
        location: string | null;
      }> = [];

      if (line.batchId) {
        // Specific batch
        const batchResult = await pool.query(
          `SELECT batch_number, expiry_date, remaining_quantity, storage_location
           FROM inventory_batches WHERE id = $1`,
          [line.batchId]
        );
        if (batchResult.rows.length > 0) {
          const b = batchResult.rows[0];
          suggestedBatches.push({
            batchNumber: b.batch_number as string,
            expiryDate: b.expiry_date ? String(b.expiry_date) : null,
            availableQty: Money.toNumber(Money.parseDb(b.remaining_quantity)),
            pickQty: line.quantityDelivered,
            location: (b.storage_location as string) || null,
          });
        }
      } else {
        // FEFO suggested batches
        const batchesResult = await pool.query(
          `SELECT id, batch_number, expiry_date, remaining_quantity, storage_location
           FROM inventory_batches
           WHERE product_id = $1 AND remaining_quantity > 0 AND status = 'ACTIVE'
             AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
           ORDER BY expiry_date ASC NULLS LAST, received_date ASC`,
          [line.productId]
        );

        let remainingQty = new Decimal(line.quantityDelivered);
        for (const batch of batchesResult.rows) {
          if (remainingQty.lessThanOrEqualTo(0)) break;
          const available = new Decimal(batch.remaining_quantity);
          const pickQty = Decimal.min(remainingQty, available);

          suggestedBatches.push({
            batchNumber: batch.batch_number as string,
            expiryDate: batch.expiry_date ? String(batch.expiry_date) : null,
            availableQty: Money.toNumber(available),
            pickQty: Money.toNumber(pickQty),
            location: (batch.storage_location as string) || null,
          });

          remainingQty = remainingQty.minus(pickQty);
        }
      }

      lines.push({
        description: line.description,
        productName,
        quantityRequired: line.quantityDelivered,
        uomName: line.uomName,
        suggestedBatches,
      });
    }

    return {
      deliveryNoteNumber: dn.deliveryNoteNumber,
      customerName: dn.customerName,
      deliveryDate: dn.deliveryDate,
      deliveryAddress: dn.deliveryAddress,
      warehouseNotes: dn.warehouseNotes,
      status: dn.status,
      lines,
    };
  },
};
