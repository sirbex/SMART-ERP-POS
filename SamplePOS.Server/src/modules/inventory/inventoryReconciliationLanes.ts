/**
 * Inventory reconciliation lanes — domain calculations (read-only).
 */
import type { Pool, PoolClient } from 'pg';
import { Money } from '../../utils/money.js';
import { LEDGER_NET_ACTIVE_SQL } from '../../utils/ledgerNetActive.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import {
  computeGl1300GrossPosted,
  computeGl1300NetActive,
  type InventoryQueryContext,
} from './inventoryReconciliationEngine.js';
import {
  captureInventoryReconciliationMetrics,
  isInventoryGlIntegrityMatched,
} from './inventoryReconciliationMetrics.js';

type InventoryDb = Pool | PoolClient;

export interface InventoryProductLaneRow {
  productId: string;
  productName: string;
  leftAmount: number;
  rightAmount: number;
  difference: number;
}

export interface InventoryIntegrityLane {
  lane: 'integrity';
  asOfDate: string;
  generatedAt: string;
  glNetActive: number;
  batchSubledger: number;
  integrityDifference: number;
  materialityThreshold: number;
  status: 'RECONCILED' | 'DISCREPANCY';
  gatesPeriodClose: true;
  exceptions: InventoryProductLaneRow[];
}

export interface InventoryCacheLane {
  lane: 'cache';
  asOfDate: string;
  generatedAt: string;
  batchSubledger: number;
  productCacheBalance: number;
  cacheDifference: number;
  storedBalance1300: number;
  storedBalanceDrift: number;
  status: 'HEALTHY' | 'DRIFT';
  gatesPeriodClose: false;
  exceptions: InventoryProductLaneRow[];
}

export interface InventoryJournalAuditEntry {
  transactionId: string;
  transactionNumber: string;
  referenceType: string;
  referenceNumber: string | null;
  transactionDate: string;
  isReversed: boolean;
  isReversingEntry: boolean;
  inventoryImpact: number;
}

export interface InventoryJournalAuditLane {
  lane: 'journal_audit';
  asOfDate: string;
  generatedAt: string;
  grossPosted: number;
  netActive: number;
  reversalImpact: number;
  status: 'INFORMATIONAL';
  gatesPeriodClose: false;
  journals: InventoryJournalAuditEntry[];
}

const PRODUCT_CACHE_EXCEPTIONS_SQL = `
  WITH batch_by_product AS (
    SELECT ib.product_id,
      COALESCE(SUM(ib.remaining_quantity * ib.cost_price), 0) AS batch_val
    FROM inventory_batches ib
    WHERE ib.remaining_quantity > 0
    GROUP BY ib.product_id
  )
  SELECT p.id::text AS product_id,
    p.name AS product_name,
    COALESCE(b.batch_val, 0)::numeric AS left_amount,
    (COALESCE(p.quantity_on_hand, 0) * COALESCE(p.cost_price, 0))::numeric AS right_amount,
    (COALESCE(b.batch_val, 0)
      - COALESCE(p.quantity_on_hand, 0) * COALESCE(p.cost_price, 0))::numeric AS difference
  FROM products p
  LEFT JOIN batch_by_product b ON b.product_id = p.id
  WHERE p.is_active = true
    AND ABS(
      COALESCE(b.batch_val, 0)
      - COALESCE(p.quantity_on_hand, 0) * COALESCE(p.cost_price, 0)
    ) > 0.01
  ORDER BY ABS(
    COALESCE(b.batch_val, 0)
    - COALESCE(p.quantity_on_hand, 0) * COALESCE(p.cost_price, 0)
  ) DESC
  LIMIT 50
`;

function mapProductRows(
  rows: Array<{
    product_id: string;
    product_name: string;
    left_amount: string | number;
    right_amount: string | number;
    difference: string | number;
  }>,
): InventoryProductLaneRow[] {
  return rows.map((r) => ({
    productId: r.product_id,
    productName: r.product_name,
    leftAmount: Money.toNumber(Money.parseDb(r.left_amount)),
    rightAmount: Money.toNumber(Money.parseDb(r.right_amount)),
    difference: Money.toNumber(Money.parseDb(r.difference)),
  }));
}

export async function getInventoryIntegrityLane(conn: InventoryDb, asOfDate?: string) {
  const date = asOfDate ?? getBusinessDate();
  const metrics = await captureInventoryReconciliationMetrics(conn, date);
  const integrityOk = isInventoryGlIntegrityMatched(metrics);

  return {
    glNetActive: metrics.glNetActive1300,
    batchSubledger: metrics.batchSubledger,
    integrityDifference: metrics.integrityGlDrift,
    materialityThreshold: metrics.materialityThreshold,
    status: integrityOk ? ('RECONCILED' as const) : ('DISCREPANCY' as const),
    exceptions: [] as InventoryProductLaneRow[],
    details: {
      productValuationCache: metrics.productValuationCache,
      storedBalance1300: metrics.storedBalance1300,
      storedBalanceDrift: metrics.storedBalanceDrift,
      materialityThreshold: metrics.materialityThreshold,
    },
  };
}

export async function getInventoryCacheLane(conn: InventoryDb, asOfDate?: string) {
  const date = asOfDate ?? getBusinessDate();
  const metrics = await captureInventoryReconciliationMetrics(conn, date);
  const exceptionsRes = await conn.query(PRODUCT_CACHE_EXCEPTIONS_SQL);
  const cacheDifference = metrics.productCacheDrift;

  return {
    batchSubledger: metrics.batchSubledger,
    productCacheBalance: metrics.productValuationCache,
    cacheDifference,
    storedBalance1300: metrics.storedBalance1300,
    storedBalanceDrift: metrics.storedBalanceDrift,
    status: Math.abs(cacheDifference) <= 0.01 ? ('HEALTHY' as const) : ('DRIFT' as const),
    exceptions: mapProductRows(exceptionsRes.rows),
  };
}

export async function getInventoryJournalAuditLane(conn: InventoryDb, asOfDate?: string) {
  const date = asOfDate ?? getBusinessDate();
  const ctx: InventoryQueryContext = { asOfDate: date };
  const [grossPosted, netActive, journalsRes] = await Promise.all([
    computeGl1300GrossPosted(conn, ctx),
    computeGl1300NetActive(conn, ctx),
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
        COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0)::numeric AS inventory_impact
      FROM ledger_transactions lt
      JOIN ledger_entries le ON le."TransactionId" = lt."Id"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1300'
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
    journals: journalsRes.rows.map((r) => ({
      transactionId: r.transaction_id,
      transactionNumber: r.transaction_number,
      referenceType: r.reference_type,
      referenceNumber: r.reference_number,
      transactionDate: r.transaction_date,
      isReversed: Boolean(r.is_reversed),
      isReversingEntry: Boolean(r.is_reversing_entry),
      inventoryImpact: Money.toNumber(Money.parseDb(r.inventory_impact)),
    })),
  };
}
