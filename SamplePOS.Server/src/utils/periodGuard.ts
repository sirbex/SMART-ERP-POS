/**
 * Period Guard — Accounting Period enforcement utility
 * Replaces fn_enforce_open_period and validate_period_open triggers
 *
 * Call before INSERT/UPDATE on tables that require open-period checks:
 *   sales, goods_receipts, invoice_payments, journal_entries, manual_journal_entries
 *
 * Ledger transactions/entries are already guarded by AccountingCore.isPeriodOpen()
 */

import { Pool, PoolClient } from 'pg';
import { getBusinessDate } from './dateRange.js';

export async function checkAccountingPeriodOpen(
  client: Pool | PoolClient,
  transactionDate: string
): Promise<void> {
  const result = await client.query(
    `SELECT status
     FROM accounting_periods
     WHERE period_year  = EXTRACT(YEAR  FROM $1::date)::int
       AND period_month = EXTRACT(MONTH FROM $1::date)::int`,
    [transactionDate]
  );

  // No period row → implicitly open (same behaviour as the dropped trigger)
  if (result.rows.length === 0) return;

  const status: string = result.rows[0].status;
  if (status === 'OPEN') return;

  const d = transactionDate.split('-');
  const label = `${d[0]}-${d[1]}`;
  throw new Error(
    `Cannot post to closed period: ${label}. Period status: ${status}. ` +
    `Create a reversal entry in the current open period instead.`
  );
}
