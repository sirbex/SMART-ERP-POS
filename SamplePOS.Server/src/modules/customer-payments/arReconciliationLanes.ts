/**
 * AR reconciliation lanes — domain calculations (read-only).
 */
import type { Pool, PoolClient } from 'pg';
import { Money } from '../../utils/money.js';
import { LEDGER_NET_ACTIVE_SQL } from '../../utils/ledgerNetActive.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import {
  computeArGlCustomerScope,
  computeArGlGrossPosted,
  type ArQueryContext,
} from './arReconciliationEngine.js';
import {
  captureArReconciliationMetrics,
  isArGlIntegrityMatched,
} from './arReconciliationMetrics.js';

type ArDb = Pool | PoolClient;

export interface ArCustomerLaneRow {
  customerId: string;
  customerName: string;
  leftAmount: number;
  rightAmount: number;
  difference: number;
}

export interface ArIntegrityLane {
  lane: 'integrity';
  asOfDate: string;
  generatedAt: string;
  glNetActive: number;
  openItemSubledger: number;
  integrityDifference: number;
  status: 'RECONCILED' | 'DISCREPANCY';
  gatesPeriodClose: true;
  exceptions: ArCustomerLaneRow[];
}

export interface ArCacheLane {
  lane: 'cache';
  asOfDate: string;
  generatedAt: string;
  openItemBalance: number;
  customerCacheBalance: number;
  cacheDifference: number;
  status: 'HEALTHY' | 'DRIFT';
  gatesPeriodClose: false;
  exceptions: ArCustomerLaneRow[];
}

export interface ArJournalAuditEntry {
  transactionId: string;
  transactionNumber: string;
  referenceType: string;
  referenceNumber: string | null;
  transactionDate: string;
  isReversed: boolean;
  isReversingEntry: boolean;
  arImpact: number;
  customerName: string | null;
}

export interface ArJournalAuditLane {
  lane: 'journal_audit';
  asOfDate: string;
  generatedAt: string;
  grossPosted: number;
  netActive: number;
  reversalImpact: number;
  status: 'INFORMATIONAL';
  gatesPeriodClose: false;
  customerExceptions: ArCustomerLaneRow[];
  journals: ArJournalAuditEntry[];
}

const INTEGRITY_CUSTOMER_SQL = `
  WITH gl_by_customer AS (
    SELECT NULLIF(TRIM(le."EntityId"), '')::uuid AS customer_id,
      COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS gl_bal
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1200'
      AND UPPER(le."EntityType") = 'CUSTOMER'
      AND le."EntityId" IS NOT NULL
      AND ${LEDGER_NET_ACTIVE_SQL}
      AND lt."TransactionDate"::DATE <= $1::date
    GROUP BY le."EntityId"
  ),
  open_item AS (
    SELECT c.id AS customer_id,
      GREATEST(0,
        COALESCE(inv.inv_due, 0) - COALESCE(pay.unalloc, 0)
      ) AS open_bal
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT SUM(i.amount_due) AS inv_due
      FROM invoices i
      WHERE i.customer_id = c.id
        AND COALESCE(i.document_type, 'INVOICE') IN ('INVOICE', 'OPENING_BALANCE')
        AND i.status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')
        AND i.issue_date::DATE <= $1::date
    ) inv ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(p.unallocated_amount) AS unalloc
      FROM ar_customer_payments p
      WHERE p.customer_id = c.id
        AND p.status IN ('POSTED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED')
        AND p.payment_date::DATE <= $1::date
    ) pay ON TRUE
    WHERE c.is_active = true
  )
  SELECT c.id::text AS customer_id,
    c.name AS customer_name,
    COALESCE(g.gl_bal, 0)::numeric AS left_amount,
    COALESCE(oi.open_bal, 0)::numeric AS right_amount,
    (COALESCE(g.gl_bal, 0) - COALESCE(oi.open_bal, 0))::numeric AS difference
  FROM customers c
  LEFT JOIN gl_by_customer g ON g.customer_id = c.id
  LEFT JOIN open_item oi ON oi.customer_id = c.id
  WHERE ABS(COALESCE(g.gl_bal, 0) - COALESCE(oi.open_bal, 0)) > 0.01
  ORDER BY ABS(COALESCE(g.gl_bal, 0) - COALESCE(oi.open_bal, 0)) DESC
`;

const CACHE_CUSTOMER_SQL = `
  WITH open_item AS (
    SELECT c.id AS customer_id,
      GREATEST(0,
        COALESCE(inv.inv_due, 0) - COALESCE(pay.unalloc, 0)
      ) AS open_bal
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT SUM(i.amount_due) AS inv_due
      FROM invoices i
      WHERE i.customer_id = c.id
        AND COALESCE(i.document_type, 'INVOICE') IN ('INVOICE', 'OPENING_BALANCE')
        AND i.status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')
        AND i.issue_date::DATE <= $1::date
    ) inv ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(p.unallocated_amount) AS unalloc
      FROM ar_customer_payments p
      WHERE p.customer_id = c.id
        AND p.status IN ('POSTED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED')
        AND p.payment_date::DATE <= $1::date
    ) pay ON TRUE
    WHERE c.is_active = true
  )
  SELECT c.id::text AS customer_id,
    c.name AS customer_name,
    COALESCE(oi.open_bal, 0)::numeric AS left_amount,
    COALESCE(c.balance, 0)::numeric AS right_amount,
    (COALESCE(oi.open_bal, 0) - COALESCE(c.balance, 0))::numeric AS difference
  FROM customers c
  LEFT JOIN open_item oi ON oi.customer_id = c.id
  WHERE ABS(COALESCE(oi.open_bal, 0) - COALESCE(c.balance, 0)) > 0.01
  ORDER BY ABS(COALESCE(oi.open_bal, 0) - COALESCE(c.balance, 0)) DESC
`;

const JOURNAL_CUSTOMER_SQL = `
  WITH gross AS (
    SELECT NULLIF(TRIM(le."EntityId"), '')::uuid AS customer_id,
      COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS gross_bal
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1200'
      AND UPPER(le."EntityType") = 'CUSTOMER'
      AND le."EntityId" IS NOT NULL
      AND lt."Status" = 'POSTED'
      AND lt."TransactionDate"::DATE <= $1::date
    GROUP BY le."EntityId"
  ),
  net AS (
    SELECT NULLIF(TRIM(le."EntityId"), '')::uuid AS customer_id,
      COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS net_bal
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1200'
      AND UPPER(le."EntityType") = 'CUSTOMER'
      AND le."EntityId" IS NOT NULL
      AND ${LEDGER_NET_ACTIVE_SQL}
      AND lt."TransactionDate"::DATE <= $1::date
    GROUP BY le."EntityId"
  )
  SELECT c.id::text AS customer_id,
    c.name AS customer_name,
    COALESCE(g.gross_bal, 0)::numeric AS left_amount,
    COALESCE(n.net_bal, 0)::numeric AS right_amount,
    (COALESCE(g.gross_bal, 0) - COALESCE(n.net_bal, 0))::numeric AS difference
  FROM customers c
  LEFT JOIN gross g ON g.customer_id = c.id
  LEFT JOIN net n ON n.customer_id = c.id
  WHERE ABS(COALESCE(g.gross_bal, 0) - COALESCE(n.net_bal, 0)) > 0.01
  ORDER BY ABS(COALESCE(g.gross_bal, 0) - COALESCE(n.net_bal, 0)) DESC
`;

function mapCustomerRows(
  rows: Array<{
    customer_id: string;
    customer_name: string;
    left_amount: string | number;
    right_amount: string | number;
    difference: string | number;
  }>,
): ArCustomerLaneRow[] {
  return rows.map((r) => ({
    customerId: r.customer_id,
    customerName: r.customer_name,
    leftAmount: Money.toNumber(Money.parseDb(r.left_amount)),
    rightAmount: Money.toNumber(Money.parseDb(r.right_amount)),
    difference: Money.toNumber(Money.parseDb(r.difference)),
  }));
}

export async function getArIntegrityLane(conn: ArDb, asOfDate?: string) {
  const date = asOfDate ?? getBusinessDate();
  const metrics = await captureArReconciliationMetrics(conn, date);
  const exceptionsRes = await conn.query(INTEGRITY_CUSTOMER_SQL, [date]);
  const integrityOk = isArGlIntegrityMatched(metrics);

  return {
    glNetActive: metrics.glNetActive1200,
    openItemSubledger: metrics.openItemSubledger,
    integrityDifference: metrics.integrityGlDrift,
    status: integrityOk ? ('RECONCILED' as const) : ('DISCREPANCY' as const),
    exceptions: mapCustomerRows(exceptionsRes.rows),
  };
}

export async function getArCacheLane(conn: ArDb, asOfDate?: string) {
  const date = asOfDate ?? getBusinessDate();
  const metrics = await captureArReconciliationMetrics(conn, date);
  const exceptionsRes = await conn.query(CACHE_CUSTOMER_SQL, [date]);
  const cacheDifference = metrics.openItemSubledger - metrics.customersTableSum;

  return {
    openItemBalance: metrics.openItemSubledger,
    customerCacheBalance: metrics.customersTableSum,
    cacheDifference,
    status: Math.abs(cacheDifference) <= 0.01 ? ('HEALTHY' as const) : ('DRIFT' as const),
    exceptions: mapCustomerRows(exceptionsRes.rows),
  };
}

export async function getArJournalAuditLane(conn: ArDb, asOfDate?: string) {
  const date = asOfDate ?? getBusinessDate();
  const ctx: ArQueryContext = { asOfDate: date };
  const [grossPosted, netActive, supplierExceptionsRes, journalsRes] = await Promise.all([
    computeArGlGrossPosted(conn, ctx),
    computeArGlCustomerScope(conn, ctx),
    conn.query(JOURNAL_CUSTOMER_SQL, [date]),
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
        COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0)::numeric AS ar_impact,
        MAX(c.name) AS customer_name
      FROM ledger_transactions lt
      JOIN ledger_entries le ON le."TransactionId" = lt."Id"
      JOIN accounts a ON a."Id" = le."AccountId"
      LEFT JOIN customers c ON c.id::text = NULLIF(TRIM(le."EntityId"), '')
      WHERE a."AccountCode" = '1200'
        AND UPPER(COALESCE(le."EntityType", '')) = 'CUSTOMER'
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
      ORDER BY ABS(COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0)) DESC
      LIMIT 100
      `,
      [date],
    ),
  ]);

  return {
    grossPosted,
    netActive,
    reversalImpact: grossPosted - netActive,
    status: 'INFORMATIONAL' as const,
    customerExceptions: mapCustomerRows(supplierExceptionsRes.rows),
    journals: journalsRes.rows.map((r) => ({
      transactionId: r.transaction_id,
      transactionNumber: r.transaction_number,
      referenceType: r.reference_type,
      referenceNumber: r.reference_number,
      transactionDate: r.transaction_date,
      isReversed: Boolean(r.is_reversed),
      isReversingEntry: Boolean(r.is_reversing_entry),
      arImpact: Money.toNumber(Money.parseDb(r.ar_impact)),
      customerName: r.customer_name,
    })),
  };
}
