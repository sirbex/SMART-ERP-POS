/**
 * AP (2100) reconciliation metrics — single source for UI, integrity, and proof scripts.
 */
import type { Pool, PoolClient } from 'pg';
import { Money } from '../../utils/money.js';
import {
  apMaterialityThreshold,
  computeApGlSupplierScope,
  computeApSubledgerBalance,
  computeExpenseOnAp,
  computeSuppliersMasterCacheExpectedSum,
  isApDriftExplainedByExpenses,
} from './apReconciliationEngine.js';

export interface ApReconciliationMetrics {
  asOfDate: string;
  glTotal2100: number;
  glSupplierEntity2100: number;
  glSupplierScopeNetActive: number;
  openItemSubledger: number;
  suppliersTableSum: number;
  /** SUM per-supplier GREATEST(0, inv − unalloc) — cache SSOT after recalc */
  suppliersCacheExpectedSum: number;
  storedBalance2100: number;
  /** suppliers.OutstandingBalance sum − expected cache sum */
  supplierCacheDrift: number;
  /** accounts.CurrentBalance − posted GL total 2100 */
  storedBalanceDrift: number;
  /** EntityType=SUPPLIER GL − open-item subledger */
  supplierEntityGlDrift: number;
  /** Net-active supplier-scope GL − open-item (integrity SSOT) */
  integrityGlDrift: number;
  /** Standalone expenses on 2100 (not supplier subledger) */
  expenseOnAp: number;
}

export interface ApReconciliationVerification {
  ok: boolean;
  failures: string[];
  metrics: ApReconciliationMetrics;
}

type ApDb = Pool | PoolClient;

export async function captureApReconciliationMetrics(
  conn: ApDb,
  asOfDate?: string,
): Promise<ApReconciliationMetrics> {
  const date = asOfDate ?? new Date().toISOString().slice(0, 10);

  const res = await conn.query(
    `
    WITH gl_total AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS balance
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '2100'
        AND lt."TransactionDate"::DATE <= $1::date
        AND lt."Status" = 'POSTED'
    ),
    gl_supplier_entity AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS balance
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '2100'
        AND UPPER(le."EntityType") = 'SUPPLIER'
        AND lt."TransactionDate"::DATE <= $1::date
        AND lt."Status" = 'POSTED'
    ),
    supplier_table AS (
      SELECT COALESCE(SUM("OutstandingBalance"), 0) AS balance FROM suppliers
    ),
    stored_balance AS (
      SELECT COALESCE("CurrentBalance", 0) AS balance
      FROM accounts WHERE "AccountCode" = '2100'
    )
    SELECT
      gt.balance AS gl_total,
      gse.balance AS gl_supplier_entity,
      st.balance AS supplier_table_sum,
      sb.balance AS stored_balance
    FROM gl_total gt, gl_supplier_entity gse, supplier_table st, stored_balance sb
    `,
    [date],
  );

  const row = res.rows[0] ?? {};
  const glTotal2100 = Money.toNumber(Money.parseDb(row.gl_total ?? 0));
  const glSupplierEntity2100 = Money.toNumber(Money.parseDb(row.gl_supplier_entity ?? 0));
  const suppliersTableSum = Money.toNumber(Money.parseDb(row.supplier_table_sum ?? 0));
  const storedBalance2100 = Money.toNumber(Money.parseDb(row.stored_balance ?? 0));

  const [glSupplierScopeNetActive, openItemSubledger, suppliersCacheExpectedSum, expenseOnAp] =
    await Promise.all([
      computeApGlSupplierScope(conn),
      computeApSubledgerBalance(conn),
      computeSuppliersMasterCacheExpectedSum(conn),
      computeExpenseOnAp(conn),
    ]);

  return {
    asOfDate: date,
    glTotal2100,
    glSupplierEntity2100,
    glSupplierScopeNetActive,
    openItemSubledger,
    suppliersTableSum,
    suppliersCacheExpectedSum,
    storedBalance2100,
    supplierCacheDrift: suppliersTableSum - suppliersCacheExpectedSum,
    storedBalanceDrift: glTotal2100 - storedBalance2100,
    supplierEntityGlDrift: glSupplierEntity2100 - openItemSubledger,
    integrityGlDrift: glSupplierScopeNetActive - openItemSubledger,
    expenseOnAp,
  };
}

/** Supplier-scope GL vs open-item — same rules as GL integrity check. */
export function isApSupplierGlIntegrityMatched(metrics: ApReconciliationMetrics): boolean {
  if (Math.abs(metrics.integrityGlDrift) <= 0.01) return true;
  const threshold = apMaterialityThreshold(metrics.glSupplierScopeNetActive);
  return isApDriftExplainedByExpenses(
    {
      glBalance: metrics.glSupplierScopeNetActive,
      invoiceOpenBalance: 0,
      unallocatedPayments: 0,
      subledgerBalance: metrics.openItemSubledger,
      expenseOnAp: metrics.expenseOnAp,
      legacyGrInAp: 0,
      unpostedOpenInvoiceBalance: 0,
      drift: metrics.integrityGlDrift,
      residualAfterExpense: metrics.integrityGlDrift + metrics.expenseOnAp,
    },
    threshold,
  );
}

/**
 * Post-heal invariants for enterprise AP reconciliation.
 * Cache + stored balance must match SSOT; integrity GL drift may remain if explained by expenses.
 */
/** Cache-layer only (STORED + SUPPLIER_BALANCE) — independent of GL vs open-item integrity. */
export function verifyApCacheLayersOnly(
  metrics: ApReconciliationMetrics,
  options?: { tolerance?: number },
): { ok: boolean; failures: string[] } {
  const t = options?.tolerance ?? 0.01;
  const failures: string[] = [];
  if (Math.abs(metrics.storedBalanceDrift) > t) {
    failures.push(
      `STORED_BALANCE: CurrentBalance ${metrics.storedBalance2100.toFixed(2)} `
        + `≠ posted GL ${metrics.glTotal2100.toFixed(2)} (drift ${metrics.storedBalanceDrift.toFixed(2)})`,
    );
  }
  if (Math.abs(metrics.supplierCacheDrift) > t) {
    failures.push(
      `SUPPLIER_BALANCE cache: suppliers sum ${metrics.suppliersTableSum.toFixed(2)} `
        + `≠ expected cache ${metrics.suppliersCacheExpectedSum.toFixed(2)} `
        + `(drift ${metrics.supplierCacheDrift.toFixed(2)})`,
    );
  }
  return { ok: failures.length === 0, failures };
}

export function verifyApReconciliationMetrics(
  metrics: ApReconciliationMetrics,
  options?: { tolerance?: number },
): ApReconciliationVerification {
  const t = options?.tolerance ?? 0.01;
  const cacheCheck = verifyApCacheLayersOnly(metrics, options);
  const failures = [...cacheCheck.failures];

  return { ok: failures.length === 0, failures, metrics };
}

export function formatApMetricsReport(metrics: ApReconciliationMetrics): string {
  return [
    `AP metrics as of ${metrics.asOfDate}`,
    `  GL 2100 (posted total):        ${metrics.glTotal2100.toFixed(2)}`,
    `  GL supplier EntityType:        ${metrics.glSupplierEntity2100.toFixed(2)}`,
    `  GL supplier scope (net-active):${metrics.glSupplierScopeNetActive.toFixed(2)}`,
    `  Open-item subledger:           ${metrics.openItemSubledger.toFixed(2)}`,
    `  suppliers.OutstandingBalance:  ${metrics.suppliersTableSum.toFixed(2)}`,
    `  Expected cache sum:            ${metrics.suppliersCacheExpectedSum.toFixed(2)}`,
    `  accounts.CurrentBalance 2100:  ${metrics.storedBalance2100.toFixed(2)}`,
    `  Drift stored vs GL:            ${metrics.storedBalanceDrift.toFixed(2)}`,
    `  Drift cache vs open-item:      ${metrics.supplierCacheDrift.toFixed(2)}`,
    `  Drift entity-GL vs open-item:  ${metrics.supplierEntityGlDrift.toFixed(2)}`,
    `  Drift integrity-GL vs open-item:${metrics.integrityGlDrift.toFixed(2)}`,
  ].join('\n');
}
