import type { PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { ValidationError } from '../../../middleware/errorHandler.js';
import { lotService } from '../../inventory-lot/lotService.js';

export interface SupplierReturnDeductionParams {
    productId: string;
    inventoryBatchId: string;
    quantity: number;
    userId?: string;
}

export interface SupplierReturnDeductionResult {
    costPrice: Decimal;
    remainingQuantity: number;
}

/**
 * Supplier-return deduction — routes through LotService.consumeLot (ADR-002 W19/W20).
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

        const result = await lotService.consumeLot(client, {
            productId: params.productId,
            quantity: qty,
            specificLotId: params.inventoryBatchId,
            selectionPolicy: 'MANUAL',
            deductAcrossAllStoreBalances: true,
            recordMovement: false,
            syncProduct: false,
            referenceType: 'SUPPLIER_RETURN',
            referenceId: params.inventoryBatchId,
            userId: params.userId ?? 'system',
        });

        if (result.layers.length === 0) {
            throw new ValidationError(
                `Insufficient on-hand batch quantity for return (batch ${params.inventoryBatchId}).`,
            );
        }

        const layer = result.layers[0];
        const lot = await client.query<{ remaining_quantity: string }>(
            `SELECT remaining_quantity FROM inventory_batches WHERE id = $1`,
            [layer.lotId],
        );

        return {
            costPrice: new Decimal(layer.costPrice || 0),
            remainingQuantity: parseFloat(lot.rows[0]?.remaining_quantity ?? '0'),
        };
    },
};
