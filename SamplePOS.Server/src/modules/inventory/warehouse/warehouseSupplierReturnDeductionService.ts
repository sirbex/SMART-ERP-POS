import type { PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { ValidationError } from '../../../middleware/errorHandler.js';
import { isMultistoreEnabled } from './multistoreSettings.js';
import { warehouseInventoryRepository } from './warehouseInventoryRepository.js';

export interface SupplierReturnDeductionParams {
    productId: string;
    inventoryBatchId: string;
    quantity: number;
}

export interface SupplierReturnDeductionResult {
    costPrice: Decimal;
    remainingQuantity: number;
}

/**
 * Atomic supplier-return deduction: inventory_batches + inventory_balances (multistore).
 * Mirrors warehouseSaleDeductionService.deductAtStore for outbound supplier returns.
 */
export const warehouseSupplierReturnDeductionService = {
    async deductForSupplierReturn(
        client: PoolClient,
        params: SupplierReturnDeductionParams,
    ): Promise<SupplierReturnDeductionResult> {
        const qty = params.quantity;
        if (qty <= 0) {
            throw new ValidationError('Return quantity must be positive');
        }

        const batchUpdate = await client.query<{ remaining_quantity: string; cost_price: string }>(
            `UPDATE inventory_batches
             SET remaining_quantity = remaining_quantity - $1,
                 status = CASE
                   WHEN remaining_quantity - $1 <= 0 THEN 'DEPLETED'::batch_status
                   ELSE status
                 END,
                 updated_at = NOW()
             WHERE id = $2 AND remaining_quantity >= $1
             RETURNING remaining_quantity, cost_price`,
            [qty, params.inventoryBatchId],
        );

        if (batchUpdate.rows.length === 0) {
            throw new ValidationError(
                `Insufficient on-hand batch quantity for return (batch ${params.inventoryBatchId}).`,
            );
        }

        if (await isMultistoreEnabled(client)) {
            const lotRes = await client.query<{ id: string }>(
                `SELECT id FROM product_lots
                 WHERE inventory_batch_id = $1 AND product_id = $2
                 LIMIT 1`,
                [params.inventoryBatchId, params.productId],
            );
            const productLotId = lotRes.rows[0]?.id;
            if (!productLotId) {
                throw new ValidationError(
                    'Multistore return requires a warehouse lot linked to this batch.',
                );
            }

            const balanceRes = await client.query<{
                store_location_id: string;
                quantity_on_hand: string;
            }>(
                `SELECT store_location_id, quantity_on_hand
                 FROM inventory_balances
                 WHERE product_lot_id = $1 AND quantity_on_hand > 0
                 ORDER BY quantity_on_hand DESC
                 FOR UPDATE`,
                [productLotId],
            );

            if (balanceRes.rows.length === 0) {
                throw new ValidationError('No warehouse stock balance found for the returned batch lot.');
            }

            let remaining = qty;
            for (const row of balanceRes.rows) {
                if (remaining <= 0) break;
                const onHand = parseFloat(row.quantity_on_hand);
                const take = Math.min(remaining, onHand);
                if (take <= 0) continue;
                await warehouseInventoryRepository.adjustSellableQuantity(client, {
                    storeLocationId: row.store_location_id,
                    productLotId,
                    productId: params.productId,
                    quantity: take,
                    direction: 'OUT',
                });
                remaining -= take;
            }

            if (remaining > 0.0001) {
                throw new ValidationError(
                    `Insufficient warehouse stock for return. Short by ${remaining} base unit(s).`,
                );
            }
        }

        return {
            costPrice: new Decimal(batchUpdate.rows[0].cost_price || 0),
            remainingQuantity: parseFloat(batchUpdate.rows[0].remaining_quantity),
        };
    },
};
