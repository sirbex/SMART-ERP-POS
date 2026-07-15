/**
 * BD-INV-6 — orphan uncollectible AR clears (expense + CR 1200 without write-off doc).
 * Static allow-list of PostingSource values that may CR 1200 with a companion expense debit.
 */

import type { Pool, PoolClient } from 'pg';
import { LEDGER_NET_ACTIVE_SQL } from '../../utils/ledgerNetActive.js';
import { Money } from '../../utils/money.js';
import { AR_CONTROL_ACCOUNT, BAD_DEBT_EXPENSE_ACCOUNT } from '@shared/bad-debt/index.js';

type Db = Pool | PoolClient;

/** Sources that may credit AR with a P&L expense companion without an ArWriteoffDocument. */
export const AR_EXPENSE_CR_ALLOWLIST = [
  'AR_WRITEOFF',
  'AR_WRITEOFF_REVERSAL',
  'SYSTEM_CORRECTION', // GL recon tip — BD07
] as const;

export interface OrphanArExpenseWriteoffRow {
  transactionId: string;
  transactionNumber: string;
  postingSource: string | null;
  referenceType: string | null;
  transactionDate: string;
  arCredit: number;
  expenseDebit: number;
}

/**
 * Find POSTED journals that CR 1200 and DR Bad Debt Expense (or generic expense)
 * without a linked posted ar_writeoff_documents row, excluding allow-listed sources.
 *
 * Default looks at 5210 companion; optional `expenseAccountCodes` extends the scan.
 */
export async function scanOrphanArExpenseWriteoffs(
  pool: Db,
  opts: {
    asOfDate: string;
    cutoffDate?: string;
    expenseAccountCodes?: string[];
  },
): Promise<{ orphans: OrphanArExpenseWriteoffRow[]; orphanCount: number }> {
  const expenseCodes = opts.expenseAccountCodes?.length
    ? opts.expenseAccountCodes
    : [BAD_DEBT_EXPENSE_ACCOUNT];
  const cutoff = opts.cutoffDate ?? '1900-01-01';

  const result = await pool.query<{
    transaction_id: string;
    transaction_number: string;
    posting_source: string | null;
    reference_type: string | null;
    transaction_date: string;
    ar_credit: string;
    expense_debit: string;
  }>(
    `
    WITH ar_credits AS (
      SELECT le."TransactionId" AS txn_id,
             COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0)::numeric AS ar_credit
      FROM ledger_entries le
      JOIN accounts a ON a."Id" = le."AccountId"
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      WHERE a."AccountCode" = $1
        AND ${LEDGER_NET_ACTIVE_SQL}
        AND lt."TransactionDate"::DATE <= $2::date
        AND lt."TransactionDate"::DATE >= $3::date
      GROUP BY le."TransactionId"
      HAVING COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0) > 0.009
    ),
    expense_debits AS (
      SELECT le."TransactionId" AS txn_id,
             COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0)::numeric AS expense_debit
      FROM ledger_entries le
      JOIN accounts a ON a."Id" = le."AccountId"
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      WHERE a."AccountCode" = ANY($4::text[])
        AND ${LEDGER_NET_ACTIVE_SQL}
        AND lt."TransactionDate"::DATE <= $2::date
        AND lt."TransactionDate"::DATE >= $3::date
      GROUP BY le."TransactionId"
      HAVING COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) > 0.009
    )
    SELECT lt."Id"::text AS transaction_id,
           lt."TransactionNumber" AS transaction_number,
           lt."PostingSource" AS posting_source,
           lt."ReferenceType" AS reference_type,
           lt."TransactionDate"::date::text AS transaction_date,
           ar.ar_credit::text,
           ex.expense_debit::text
    FROM ar_credits ar
    JOIN expense_debits ex ON ex.txn_id = ar.txn_id
    JOIN ledger_transactions lt ON lt."Id" = ar.txn_id
    LEFT JOIN ar_writeoff_documents wod
      ON wod.journal_entry_id = lt."Id"
     AND wod.status = 'POSTED'
    WHERE wod.id IS NULL
      AND COALESCE(lt."PostingSource", '') <> ALL($5::text[])
    ORDER BY lt."TransactionDate", lt."TransactionNumber"
    `,
    [
      AR_CONTROL_ACCOUNT,
      opts.asOfDate,
      cutoff,
      expenseCodes,
      [...AR_EXPENSE_CR_ALLOWLIST],
    ],
  );

  const orphans: OrphanArExpenseWriteoffRow[] = result.rows.map((r) => ({
    transactionId: r.transaction_id,
    transactionNumber: r.transaction_number,
    postingSource: r.posting_source,
    referenceType: r.reference_type,
    transactionDate: r.transaction_date,
    arCredit: Money.toNumber(Money.parseDb(r.ar_credit)),
    expenseDebit: Money.toNumber(Money.parseDb(r.expense_debit)),
  }));

  return { orphans, orphanCount: orphans.length };
}
