/**
 * AP reconciliation lanes — three distinct reporting concerns:
 *   1. Integrity (period close): net-active GL vs open-item subledger
 *   2. Cache health (maintenance): open-item vs suppliers.OutstandingBalance
 *   3. Journal audit (informational): gross posted GL vs net-active GL
 */
import type { Pool, PoolClient } from 'pg';
import { Money } from '../../utils/money.js';
import { LEDGER_NET_ACTIVE_SQL } from '../../utils/ledgerNetActive.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import {
  apMaterialityThreshold,
  computeApGlSupplierScope,
  computeApGlSupplierScopeGrossPosted,
  isApDriftExplainedByExpenses,
  AP_OPEN_INVOICE_STATUS_SQL,
  AP_OPEN_INVOICE_GL_POSTED_SQL,
  type ApQueryContext,
} from './apReconciliationEngine.js';
import {
  captureApReconciliationMetrics,
  isApSupplierGlIntegrityMatched,
} from './apReconciliationMetrics.js';

type ApDb = Pool | PoolClient;

export interface ApSupplierLaneRow {
  supplierId: string;
  supplierName: string;
  leftAmount: number;
  rightAmount: number;
  difference: number;
}

export interface ApIntegrityLane {
  lane: 'integrity';
  asOfDate: string;
  generatedAt: string;
  glNetActive: number;
  openItemSubledger: number;
  integrityDifference: number;
  status: 'RECONCILED' | 'DISCREPANCY';
  gatesPeriodClose: true;
  exceptions: ApSupplierLaneRow[];
}

export interface ApCacheLane {
  lane: 'cache';
  asOfDate: string;
  generatedAt: string;
  openItemBalance: number;
  supplierCacheBalance: number;
  cacheDifference: number;
  status: 'HEALTHY' | 'DRIFT';
  gatesPeriodClose: false;
  exceptions: ApSupplierLaneRow[];
}

export interface ApJournalAuditEntry {
  transactionId: string;
  transactionNumber: string;
  referenceType: string;
  referenceNumber: string | null;
  transactionDate: string;
  isReversed: boolean;
  isReversingEntry: boolean;
  apImpact: number;
  supplierName: string | null;
}

export interface ApJournalAuditLane {
  lane: 'journal_audit';
  asOfDate: string;
  generatedAt: string;
  grossPosted: number;
  netActive: number;
  reversalImpact: number;
  status: 'INFORMATIONAL';
  gatesPeriodClose: false;
  supplierExceptions: ApSupplierLaneRow[];
  journals: ApJournalAuditEntry[];
}

const INTEGRITY_SUPPLIER_SQL = `
  WITH gl_by_supplier AS (
    SELECT NULLIF(TRIM(le."EntityId"), '')::uuid AS supplier_id,
      COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0) AS gl_bal
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '2100'
      AND UPPER(le."EntityType") = 'SUPPLIER'
      AND le."EntityId" IS NOT NULL
      AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
      AND ${LEDGER_NET_ACTIVE_SQL}
      AND lt."TransactionDate"::DATE <= $1::date
    GROUP BY le."EntityId"
  ),
  open_item AS (
    SELECT si."SupplierId" AS supplier_id,
      COALESCE(SUM(
        CASE WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
          THEN -COALESCE(si."OutstandingBalance", 0)
          ELSE COALESCE(si."OutstandingBalance", 0) END
      ), 0) AS inv_bal
    FROM supplier_invoices si
    WHERE si.deleted_at IS NULL
      ${AP_OPEN_INVOICE_STATUS_SQL}
      ${AP_OPEN_INVOICE_GL_POSTED_SQL}
      AND si."InvoiceDate"::DATE <= $1::date
    GROUP BY si."SupplierId"
  )
  SELECT s."Id"::text AS supplier_id,
    s."CompanyName" AS supplier_name,
    COALESCE(g.gl_bal, 0)::numeric AS left_amount,
    COALESCE(i.inv_bal, 0)::numeric AS right_amount,
    (COALESCE(g.gl_bal, 0) - COALESCE(i.inv_bal, 0))::numeric AS difference
  FROM suppliers s
  LEFT JOIN gl_by_supplier g ON g.supplier_id = s."Id"
  LEFT JOIN open_item i ON i.supplier_id = s."Id"
  WHERE ABS(COALESCE(g.gl_bal, 0) - COALESCE(i.inv_bal, 0)) > 0.01
  ORDER BY ABS(COALESCE(g.gl_bal, 0) - COALESCE(i.inv_bal, 0)) DESC
`;

const CACHE_SUPPLIER_SQL = `
  WITH open_inv AS (
    SELECT si."SupplierId" AS supplier_id,
      COALESCE(SUM(
        CASE WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
          THEN -COALESCE(si."OutstandingBalance", 0)
          ELSE COALESCE(si."OutstandingBalance", 0) END
      ), 0) AS inv_bal
    FROM supplier_invoices si
    WHERE si.deleted_at IS NULL
      ${AP_OPEN_INVOICE_STATUS_SQL}
      ${AP_OPEN_INVOICE_GL_POSTED_SQL}
      AND si."InvoiceDate"::DATE <= $1::date
    GROUP BY si."SupplierId"
  ),
  unalloc AS (
    SELECT sp."SupplierId" AS supplier_id,
      COALESCE(SUM(
        COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0))
      ), 0) AS unalloc
    FROM supplier_payments sp
    WHERE sp.deleted_at IS NULL
      AND sp."Status" = 'COMPLETED'
      AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) > 0.009
      AND sp."PaymentDate"::DATE <= $1::date
    GROUP BY sp."SupplierId"
  ),
  open_item AS (
    SELECT s."Id" AS supplier_id,
      GREATEST(
        COALESCE(oi.inv_bal, 0) - COALESCE(u.unalloc, 0),
        0
      ) AS open_bal
    FROM suppliers s
    LEFT JOIN open_inv oi ON oi.supplier_id = s."Id"
    LEFT JOIN unalloc u ON u.supplier_id = s."Id"
  )
  SELECT s."Id"::text AS supplier_id,
    s."CompanyName" AS supplier_name,
    COALESCE(oi.open_bal, 0)::numeric AS left_amount,
    COALESCE(s."OutstandingBalance", 0)::numeric AS right_amount,
    (COALESCE(oi.open_bal, 0) - COALESCE(s."OutstandingBalance", 0))::numeric AS difference
  FROM suppliers s
  LEFT JOIN open_item oi ON oi.supplier_id = s."Id"
  WHERE ABS(COALESCE(oi.open_bal, 0) - COALESCE(s."OutstandingBalance", 0)) > 0.01
  ORDER BY ABS(COALESCE(oi.open_bal, 0) - COALESCE(s."OutstandingBalance", 0)) DESC
`;

const JOURNAL_SUPPLIER_SQL = `
  WITH gross AS (
    SELECT NULLIF(TRIM(le."EntityId"), '')::uuid AS supplier_id,
      COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0) AS gross_bal
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '2100'
      AND UPPER(le."EntityType") = 'SUPPLIER'
      AND le."EntityId" IS NOT NULL
      AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
      AND lt."Status" = 'POSTED'
      AND lt."TransactionDate"::DATE <= $1::date
    GROUP BY le."EntityId"
  ),
  net AS (
    SELECT NULLIF(TRIM(le."EntityId"), '')::uuid AS supplier_id,
      COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0) AS net_bal
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '2100'
      AND UPPER(le."EntityType") = 'SUPPLIER'
      AND le."EntityId" IS NOT NULL
      AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
      AND ${LEDGER_NET_ACTIVE_SQL}
      AND lt."TransactionDate"::DATE <= $1::date
    GROUP BY le."EntityId"
  )
  SELECT s."Id"::text AS supplier_id,
    s."CompanyName" AS supplier_name,
    COALESCE(g.gross_bal, 0)::numeric AS left_amount,
    COALESCE(n.net_bal, 0)::numeric AS right_amount,
    (COALESCE(g.gross_bal, 0) - COALESCE(n.net_bal, 0))::numeric AS difference
  FROM suppliers s
  LEFT JOIN gross g ON g.supplier_id = s."Id"
  LEFT JOIN net n ON n.supplier_id = s."Id"
  WHERE ABS(COALESCE(g.gross_bal, 0) - COALESCE(n.net_bal, 0)) > 0.01
  ORDER BY ABS(COALESCE(g.gross_bal, 0) - COALESCE(n.net_bal, 0)) DESC
`;

function mapSupplierRows(
  rows: Array<{
    supplier_id: string;
    supplier_name: string;
    left_amount: string | number;
    right_amount: string | number;
    difference: string | number;
  }>,
): ApSupplierLaneRow[] {
  return rows.map((r) => ({
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    leftAmount: Money.toNumber(Money.parseDb(r.left_amount)),
    rightAmount: Money.toNumber(Money.parseDb(r.right_amount)),
    difference: Money.toNumber(Money.parseDb(r.difference)),
  }));
}

export async function getApIntegrityLane(
  conn: ApDb,
  asOfDate?: string,
): Promise<ApIntegrityLane> {
  const date = asOfDate ?? getBusinessDate();
  const metrics = await captureApReconciliationMetrics(conn, date);
  const exceptionsRes = await conn.query(INTEGRITY_SUPPLIER_SQL, [date]);
  const integrityOk = isApSupplierGlIntegrityMatched(metrics);

  return {
    lane: 'integrity',
    asOfDate: date,
    generatedAt: new Date().toISOString(),
    glNetActive: metrics.glSupplierScopeNetActive,
    openItemSubledger: metrics.openItemSubledger,
    integrityDifference: metrics.integrityGlDrift,
    status: integrityOk ? 'RECONCILED' : 'DISCREPANCY',
    gatesPeriodClose: true,
    exceptions: mapSupplierRows(exceptionsRes.rows),
  };
}

export async function getApCacheLane(
  conn: ApDb,
  asOfDate?: string,
): Promise<ApCacheLane> {
  const date = asOfDate ?? getBusinessDate();
  const metrics = await captureApReconciliationMetrics(conn, date);
  const exceptionsRes = await conn.query(CACHE_SUPPLIER_SQL, [date]);
  const openItemBalance = metrics.openItemSubledger;
  const supplierCacheBalance = metrics.suppliersTableSum;
  const cacheDifference = openItemBalance - supplierCacheBalance;

  return {
    lane: 'cache',
    asOfDate: date,
    generatedAt: new Date().toISOString(),
    openItemBalance,
    supplierCacheBalance,
    cacheDifference,
    status: Math.abs(cacheDifference) <= 0.01 ? 'HEALTHY' : 'DRIFT',
    gatesPeriodClose: false,
    exceptions: mapSupplierRows(exceptionsRes.rows),
  };
}

export async function getApJournalAuditLane(
  conn: ApDb,
  asOfDate?: string,
): Promise<ApJournalAuditLane> {
  const date = asOfDate ?? getBusinessDate();
  const ctx: ApQueryContext = { asOfDate: date };
  const [grossPosted, netActive, supplierExceptionsRes, journalsRes] = await Promise.all([
    computeApGlSupplierScopeGrossPosted(conn, ctx),
    computeApGlSupplierScope(conn, ctx),
    conn.query(JOURNAL_SUPPLIER_SQL, [date]),
    conn.query(
      `
      SELECT lt."Id"::text AS transaction_id,
        lt."TransactionNumber" AS transaction_number,
        lt."ReferenceType" AS reference_type,
        lt."ReferenceNumber" AS reference_number,
        lt."TransactionDate"::date::text AS transaction_date,
        lt."IsReversed" AS is_reversed,
        (lt."Id" IN (
          SELECT "ReversedByTransactionId" FROM ledger_transactions
          WHERE "ReversedByTransactionId" IS NOT NULL
        )) AS is_reversing_entry,
        COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0)::numeric AS ap_impact,
        MAX(s."CompanyName") AS supplier_name
      FROM ledger_transactions lt
      JOIN ledger_entries le ON le."TransactionId" = lt."Id"
      JOIN accounts a ON a."Id" = le."AccountId"
      LEFT JOIN suppliers s ON s."Id"::text = NULLIF(TRIM(le."EntityId"), '')
      WHERE a."AccountCode" = '2100'
        AND UPPER(COALESCE(le."EntityType", '')) = 'SUPPLIER'
        AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
        AND lt."Status" = 'POSTED'
        AND lt."TransactionDate"::DATE <= $1::date
        AND (
          lt."IsReversed" = TRUE
          OR lt."Id" IN (
            SELECT "ReversedByTransactionId" FROM ledger_transactions
            WHERE "ReversedByTransactionId" IS NOT NULL
          )
        )
      GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."ReferenceNumber",
        lt."TransactionDate", lt."IsReversed"
      ORDER BY ABS(COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0)) DESC
      LIMIT 100
      `,
      [date],
    ),
  ]);

  return {
    lane: 'journal_audit',
    asOfDate: date,
    generatedAt: new Date().toISOString(),
    grossPosted,
    netActive,
    reversalImpact: grossPosted - netActive,
    status: 'INFORMATIONAL',
    gatesPeriodClose: false,
    supplierExceptions: mapSupplierRows(supplierExceptionsRes.rows),
    journals: journalsRes.rows.map((r) => ({
      transactionId: r.transaction_id,
      transactionNumber: r.transaction_number,
      referenceType: r.reference_type,
      referenceNumber: r.reference_number,
      transactionDate: r.transaction_date,
      isReversed: Boolean(r.is_reversed),
      isReversingEntry: Boolean(r.is_reversing_entry),
      apImpact: Money.toNumber(Money.parseDb(r.ap_impact)),
      supplierName: r.supplier_name,
    })),
  };
}

/** Whether integrity drift is within materiality or explained by standalone expenses. */
export function isIntegrityLaneMatched(
  glNetActive: number,
  integrityDifference: number,
  expenseOnAp: number,
): boolean {
  if (Math.abs(integrityDifference) <= 0.01) return true;
  const threshold = apMaterialityThreshold(glNetActive);
  return isApDriftExplainedByExpenses(
    {
      glBalance: glNetActive,
      invoiceOpenBalance: 0,
      unallocatedPayments: 0,
      subledgerBalance: 0,
      expenseOnAp,
      legacyGrInAp: 0,
      unpostedOpenInvoiceBalance: 0,
      drift: integrityDifference,
      residualAfterExpense: integrityDifference + expenseOnAp,
    },
    threshold,
  );
}
