/**
 * WHT reconciliation — GL control accounts vs withholding_tax_entries subledger.
 *   integrity: payable (2350) primary; receivable (1250) in details/exceptions
 *   history: net-active journal activity on 2350/1250
 */
import type { Pool, PoolClient } from 'pg';
import { Money } from '../../../utils/money.js';
import { LEDGER_NET_ACTIVE_SQL } from '../../../utils/ledgerNetActive.js';
import { AccountCodes } from '../../../services/glEntryService.js';
import { getBusinessDate } from '../../../utils/dateRange.js';

type Db = Pool | PoolClient;

async function glNetBalance(
  pool: Db,
  accountCode: string,
  asOfDate: string,
  kind: 'ASSET' | 'LIABILITY',
): Promise<number> {
  const result = await pool.query<{ debits: string; credits: string }>(
    `SELECT
       COALESCE(SUM(le."DebitAmount"), 0) AS debits,
       COALESCE(SUM(le."CreditAmount"), 0) AS credits
     FROM ledger_entries le
     JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE a."AccountCode" = $1
       AND ${LEDGER_NET_ACTIVE_SQL}
       AND lt."TransactionDate"::DATE <= $2::date`,
    [accountCode, asOfDate],
  );
  const debits = Number(result.rows[0]?.debits ?? 0);
  const credits = Number(result.rows[0]?.credits ?? 0);
  const raw = kind === 'ASSET' ? debits - credits : credits - debits;
  return Money.toNumber(Money.round(raw));
}

async function entrySubledgerBalance(
  pool: Db,
  asOfDate: string,
  side: 'PAYABLE' | 'RECEIVABLE',
): Promise<number> {
  const paymentType = side === 'PAYABLE' ? 'SUPPLIER_PAYMENT' : 'CUSTOMER_PAYMENT';
  const settleType = side === 'PAYABLE' ? 'WHT_REMITTANCE' : 'WHT_RECEIVABLE_RECOVERY';
  const result = await pool.query<{ balance: string }>(
    `SELECT COALESCE(SUM(
       CASE
         WHEN transaction_type = $1 THEN wht_amount
         WHEN transaction_type = $2 THEN -wht_amount
         ELSE 0
       END
     ), 0) AS balance
     FROM withholding_tax_entries
     WHERE created_at::DATE <= $3::date
       AND transaction_type IN ($1, $2)`,
    [paymentType, settleType, asOfDate],
  );
  return Money.toNumber(Money.round(Number(result.rows[0]?.balance ?? 0)));
}

export async function getWhtIntegrityLane(pool: Db, asOfDate?: string) {
  const date = asOfDate ?? getBusinessDate();
  const [payableGl, receivableGl, payableEntries, receivableEntries] = await Promise.all([
    glNetBalance(pool, AccountCodes.WHT_PAYABLE, date, 'LIABILITY'),
    glNetBalance(pool, AccountCodes.WHT_RECEIVABLE, date, 'ASSET'),
    entrySubledgerBalance(pool, date, 'PAYABLE'),
    entrySubledgerBalance(pool, date, 'RECEIVABLE'),
  ]);

  const payableDiff = Money.toNumber(Money.round(payableGl - payableEntries));
  const receivableDiff = Money.toNumber(Money.round(receivableGl - receivableEntries));
  const integrityDifference = Money.toNumber(Money.round(payableDiff + receivableDiff));
  const status =
    Math.abs(payableDiff) <= 0.01 && Math.abs(receivableDiff) <= 0.01
      ? ('RECONCILED' as const)
      : ('DISCREPANCY' as const);

  const exceptions = [
    {
      entityId: AccountCodes.WHT_PAYABLE,
      entityName: 'WHT Payable',
      leftAmount: payableGl,
      rightAmount: payableEntries,
      difference: payableDiff,
    },
    {
      entityId: AccountCodes.WHT_RECEIVABLE,
      entityName: 'Tax Receivable',
      leftAmount: receivableGl,
      rightAmount: receivableEntries,
      difference: receivableDiff,
    },
  ].filter((e) => Math.abs(e.difference) > 0.01);

  return {
    asOfDate: date,
    payableGl,
    payableEntries,
    payableDiff,
    receivableGl,
    receivableEntries,
    receivableDiff,
    integrityDifference,
    status,
    exceptions,
  };
}

export async function getWhtJournalAuditLane(pool: Db, asOfDate?: string) {
  const date = asOfDate ?? getBusinessDate();
  const result = await pool.query<{
    transaction_id: string;
    transaction_number: string;
    reference_type: string;
    reference_number: string | null;
    transaction_date: string;
    is_reversed: boolean;
    is_reversing_entry: boolean;
    impact: string;
    account_code: string;
  }>(
    `SELECT
       lt."Id" AS transaction_id,
       lt."TransactionNumber" AS transaction_number,
       lt."ReferenceType" AS reference_type,
       lt."ReferenceNumber" AS reference_number,
       lt."TransactionDate"::text AS transaction_date,
       lt."IsReversed" AS is_reversed,
       (lt."ReversedTransactionId" IS NOT NULL) AS is_reversing_entry,
       a."AccountCode" AS account_code,
       CASE
         WHEN a."AccountCode" = $1
           THEN COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0)
         ELSE COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0)
       END AS impact
     FROM ledger_entries le
     JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE a."AccountCode" IN ($1, $2)
       AND lt."Status" = 'POSTED'
       AND lt."TransactionDate"::DATE <= $3::date
     GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."ReferenceNumber",
              lt."TransactionDate", lt."IsReversed", lt."ReversedTransactionId", a."AccountCode"
     ORDER BY lt."TransactionDate" DESC
     LIMIT 100`,
    [AccountCodes.WHT_PAYABLE, AccountCodes.WHT_RECEIVABLE, date],
  );

  const journals = result.rows.map((r) => ({
    transactionId: r.transaction_id,
    transactionNumber: r.transaction_number,
    referenceType: r.reference_type,
    referenceNumber: r.reference_number,
    transactionDate: r.transaction_date,
    isReversed: r.is_reversed,
    isReversingEntry: r.is_reversing_entry,
    impact: Number(r.impact),
    entityName: r.account_code === AccountCodes.WHT_PAYABLE ? 'WHT Payable' : 'Tax Receivable',
  }));

  const grossPosted = Money.toNumber(
    Money.round(journals.reduce((sum, j) => sum + Math.abs(j.impact), 0)),
  );
  const integrity = await getWhtIntegrityLane(pool, date);
  const netActive = Money.toNumber(
    Money.round(Math.abs(integrity.payableGl) + Math.abs(integrity.receivableGl)),
  );

  return {
    asOfDate: date,
    grossPosted,
    netActive,
    reversalImpact: Money.toNumber(Money.round(grossPosted - netActive)),
    status: 'INFORMATIONAL' as const,
    journals,
  };
}
