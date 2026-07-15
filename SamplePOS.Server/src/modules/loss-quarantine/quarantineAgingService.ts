/**
 * Quarantine aging workqueue — stock in DAMAGE/EXPIRED/RETURN still valued on 1300 (Phase 2B)
 */

import type { Pool, PoolClient } from 'pg';
import { isMultistoreEnabled } from '../inventory/warehouse/multistoreSettings.js';
import { ValidationError } from '../../middleware/errorHandler.js';

export type DbConn = Pool | PoolClient;

export interface QuarantineAgingLine {
  storeLocationId: string;
  storeCode: string;
  storeName: string;
  storeType: string;
  productId: string;
  productName: string;
  productSku: string | null;
  productLotId: string;
  lotNumber: string;
  inventoryBatchId: string | null;
  lotStatus: string;
  quantity: number;
  unitCost: number;
  inventoryValue: number;
  /** Days since balance row last updated (proxy for age in quarantine). */
  ageDays: number;
  firstSeenAt: string | null;
}

export interface QuarantineAgingSummary {
  totalLines: number;
  totalQuantity: number;
  totalValue: number;
  byStoreType: Record<string, { lines: number; quantity: number; value: number }>;
}

export interface QuarantineAgingReport {
  asOf: string;
  summary: QuarantineAgingSummary;
  lines: QuarantineAgingLine[];
}

function parseNum(v: string | number | null | undefined): number {
  return Number(v ?? 0);
}

export async function getQuarantineAging(
  conn: DbConn,
  options: { minAgeDays?: number; storeType?: string; limit?: number } = {},
): Promise<QuarantineAgingReport> {
  if (!(await isMultistoreEnabled(conn))) {
    throw new ValidationError('Quarantine aging requires multi-store mode');
  }

  const minAge = Math.max(0, options.minAgeDays ?? 0);
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 2000);
  const params: unknown[] = [minAge, limit];
  let storeFilter = '';
  if (options.storeType) {
    params.push(options.storeType);
    storeFilter = ` AND sl.store_type = $${params.length}`;
  }

  const result = await conn.query<{
    store_location_id: string;
    store_code: string;
    store_name: string;
    store_type: string;
    product_id: string;
    product_name: string;
    product_sku: string | null;
    product_lot_id: string;
    lot_number: string;
    inventory_batch_id: string | null;
    lot_status: string;
    quantity: string;
    unit_cost: string;
    inventory_value: string;
    age_days: string;
    first_seen_at: string | null;
  }>(
    `SELECT
       sl.id AS store_location_id,
       sl.code AS store_code,
       sl.name AS store_name,
       sl.store_type,
       p.id AS product_id,
       p.name AS product_name,
       p.sku AS product_sku,
       pl.id AS product_lot_id,
       COALESCE(pl.lot_number, ib.batch_number, pl.id::text) AS lot_number,
       pl.inventory_batch_id,
       COALESCE(ib.status::text, pl.status, 'ACTIVE') AS lot_status,
       GREATEST(bal.quantity_on_hand - bal.quantity_reserved - bal.quantity_committed, 0) AS quantity,
       COALESCE(ib.cost_price, pl.cost_price, 0) AS unit_cost,
       GREATEST(bal.quantity_on_hand - bal.quantity_reserved - bal.quantity_committed, 0)
         * COALESCE(ib.cost_price, pl.cost_price, 0) AS inventory_value,
       GREATEST(
         EXTRACT(EPOCH FROM (NOW() - COALESCE(bal.updated_at, NOW()))) / 86400,
         0
       )::int AS age_days,
       bal.updated_at::text AS first_seen_at
     FROM inventory_balances bal
     INNER JOIN store_locations sl ON sl.id = bal.store_location_id
     INNER JOIN product_lots pl ON pl.id = bal.product_lot_id
     INNER JOIN products p ON p.id = pl.product_id
     LEFT JOIN inventory_batches ib ON ib.id = pl.inventory_batch_id
     WHERE sl.is_active = true
       AND sl.store_type IN ('DAMAGE', 'EXPIRED', 'RETURN')
       AND NOT bal.blocked
       AND GREATEST(bal.quantity_on_hand - bal.quantity_reserved - bal.quantity_committed, 0) > 0.0001
       AND GREATEST(
         EXTRACT(EPOCH FROM (NOW() - COALESCE(bal.updated_at, NOW()))) / 86400,
         0
       ) >= $1
       ${storeFilter}
     ORDER BY inventory_value DESC, age_days DESC
     LIMIT $2`,
    params,
  );

  const lines: QuarantineAgingLine[] = result.rows.map((r) => ({
    storeLocationId: r.store_location_id,
    storeCode: r.store_code,
    storeName: r.store_name,
    storeType: r.store_type,
    productId: r.product_id,
    productName: r.product_name,
    productSku: r.product_sku,
    productLotId: r.product_lot_id,
    lotNumber: r.lot_number,
    inventoryBatchId: r.inventory_batch_id,
    lotStatus: r.lot_status,
    quantity: parseNum(r.quantity),
    unitCost: parseNum(r.unit_cost),
    inventoryValue: parseNum(r.inventory_value),
    ageDays: parseNum(r.age_days),
    firstSeenAt: r.first_seen_at,
  }));

  const byStoreType: QuarantineAgingSummary['byStoreType'] = {};
  let totalQuantity = 0;
  let totalValue = 0;
  for (const line of lines) {
    totalQuantity += line.quantity;
    totalValue += line.inventoryValue;
    const bucket = byStoreType[line.storeType] ?? { lines: 0, quantity: 0, value: 0 };
    bucket.lines += 1;
    bucket.quantity += line.quantity;
    bucket.value += line.inventoryValue;
    byStoreType[line.storeType] = bucket;
  }

  return {
    asOf: new Date().toISOString(),
    summary: {
      totalLines: lines.length,
      totalQuantity,
      totalValue,
      byStoreType,
    },
    lines,
  };
}
