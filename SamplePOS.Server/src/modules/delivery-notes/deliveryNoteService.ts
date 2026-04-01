// Delivery Note Service - Business logic for wholesale delivery notes
// Flow: Quotation (WHOLESALE) → Delivery Note(s) → Invoice
// Stock moves at DN posting. Money moves at Invoice.

import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { Money } from '../../utils/money.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { deliveryNoteRepository } from './deliveryNoteRepository.js';
import { recordMovement } from '../stock-movements/stockMovementRepository.js';
import logger from '../../utils/logger.js';
import { NotFoundError, ValidationError, ConflictError } from '../../middleware/errorHandler.js';
import * as documentFlowService from '../document-flow/documentFlowService.js';
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

      // ── Load quotation items ─────────────────────────────────
      const qiResult = await client.query(
        `SELECT id, product_id, description, quantity, delivered_quantity,
                unit_price, uom_id, uom_name, unit_cost, product_type
         FROM quotation_items WHERE quotation_id = $1`,
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
        const remaining = ordered.minus(alreadyDelivered);
        const requested = new Decimal(line.quantityDelivered);

        if (requested.greaterThan(remaining)) {
          throw new ValidationError(
            `Cannot deliver ${requested.toFixed(2)} of "${qi.description}". ` +
            `Ordered: ${ordered.toFixed(2)}, Already delivered: ${alreadyDelivered.toFixed(2)}, ` +
            `Remaining: ${remaining.toFixed(2)}`
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
   * POST a delivery note — moves stock via FEFO batch deduction.
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
      if (dn.status === 'POSTED') {
        throw new ConflictError(`Delivery note ${dn.delivery_note_number} is already POSTED`);
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

      // ── FEFO batch deduction per line ────────────────────────
      const productsToSync = new Set<string>();

      for (const line of linesResult.rows) {
        const productId = line.product_id as string;
        let remainingQty = new Decimal(line.quantity_delivered);
        productsToSync.add(productId);

        if (line.batch_id) {
          // ── Specific batch requested ─────────────────────────
          const batchResult = await client.query(
            `SELECT id, remaining_quantity, cost_price
             FROM inventory_batches
             WHERE id = $1 AND product_id = $2 AND status = 'ACTIVE'
             FOR UPDATE`,
            [line.batch_id, productId]
          );
          if (batchResult.rows.length === 0) {
            throw new NotFoundError(`Batch ${line.batch_id} not found or not active for product ${productId}`);
          }

          const batch = batchResult.rows[0];
          const batchQty = new Decimal(batch.remaining_quantity);
          if (remainingQty.greaterThan(batchQty)) {
            throw new ValidationError(
              `Batch ${line.batch_id} has only ${batchQty.toFixed(2)} remaining, ` +
              `but ${remainingQty.toFixed(2)} required`
            );
          }

          await client.query(
            `UPDATE inventory_batches
             SET remaining_quantity = remaining_quantity - $1,
                 status = CASE WHEN remaining_quantity - $1 <= 0 THEN 'DEPLETED'::batch_status ELSE status END,
                 updated_at = NOW()
             WHERE id = $2`,
            [remainingQty.toFixed(4), line.batch_id]
          );

          await recordMovement(client, {
            productId,
            batchId: line.batch_id,
            movementType: 'DELIVERY',
            quantity: remainingQty.toNumber(),
            unitCost: batch.cost_price ? Money.toNumber(Money.parseDb(batch.cost_price)) : null,
            referenceType: 'DELIVERY_NOTE',
            referenceId: deliveryNoteId,
            notes: `DN ${dn.delivery_note_number} - batch delivery`,
            createdBy: postedById,
          });
        } else {
          // ── FEFO auto-select ─────────────────────────────────
          const batchesResult = await client.query(
            `SELECT id, remaining_quantity, expiry_date, cost_price
             FROM inventory_batches
             WHERE product_id = $1 AND remaining_quantity > 0 AND status = 'ACTIVE'
               AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
             ORDER BY expiry_date ASC NULLS LAST, received_date ASC
             FOR UPDATE`,
            [productId]
          );

          for (const batch of batchesResult.rows) {
            if (remainingQty.lessThanOrEqualTo(0)) break;

            const batchQty = new Decimal(batch.remaining_quantity || 0);
            const qtyToDeduct = Decimal.min(remainingQty, batchQty);

            await client.query(
              `UPDATE inventory_batches
               SET remaining_quantity = remaining_quantity - $1,
                   status = CASE WHEN remaining_quantity - $1 <= 0 THEN 'DEPLETED'::batch_status ELSE status END,
                   updated_at = NOW()
               WHERE id = $2`,
              [qtyToDeduct.toFixed(4), batch.id]
            );

            await recordMovement(client, {
              productId,
              batchId: batch.id,
              movementType: 'DELIVERY',
              quantity: qtyToDeduct.toNumber(),
              unitCost: batch.cost_price ? Money.toNumber(Money.parseDb(batch.cost_price)) : null,
              referenceType: 'DELIVERY_NOTE',
              referenceId: deliveryNoteId,
              notes: `DN ${dn.delivery_note_number} - FEFO batch deduction`,
              createdBy: postedById,
            });

            remainingQty = remainingQty.minus(qtyToDeduct);
          }

          if (remainingQty.greaterThan(0)) {
            // Look up product name for error
            const pResult = await client.query('SELECT name FROM products WHERE id = $1', [productId]);
            const productName = pResult.rows[0]?.name || productId;
            throw new ValidationError(
              `Not enough stock for "${productName}". ` +
              `Requested: ${new Decimal(line.quantity_delivered).toFixed(2)}, ` +
              `Short by: ${remainingQty.toFixed(2)}`
            );
          }
        }

        // ── Update quotation_items.delivered_quantity ───────────
        await deliveryNoteRepository.syncDeliveredQuantity(client, line.quotation_item_id);
      }

      // ── Sync product_inventory aggregate for all affected products
      for (const productId of productsToSync) {
        await client.query(
          `UPDATE product_inventory
           SET quantity_on_hand = (
             SELECT COALESCE(SUM(remaining_quantity), 0)
             FROM inventory_batches
             WHERE product_id = $1 AND status = 'ACTIVE'
           ),
           updated_at = CURRENT_TIMESTAMP
           WHERE product_id = $1`,
          [productId]
        );
      }

      // ── Recalc total while still DRAFT (immutability trigger blocks updates after POSTED) ──
      await deliveryNoteRepository.recalcTotal(client, deliveryNoteId);
      // ── Mark DN as POSTED ────────────────────────────────────
      await deliveryNoteRepository.markPosted(client, deliveryNoteId, postedById);

      // Return final state
      const result = await deliveryNoteRepository.getById(client, deliveryNoteId);
      if (!result) throw new NotFoundError('Failed to retrieve posted delivery note');

      logger.info('Delivery note posted', {
        deliveryNoteId,
        deliveryNoteNumber: result.deliveryNoteNumber,
        quotationId: dn.quotation_id,
        lineCount: linesResult.rows.length,
        totalAmount: result.totalAmount,
      });

      return result;
    });
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
      `SELECT id, product_id, description, quantity, delivered_quantity,
              unit_price, line_total, uom_name
       FROM quotation_items WHERE quotation_id = $1
       ORDER BY line_number`,
      [quotationId]
    );

    const items = itemsResult.rows.map((r) => {
      const ordered = Money.toNumber(Money.parseDb(r.quantity));
      const delivered = Money.toNumber(Money.parseDb(r.delivered_quantity));
      return {
        quotationItemId: r.id as string,
        productId: r.product_id as string,
        description: r.description as string,
        ordered,
        delivered,
        remaining: Money.toNumber(new Decimal(ordered).minus(delivered)),
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
      await deliveryNoteRepository.deleteDraft(client, id);
    });
  },
};
