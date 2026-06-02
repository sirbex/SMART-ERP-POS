/**
 * customerBalanceSync.ts
 * ═══════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH — Customer Balance (AR subledger)
 * ═══════════════════════════════════════════════════════════════
 *
 * Wave 3: all callers route through the AR open-item engine formula.
 *
 * Formula (SAP/Odoo open-item parity):
 *   customer.balance = GREATEST(0,
 *     SUM(invoice amount_due for INVOICE + OPENING_BALANCE, non-cancelled)
 *     − SUM(unallocated_amount on posted AR receipts)
 *   )
 *
 * Credit/debit notes adjust the parent invoice's amount_due on post — they are
 * not summed separately into customer.balance.
 *
 * AR control account (1200) is maintained by AccountingCore via ledger_entries.
 * customers.balance tracks per-customer net open AR for credit-limit / UI.
 */

import type { Pool, PoolClient } from 'pg';
import { syncCustomerBalanceFromOpenItems } from '../modules/ar-payments/openItemAllocationEngine.js';

export type CustomerBalanceDbConn = Pool | PoolClient;

/**
 * Recalculate customer balance from open items − unallocated receipts.
 * Must run inside a transaction (PoolClient) when paired with other mutations.
 *
 * @deprecated Prefer the name syncCustomerBalanceFromOpenItems in new code;
 * this export preserves every legacy import path (Wave 3 SSOT redirect).
 */
export async function syncCustomerBalanceFromInvoices(
  conn: CustomerBalanceDbConn,
  customerId: string,
  changeSource: string,
): Promise<{ oldBalance: number; newBalance: number }> {
  return syncCustomerBalanceFromOpenItems(conn, customerId, changeSource);
}

/** Canonical alias — same implementation as syncCustomerBalanceFromInvoices. */
export const syncCustomerArBalance = syncCustomerBalanceFromInvoices;
