import type { PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { syncProductQuantity } from '../../../utils/inventorySync.js';
import { getBusinessYear } from '../../../utils/dateRange.js';
import { isMultistoreEnabled } from './multistoreSettings.js';
import { posProductSearchService } from './posProductSearchService.js';
import { lotService } from '../../inventory-lot/lotService.js';

export interface VoidSaleRestoreParams {
    productId: string;
    quantity: number;
    unitCost: number;
    storeLocationId?: string | null;
    productLotId?: string | null;
    batchId?: string | null;
    saleId: string;
    saleNumber: string;
    voidReason: string;
    voidedById: string;
}

export const warehouseSaleVoidRestoreService = {
    /**
     * Reverse a multistore sale deduction — restore via LotService.returnLot (ADR-002 W21).
     * Returns true when the multistore path handled restoration (caller skips legacy batch restore).
     */
    async restoreVoidedSaleLine(
        client: PoolClient,
        params: VoidSaleRestoreParams,
    ): Promise<boolean> {
        if (!(await isMultistoreEnabled(client))) {
            return false;
        }

        let storeLocationId = params.storeLocationId ?? null;
        const productLotId = params.productLotId ?? null;

        if (!storeLocationId) {
            storeLocationId = await posProductSearchService.resolveActiveSellingStoreId(client);
        }

        if (!storeLocationId || !productLotId) {
            return false;
        }

        const lotCheck = await client.query<{ product_id: string; inventory_batch_id: string | null }>(
            `SELECT product_id, inventory_batch_id FROM product_lots WHERE id = $1`,
            [productLotId],
        );
        if (!lotCheck.rows[0] || lotCheck.rows[0].product_id !== params.productId) {
            return false;
        }

        const qty = new Decimal(params.quantity);
        if (qty.lte(0)) {
            return true;
        }

        const batchId = params.batchId ?? lotCheck.rows[0].inventory_batch_id;
        if (!batchId) {
            return false;
        }

        await lotService.returnLot(client, {
            productId: params.productId,
            batchId,
            quantity: qty.toNumber(),
            costPrice: params.unitCost,
            targetStoreLocationId: storeLocationId,
            referenceType: 'VOID',
            referenceId: params.saleId,
            notes: `Void sale ${params.saleNumber}: ${params.voidReason}`,
            userId: params.voidedById,
        });

        await client.query(`SELECT pg_advisory_xact_lock(hashtext('movement_number_seq'))`);
        const movNumRes = await client.query<{ movement_number: string }>(
            `SELECT 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' ||
             CASE WHEN (COALESCE(MAX(CAST(SUBSTRING(movement_number FROM 10) AS INTEGER)), 0) + 1) <= 9999
                  THEN LPAD((COALESCE(MAX(CAST(SUBSTRING(movement_number FROM 10) AS INTEGER)), 0) + 1)::TEXT, 4, '0')
                  ELSE (COALESCE(MAX(CAST(SUBSTRING(movement_number FROM 10) AS INTEGER)), 0) + 1)::TEXT
             END AS movement_number
             FROM stock_movements
             WHERE movement_number LIKE 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'`,
        );
        const movementNumber =
            movNumRes.rows[0]?.movement_number ?? `MOV-${getBusinessYear()}-0001`;

        await client.query(
            `INSERT INTO stock_movements (
               movement_number, product_id, batch_id, movement_type, quantity, unit_cost,
               reference_type, reference_id, notes, created_by_id
             ) VALUES ($1, $2, $3, 'ADJUSTMENT_IN', $4, $5, 'VOID', $6, $7, $8)`,
            [
                movementNumber,
                params.productId,
                batchId,
                qty.toFixed(4),
                params.unitCost,
                params.saleId,
                `Void sale ${params.saleNumber}: ${params.voidReason}`,
                params.voidedById,
            ],
        );

        await syncProductQuantity(client, params.productId);
        return true;
    },
};
