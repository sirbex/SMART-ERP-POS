/**
 * Quarantine aging workqueue — stock still valued on 1300 (Phase 2B + LQ13 soft).
 * Multistore: DAMAGE/EXPIRED/RETURN store balances.
 * Single-store: soft-quarantined lots (EXPIRED / QUARANTINED status).
 */

import type { Pool, PoolClient } from 'pg';
import { isMultistoreEnabled } from '../inventory/warehouse/multistoreSettings.js';
import { softQuarantineBucketForStatus } from '@shared/loss-quarantine/index.js';

export type DbConn = Pool | PoolClient;

export type QuarantineMode = 'HARD' | 'SOFT';

export interface QuarantineAgingLine {
  quarantineMode: QuarantineMode;
  storeLocationId: string | null;
  storeCode: string;
  storeName: string;
  storeType: string;
  productId: string;
  productName: string;
  productSku: string | null;
  productLotId: string | null;
  inventoryBatchId: string | null;
  lotNumber: string;
  lotStatus: string;
  quantity: number;
  unitCost: number;
  inventoryValue: number;
  /** Days since balance/status last updated (proxy for age in quarantine). */
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
  quarantineMode: QuarantineMode;
  summary: QuarantineAgingSummary;
  lines: QuarantineAgingLine[];
}

function parseNum(v: string | number | null | undefined): number {
  return Number(v ?? 0);
}

function summarize(lines: QuarantineAgingLine[]): QuarantineAgingSummary {
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
    totalLines: lines.length,
    totalQuantity,
    totalValue,
    byStoreType,
  };
}

async function getHardQuarantineAging(
  conn: DbConn,
  options: { minAgeDays: number; storeType?: string; limit: number },
): Promise<QuarantineAgingLine[]> {
  const params: unknown[] = [options.minAgeDays, options.limit];
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

  return result.rows.map((r) => ({
    quarantineMode: 'HARD' as const,
    storeLocationId: r.store_location_id,
    storeCode: r.store_code,
    storeName: r.store_name,
    storeType: r.store_type,
    productId: r.product_id,
    productName: r.product_name,
    productSku: r.product_sku,
    productLotId: r.product_lot_id,
    inventoryBatchId: r.inventory_batch_id,
    lotNumber: r.lot_number,
    lotStatus: r.lot_status,
    quantity: parseNum(r.quantity),
    unitCost: parseNum(r.unit_cost),
    inventoryValue: parseNum(r.inventory_value),
    ageDays: parseNum(r.age_days),
    firstSeenAt: r.first_seen_at,
  }));
}

async function getSoftQuarantineAging(
  conn: DbConn,
  options: { minAgeDays: number; storeType?: string; limit: number },
): Promise<QuarantineAgingLine[]> {
  const params: unknown[] = [options.minAgeDays, options.limit];
  let statusFilter = `AND COALESCE(ib.status::text, pl.status, 'ACTIVE') IN ('EXPIRED', 'QUARANTINED')`;
  if (options.storeType === 'EXPIRED') {
    statusFilter = `AND COALESCE(ib.status::text, pl.status, 'ACTIVE') = 'EXPIRED'`;
  } else if (options.storeType === 'DAMAGE') {
    statusFilter = `AND COALESCE(ib.status::text, pl.status, 'ACTIVE') = 'QUARANTINED'`;
  } else if (options.storeType === 'RETURN') {
    return [];
  }

  const result = await conn.query<{
    product_id: string;
    product_name: string;
    product_sku: string | null;
    product_lot_id: string | null;
    inventory_batch_id: string;
    lot_number: string;
    lot_status: string;
    quantity: string;
    unit_cost: string;
    inventory_value: string;
    age_days: string;
    first_seen_at: string | null;
  }>(
    `SELECT
       ib.product_id,
       p.name AS product_name,
       p.sku AS product_sku,
       pl.id AS product_lot_id,
       ib.id AS inventory_batch_id,
       COALESCE(pl.lot_number, ib.batch_number, ib.id::text) AS lot_number,
       COALESCE(ib.status::text, pl.status, 'ACTIVE') AS lot_status,
       ib.remaining_quantity::text AS quantity,
       COALESCE(ib.cost_price, 0)::text AS unit_cost,
       (ib.remaining_quantity * COALESCE(ib.cost_price, 0))::text AS inventory_value,
       GREATEST(
         EXTRACT(EPOCH FROM (NOW() - COALESCE(ib.updated_at, NOW()))) / 86400,
         0
       )::int AS age_days,
       ib.updated_at::text AS first_seen_at
     FROM inventory_batches ib
     INNER JOIN products p ON p.id = ib.product_id
     LEFT JOIN LATERAL (
       SELECT id, lot_number, status
       FROM product_lots
       WHERE inventory_batch_id = ib.id
       ORDER BY created_at ASC NULLS LAST
       LIMIT 1
     ) pl ON true
     WHERE ib.remaining_quantity > 0.0001
       ${statusFilter}
       AND GREATEST(
         EXTRACT(EPOCH FROM (NOW() - COALESCE(ib.updated_at, NOW()))) / 86400,
         0
       ) >= $1
     ORDER BY inventory_value DESC, age_days DESC
     LIMIT $2`,
    params,
  );

  return result.rows.map((r) => {
    const lotStatus = r.lot_status;
    const bucket = softQuarantineBucketForStatus(lotStatus);
    return {
      quarantineMode: 'SOFT' as const,
      storeLocationId: null,
      storeCode: 'SOFT',
      storeName: 'Soft quarantine',
      storeType: bucket,
      productId: r.product_id,
      productName: r.product_name,
      productSku: r.product_sku,
      productLotId: r.product_lot_id,
      inventoryBatchId: r.inventory_batch_id,
      lotNumber: r.lot_number,
      lotStatus,
      quantity: parseNum(r.quantity),
      unitCost: parseNum(r.unit_cost),
      inventoryValue: parseNum(r.inventory_value),
      ageDays: parseNum(r.age_days),
      firstSeenAt: r.first_seen_at,
    };
  });
}

export async function getQuarantineAging(
  conn: DbConn,
  options: { minAgeDays?: number; storeType?: string; limit?: number } = {},
): Promise<QuarantineAgingReport> {
  const minAge = Math.max(0, options.minAgeDays ?? 0);
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 2000);
  const multistore = await isMultistoreEnabled(conn);
  const quarantineMode: QuarantineMode = multistore ? 'HARD' : 'SOFT';

  const lines = multistore
    ? await getHardQuarantineAging(conn, { minAgeDays: minAge, storeType: options.storeType, limit })
    : await getSoftQuarantineAging(conn, { minAgeDays: minAge, storeType: options.storeType, limit });

  return {
    asOf: new Date().toISOString(),
    quarantineMode,
    summary: summarize(lines),
    lines,
  };
}
