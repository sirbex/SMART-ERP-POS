import type { PoolClient } from 'pg';
import Decimal from 'decimal.js';

export interface PosAllocationLockRow {
    sourceType: 'legacy_batch' | 'composite_balance';
    rowId: string;
    lotId?: string;
    lotNumber?: string;
    expiryDate?: string | null;
    quantityAvailable: number;
    costPrice: number;
}

export interface PosAllocationLockResult {
    productId: string;
    storeLocationId?: string;
    requestedQuantity: number;
    allocatedQuantity: number;
    sufficient: boolean;
    rows: PosAllocationLockRow[];
}

/**
 * Legacy FEFO row locks on inventory_batches (single-store).
 * Must run inside an open transaction (PoolClient).
 */
export async function lockLegacyBatchesForAllocation(
    client: PoolClient,
    productId: string,
    quantity: number,
): Promise<PosAllocationLockResult> {
    const batchRes = await client.query<{
        id: string;
        remaining_quantity: string;
        cost_price: string;
        expiry_date: string | null;
        batch_number: string;
    }>(
        `SELECT b.id, b.remaining_quantity, b.cost_price, b.expiry_date, b.batch_number
         FROM inventory_batches b
         INNER JOIN products p ON p.id = b.product_id
         WHERE b.product_id = $1
           AND b.status = 'ACTIVE'
           AND b.remaining_quantity > 0
           AND (b.expiry_date IS NULL OR b.expiry_date > CURRENT_DATE)
           AND (
             b.expiry_date IS NULL
             OR b.expiry_date > CURRENT_DATE + COALESCE(p.min_days_before_expiry_sale, 0) * INTERVAL '1 day'
           )
         ORDER BY b.expiry_date ASC NULLS LAST, b.received_date ASC
         FOR UPDATE`,
        [productId],
    );

    return planAllocationFromRows(
        productId,
        quantity,
        batchRes.rows.map((r) => ({
            sourceType: 'legacy_batch' as const,
            rowId: r.id,
            lotNumber: r.batch_number,
            expiryDate: r.expiry_date,
            quantityAvailable: parseFloat(r.remaining_quantity),
            costPrice: parseFloat(r.cost_price),
        })),
    );
}

/**
 * Multistore FEFO row locks on inventory_balances at a single store_location_id.
 * Must run inside an open transaction (PoolClient).
 */
export async function lockMultistoreBalancesForAllocation(
    client: PoolClient,
    storeLocationId: string,
    productId: string,
    quantity: number,
): Promise<PosAllocationLockResult> {
    const balanceRes = await fetchMultistoreSellableBalances(
        client,
        storeLocationId,
        productId,
        true,
    );

    return planAllocationFromRows(
        productId,
        quantity,
        balanceRes.rows.map((r) => {
            const available = Math.max(
                parseFloat(r.quantity_on_hand)
                    - parseFloat(r.quantity_reserved)
                    - parseFloat(r.quantity_committed),
                0,
            );
            return {
                sourceType: 'composite_balance' as const,
                rowId: r.id,
                lotId: r.product_lot_id,
                lotNumber: r.lot_number,
                expiryDate: r.expiry_date,
                quantityAvailable: available,
                costPrice: parseFloat(r.cost_price),
            };
        }),
        storeLocationId,
    );
}

async function fetchMultistoreSellableBalances(
    client: PoolClient,
    storeLocationId: string,
    productId: string,
    forUpdate: boolean,
) {
    const lockSql = forUpdate ? ' FOR UPDATE OF ib' : '';
    return client.query<{
        id: string;
        quantity_on_hand: string;
        quantity_reserved: string;
        quantity_committed: string;
        cost_price: string;
        expiry_date: string | null;
        lot_number: string;
        product_lot_id: string;
    }>(
        `SELECT
           ib.id,
           ib.quantity_on_hand,
           ib.quantity_reserved,
           ib.quantity_committed,
           pl.cost_price,
           pl.expiry_date,
           pl.lot_number,
           pl.id AS product_lot_id
         FROM inventory_balances ib
         INNER JOIN product_lots pl ON pl.id = ib.product_lot_id
         INNER JOIN products p ON p.id = ib.product_id
         WHERE ib.store_location_id = $1
           AND ib.product_id = $2
           AND pl.status = 'ACTIVE'
           AND NOT ib.blocked
           AND ib.quantity_on_hand > 0
           AND (pl.expiry_date IS NULL OR pl.expiry_date > CURRENT_DATE)
           AND (
             pl.expiry_date IS NULL
             OR pl.expiry_date > CURRENT_DATE + COALESCE(p.min_days_before_expiry_sale, 0) * INTERVAL '1 day'
           )
         ORDER BY pl.expiry_date ASC NULLS LAST, pl.received_date ASC${lockSql}`,
        [storeLocationId, productId],
    );
}

/**
 * Read-only FEFO allocation plan at a store (COGS preview / availability).
 */
export async function previewMultistoreBalancesForAllocation(
    client: PoolClient,
    storeLocationId: string,
    productId: string,
    quantity: number,
): Promise<PosAllocationLockResult> {
    const balanceRes = await fetchMultistoreSellableBalances(
        client,
        storeLocationId,
        productId,
        false,
    );

    return planAllocationFromRows(
        productId,
        quantity,
        balanceRes.rows.map((r) => {
            const available = Math.max(
                parseFloat(r.quantity_on_hand)
                    - parseFloat(r.quantity_reserved)
                    - parseFloat(r.quantity_committed),
                0,
            );
            return {
                sourceType: 'composite_balance' as const,
                rowId: r.id,
                lotId: r.product_lot_id,
                lotNumber: r.lot_number,
                expiryDate: r.expiry_date,
                quantityAvailable: available,
                costPrice: parseFloat(r.cost_price),
            };
        }),
        storeLocationId,
    );
}

function planAllocationFromRows(
    productId: string,
    quantity: number,
    rows: PosAllocationLockRow[],
    storeLocationId?: string,
): PosAllocationLockResult {
    let remaining = new Decimal(quantity);
    const locked: PosAllocationLockRow[] = [];

    for (const row of rows) {
        if (remaining.lte(0)) break;
        if (row.quantityAvailable <= 0) continue;

        const take = Decimal.min(remaining, new Decimal(row.quantityAvailable));
        locked.push({ ...row, quantityAvailable: take.toNumber() });
        remaining = remaining.minus(take);
    }

    const allocated = new Decimal(quantity).minus(remaining).toNumber();

    return {
        productId,
        storeLocationId,
        requestedQuantity: quantity,
        allocatedQuantity: allocated,
        sufficient: remaining.lte(0),
        rows: locked,
    };
}
