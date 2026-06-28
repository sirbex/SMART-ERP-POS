/**
 * Centralized inventory (1300) reconciliation — batch subledger SSOT.
 *
 * Formula:
 *   integrity: net-active GL 1300 vs SUM(inventory_batches.remaining_qty × cost_price)
 *   cache: batch subledger vs product header valuation (qty × cost_price)
 */
import type { Pool, PoolClient } from 'pg';
import { Money } from '../../utils/money.js';
import { LEDGER_NET_ACTIVE_SQL } from '../../utils/ledgerNetActive.js';

export type InventoryDbConn = Pool | PoolClient;

export type InventoryQueryContext = { asOfDate?: string };

function asOfDateParam(ctx?: InventoryQueryContext): string[] {
  return ctx?.asOfDate ? [ctx.asOfDate] : [];
}

function glAsOfFilter(ctx?: InventoryQueryContext, ltAlias = 'lt'): string {
  return ctx?.asOfDate ? `AND ${ltAlias}."TransactionDate"::DATE <= $1::date` : '';
}

/** Net-active GL 1300 (asset: debit − credit). */
export async function computeGl1300NetActive(
  conn: InventoryDbConn,
  ctx?: InventoryQueryContext,
): Promise<number> {
  const params = asOfDateParam(ctx);
  const res = await conn.query(
    `
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1300'
      AND ${LEDGER_NET_ACTIVE_SQL}
      ${glAsOfFilter(ctx)}
    `,
    params,
  );
  return Money.toNumber(Money.parseDb(res.rows[0]?.gl_balance ?? 0));
}

/** Gross posted GL 1300 (includes reversal pairs). */
export async function computeGl1300GrossPosted(
  conn: InventoryDbConn,
  ctx?: InventoryQueryContext,
): Promise<number> {
  const params = asOfDateParam(ctx);
  const res = await conn.query(
    `
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1300'
      AND lt."Status" = 'POSTED'
      ${glAsOfFilter(ctx)}
    `,
    params,
  );
  return Money.toNumber(Money.parseDb(res.rows[0]?.gl_balance ?? 0));
}

/** FEFO batch subledger — canonical inventory valuation. */
export async function computeBatchSubledger(conn: InventoryDbConn): Promise<number> {
  const res = await conn.query(`
    SELECT COALESCE(SUM(remaining_quantity * cost_price), 0) AS total
    FROM inventory_batches
    WHERE remaining_quantity > 0
  `);
  return Money.toNumber(Money.parseDb(res.rows[0]?.total ?? 0));
}

/** Product header cache — qty × cost (informational; diverges from batch costs). */
export async function computeProductValuationCache(conn: InventoryDbConn): Promise<number> {
  const res = await conn.query(`
    SELECT COALESCE(SUM(COALESCE(quantity_on_hand, 0) * COALESCE(cost_price, 0)), 0) AS total
    FROM products
    WHERE is_active = true
  `);
  return Money.toNumber(Money.parseDb(res.rows[0]?.total ?? 0));
}

export async function computeStoredBalance1300(conn: InventoryDbConn): Promise<number> {
  const res = await conn.query(`
    SELECT COALESCE("CurrentBalance", 0) AS balance
    FROM accounts WHERE "AccountCode" = '1300'
  `);
  return Money.toNumber(Money.parseDb(res.rows[0]?.balance ?? 0));
}

export function inventoryMaterialityThreshold(glBalance: number): number {
  return Math.max(5000, Math.abs(glBalance) * 0.0001);
}
