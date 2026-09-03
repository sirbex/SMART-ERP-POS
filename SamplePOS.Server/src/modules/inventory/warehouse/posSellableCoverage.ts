/**
 * INV-POS — sellable batch stock must be visible to POS (SELLING store).
 *
 * Multistore POS reads only active SELLING balances. Stock sitting solely on MAIN
 * (or batches with no product_lots/balances) makes Inventory look stocked while POS shows 0.
 */
import type { Pool, PoolClient } from 'pg';
import { BusinessError } from '../../../middleware/errorHandler.js';
import { isMultistoreEnabled } from './multistoreSettings.js';
import logger from '../../../utils/logger.js';

export type DbConn = Pool | PoolClient;

export const POS_SELLABLE_TOLERANCE = 0.001;

export interface PosSellableGap {
  productId: string;
  sku: string;
  productName: string;
  inventoryBatchId: string;
  batchRemaining: number;
  sellingSellable: number;
  mainOnHand: number;
  reason:
    | 'NO_LOT'
    | 'SELLING_ZERO_MAIN_HAS'
    | 'SELLING_ZERO_QUARANTINE_HAS'
    | 'SELLING_ZERO_NO_BALANCES';
  quarantineOnHand: number;
}

/**
 * ACTIVE sellable batches with remaining qty that POS cannot sell.
 */
export async function findPosSellableCoverageGaps(
  conn: DbConn,
  productId?: string,
): Promise<PosSellableGap[]> {
  const params: unknown[] = [];
  let productFilter = '';
  if (productId) {
    params.push(productId);
    productFilter = `AND b.product_id = $${params.length}`;
  }

  const result = await conn.query<{
    product_id: string;
    sku: string;
    product_name: string;
    inventory_batch_id: string;
    batch_remaining: string;
    selling_sellable: string;
    main_on_hand: string;
    quarantine_on_hand: string;
    has_lot: boolean;
  }>(
    `WITH selling AS (
       SELECT id FROM store_locations
       WHERE is_active = true AND store_type = 'SELLING'
       ORDER BY is_pos_selling DESC, code ASC
       LIMIT 1
     ),
     main AS (
       SELECT id FROM store_locations
       WHERE is_active = true AND store_type = 'MAIN'
       ORDER BY is_default_receiving DESC, code ASC
       LIMIT 1
     )
     SELECT
       b.product_id,
       COALESCE(p.sku, '') AS sku,
       COALESCE(p.name, '') AS product_name,
       b.id AS inventory_batch_id,
       b.remaining_quantity::text AS batch_remaining,
       COALESCE((
         SELECT SUM(GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0))
         FROM inventory_balances ib
         JOIN product_lots pl ON pl.id = ib.product_lot_id
         WHERE pl.inventory_batch_id = b.id
           AND ib.store_location_id = (SELECT id FROM selling)
           AND pl.status = 'ACTIVE'
           AND NOT ib.blocked
       ), 0)::text AS selling_sellable,
       COALESCE((
         SELECT SUM(ib.quantity_on_hand)
         FROM inventory_balances ib
         JOIN product_lots pl ON pl.id = ib.product_lot_id
         WHERE pl.inventory_batch_id = b.id
           AND ib.store_location_id = (SELECT id FROM main)
       ), 0)::text AS main_on_hand,
       COALESCE((
         SELECT SUM(ib.quantity_on_hand)
         FROM inventory_balances ib
         JOIN product_lots pl ON pl.id = ib.product_lot_id
         JOIN store_locations sl ON sl.id = ib.store_location_id
         WHERE pl.inventory_batch_id = b.id
           AND sl.is_active = true
           AND sl.store_type IN ('RETURN', 'DAMAGE', 'EXPIRED')
       ), 0)::text AS quarantine_on_hand,
       EXISTS (SELECT 1 FROM product_lots pl WHERE pl.inventory_batch_id = b.id) AS has_lot
     FROM inventory_batches b
     JOIN products p ON p.id = b.product_id
     WHERE b.status = 'ACTIVE'
       AND b.remaining_quantity > ${POS_SELLABLE_TOLERANCE}
       AND p.is_active = true
       AND COALESCE(p.product_type, 'product') <> 'service'
       ${productFilter}`,
    params,
  );

  const gaps: PosSellableGap[] = [];
  for (const row of result.rows) {
    const batchRemaining = parseFloat(row.batch_remaining);
    const sellingSellable = parseFloat(row.selling_sellable);
    const mainOnHand = parseFloat(row.main_on_hand);
    const quarantineOnHand = parseFloat(row.quarantine_on_hand);
    if (sellingSellable > POS_SELLABLE_TOLERANCE) continue;

    let reason: PosSellableGap['reason'];
    if (!row.has_lot) reason = 'NO_LOT';
    else if (mainOnHand > POS_SELLABLE_TOLERANCE) reason = 'SELLING_ZERO_MAIN_HAS';
    else if (quarantineOnHand > POS_SELLABLE_TOLERANCE) reason = 'SELLING_ZERO_QUARANTINE_HAS';
    else reason = 'SELLING_ZERO_NO_BALANCES';

    gaps.push({
      productId: row.product_id,
      sku: row.sku,
      productName: row.product_name,
      inventoryBatchId: row.inventory_batch_id,
      batchRemaining,
      sellingSellable,
      mainOnHand,
      quarantineOnHand,
      reason,
    });
  }
  return gaps;
}

export async function assertPosSellableCoverageConsistent(
  conn: DbConn,
  context: string,
  productId?: string,
): Promise<void> {
  if (!(await isMultistoreEnabled(conn))) return;

  const gaps = await findPosSellableCoverageGaps(conn, productId);
  if (gaps.length === 0) return;

  logger.error('[INV-POS] Sellable stock not visible to POS (SELLING)', {
    context,
    productId: productId ?? 'ALL',
    gapCount: gaps.length,
    sample: gaps.slice(0, 5),
  });

  const sample = gaps[0];
  throw new BusinessError(
    `POS sellable coverage gap (${context}). ` +
      `${sample.sku || sample.productName}: batch=${sample.batchRemaining}, ` +
      `SELLING=${sample.sellingSellable}, MAIN=${sample.mainOnHand} (${sample.reason}). ` +
      `Run multistore sellable backfill / putaway so POS can sell.`,
    'ERR_POS_SELLABLE_COVERAGE',
    { context, gapCount: gaps.length, sample },
  );
}

/**
 * Hard fail for broken projections / zero balances (Bliss-class).
 * Does not fail when stock sits on MAIN (transfer pending) or RETURN/DAMAGE/EXPIRED
 * (customer return quarantine — not POS-sellable until putaway/transfer).
 */
export async function assertPosSellableProjectionConsistent(
  conn: DbConn,
  context: string,
  productId?: string,
): Promise<void> {
  if (!(await isMultistoreEnabled(conn))) return;

  const gaps = (await findPosSellableCoverageGaps(conn, productId)).filter(
    (g) =>
      g.reason === 'NO_LOT' ||
      g.reason === 'SELLING_ZERO_NO_BALANCES',
  );
  if (gaps.length === 0) return;

  logger.error('[INV-POS] Batch sellable with no POS projection/balances', {
    context,
    productId: productId ?? 'ALL',
    gapCount: gaps.length,
    sample: gaps.slice(0, 5),
  });

  const sample = gaps[0];
  throw new BusinessError(
    `POS sellable projection missing (${context}). ` +
      `${sample.sku || sample.productName}: batch=${sample.batchRemaining} (${sample.reason}).`,
    'ERR_POS_SELLABLE_PROJECTION',
    { context, gapCount: gaps.length, sample },
  );
}
