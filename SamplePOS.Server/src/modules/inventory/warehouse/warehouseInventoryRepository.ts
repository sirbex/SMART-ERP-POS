import type { PoolClient } from 'pg';
import { ValidationError } from '../../../middleware/errorHandler.js';
import {
    normalizeInventoryBalance,
    type InventoryBalance,
    type InventoryBalanceDbRow,
} from '../../../../../shared/types/warehouseNetwork.js';
import {
    getLotByIdWithClient,
    getProductLotIdByBatchId,
    postgresLotRepository,
} from '../../inventory-lot/postgresLotRepository.js';

export interface UpsertReceiptParams {
    storeLocationId: string;
    productId: string;
    lotNumber: string;
    expiryDate?: string | null;
    costPrice: number;
    quantity: number;
    goodsReceiptId?: string | null;
    inventoryBatchId?: string | null;
    isBonus?: boolean;
}

export interface MoveLotQuantityParams {
    fromStoreId: string;
    toStoreId: string;
    productId: string;
    productLotId: string;
    quantity: number;
    /** Track transfer_out on source / transfer_in on destination for visibility. */
    trackTransferMetrics?: boolean;
}

/**
 * Composite inventory layer — lot UPSERT + balance UPSERT (ON CONFLICT).
 * All methods require an active transaction (PoolClient).
 */
export const warehouseInventoryRepository = {
    /**
     * GRN receipt posting: upsert product_lots then increment inventory_balances at target store.
     */
    async upsertLotAndIncrementBalance(
        client: PoolClient,
        params: UpsertReceiptParams,
    ): Promise<{ lotId: string; balance: InventoryBalance }> {
        if (params.quantity <= 0) {
            throw new ValidationError('Receipt quantity must be positive');
        }
        if (!params.inventoryBatchId) {
            throw new ValidationError(
                'upsertLotAndIncrementBalance requires inventoryBatchId — use LotService.receiveLot for new lots',
            );
        }

        const master = await getLotByIdWithClient(client, params.inventoryBatchId);
        if (!master || master.productId !== params.productId) {
            throw new ValidationError('Inventory batch master not found for receipt segment');
        }

        await postgresLotRepository.upsertProjection(client, {
            inventoryBatchId: params.inventoryBatchId,
            productId: params.productId,
            lotNumber: params.lotNumber,
            expiryDate: master.attributes.expiryDate,
            costPrice: params.costPrice,
            goodsReceiptId: params.goodsReceiptId,
            isBonus: params.isBonus,
            status: 'ACTIVE',
        });

        const lotId = await getProductLotIdByBatchId(client, params.inventoryBatchId);
        if (!lotId) {
            throw new ValidationError('Product lot projection missing after receipt upsert');
        }

        const balanceResult = await client.query<InventoryBalanceDbRow>(
            `INSERT INTO inventory_balances (
               store_location_id, product_id, product_lot_id, quantity_on_hand
             ) VALUES ($1, $2, $3, $4)
             ON CONFLICT (store_location_id, product_lot_id) DO UPDATE SET
               quantity_on_hand = inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
               product_id = EXCLUDED.product_id,
               updated_at = NOW()
             RETURNING *`,
            [params.storeLocationId, params.productId, lotId, params.quantity],
        );

        return {
            lotId,
            balance: normalizeInventoryBalance(balanceResult.rows[0]),
        };
    },

    /**
     * Move sellable quantity between stores with row-level locks (FOR UPDATE).
     */
    async moveLotQuantityBetweenStores(
        client: PoolClient,
        params: MoveLotQuantityParams,
    ): Promise<void> {
        if (params.quantity <= 0) {
            throw new ValidationError('Transfer quantity must be positive');
        }

        const sourceRes = await client.query<InventoryBalanceDbRow>(
            `SELECT *
             FROM inventory_balances
             WHERE store_location_id = $1 AND product_lot_id = $2
             FOR UPDATE`,
            [params.fromStoreId, params.productLotId],
        );

        if (sourceRes.rows.length === 0) {
            throw new ValidationError(
                `No inventory balance at source store for lot ${params.productLotId}`,
            );
        }

        const source = sourceRes.rows[0];
        const available =
            parseFloat(source.quantity_on_hand)
            - parseFloat(source.quantity_reserved)
            - parseFloat(source.quantity_committed);

        if (available < params.quantity) {
            throw new ValidationError(
                `Insufficient sellable stock at source store. Available ${available}, requested ${params.quantity}.`,
            );
        }

        const transferOutSql = params.trackTransferMetrics
            ? `, quantity_transfer_out = inventory_balances.quantity_transfer_out + $2`
            : '';
        const transferInSql = params.trackTransferMetrics
            ? `, quantity_transfer_in = inventory_balances.quantity_transfer_in + EXCLUDED.quantity_on_hand`
            : '';

        await client.query(
            `UPDATE inventory_balances
             SET quantity_on_hand = quantity_on_hand - $2${transferOutSql},
                 updated_at = NOW()
             WHERE id = $1`,
            [source.id, params.quantity],
        );

        await client.query(
            `INSERT INTO inventory_balances (
               store_location_id, product_id, product_lot_id, quantity_on_hand
             ) VALUES ($1, $2, $3, $4)
             ON CONFLICT (store_location_id, product_lot_id) DO UPDATE SET
               quantity_on_hand = inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
               product_id = EXCLUDED.product_id${transferInSql},
               updated_at = NOW()`,
            [params.toStoreId, params.productId, params.productLotId, params.quantity],
        );
    },

    /**
     * Increment sellable quantity for an existing product_lot at a store.
     */
    async incrementBalanceAtStore(
        client: PoolClient,
        params: {
            storeLocationId: string;
            productId: string;
            productLotId: string;
            quantity: number;
        },
    ): Promise<void> {
        if (params.quantity <= 0) {
            throw new ValidationError('Receipt quantity must be positive');
        }

        await client.query(
            `INSERT INTO inventory_balances (
               store_location_id, product_id, product_lot_id, quantity_on_hand
             ) VALUES ($1, $2, $3, $4)
             ON CONFLICT (store_location_id, product_lot_id) DO UPDATE SET
               quantity_on_hand = inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
               product_id = EXCLUDED.product_id,
               updated_at = NOW()`,
            [params.storeLocationId, params.productId, params.productLotId, params.quantity],
        );
    },

    async getSellableQuantityAtStore(
        client: PoolClient,
        storeLocationId: string,
        productLotId: string,
    ): Promise<number> {
        const result = await client.query<{ available: string }>(
            `SELECT GREATEST(
               quantity_on_hand - quantity_reserved - quantity_committed,
               0
             ) AS available
             FROM inventory_balances
             WHERE store_location_id = $1 AND product_lot_id = $2`,
            [storeLocationId, productLotId],
        );
        if (result.rows.length === 0) return 0;
        return parseFloat(result.rows[0].available);
    },

    /**
     * Adjust sellable quantity at a store (composite layer). Requires active transaction.
     */
    async adjustSellableQuantity(
        client: PoolClient,
        params: {
            storeLocationId: string;
            productLotId: string;
            productId: string;
            quantity: number;
            direction: 'IN' | 'OUT';
        },
    ): Promise<void> {
        if (params.quantity <= 0) {
            throw new ValidationError('Adjustment quantity must be positive');
        }

        const balanceRes = await client.query<{
            id: string;
            quantity_on_hand: string;
            quantity_reserved: string;
            quantity_committed: string;
        }>(
            `SELECT id, quantity_on_hand, quantity_reserved, quantity_committed
             FROM inventory_balances
             WHERE store_location_id = $1 AND product_lot_id = $2
             FOR UPDATE`,
            [params.storeLocationId, params.productLotId],
        );

        if (params.direction === 'OUT') {
            if (balanceRes.rows.length === 0) {
                throw new ValidationError('No inventory balance at the selected store for this lot');
            }

            const row = balanceRes.rows[0];
            const available =
                parseFloat(row.quantity_on_hand)
                - parseFloat(row.quantity_reserved)
                - parseFloat(row.quantity_committed);

            if (available < params.quantity) {
                throw new ValidationError(
                    `Insufficient sellable stock at store. Available ${available}, requested ${params.quantity}.`,
                );
            }

            await client.query(
                `UPDATE inventory_balances
                 SET quantity_on_hand = quantity_on_hand - $2,
                     updated_at = NOW()
                 WHERE id = $1`,
                [row.id, params.quantity],
            );
            return;
        }

        if (balanceRes.rows.length === 0) {
            await client.query(
                `INSERT INTO inventory_balances (
                   store_location_id, product_id, product_lot_id, quantity_on_hand
                 ) VALUES ($1, $2, $3, $4)`,
                [params.storeLocationId, params.productId, params.productLotId, params.quantity],
            );
            return;
        }

        await client.query(
            `UPDATE inventory_balances
             SET quantity_on_hand = quantity_on_hand + $2,
                 updated_at = NOW()
             WHERE id = $1`,
            [balanceRes.rows[0].id, params.quantity],
        );
    },
};
