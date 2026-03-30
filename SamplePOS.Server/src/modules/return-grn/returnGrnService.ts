/**
 * Return GRN Service
 * 
 * Business logic for creating and posting Return Goods Receipt Notes.
 * 
 * POSTING LOGIC (SAP/Odoo compliant):
 * - Validates return qty ≤ (received qty − previously returned qty)
 * - Creates SUPPLIER_RETURN stock movements (decreases stock)
 * - Reduces batch remaining_quantity
 * - Recalculates product_inventory.quantity_on_hand
 * - NO GL entries — accounting is handled by Supplier Credit Note
 */

import type { Pool } from 'pg';
import { UnitOfWork } from '../../db/unitOfWork.js';
import {
  returnGrnRepository,
  type ReturnGrn,
  type ReturnGrnLine,
} from './returnGrnRepository.js';
import * as stockMovementRepository from '../stock-movements/stockMovementRepository.js';
import { Money } from '../../utils/money.js';
import logger from '../../utils/logger.js';

export interface CreateReturnGrnInput {
  grnId: string;
  returnDate?: string;
  reason: string;
  createdBy: string;
  lines: Array<{
    productId: string;
    batchId: string | null;
    uomId: string | null;
    quantity: number;
    baseQuantity: number;
    unitCost: number;
  }>;
}

export const returnGrnService = {

  /**
   * Create a Return GRN (DRAFT).
   * Validates that the GRN is finalized and lines reference valid items.
   */
  async create(
    pool: Pool,
    input: CreateReturnGrnInput,
  ): Promise<{ returnGrn: ReturnGrn; lines: ReturnGrnLine[] }> {

    return UnitOfWork.run(pool, async (client) => {
      // 1. Validate source GRN exists and is finalized
      const grResult = await client.query(
        `SELECT g.id, g.status, g.purchase_order_id,
                s."Id" AS "supplierId", s."CompanyName" AS "supplierName"
         FROM goods_receipts g
         LEFT JOIN purchase_orders po ON po.id = g.purchase_order_id
         LEFT JOIN suppliers s ON s."Id" = po.supplier_id
         WHERE g.id = $1`,
        [input.grnId]
      );
      if (grResult.rows.length === 0) throw new Error('Goods receipt not found');
      const gr = grResult.rows[0];
      if (gr.status !== 'COMPLETED' && gr.status !== 'FINALIZED') {
        throw new Error('Can only return items from a finalized goods receipt');
      }
      if (!gr.supplierId) throw new Error('GRN has no linked supplier');

      // 2. Validate at least one line
      if (!input.lines.length) throw new Error('At least one return line is required');

      // 3. Create RGRN header
      const returnGrn = await returnGrnRepository.create(client, {
        grnId: input.grnId,
        supplierId: gr.supplierId,
        returnDate: input.returnDate || new Date().toISOString().split('T')[0],
        reason: input.reason,
        createdBy: input.createdBy,
      });

      // 4. Create line items with validation
      const lines: ReturnGrnLine[] = [];
      for (const line of input.lines) {
        if (line.baseQuantity <= 0) throw new Error('Return quantity must be positive');

        const lineTotal = Money.toNumber(
          Money.multiply(Money.parseDb(line.baseQuantity), Money.parseDb(line.unitCost))
        );

        const created = await returnGrnRepository.createLine(client, {
          rgrnId: returnGrn.id,
          productId: line.productId,
          batchId: line.batchId,
          uomId: line.uomId,
          quantity: line.quantity,
          baseQuantity: line.baseQuantity,
          unitCost: line.unitCost,
          lineTotal,
        });
        lines.push(created);
      }

      logger.info('Return GRN draft created', {
        rgrnId: returnGrn.id,
        rgrnNumber: returnGrn.returnGrnNumber,
        grnId: input.grnId,
        lineCount: lines.length,
      });

      return { returnGrn, lines };
    });
  },

  /**
   * Post a Return GRN (DRAFT → POSTED).
   * 
   * For each line:
   * - Validates quantity ≤ (received - previously returned)
   * - Reduces batch remaining_quantity
   * - Creates SUPPLIER_RETURN stock movement
   * - Recalculates product_inventory.quantity_on_hand
   * 
   * NO GL entries — accounting handled by Supplier Credit Note.
   */
  async post(
    pool: Pool,
    rgrnId: string,
  ): Promise<ReturnGrn> {

    return UnitOfWork.run(pool, async (client) => {
      // 1. Get the RGRN and validate DRAFT status
      const rgrn = await returnGrnRepository.getById(client, rgrnId);
      if (!rgrn) throw new Error('Return GRN not found');
      if (rgrn.status !== 'DRAFT') throw new Error('Only DRAFT Return GRNs can be posted');

      // 2. Get lines
      const lines = await returnGrnRepository.getLines(client, rgrnId);
      if (lines.length === 0) throw new Error('Return GRN has no line items');

      // 3. Process each line
      for (const line of lines) {
        // 3a. Validate returnable quantity
        const alreadyReturned = await returnGrnRepository.getReturnedQuantity(
          client, rgrn.grnId, line.productId, line.batchId,
        );
        
        // Get originally received quantity for this product+batch  
        const receivedResult = await client.query(
          `SELECT COALESCE(SUM(gri.received_quantity), 0) AS received
           FROM goods_receipt_items gri
           LEFT JOIN inventory_batches ib
             ON ib.product_id = gri.product_id AND ib.batch_number = gri.batch_number
           WHERE gri.goods_receipt_id = $1
             AND gri.product_id = $2
             ${line.batchId ? 'AND ib.id = $3' : ''}`,
          line.batchId ? [rgrn.grnId, line.productId, line.batchId] : [rgrn.grnId, line.productId]
        );
        const received = parseFloat(receivedResult.rows[0].received);
        const returnable = received - alreadyReturned;

        if (line.baseQuantity > returnable) {
          throw new Error(
            `Cannot return ${line.baseQuantity} of ${line.productName}. ` +
            `Received: ${received}, already returned: ${alreadyReturned}, returnable: ${returnable}`
          );
        }

        // 3b. Reduce batch remaining_quantity (if batch-tracked)
        if (line.batchId) {
          const batchUpdate = await client.query(
            `UPDATE inventory_batches
             SET remaining_quantity = remaining_quantity - $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND remaining_quantity >= $1
             RETURNING remaining_quantity`,
            [line.baseQuantity, line.batchId]
          );
          if (batchUpdate.rows.length === 0) {
            throw new Error(
              `Insufficient batch quantity for ${line.productName} (batch ${line.batchNumber})`
            );
          }
        }

        // 3c. Create SUPPLIER_RETURN stock movement
        await stockMovementRepository.recordMovement(client, {
          productId: line.productId,
          batchId: line.batchId,
          movementType: 'SUPPLIER_RETURN',
          quantity: -line.baseQuantity, // Negative = stock decrease
          unitCost: line.unitCost,
          referenceType: 'RETURN_GRN',
          referenceId: rgrnId,
          notes: `Return to supplier: ${rgrn.reason}`,
          createdBy: rgrn.createdBy,
        });

        // 3d. Recalculate product_inventory.quantity_on_hand
        await client.query(
          `UPDATE product_inventory
           SET quantity_on_hand = (
             SELECT COALESCE(SUM(remaining_quantity), 0)
             FROM inventory_batches
             WHERE product_id = $1 AND status = 'ACTIVE'
           ),
           updated_at = CURRENT_TIMESTAMP
           WHERE product_id = $1`,
          [line.productId]
        );
      }

      // 4. Post the RGRN
      const posted = await returnGrnRepository.post(client, rgrnId);
      if (!posted) throw new Error('Failed to post Return GRN');

      logger.info('Return GRN posted — stock decreased, no GL entries', {
        rgrnId: posted.id,
        rgrnNumber: posted.returnGrnNumber,
        grnId: posted.grnId,
        lineCount: lines.length,
      });

      return posted;
    });
  },

  /**
   * Get a Return GRN with its line items.
   */
  async getById(
    pool: Pool,
    rgrnId: string,
  ): Promise<{ returnGrn: ReturnGrn; lines: ReturnGrnLine[] } | null> {
    const returnGrn = await returnGrnRepository.getById(pool, rgrnId);
    if (!returnGrn) return null;
    const lines = await returnGrnRepository.getLines(pool, rgrnId);
    return { returnGrn, lines };
  },

  /**
   * List Return GRNs with pagination.
   */
  async list(
    pool: Pool,
    options: { grnId?: string; supplierId?: string; status?: string; page: number; limit: number },
  ) {
    return returnGrnRepository.list(pool, options);
  },

  /**
   * Get returnable items for a GRN (for UI).
   */
  async getReturnableItems(pool: Pool, grnId: string) {
    return returnGrnRepository.getReturnableItems(pool, grnId);
  },

  /**
   * Get Return GRNs linked to a specific GRN (for badge display).
   */
  async getByGrnId(pool: Pool, grnId: string) {
    return returnGrnRepository.getByGrnId(pool, grnId);
  },
};
