/**
 * customerBalanceSync.ts
 * ═══════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH — Customer Balance & AR Account Sync
 * ═══════════════════════════════════════════════════════════════
 *
 * SAP-style canonical pattern: ONE function, ONE formula, called
 * from EVERY code path that modifies invoice amounts/statuses.
 *
 * Formula:
 *   customer.balance = SUM(amount_due) FROM invoices
 *                      WHERE status NOT IN ('CANCELLED','VOIDED','DRAFT')
 *
 * Why NOT IN ('CANCELLED','VOIDED','DRAFT') and NOT filtering PAID?
 *   - A PAID invoice has amount_due = 0, so it contributes zero.
 *   - Including PAID is intentional: if a recalc ever computes
 *     a nonzero remainder on a "PAID" invoice (e.g., rounding),
 *     it would still surface correctly instead of being silently hidden.
 *   - CANCELLED/VOIDED/DRAFT are explicitly excluded because they
 *     represent non-active documents that must never affect AR.
 *
 * AR Account (1200) is always derived from SUM(customers.balance).
 */

import type { Pool, PoolClient } from 'pg';
import logger from './logger.js';
import { Money } from './money.js';

type DbConn = Pool | PoolClient;

/**
 * Recalculate a single customer's balance from invoices, then
 * sync the AR control account. Writes an audit trail row.
 *
 * Must be called inside a transaction (PoolClient) for atomicity.
 */
export async function syncCustomerBalanceFromInvoices(
  conn: DbConn,
  customerId: string,
  changeSource: string,
): Promise<{ oldBalance: number; newBalance: number }> {
  // Step 1: Recalculate customer balance from invoices
  const balanceUpdate = await conn.query(
    `WITH old AS (SELECT balance, name FROM customers WHERE id = $1)
     UPDATE customers SET balance = (
       SELECT COALESCE(SUM(amount_due), 0)
       FROM invoices
       WHERE customer_id = $1
         AND status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')
     )
     WHERE id = $1
     RETURNING balance,
               (SELECT balance FROM old) AS old_balance,
               (SELECT name FROM old) AS customer_name`,
    [customerId],
  );

  const row = balanceUpdate.rows[0];
  if (!row) {
    logger.warn('syncCustomerBalanceFromInvoices: customer not found', { customerId });
    return { oldBalance: 0, newBalance: 0 };
  }

  const oldBalance = Money.toNumber(Money.parseDb(row.old_balance ?? 0));
  const newBalance = Money.toNumber(Money.parseDb(row.balance ?? 0));

  // Step 2: Audit trail (only if balance changed)
  if (oldBalance !== newBalance) {
    const changeAmount = Money.toNumber(Money.subtract(newBalance, oldBalance));
    await conn.query(
      `INSERT INTO customer_balance_audit
       (customer_id, customer_name, old_balance, new_balance, change_amount, change_source)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [customerId, row.customer_name, oldBalance, newBalance, changeAmount, changeSource],
    );
  }

  // NOTE: AR control account (1200) CurrentBalance is maintained exclusively by
  // AccountingCore via ledger_entries. customers.balance tracks per-customer
  // open AR for credit-limit purposes. The two are separate; syncing one to the
  // other bypasses the GL and causes reconciliation drift.

  logger.info('Customer balance synced from invoices (SSOT)', {
    customerId,
    oldBalance,
    newBalance,
    changeSource,
  });

  return { oldBalance, newBalance };
}
