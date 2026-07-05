import type { PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { BusinessError } from '../../../middleware/errorHandler.js';
import { Money } from '../../../utils/money.js';
import { getBusinessYear } from '../../../utils/dateRange.js';
import { syncProductQuantity } from '../../../utils/inventorySync.js';
import { posProductSearchService } from './posProductSearchService.js';
import {
    lockMultistoreBalancesForAllocation,
    previewMultistoreBalancesForAllocation,
    type PosAllocationLockRow,
} from './posAllocationLockRepository.js';
import { warehouseInventoryRepository } from './warehouseInventoryRepository.js';
import { storeLocationRepository } from './storeLocationRepository.js';

export interface MultistoreSaleDeductionResult {
    storeLocationId: string;
    primaryProductLotId: string | null;
    primaryBatchId: string | null;
    actualBatchCost: Decimal;
    movementCount: number;
    nextMovementSeq: number;
}

export interface MultistoreSaleCostPreview {
    totalCost: Decimal;
    coveredQty: Decimal;
    shortfall: Decimal;
}

export interface MultistoreStockDeductionParams {
    storeLocationId: string;
    productId: string;
    productName: string;
    baseQty: Decimal;
    movementType: 'SALE' | 'DELIVERY';
    referenceType: string;
    referenceId: string;
    notes: string;
    userId: string | null;
    enteredQty?: number;
    baseUomId?: string;
    conversionFactor?: string;
    movementSeqStart: number;
}

async function resolveLotBatchId(
    client: PoolClient,
    productLotId: string,
): Promise<string | null> {
    const res = await client.query<{ inventory_batch_id: string | null }>(
        `SELECT inventory_batch_id FROM product_lots WHERE id = $1`,
        [productLotId],
    );
    return res.rows[0]?.inventory_batch_id ?? null;
}

async function deductBatchQuantity(
    client: PoolClient,
    batchId: string,
    qty: Decimal,
): Promise<void> {
    await client.query(
        `UPDATE inventory_batches
         SET remaining_quantity = remaining_quantity - $1,
             status = CASE
               WHEN remaining_quantity - $1 <= 0 THEN 'DEPLETED'::batch_status
               ELSE status
             END,
             updated_at = NOW()
         WHERE id = $2`,
        [qty.toFixed(4), batchId],
    );
}

async function insertStockMovement(
    client: PoolClient,
    params: {
        movementNumber: string;
        productId: string;
        batchId: string;
        quantity: Decimal;
        unitCost: number;
        movementType: 'SALE' | 'DELIVERY';
        referenceType: string;
        referenceId: string;
        notes: string;
        userId: string | null;
        enteredQty?: number;
        baseUomId?: string;
        conversionFactor?: string;
    },
): Promise<void> {
    await client.query(
        `INSERT INTO stock_movements (
           movement_number, product_id, batch_id, movement_type, quantity, unit_cost,
           reference_type, reference_id, notes, created_by_id,
           entered_qty, base_uom_id, conversion_factor
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
            params.movementNumber,
            params.productId,
            params.batchId,
            params.movementType,
            params.quantity.abs().toFixed(4),
            params.unitCost,
            params.referenceType,
            params.referenceId,
            params.notes,
            params.userId,
            params.enteredQty ?? null,
            params.baseUomId ?? null,
            params.conversionFactor ?? null,
        ],
    );
}

function sumAllocationCost(rows: PosAllocationLockRow[]): Decimal {
    return rows.reduce(
        (sum, row) => sum.plus(new Decimal(row.quantityAvailable).times(row.costPrice)),
        new Decimal(0),
    );
}

export const warehouseSaleDeductionService = {
    async resolveSellingStoreId(client: PoolClient): Promise<string> {
        const storeId = await posProductSearchService.resolveActiveSellingStoreId(client);
        if (!storeId) {
            throw new BusinessError(
                'Multistore POS requires an active selling store (store_locations.is_pos_selling).',
                'ERR_STORE_001',
            );
        }
        return storeId;
    },

    async validateSellableAtStore(
        client: PoolClient,
        storeLocationId: string,
        productId: string,
        quantity: number,
    ): Promise<void> {
        const plan = await previewMultistoreBalancesForAllocation(
            client,
            storeLocationId,
            productId,
            quantity,
        );
        if (!plan.sufficient) {
            throw new BusinessError(
                `Insufficient stock at selling store. Available: ${plan.allocatedQuantity}, Requested: ${quantity}.`,
                'ERR_STOCK_001',
                { productId, available: plan.allocatedQuantity, requested: quantity },
            );
        }
    },

    async previewSaleCostAtStore(
        client: PoolClient,
        storeLocationId: string,
        productId: string,
        baseQty: Decimal,
        masterCostPerBase: Decimal,
    ): Promise<MultistoreSaleCostPreview> {
        const plan = await previewMultistoreBalancesForAllocation(
            client,
            storeLocationId,
            productId,
            baseQty.toNumber(),
        );

        const covered = new Decimal(plan.allocatedQuantity);
        const shortfall = baseQty.minus(covered);
        let totalCost = sumAllocationCost(plan.rows);

        if (shortfall.greaterThan(0.001)) {
            totalCost = totalCost.plus(shortfall.times(masterCostPerBase));
        }

        return {
            totalCost,
            coveredQty: covered,
            shortfall: shortfall.greaterThan(0) ? shortfall : new Decimal(0),
        };
    },

    async resolveMainStoreId(client: PoolClient): Promise<string> {
        const main = await storeLocationRepository.getDefaultReceivingStore(client);
        if (!main) {
            throw new BusinessError(
                'Multistore wholesale issue requires a MAIN receiving store.',
                'ERR_STORE_001',
            );
        }
        return main.id;
    },

    /**
     * Deduct sellable stock at a store (SELLING for POS, MAIN for wholesale/DN) and mirror batch subledger.
     */
    async deductAtStore(
        client: PoolClient,
        params: MultistoreStockDeductionParams,
    ): Promise<MultistoreSaleDeductionResult> {
        const allocation = await lockMultistoreBalancesForAllocation(
            client,
            params.storeLocationId,
            params.productId,
            params.baseQty.toNumber(),
        );

        if (!allocation.sufficient) {
            throw new BusinessError(
                `Not enough stock for "${params.productName}" at the selected store. ` +
                    `Requested: ${params.baseQty.toFixed(2)}, Available: ${allocation.allocatedQuantity}.`,
                'ERR_STOCK_001',
                {
                    product: params.productName,
                    productId: params.productId,
                    requested: Money.toNumber(params.baseQty),
                    available: allocation.allocatedQuantity,
                },
            );
        }

        let movementSeq = params.movementSeqStart;
        let actualBatchCost = new Decimal(0);
        let primaryProductLotId: string | null = null;
        let primaryBatchId: string | null = null;

        for (const row of allocation.rows) {
            if (!row.lotId || row.quantityAvailable <= 0) continue;

            const qty = new Decimal(row.quantityAvailable);
            const batchId = await resolveLotBatchId(client, row.lotId);

            await warehouseInventoryRepository.adjustSellableQuantity(client, {
                storeLocationId: params.storeLocationId,
                productLotId: row.lotId,
                productId: params.productId,
                quantity: row.quantityAvailable,
                direction: 'OUT',
            });

            if (batchId) {
                await deductBatchQuantity(client, batchId, qty);
            }

            const movementNumber = `MOV-${getBusinessYear()}-${String(movementSeq).padStart(4, '0')}`;
            movementSeq++;

            if (batchId) {
                await insertStockMovement(client, {
                    movementNumber,
                    productId: params.productId,
                    batchId,
                    quantity: qty,
                    unitCost: row.costPrice,
                    movementType: params.movementType,
                    referenceType: params.referenceType,
                    referenceId: params.referenceId,
                    notes: params.notes,
                    userId: params.userId,
                    enteredQty: params.enteredQty,
                    baseUomId: params.baseUomId,
                    conversionFactor: params.conversionFactor,
                });
            }

            actualBatchCost = actualBatchCost.plus(qty.times(row.costPrice));

            if (!primaryProductLotId) {
                primaryProductLotId = row.lotId;
                primaryBatchId = batchId;
            }
        }

        await syncProductQuantity(client, params.productId);

        return {
            storeLocationId: params.storeLocationId,
            primaryProductLotId,
            primaryBatchId,
            actualBatchCost,
            movementCount: allocation.rows.length,
            nextMovementSeq: movementSeq,
        };
    },

    /**
     * Deduct sellable stock at the POS selling store and mirror batch subledger + SALE movements.
     * Must run inside the sale transaction (rows locked via FOR UPDATE).
     */
    async deductForSaleLine(
        client: PoolClient,
        params: {
            storeLocationId: string;
            productId: string;
            productName: string;
            baseQty: Decimal;
            saleId: string;
            saleNumber: string;
            soldBy: string | null;
            enteredQty: number;
            baseUomId: string;
            conversionFactor: string;
            movementSeqStart: number;
        },
    ): Promise<MultistoreSaleDeductionResult> {
        return this.deductAtStore(client, {
            storeLocationId: params.storeLocationId,
            productId: params.productId,
            productName: params.productName,
            baseQty: params.baseQty,
            movementType: 'SALE',
            referenceType: 'SALE',
            referenceId: params.saleId,
            notes: `Sale ${params.saleNumber} - FEFO store deduction`,
            userId: params.soldBy,
            enteredQty: params.enteredQty,
            baseUomId: params.baseUomId,
            conversionFactor: params.conversionFactor,
            movementSeqStart: params.movementSeqStart,
        });
    },
};
