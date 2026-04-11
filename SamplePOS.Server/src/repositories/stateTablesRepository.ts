/**
 * State Tables Repository — UPSERT functions for SAP-style write-time aggregation
 *
 * Architecture: "Transaction tables are history. State tables are reality."
 * All functions accept a PoolClient and run INSIDE the posting transaction.
 * Uses ON CONFLICT DO UPDATE with additive math — never full replacement.
 *
 * Tables: product_daily_summary, customer_balances, supplier_balances, inventory_balances
 * (sales_daily_summary is maintained by salesRepository.incrementDailySummary)
 */

import type { PoolClient } from 'pg';
import Decimal from 'decimal.js';

// ============================================================================
// PRODUCT DAILY SUMMARY — Per-product per-day sales rollup
// ============================================================================

export interface ProductDailySummaryUpsert {
  businessDate: string;   // YYYY-MM-DD
  productId: string;      // UUID
  category: string;       // Product category (from products table)
  unitsSold: number;      // Quantity sold (positive for sale, negative for void)
  revenue: number;        // Line total (positive for sale, negative for void)
  costOfGoods: number;    // Unit cost * quantity
  discountGiven: number;  // Per-item discount
}

export async function upsertProductDailySummary(
  client: PoolClient,
  data: ProductDailySummaryUpsert
): Promise<void> {
  const grossProfit = new Decimal(data.revenue).minus(data.costOfGoods);

  await client.query(
    `INSERT INTO product_daily_summary (
        business_date, product_id, category,
        units_sold, revenue, cost_of_goods, gross_profit, discount_given,
        transaction_count, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, NOW())
     ON CONFLICT (business_date, product_id) DO UPDATE SET
        units_sold        = product_daily_summary.units_sold + EXCLUDED.units_sold,
        revenue           = product_daily_summary.revenue + EXCLUDED.revenue,
        cost_of_goods     = product_daily_summary.cost_of_goods + EXCLUDED.cost_of_goods,
        gross_profit      = product_daily_summary.gross_profit + EXCLUDED.gross_profit,
        discount_given    = product_daily_summary.discount_given + EXCLUDED.discount_given,
        transaction_count = product_daily_summary.transaction_count + 1,
        updated_at        = NOW()`,
    [
      data.businessDate,
      data.productId,
      data.category || 'Uncategorized',
      new Decimal(data.unitsSold).toFixed(4),
      new Decimal(data.revenue).toFixed(2),
      new Decimal(data.costOfGoods).toFixed(2),
      grossProfit.toFixed(2),
      new Decimal(data.discountGiven).toFixed(2),
    ]
  );
}

/**
 * Decrement product daily summary (for sale voids).
 * Uses negative additive math — same UPSERT pattern but with negative values.
 */
export async function decrementProductDailySummary(
  client: PoolClient,
  data: ProductDailySummaryUpsert
): Promise<void> {
  const grossProfit = new Decimal(data.revenue).minus(data.costOfGoods);

  await client.query(
    `UPDATE product_daily_summary SET
        units_sold        = units_sold - $3,
        revenue           = revenue - $4,
        cost_of_goods     = cost_of_goods - $5,
        gross_profit      = gross_profit - $6,
        discount_given    = discount_given - $7,
        transaction_count = GREATEST(transaction_count - 1, 0),
        updated_at        = NOW()
     WHERE business_date = $1 AND product_id = $2`,
    [
      data.businessDate,
      data.productId,
      new Decimal(data.unitsSold).toFixed(4),
      new Decimal(data.revenue).toFixed(2),
      new Decimal(data.costOfGoods).toFixed(2),
      grossProfit.toFixed(2),
      new Decimal(data.discountGiven).toFixed(2),
    ]
  );
}

// ============================================================================
// PRODUCT DAILY SUMMARY — Batch functions (100M-scale optimization)
// Single query replaces N per-item UPSERTs. Pre-aggregate by (date, productId)
// before calling to avoid ON CONFLICT self-collision.
// ============================================================================

export interface ProductDailySummaryBatchItem {
  productId: string;
  category: string;
  unitsSold: number;
  revenue: number;
  costOfGoods: number;
  discountGiven: number;
}

/**
 * Batch UPSERT product_daily_summary for multiple products in a single round-trip.
 * Items must be pre-aggregated by productId (no duplicate productIds allowed).
 */
export async function batchUpsertProductDailySummary(
  client: PoolClient,
  businessDate: string,
  items: ProductDailySummaryBatchItem[]
): Promise<void> {
  if (items.length === 0) return;

  const productIds: string[] = [];
  const categories: string[] = [];
  const unitsSoldArr: string[] = [];
  const revenueArr: string[] = [];
  const cogArr: string[] = [];
  const gpArr: string[] = [];
  const discountArr: string[] = [];

  for (const item of items) {
    const gp = new Decimal(item.revenue).minus(item.costOfGoods);
    productIds.push(item.productId);
    categories.push(item.category || 'Uncategorized');
    unitsSoldArr.push(new Decimal(item.unitsSold).toFixed(4));
    revenueArr.push(new Decimal(item.revenue).toFixed(2));
    cogArr.push(new Decimal(item.costOfGoods).toFixed(2));
    gpArr.push(gp.toFixed(2));
    discountArr.push(new Decimal(item.discountGiven).toFixed(2));
  }

  await client.query(
    `INSERT INTO product_daily_summary (
        business_date, product_id, category,
        units_sold, revenue, cost_of_goods, gross_profit, discount_given,
        transaction_count, updated_at
     )
     SELECT
        $1::date,
        unnest($2::uuid[]),
        unnest($3::text[]),
        unnest($4::numeric[]),
        unnest($5::numeric[]),
        unnest($6::numeric[]),
        unnest($7::numeric[]),
        unnest($8::numeric[]),
        1, NOW()
     ON CONFLICT (business_date, product_id) DO UPDATE SET
        units_sold        = product_daily_summary.units_sold + EXCLUDED.units_sold,
        revenue           = product_daily_summary.revenue + EXCLUDED.revenue,
        cost_of_goods     = product_daily_summary.cost_of_goods + EXCLUDED.cost_of_goods,
        gross_profit      = product_daily_summary.gross_profit + EXCLUDED.gross_profit,
        discount_given    = product_daily_summary.discount_given + EXCLUDED.discount_given,
        transaction_count = product_daily_summary.transaction_count + 1,
        updated_at        = NOW()`,
    [businessDate, productIds, categories, unitsSoldArr, revenueArr, cogArr, gpArr, discountArr]
  );
}

/**
 * Batch DECREMENT product_daily_summary for voids.
 * Single UPDATE...FROM with unnest arrays.
 * Items must be pre-aggregated by productId.
 */
export async function batchDecrementProductDailySummary(
  client: PoolClient,
  businessDate: string,
  items: ProductDailySummaryBatchItem[]
): Promise<void> {
  if (items.length === 0) return;

  const productIds: string[] = [];
  const unitsSoldArr: string[] = [];
  const revenueArr: string[] = [];
  const cogArr: string[] = [];
  const gpArr: string[] = [];
  const discountArr: string[] = [];

  for (const item of items) {
    const gp = new Decimal(item.revenue).minus(item.costOfGoods);
    productIds.push(item.productId);
    unitsSoldArr.push(new Decimal(item.unitsSold).toFixed(4));
    revenueArr.push(new Decimal(item.revenue).toFixed(2));
    cogArr.push(new Decimal(item.costOfGoods).toFixed(2));
    gpArr.push(gp.toFixed(2));
    discountArr.push(new Decimal(item.discountGiven).toFixed(2));
  }

  await client.query(
    `UPDATE product_daily_summary AS pds SET
        units_sold        = pds.units_sold - v.units_sold,
        revenue           = pds.revenue - v.revenue,
        cost_of_goods     = pds.cost_of_goods - v.cog,
        gross_profit      = pds.gross_profit - v.gp,
        discount_given    = pds.discount_given - v.discount,
        transaction_count = GREATEST(pds.transaction_count - 1, 0),
        updated_at        = NOW()
     FROM (
       SELECT
         unnest($2::uuid[])    AS product_id,
         unnest($3::numeric[]) AS units_sold,
         unnest($4::numeric[]) AS revenue,
         unnest($5::numeric[]) AS cog,
         unnest($6::numeric[]) AS gp,
         unnest($7::numeric[]) AS discount
     ) AS v
     WHERE pds.business_date = $1::date AND pds.product_id = v.product_id`,
    [businessDate, productIds, unitsSoldArr, revenueArr, cogArr, gpArr, discountArr]
  );
}

// ============================================================================
// INVENTORY BALANCES — Batch function (100M-scale optimization)
// ============================================================================

export interface InventoryBatchItem {
  productId: string;
  quantity: number;
}

/**
 * Batch UPSERT inventory_balances for a single movement type.
 * Items must be pre-aggregated by productId.
 */
export async function batchUpsertInventoryBalance(
  client: PoolClient,
  items: InventoryBatchItem[],
  movementType: InventoryMovementType,
  movementDate: string
): Promise<void> {
  if (items.length === 0) return;

  const productIds: string[] = [];
  const qohDeltas: string[] = [];
  const receivedDeltas: string[] = [];
  const soldDeltas: string[] = [];
  const adjustedDeltas: string[] = [];

  for (const item of items) {
    const qty = new Decimal(item.quantity);
    productIds.push(item.productId);

    switch (movementType) {
      case 'RECEIVED':
        qohDeltas.push(qty.toFixed(4));
        receivedDeltas.push(qty.toFixed(4));
        soldDeltas.push('0');
        adjustedDeltas.push('0');
        break;
      case 'SOLD':
        qohDeltas.push(qty.times(-1).toFixed(4));
        receivedDeltas.push('0');
        soldDeltas.push(qty.toFixed(4));
        adjustedDeltas.push('0');
        break;
      case 'ADJUSTED':
        qohDeltas.push(qty.toFixed(4));
        receivedDeltas.push('0');
        soldDeltas.push('0');
        adjustedDeltas.push(qty.toFixed(4));
        break;
    }
  }

  await client.query(
    `INSERT INTO inventory_balances (
        product_id, quantity_on_hand, total_received, total_sold,
        total_adjusted, last_movement_date, updated_at
     )
     SELECT
        unnest($1::uuid[]),
        unnest($2::numeric[]),
        unnest($3::numeric[]),
        unnest($4::numeric[]),
        unnest($5::numeric[]),
        $6::date, NOW()
     ON CONFLICT (product_id) DO UPDATE SET
        quantity_on_hand   = inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
        total_received     = inventory_balances.total_received + EXCLUDED.total_received,
        total_sold         = inventory_balances.total_sold + EXCLUDED.total_sold,
        total_adjusted     = inventory_balances.total_adjusted + EXCLUDED.total_adjusted,
        last_movement_date = EXCLUDED.last_movement_date,
        updated_at         = NOW()`,
    [productIds, qohDeltas, receivedDeltas, soldDeltas, adjustedDeltas, movementDate]
  );
}

// ============================================================================
// CUSTOMER BALANCES — Real-time AR state per customer
// ============================================================================

export interface CustomerBalanceUpsert {
  customerId: string;
  invoicedAmount: number;   // Amount added to AR (positive for credit sale)
  paidAmount: number;       // Amount paid (positive for payment)
  invoiceDate?: string;     // YYYY-MM-DD (for credit sales)
  paymentDate?: string;     // YYYY-MM-DD (for payments)
}

export async function upsertCustomerBalance(
  client: PoolClient,
  data: CustomerBalanceUpsert
): Promise<void> {
  const balance = new Decimal(data.invoicedAmount).minus(data.paidAmount);

  await client.query(
    `INSERT INTO customer_balances (
        customer_id, total_invoiced, total_paid, balance,
        last_invoice_date, last_payment_date, transaction_count, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 1, NOW())
     ON CONFLICT (customer_id) DO UPDATE SET
        total_invoiced    = customer_balances.total_invoiced + EXCLUDED.total_invoiced,
        total_paid        = customer_balances.total_paid + EXCLUDED.total_paid,
        balance           = customer_balances.balance + EXCLUDED.balance,
        last_invoice_date = COALESCE(EXCLUDED.last_invoice_date, customer_balances.last_invoice_date),
        last_payment_date = COALESCE(EXCLUDED.last_payment_date, customer_balances.last_payment_date),
        transaction_count = customer_balances.transaction_count + 1,
        updated_at        = NOW()`,
    [
      data.customerId,
      new Decimal(data.invoicedAmount).toFixed(2),
      new Decimal(data.paidAmount).toFixed(2),
      balance.toFixed(2),
      data.invoiceDate || null,
      data.paymentDate || null,
    ]
  );
}

// ============================================================================
// SUPPLIER BALANCES — Real-time AP state per supplier
// ============================================================================

export interface SupplierBalanceUpsert {
  supplierId: string;
  invoicedAmount: number;   // Amount added to AP (positive for GR)
  paidAmount: number;       // Amount paid (positive for payment)
  grDate?: string;          // YYYY-MM-DD
  paymentDate?: string;     // YYYY-MM-DD
}

export async function upsertSupplierBalance(
  client: PoolClient,
  data: SupplierBalanceUpsert
): Promise<void> {
  const balance = new Decimal(data.invoicedAmount).minus(data.paidAmount);

  await client.query(
    `INSERT INTO supplier_balances (
        supplier_id, total_invoiced, total_paid, balance,
        last_gr_date, last_payment_date, transaction_count, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 1, NOW())
     ON CONFLICT (supplier_id) DO UPDATE SET
        total_invoiced    = supplier_balances.total_invoiced + EXCLUDED.total_invoiced,
        total_paid        = supplier_balances.total_paid + EXCLUDED.total_paid,
        balance           = supplier_balances.balance + EXCLUDED.balance,
        last_gr_date      = COALESCE(EXCLUDED.last_gr_date, supplier_balances.last_gr_date),
        last_payment_date = COALESCE(EXCLUDED.last_payment_date, supplier_balances.last_payment_date),
        transaction_count = supplier_balances.transaction_count + 1,
        updated_at        = NOW()`,
    [
      data.supplierId,
      new Decimal(data.invoicedAmount).toFixed(2),
      new Decimal(data.paidAmount).toFixed(2),
      balance.toFixed(2),
      data.grDate || null,
      data.paymentDate || null,
    ]
  );
}

// ============================================================================
// INVENTORY BALANCES — Real-time stock state per product
// ============================================================================

export type InventoryMovementType = 'RECEIVED' | 'SOLD' | 'ADJUSTED';

export interface InventoryBalanceUpsert {
  productId: string;
  quantity: number;           // Always positive
  movementType: InventoryMovementType;
  movementDate: string;       // YYYY-MM-DD
}

export async function upsertInventoryBalance(
  client: PoolClient,
  data: InventoryBalanceUpsert
): Promise<void> {
  const qty = new Decimal(data.quantity);

  // Depending on movement type, update the appropriate running total
  // and adjust quantity_on_hand accordingly
  let qohDelta: string;
  let receivedDelta: string;
  let soldDelta: string;
  let adjustedDelta: string;

  switch (data.movementType) {
    case 'RECEIVED':
      qohDelta = qty.toFixed(4);
      receivedDelta = qty.toFixed(4);
      soldDelta = '0';
      adjustedDelta = '0';
      break;
    case 'SOLD':
      qohDelta = qty.times(-1).toFixed(4);
      receivedDelta = '0';
      soldDelta = qty.toFixed(4);
      adjustedDelta = '0';
      break;
    case 'ADJUSTED':
      // Quantity can be positive (gain) or negative (loss) for adjustments
      qohDelta = qty.toFixed(4);
      receivedDelta = '0';
      soldDelta = '0';
      adjustedDelta = qty.toFixed(4);
      break;
  }

  await client.query(
    `INSERT INTO inventory_balances (
        product_id, quantity_on_hand, total_received, total_sold,
        total_adjusted, last_movement_date, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (product_id) DO UPDATE SET
        quantity_on_hand   = inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
        total_received     = inventory_balances.total_received + EXCLUDED.total_received,
        total_sold         = inventory_balances.total_sold + EXCLUDED.total_sold,
        total_adjusted     = inventory_balances.total_adjusted + EXCLUDED.total_adjusted,
        last_movement_date = EXCLUDED.last_movement_date,
        updated_at         = NOW()`,
    [
      data.productId,
      qohDelta,
      receivedDelta,
      soldDelta,
      adjustedDelta,
      data.movementDate,
    ]
  );
}
