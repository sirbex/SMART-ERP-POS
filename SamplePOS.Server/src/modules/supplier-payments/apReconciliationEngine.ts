/**
 * Centralized AP open-item reconciliation (SAP / Odoo SSOT).
 * All AP integrity checks and supplier balance sync MUST use this module.
 *
 * Formula:
 *   AP subledger = SUM(open supplier invoice obligations with is_posted_to_gl)
 *                  − SUM(unallocated completed supplier payments)
 *   AP GL (supplier scope) = net-active 2100 excluding EXPENSE / EXPENSE_PAYMENT
 *
 * Invoices not yet posted to GL are excluded from subledger reconciliation (they
 * have no AP credit in ledger yet). Use computeUnpostedOpenInvoiceBalance for pipeline gap.
 */

import type { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { Money } from '../../utils/money.js';
import { LEDGER_NET_ACTIVE_SQL } from '../../utils/ledgerNetActive.js';

export type ApDbConn = Pool | PoolClient;

/** Optional as-of date for point-in-time GL / subledger (YYYY-MM-DD). */
export type ApQueryContext = { asOfDate?: string };

function asOfDateParam(ctx?: ApQueryContext): string[] {
  return ctx?.asOfDate ? [ctx.asOfDate] : [];
}

function glAsOfFilter(ctx?: ApQueryContext, ltAlias = 'lt'): string {
  return ctx?.asOfDate
    ? `AND ${ltAlias}."TransactionDate"::DATE <= $1::date`
    : '';
}

function invoiceAsOfFilter(ctx?: ApQueryContext): string {
  return ctx?.asOfDate ? `AND si."InvoiceDate"::DATE <= $1::date` : '';
}

function paymentAsOfFilter(ctx?: ApQueryContext): string {
  return ctx?.asOfDate ? `AND sp."PaymentDate"::DATE <= $1::date` : '';
}

/** Invoice rows excluded from open-item subledger. */
export const AP_INACTIVE_INVOICE_STATUSES = [
  'PAID',
  'CANCELLED',
  'DELETED',
  'DRAFT',
] as const;

/** Standalone expenses on 2100 — valid GL but not supplier subledger. */
export const AP_NON_SUPPLIER_REFERENCE_TYPES = ['EXPENSE', 'EXPENSE_PAYMENT'] as const;

/** Open-item subledger only counts obligations already credited to AP in the GL. */
export const AP_OPEN_INVOICE_GL_POSTED_SQL = 'AND COALESCE(si.is_posted_to_gl, FALSE) = TRUE';

export interface ApReconciliationSnapshot {
  glBalance: number;
  invoiceOpenBalance: number;
  unallocatedPayments: number;
  subledgerBalance: number;
  expenseOnAp: number;
  legacyGrInAp: number;
  /** Open invoices not yet posted to GL (excluded from subledgerBalance). */
  unpostedOpenInvoiceBalance: number;
  drift: number;
  /** Drift after adding expense-on-AP (explains standalone expenses on 2100). */
  residualAfterExpense: number;
}

export interface ApIntegrityResult {
  ok: boolean;
  message: string;
  snapshot: ApReconciliationSnapshot;
}

export interface SupplierOpenItemBalance {
  invoiceOpen: number;
  unallocatedPayments: number;
  openItemBalance: number;
}

/**
 * Correlated SQL for suppliers.* — open-item balance (invoices − unallocated).
 * Must match syncSupplierBalanceFromOpenItems / getTotalOutstanding.
 */
export const SUPPLIER_OPEN_ITEM_BALANCE_SQL = `
  GREATEST(
    COALESCE((
      SELECT SUM(
        CASE
          WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
            THEN -COALESCE(si."OutstandingBalance", 0)
          ELSE COALESCE(si."OutstandingBalance", 0)
        END
      )
      FROM supplier_invoices si
      WHERE si."SupplierId" = suppliers."Id"
        AND si.deleted_at IS NULL
        AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
        ${AP_OPEN_INVOICE_GL_POSTED_SQL}
    ), 0)
    - COALESCE((
      SELECT COALESCE(SUM(
        COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0))
      ), 0)
      FROM supplier_payments sp
      WHERE sp."SupplierId" = suppliers."Id"
        AND sp.deleted_at IS NULL
        AND sp."Status" = 'COMPLETED'
        AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) > 0.009
    ), 0),
    0
  )`;

function ledgerDerivedOpenInvoiceSql(
  supplierIdParam?: string,
  ctx?: ApQueryContext,
): string {
  const supplierFilter = supplierIdParam
    ? `AND si."SupplierId" = ${supplierIdParam}`
    : '';
  const invDateFilter = invoiceAsOfFilter(ctx);
  const payDateFilter = ctx?.asOfDate
    ? `AND sp."PaymentDate"::DATE <= $1::date`
    : '';
  return `
    WITH inv_paid AS (
      SELECT spa."SupplierInvoiceId" AS invoice_id,
        COALESCE(SUM(spa."AmountAllocated"), 0) AS paid_amount
      FROM supplier_payment_allocations spa
      JOIN supplier_payments sp ON sp."Id" = spa."PaymentId"
      WHERE spa.deleted_at IS NULL
        AND sp.deleted_at IS NULL
        AND sp."Status" != 'DELETED'
        ${payDateFilter}
      GROUP BY spa."SupplierInvoiceId"
    ),
    inv_credits AS (
      SELECT scn.reference_invoice_id AS invoice_id,
        COALESCE(SUM(CASE WHEN scn.return_grn_id IS NOT NULL THEN scn."TotalAmount" ELSE 0 END), 0) AS return_credits,
        COALESCE(SUM(CASE WHEN scn.return_grn_id IS NULL THEN scn."TotalAmount" ELSE 0 END), 0) AS credit_notes
      FROM supplier_invoices scn
      WHERE scn.document_type = 'SUPPLIER_CREDIT_NOTE'
        AND scn.deleted_at IS NULL
        AND UPPER(scn."Status") IN ('POSTED', 'APPLIED')
        AND scn.reference_invoice_id IS NOT NULL
        ${ctx?.asOfDate ? `AND scn."InvoiceDate"::DATE <= $1::date` : ''}
      GROUP BY scn.reference_invoice_id
    ),
    open_rows AS (
      SELECT si.document_type,
        CASE
          WHEN si.document_type IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE') THEN
            GREATEST(0, si."TotalAmount" - COALESCE(si."AmountPaid", 0))
          ELSE GREATEST(0,
            si."TotalAmount"
            - COALESCE(ip.paid_amount, 0)
            - COALESCE(ic.return_credits, 0)
            - COALESCE(ic.credit_notes, 0)
          )
        END AS ledger_open
      FROM supplier_invoices si
      LEFT JOIN inv_paid ip ON ip.invoice_id = si."Id"
      LEFT JOIN inv_credits ic ON ic.invoice_id = si."Id"
      WHERE si.deleted_at IS NULL
        AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
        ${AP_OPEN_INVOICE_GL_POSTED_SQL}
        ${invDateFilter}
        ${supplierFilter}
    )
    SELECT COALESCE(SUM(
      CASE
        WHEN document_type = 'SUPPLIER_CREDIT_NOTE' THEN -ledger_open
        ELSE ledger_open
      END
    ), 0) AS invoice_open
    FROM open_rows
    WHERE ledger_open > 0.009
  `;
}

function invoiceOpenBalanceSql(supplierIdParam?: string, ctx?: ApQueryContext): string {
  return ledgerDerivedOpenInvoiceSql(supplierIdParam, ctx);
}

/** Open supplier invoices not yet credited to AP 2100 (3-way match / billing pipeline). */
export async function computeUnpostedOpenInvoiceBalance(
  conn: ApDbConn,
  supplierId?: string,
): Promise<number> {
  const params = supplierId ? [supplierId] : [];
  const supplierFilter = supplierId ? 'AND si."SupplierId" = $1' : '';
  const res = await conn.query(
    `
    SELECT COALESCE(SUM(
      CASE
        WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
          THEN -COALESCE(si."OutstandingBalance", 0)
        ELSE COALESCE(si."OutstandingBalance", 0)
      END
    ), 0) AS unposted_open
    FROM supplier_invoices si
    WHERE si.deleted_at IS NULL
      AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
      AND COALESCE(si.is_posted_to_gl, FALSE) = FALSE
      ${supplierFilter}
    `,
    params,
  );
  return Money.toNumber(Money.parseDb(res.rows[0]?.unposted_open ?? 0));
}

function unallocatedPaymentsSql(supplierIdParam?: string, ctx?: ApQueryContext): string {
  const supplierFilter = supplierIdParam
    ? `AND sp."SupplierId" = ${supplierIdParam}`
    : '';
  return `
    SELECT COALESCE(SUM(
      COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0))
    ), 0) AS unallocated
    FROM supplier_payments sp
    WHERE sp.deleted_at IS NULL
      AND sp."Status" = 'COMPLETED'
      AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) > 0.009
      ${paymentAsOfFilter(ctx)}
      ${supplierFilter}
  `;
}

/** Gross posted GL 2100 for supplier procure-to-pay (includes reversal legs). */
export async function computeApGlSupplierScopeGrossPosted(
  conn: ApDbConn,
  ctx?: ApQueryContext,
): Promise<number> {
  const params = asOfDateParam(ctx);
  const res = await conn.query(
    `
    SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '2100'
      AND UPPER(le."EntityType") = 'SUPPLIER'
      AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
      AND lt."Status" = 'POSTED'
      ${glAsOfFilter(ctx)}
    `,
    params,
  );
  return Money.toNumber(Money.parseDb(res.rows[0]?.gl_balance ?? 0));
}

/** Net-active GL 2100 for supplier procure-to-pay (excludes standalone expenses). */
export async function computeApGlSupplierScope(
  conn: ApDbConn,
  ctx?: ApQueryContext,
): Promise<number> {
  const params = asOfDateParam(ctx);
  const res = await conn.query(
    `
    SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '2100'
      AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
      AND ${LEDGER_NET_ACTIVE_SQL}
      ${glAsOfFilter(ctx)}
    `,
    params,
  );
  return Money.toNumber(Money.parseDb(res.rows[0]?.gl_balance ?? 0));
}

export async function computeApGlTotal2100(
  conn: ApDbConn,
  ctx?: ApQueryContext,
): Promise<number> {
  const params = asOfDateParam(ctx);
  const res = await conn.query(
    `
    SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '2100'
      AND ${LEDGER_NET_ACTIVE_SQL}
      ${glAsOfFilter(ctx)}
    `,
    params,
  );
  return Money.toNumber(Money.parseDb(res.rows[0]?.gl_balance ?? 0));
}

export async function computeExpenseOnAp(
  conn: ApDbConn,
  ctx?: ApQueryContext,
): Promise<number> {
  const params = asOfDateParam(ctx);
  const res = await conn.query(
    `
    SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS expense_on_ap
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '2100'
      AND lt."ReferenceType" IN ('EXPENSE', 'EXPENSE_PAYMENT')
      AND ${LEDGER_NET_ACTIVE_SQL}
      ${glAsOfFilter(ctx)}
    `,
    params,
  );
  return Money.toNumber(Money.parseDb(res.rows[0]?.expense_on_ap ?? 0));
}

/** Legacy GR credits still sitting in AP instead of GRIR 2150 (advisory). */
export async function computeLegacyGrInAp(conn: ApDbConn): Promise<number> {
  const res = await conn.query(`
    SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS legacy_gr
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '2100'
      AND lt."ReferenceType" = 'GOODS_RECEIPT'
      AND lt."IsReversed" = FALSE
  `);
  return Money.toNumber(Money.parseDb(res.rows[0]?.legacy_gr ?? 0));
}

/** Per-supplier open-item balance (SSOT for UI, performance API, cache sync). */
export async function computeSupplierOpenItemBalance(
  conn: ApDbConn,
  supplierId: string,
): Promise<SupplierOpenItemBalance> {
  const invoiceOpen = await computeOpenInvoiceBalance(conn, supplierId);
  const unallocatedPayments = await computeUnallocatedSupplierPayments(conn, supplierId);
  const sub = new Decimal(invoiceOpen).minus(unallocatedPayments);
  const openItemBalance = Money.toNumber(sub.lessThan(0) ? new Decimal(0) : sub);
  return { invoiceOpen, unallocatedPayments, openItemBalance };
}

export async function computeOpenInvoiceBalance(
  conn: ApDbConn,
  supplierId?: string,
  ctx?: ApQueryContext,
): Promise<number> {
  const params = supplierId
    ? [...asOfDateParam(ctx), supplierId]
    : asOfDateParam(ctx);
  const supplierParam = supplierId
    ? ctx?.asOfDate ? '$2' : '$1'
    : undefined;
  const res = await conn.query(
    invoiceOpenBalanceSql(supplierParam, ctx),
    params,
  );
  return Money.toNumber(Money.parseDb(res.rows[0]?.invoice_open ?? 0));
}

export async function computeUnallocatedSupplierPayments(
  conn: ApDbConn,
  supplierId?: string,
  ctx?: ApQueryContext,
): Promise<number> {
  const params = supplierId
    ? [...asOfDateParam(ctx), supplierId]
    : asOfDateParam(ctx);
  const supplierParam = supplierId
    ? ctx?.asOfDate ? '$2' : '$1'
    : undefined;
  const res = await conn.query(
    unallocatedPaymentsSql(supplierParam, ctx),
    params,
  );
  return Money.toNumber(Money.parseDb(res.rows[0]?.unallocated ?? 0));
}

/**
 * Open-item AP subledger (global) = open invoices − unallocated payments, floored once at 0.
 * Used for GL integrity / heal-ap-drift.
 */
export async function computeApSubledgerBalance(
  conn: ApDbConn,
  supplierId?: string,
  ctx?: ApQueryContext,
): Promise<number> {
  const invoiceOpen = await computeOpenInvoiceBalance(conn, supplierId, ctx);
  const unallocated = await computeUnallocatedSupplierPayments(conn, supplierId, ctx);
  const sub = new Decimal(invoiceOpen).minus(unallocated);
  return Money.toNumber(sub.lessThan(0) ? new Decimal(0) : sub);
}

/** Scalar subquery: ledger-derived open invoice balance for one supplier. */
function correlatedLedgerInvoiceOpenSql(supplierIdColumn: string, ctx?: ApQueryContext): string {
  const payDate = ctx?.asOfDate ? `AND sp."PaymentDate"::DATE <= $1::date` : '';
  const invDate = invoiceAsOfFilter(ctx);
  const scnDate = ctx?.asOfDate ? `AND scn."InvoiceDate"::DATE <= $1::date` : '';
  return `
    SELECT COALESCE(SUM(
      CASE
        WHEN document_type = 'SUPPLIER_CREDIT_NOTE' THEN -ledger_open
        ELSE ledger_open
      END
    ), 0)
    FROM (
      SELECT si.document_type,
        CASE
          WHEN si.document_type IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE') THEN
            GREATEST(0, si."TotalAmount" - COALESCE(si."AmountPaid", 0))
          ELSE GREATEST(0,
            si."TotalAmount"
            - COALESCE((
                SELECT COALESCE(SUM(spa."AmountAllocated"), 0)
                FROM supplier_payment_allocations spa
                JOIN supplier_payments sp ON sp."Id" = spa."PaymentId"
                WHERE spa."SupplierInvoiceId" = si."Id"
                  AND spa.deleted_at IS NULL
                  AND sp.deleted_at IS NULL
                  AND sp."Status" != 'DELETED'
                  ${payDate}
              ), 0)
            - COALESCE((
                SELECT COALESCE(SUM(
                  CASE WHEN scn.return_grn_id IS NOT NULL THEN scn."TotalAmount" ELSE 0 END
                ), 0)
                FROM supplier_invoices scn
                WHERE scn.reference_invoice_id = si."Id"
                  AND scn.document_type = 'SUPPLIER_CREDIT_NOTE'
                  AND scn.deleted_at IS NULL
                  AND UPPER(scn."Status") IN ('POSTED', 'APPLIED')
                  ${scnDate}
              ), 0)
            - COALESCE((
                SELECT COALESCE(SUM(
                  CASE WHEN scn.return_grn_id IS NULL THEN scn."TotalAmount" ELSE 0 END
                ), 0)
                FROM supplier_invoices scn
                WHERE scn.reference_invoice_id = si."Id"
                  AND scn.document_type = 'SUPPLIER_CREDIT_NOTE'
                  AND scn.deleted_at IS NULL
                  AND UPPER(scn."Status") IN ('POSTED', 'APPLIED')
                  ${scnDate}
              ), 0)
          )
        END AS ledger_open
      FROM supplier_invoices si
      WHERE si."SupplierId" = ${supplierIdColumn}
        AND si.deleted_at IS NULL
        AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
        ${AP_OPEN_INVOICE_GL_POSTED_SQL}
        ${invDate}
    ) open_rows
    WHERE ledger_open > 0.009
  `;
}

/**
 * Expected SUM(suppliers.OutstandingBalance) after recalc — per-supplier floor, then sum.
 * Must match syncSupplierBalanceFromOpenItems (Wave 5 cache SSOT).
 */
export async function computeSuppliersMasterCacheExpectedSum(
  conn: ApDbConn,
  ctx?: ApQueryContext,
): Promise<number> {
  const params = asOfDateParam(ctx);
  const payDate = paymentAsOfFilter(ctx);
  const res = await conn.query(
    `
    SELECT COALESCE(SUM(per_supplier), 0) AS total
    FROM (
      SELECT GREATEST(
        COALESCE((
          ${correlatedLedgerInvoiceOpenSql('s."Id"', ctx)}
        ), 0)
        - COALESCE((
          SELECT COALESCE(SUM(
            COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0))
          ), 0)
          FROM supplier_payments sp
          WHERE sp."SupplierId" = s."Id"
            AND sp.deleted_at IS NULL
            AND sp."Status" = 'COMPLETED'
            AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) > 0.009
            ${payDate}
        ), 0),
        0
      ) AS per_supplier
      FROM suppliers s
    ) sums
    `,
    params,
  );
  return Money.toNumber(Money.parseDb(res.rows[0]?.total ?? 0));
}

export async function computeApReconciliationSnapshot(
  conn: ApDbConn,
  ctx?: ApQueryContext,
): Promise<ApReconciliationSnapshot> {
  const [glBalance, invoiceOpenBalance, unallocatedPayments, expenseOnAp, legacyGrInAp, unpostedOpenInvoiceBalance] =
    await Promise.all([
      computeApGlSupplierScope(conn, ctx),
      computeOpenInvoiceBalance(conn, undefined, ctx),
      computeUnallocatedSupplierPayments(conn, undefined, ctx),
      computeExpenseOnAp(conn, ctx),
      computeLegacyGrInAp(conn),
      computeUnpostedOpenInvoiceBalance(conn),
    ]);

  const sub = new Decimal(invoiceOpenBalance).minus(unallocatedPayments);
  const subledgerBalance = Money.toNumber(sub.lessThan(0) ? new Decimal(0) : sub);
  const drift = Money.toNumber(new Decimal(glBalance).minus(subledgerBalance));
  const residualAfterExpense = Money.toNumber(new Decimal(drift).plus(expenseOnAp));

  return {
    glBalance,
    invoiceOpenBalance,
    unallocatedPayments,
    subledgerBalance,
    expenseOnAp,
    legacyGrInAp,
    unpostedOpenInvoiceBalance,
    drift,
    residualAfterExpense,
  };
}

/** Drift ≈ −unposted when subledger wrongly included pre-GL invoices (do not heal-ap-drift). */
export function isApDriftExplainedByUnpostedInvoices(
  snapshot: ApReconciliationSnapshot,
  threshold?: number,
): boolean {
  const t = threshold ?? apMaterialityThreshold(snapshot.glBalance);
  const unposted = snapshot.unpostedOpenInvoiceBalance;
  if (unposted < t) return false;
  return Math.abs(snapshot.drift + unposted) <= t;
}

export function apMaterialityThreshold(glBalance: number): number {
  const gl = new Decimal(glBalance).abs();
  const pct = gl.times(0.0001);
  return pct.greaterThan(5000) ? pct.toDecimalPlaces(2).toNumber() : 5000;
}

export function isApDriftExplainedByExpenses(
  snapshot: ApReconciliationSnapshot,
  threshold?: number,
): boolean {
  const t = threshold ?? apMaterialityThreshold(snapshot.glBalance);
  return Math.abs(snapshot.residualAfterExpense) <= t;
}

export async function assertApIntegrity(conn: ApDbConn): Promise<ApIntegrityResult> {
  const snapshot = await computeApReconciliationSnapshot(conn);
  const threshold = apMaterialityThreshold(snapshot.glBalance);
  const driftOk = Math.abs(snapshot.drift) <= 0.02;
  const explained = isApDriftExplainedByExpenses(snapshot, threshold);
  const ok = driftOk || explained;

  return {
    ok,
    message: ok
      ? explained && !driftOk
        ? `AP reconciled; ${snapshot.expenseOnAp.toFixed(2)} standalone expenses on 2100 excluded from supplier subledger`
        : 'AP open-item integrity OK'
      : `AP drift ${snapshot.drift.toFixed(2)} — GL ${snapshot.glBalance.toFixed(2)} vs subledger ${snapshot.subledgerBalance.toFixed(2)}`,
    snapshot,
  };
}

/**
 * Supplier master balance = open invoices − unallocated payments (Wave 5 SSOT).
 */
export async function syncSupplierBalanceFromOpenItems(
  conn: PoolClient,
  supplierId: string,
  _changeSource: string,
): Promise<{ oldBalance: number; newBalance: number; invoicesRepaired?: number }> {
  const { repairSupplierInvoiceOutstandingFromLedger } = await import(
    './supplierPaymentRepository.js'
  );
  const repair = await repairSupplierInvoiceOutstandingFromLedger(conn, supplierId);
  if (repair.repaired > 0) {
    const { default: logger } = await import('../../utils/logger.js');
    logger.warn('Supplier invoice outstanding repaired from ledger before cache sync', {
      supplierId,
      ...repair,
      changeSource: _changeSource,
    });
  }

  const balanceUpdate = await conn.query(
    `WITH old AS (
       SELECT "OutstandingBalance" AS balance, "CompanyName" AS name
       FROM suppliers WHERE "Id" = $1
     ),
     open_inv AS (
       SELECT COALESCE(SUM(
         CASE
           WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
             THEN -COALESCE(si."OutstandingBalance", 0)
           ELSE COALESCE(si."OutstandingBalance", 0)
         END
       ), 0) AS due
       FROM supplier_invoices si
       WHERE si."SupplierId" = $1
         AND si.deleted_at IS NULL
         AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
         ${AP_OPEN_INVOICE_GL_POSTED_SQL}
     ),
     unalloc AS (
       SELECT COALESCE(SUM(
         COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0))
       ), 0) AS ua
       FROM supplier_payments sp
       WHERE sp."SupplierId" = $1
         AND sp.deleted_at IS NULL
         AND sp."Status" = 'COMPLETED'
         AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) > 0.009
     )
     UPDATE suppliers
     SET "OutstandingBalance" = GREATEST(0, (SELECT due FROM open_inv) - (SELECT ua FROM unalloc)),
         "UpdatedAt" = NOW()
     WHERE "Id" = $1
     RETURNING "OutstandingBalance" AS balance,
               (SELECT balance FROM old) AS old_balance,
               (SELECT name FROM old) AS supplier_name`,
    [supplierId],
  );

  const row = balanceUpdate.rows[0];
  const oldBalance = Money.toNumber(Money.parseDb(row?.old_balance ?? 0));
  const newBalance = Money.toNumber(Money.parseDb(row?.balance ?? 0));

  return { oldBalance, newBalance, invoicesRepaired: repair.repaired };
}
