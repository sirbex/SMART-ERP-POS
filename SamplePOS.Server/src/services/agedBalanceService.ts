/**
 * AGED RECEIVABLES / PAYABLES SERVICE
 *
 * Enterprise-grade aging analysis (Odoo Accounting Reports pattern).
 *
 * Integrity rules:
 *   - AR: invoices SSOT when linked to a credit sale — never double-count sale + invoice
 *   - AP: supplier invoices UNION open POs without open bill — never JOIN cartesian
 *   - Response SSOT: summary.total === grandTotal; table rows = entities (not invoice details)
 */

import type pg from 'pg';
import { pool as globalPool } from '../db/pool.js';
import { Money, Decimal } from '../utils/money.js';

// =============================================================================
// TYPES
// =============================================================================

export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null; // null = unbounded (90+)
}

export interface AgingLineItem {
  entityId: string;
  entityName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  daysOverdue: number;
  originalAmount: number;
  outstandingAmount: number;
  bucket: string;
}

export interface AgingEntitySummary {
  entityId: string;
  entityName: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
}

export interface AgingReportSummary {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  /** Same as grandTotal — UI/report consumer SSOT */
  total: number;
  grandTotal: number;
  entityCount: number;
}

export interface AgingReport {
  reportType: 'RECEIVABLE' | 'PAYABLE';
  asOfDate: string;
  generatedAt: string;
  buckets: AgingBucket[];
  summary: AgingReportSummary;
  /** Per customer/supplier bucket matrix (UI table) */
  entities: AgingEntitySummary[];
  /** Line-level invoices/sales (PDF detail; not the main table) */
  details: AgingLineItem[];
}

const DEFAULT_BUCKETS: AgingBucket[] = [
  { label: 'Current', minDays: 0, maxDays: 0 },
  { label: '1-30 Days', minDays: 1, maxDays: 30 },
  { label: '31-60 Days', minDays: 31, maxDays: 60 },
  { label: '61-90 Days', minDays: 61, maxDays: 90 },
  { label: '90+ Days', minDays: 91, maxDays: null },
];

// =============================================================================
// AGED RECEIVABLES / PAYABLES SERVICE
// =============================================================================

export class AgedBalanceService {
  /**
   * Aged Receivables — open AR only, no sale+invoice double count.
   */
  static async agedReceivables(
    asOfDate: string,
    dbPool?: pg.Pool
  ): Promise<AgingReport> {
    const pool = dbPool || globalPool;

    // 1) Customer invoices with outstanding balance (include those linked to sales)
    const invoiceResult = await pool.query(
      `SELECT
         COALESCE(c.id::text, i.customer_id::text, 'unknown') as entity_id,
         COALESCE(c.name, i.customer_name, 'Unknown Customer') as entity_name,
         i.invoice_number as invoice_number,
         i.issue_date::date::text as invoice_date,
         COALESCE(i.due_date, i.issue_date)::date::text as due_date,
         i.total_amount as original_amount,
         (i.total_amount - COALESCE(i.amount_paid, 0)) as outstanding_amount,
         ($1::date - COALESCE(i.due_date, i.issue_date)::date) as days_overdue
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       WHERE UPPER(COALESCE(i.status::text, '')) NOT IN ('CANCELLED', 'PAID', 'VOIDED', 'VOID')
         AND (i.total_amount - COALESCE(i.amount_paid, 0)) > 0.01
         AND i.issue_date::date <= $1::date`,
      [asOfDate]
    );

    // 2) Credit sales still open that do NOT have a non-cancelled invoice (avoid double count)
    // payment_method is PG enum — never COALESCE(enum, '') (casts '' → 22P02).
    // Compare via ::text so unknown method codes never invent invalid enum labels.
    const salesResult = await pool.query(
      `SELECT
         COALESCE(c.id::text, s.customer_id::text, 'unknown') as entity_id,
         COALESCE(c.name, 'Walk-in / Unknown') as entity_name,
         s.sale_number as invoice_number,
         s.sale_date::date::text as invoice_date,
         s.sale_date::date::text as due_date,
         s.total_amount as original_amount,
         (s.total_amount - COALESCE(s.amount_paid, 0)) as outstanding_amount,
         ($1::date - s.sale_date::date) as days_overdue
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE UPPER(COALESCE(s.payment_method::text, '')) = 'CREDIT'
         AND UPPER(COALESCE(s.status::text, '')) NOT IN ('VOID', 'REFUNDED', 'VOIDED_BY_RETURN')
         AND (s.total_amount - COALESCE(s.amount_paid, 0)) > 0.01
         AND s.sale_date::date <= $1::date
         AND NOT EXISTS (
           SELECT 1 FROM invoices inv
           WHERE inv.sale_id = s.id
             AND UPPER(COALESCE(inv.status::text, '')) NOT IN ('CANCELLED', 'VOIDED', 'VOID')
         )`,
      [asOfDate]
    );

    const allRows = [...invoiceResult.rows, ...salesResult.rows];
    return this.buildReport('RECEIVABLE', asOfDate, allRows);
  }

  /**
   * Aged Payables — open supplier bills UNION open POs (no cartesian product).
   */
  static async agedPayables(
    asOfDate: string,
    dbPool?: pg.Pool
  ): Promise<AgingReport> {
    const pool = dbPool || globalPool;

    const bills = await pool.query(
      `SELECT
         COALESCE(s."Id"::text, si."SupplierId"::text, 'unknown') as entity_id,
         COALESCE(s."CompanyName", 'Unknown Supplier') as entity_name,
         COALESCE(si."SupplierInvoiceNumber", si."InternalReferenceNumber", si."Id"::text) as invoice_number,
         si."InvoiceDate"::date::text as invoice_date,
         COALESCE(si."DueDate", si."InvoiceDate")::date::text as due_date,
         si."TotalAmount" as original_amount,
         COALESCE(si."OutstandingBalance", si."TotalAmount" - COALESCE(si."AmountPaid", 0)) as outstanding_amount,
         ($1::date - COALESCE(si."DueDate", si."InvoiceDate")::date) as days_overdue
       FROM supplier_invoices si
       LEFT JOIN suppliers s ON s."Id" = si."SupplierId"
       WHERE COALESCE(si.document_type, 'SUPPLIER_INVOICE') = 'SUPPLIER_INVOICE'
         AND si.deleted_at IS NULL
         AND COALESCE(si."Status", '') NOT IN ('PAID', 'CANCELLED', 'Cancelled', 'VOIDED', 'Voided')
         AND COALESCE(si."OutstandingBalance", si."TotalAmount" - COALESCE(si."AmountPaid", 0), 0) > 0.01
         AND si."InvoiceDate"::date <= $1::date`,
      [asOfDate]
    );

    // Unbilled PO residual only when no open SI is linked to the PO
    const pos = await pool.query(
      `SELECT
         COALESCE(s."Id"::text, po.supplier_id::text, 'unknown') as entity_id,
         COALESCE(s."CompanyName", 'Unknown Supplier') as entity_name,
         po.order_number as invoice_number,
         po.order_date::date::text as invoice_date,
         COALESCE(po.expected_delivery_date, po.order_date)::date::text as due_date,
         po.total_amount as original_amount,
         (po.total_amount - COALESCE(po.paid_amount, 0)) as outstanding_amount,
         ($1::date - COALESCE(po.expected_delivery_date, po.order_date)::date) as days_overdue
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s."Id" = po.supplier_id
       WHERE po.status NOT IN ('CANCELLED', 'DRAFT')
         AND (po.total_amount - COALESCE(po.paid_amount, 0)) > 0.01
         AND po.order_date::date <= $1::date
         AND NOT EXISTS (
           SELECT 1 FROM supplier_invoices si2
           WHERE si2."PurchaseOrderId" = po.id
             AND si2.deleted_at IS NULL
             AND COALESCE(si2."Status", '') NOT IN ('PAID', 'CANCELLED', 'Cancelled', 'VOIDED', 'Voided')
         )`,
      [asOfDate]
    );

    return this.buildReport('PAYABLE', asOfDate, [...bills.rows, ...pos.rows]);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private static buildReport(
    reportType: 'RECEIVABLE' | 'PAYABLE',
    asOfDate: string,
    rows: Array<Record<string, unknown>>
  ): AgingReport {
    const details: AgingLineItem[] = [];
    const entityMap = new Map<string, AgingEntitySummary>();

    let totalCurrent = Money.zero();
    let total1to30 = Money.zero();
    let total31to60 = Money.zero();
    let total61to90 = Money.zero();
    let totalOver90 = Money.zero();

    for (const row of rows) {
      const daysOverdue = Math.max(0, Number(row.days_overdue) || 0);
      const outstanding = Money.parseDb(String(row.outstanding_amount || 0));
      if (outstanding.lte(0.01)) continue;

      const bucket = this.getBucketLabel(daysOverdue);
      const entityId = String(row.entity_id || 'unknown');
      const entityName = String(row.entity_name || 'Unknown');

      details.push({
        entityId,
        entityName,
        invoiceNumber: String(row.invoice_number || ''),
        invoiceDate: String(row.invoice_date || ''),
        dueDate: String(row.due_date || ''),
        daysOverdue,
        originalAmount: Money.parseDb(String(row.original_amount || 0)).toNumber(),
        outstandingAmount: outstanding.toNumber(),
        bucket,
      });

      if (!entityMap.has(entityId)) {
        entityMap.set(entityId, {
          entityId,
          entityName,
          current: 0,
          days1to30: 0,
          days31to60: 0,
          days61to90: 0,
          over90: 0,
          total: 0,
        });
      }

      const entity = entityMap.get(entityId)!;

      if (daysOverdue <= 0) {
        entity.current = Money.add(new Decimal(entity.current), outstanding).toNumber();
        totalCurrent = Money.add(totalCurrent, outstanding);
      } else if (daysOverdue <= 30) {
        entity.days1to30 = Money.add(new Decimal(entity.days1to30), outstanding).toNumber();
        total1to30 = Money.add(total1to30, outstanding);
      } else if (daysOverdue <= 60) {
        entity.days31to60 = Money.add(new Decimal(entity.days31to60), outstanding).toNumber();
        total31to60 = Money.add(total31to60, outstanding);
      } else if (daysOverdue <= 90) {
        entity.days61to90 = Money.add(new Decimal(entity.days61to90), outstanding).toNumber();
        total61to90 = Money.add(total61to90, outstanding);
      } else {
        entity.over90 = Money.add(new Decimal(entity.over90), outstanding).toNumber();
        totalOver90 = Money.add(totalOver90, outstanding);
      }

      entity.total = Money.add(new Decimal(entity.total), outstanding).toNumber();
    }

    const grandTotal = Money.add(
      Money.add(
        Money.add(totalCurrent, total1to30),
        Money.add(total31to60, total61to90)
      ),
      totalOver90
    ).toNumber();

    return {
      reportType,
      asOfDate,
      generatedAt: new Date().toISOString(),
      buckets: DEFAULT_BUCKETS,
      summary: {
        current: totalCurrent.toNumber(),
        days1to30: total1to30.toNumber(),
        days31to60: total31to60.toNumber(),
        days61to90: total61to90.toNumber(),
        over90: totalOver90.toNumber(),
        total: grandTotal,
        grandTotal,
        entityCount: entityMap.size,
      },
      entities: Array.from(entityMap.values()).sort((a, b) => b.total - a.total),
      details,
    };
  }

  private static getBucketLabel(daysOverdue: number): string {
    if (daysOverdue <= 0) return 'Current';
    if (daysOverdue <= 30) return '1-30 Days';
    if (daysOverdue <= 60) return '31-60 Days';
    if (daysOverdue <= 90) return '61-90 Days';
    return '90+ Days';
  }
}

export default AgedBalanceService;
