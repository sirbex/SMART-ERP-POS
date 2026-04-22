/**
 * Shared FEFO (First Expiry First Out) stock deduction utility.
 *
 * Canonical implementation used by:
 *  - POS sales (salesService)
 *  - Delivery Notes PGI (deliveryNoteService)
 *  - Distribution deliveries (distService / distRepository)
 *
 * All FEFO stock deductions MUST use this utility to ensure consistent:
 *  - Batch selection ordering (expiry_date ASC NULLS LAST, received_date ASC)
 *  - Active-only batch filtering with FOR UPDATE locking
 *  - DEPLETED status transition when batch fully consumed
 *  - Positive-quantity stock movements via recordMovement()
 *  - Decimal-safe cost accumulation
 */

import { PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { Money } from './money.js';
import { recordMovement } from '../modules/stock-movements/stockMovementRepository.js';
import type { MovementType } from '../modules/stock-movements/types.js';
import { syncProductQuantity } from './inventorySync.js';

// ── Types ──────────────────────────────────────────────────

export interface FEFODeductionRequest {
  /** Product to deduct stock for */
  productId: string;
  /** Total quantity to deduct (positive number) */
  quantity: Decimal;
  /** Optional: deduct from a specific batch instead of auto-selecting */
  specificBatchId?: string;
  /** Movement type for the stock_movements record */
  movementType: MovementType;
  /** Reference type (e.g. 'SALE', 'DELIVERY_NOTE', 'DIST_DELIVERY') */
  referenceType: string;
  /** Reference ID (e.g. sale ID, delivery note ID) */
  referenceId: string;
  /** User who triggered the deduction */
  createdById: string;
  /** Optional product name for error messages */
  productName?: string;
}

export interface FEFODeductionResult {
  /** Total cost of goods deducted (sum of batch cost_price * qty) */
  totalCost: Decimal;
  /** Number of batches touched */
  batchCount: number;
  /** Per-batch breakdown */
  batches: Array<{
    batchId: string;
    quantity: Decimal;
    costPrice: Decimal;
    lineCost: Decimal;
  }>;
}

// ── Core FEFO deduction ────────────────────────────────────

/**
 * Deduct stock using FEFO algorithm within an existing transaction.
 *
 * - Selects ACTIVE batches ordered by expiry_date ASC NULLS LAST, received_date ASC
 * - Excludes expired batches (expiry_date <= CURRENT_DATE)
 * - Uses FOR UPDATE row locking to prevent concurrent over-deduction
 * - Transitions batch to DEPLETED when remaining_quantity reaches 0
 * - Records positive-quantity stock movements
 * - Syncs products.quantity_on_hand after deduction
 *
 * @throws ValidationError-style Error if insufficient stock
 */
export async function deductStockFEFO(
  client: PoolClient,
  request: FEFODeductionRequest
): Promise<FEFODeductionResult> {
  let remaining = request.quantity;
  let totalCost = new Decimal(0);
  const batchResults: FEFODeductionResult['batches'] = [];

  if (request.specificBatchId) {
    // ── Specific batch override ──────────────────────────────
    const batchRes = await client.query(
      `SELECT id, remaining_quantity, cost_price
       FROM inventory_batches
       WHERE id = $1 AND product_id = $2 AND status = 'ACTIVE'
       FOR UPDATE`,
      [request.specificBatchId, request.productId]
    );

    if (batchRes.rows.length === 0) {
      throw new Error(
        `Batch ${request.specificBatchId} not found or not active for product ${request.productName || request.productId}`
      );
    }

    const batch = batchRes.rows[0];
    const batchQty = Money.parseDb(batch.remaining_quantity);
    if (batchQty.lt(remaining)) {
      throw new Error(
        `Insufficient stock in batch ${request.specificBatchId}: ` +
        `available ${batchQty.toFixed(4)}, requested ${remaining.toFixed(4)}`
      );
    }

    const costPrice = Money.parseDb(batch.cost_price);
    const lineCost = remaining.times(costPrice);
    totalCost = totalCost.plus(lineCost);

    // Deduct and possibly mark DEPLETED
    const newQty = batchQty.minus(remaining);
    await client.query(
      `UPDATE inventory_batches
       SET remaining_quantity = $1,
           status = CASE WHEN $1::numeric <= 0 THEN 'DEPLETED'::batch_status ELSE status END,
           updated_at = NOW()
       WHERE id = $2`,
      [newQty.toFixed(4), batch.id]
    );

    await recordMovement(client, {
      productId: request.productId,
      batchId: batch.id,
      movementType: request.movementType,
      quantity: Number(remaining.toFixed(4)),
      unitCost: Number(costPrice.toFixed(2)),
      referenceType: request.referenceType,
      referenceId: request.referenceId,
      createdBy: request.createdById,
    });

    batchResults.push({
      batchId: batch.id,
      quantity: remaining,
      costPrice,
      lineCost,
    });

    remaining = new Decimal(0);
  } else {
    // ── Auto-select FEFO ─────────────────────────────────────
    const batchesRes = await client.query(
      `SELECT id, remaining_quantity, expiry_date, cost_price
       FROM inventory_batches
       WHERE product_id = $1 AND remaining_quantity > 0 AND status = 'ACTIVE'
         AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
       ORDER BY expiry_date ASC NULLS LAST, received_date ASC
       FOR UPDATE`,
      [request.productId]
    );

    for (const batch of batchesRes.rows) {
      if (remaining.lte(0)) break;

      const batchQty = Money.parseDb(batch.remaining_quantity);
      const costPrice = Money.parseDb(batch.cost_price);
      const qtyToDeduct = Decimal.min(remaining, batchQty);
      const lineCost = qtyToDeduct.times(costPrice);
      totalCost = totalCost.plus(lineCost);

      const newQty = batchQty.minus(qtyToDeduct);
      await client.query(
        `UPDATE inventory_batches
         SET remaining_quantity = $1,
             status = CASE WHEN $1::numeric <= 0 THEN 'DEPLETED'::batch_status ELSE status END,
             updated_at = NOW()
         WHERE id = $2`,
        [newQty.toFixed(4), batch.id]
      );

      await recordMovement(client, {
        productId: request.productId,
        batchId: batch.id,
        movementType: request.movementType,
        quantity: Number(qtyToDeduct.toFixed(4)),
        unitCost: Number(costPrice.toFixed(2)),
        referenceType: request.referenceType,
        referenceId: request.referenceId,
        createdBy: request.createdById,
      });

      batchResults.push({
        batchId: batch.id,
        quantity: qtyToDeduct,
        costPrice,
        lineCost,
      });

      remaining = remaining.minus(qtyToDeduct);
    }
  }

  // Check if fully deducted (tolerance for rounding)
  if (remaining.gt(new Decimal('0.001'))) {
    const deducted = request.quantity.minus(remaining);
    throw new Error(
      `Insufficient stock for product ${request.productName || request.productId}: ` +
      `requested ${request.quantity.toFixed(4)}, available ${deducted.toFixed(4)}, ` +
      `short ${remaining.toFixed(4)}`
    );
  }

  // Sync product quantity_on_hand
  await syncProductQuantity(client, request.productId);

  return {
    totalCost,
    batchCount: batchResults.length,
    batches: batchResults,
  };
}
