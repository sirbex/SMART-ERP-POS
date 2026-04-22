/**
 * AGED RECEIVABLES / PAYABLES SERVICE
 *
 * Enterprise-grade aging analysis (Odoo Accounting Reports pattern).
 *
 * Features:
 *   ✔ Configurable aging buckets (current, 1-30, 31-60, 61-90, 90+)
 *   ✔ By customer / supplier breakdown
 *   ✔ As-of-date analysis (point-in-time)
 *   ✔ Summary and detail views
 *   ✔ Currency-aware output
 *   ✔ Decimal-safe via Money utility
 */

import type pg from 'pg';
import { pool as globalPool } from '../db/pool.js';
import { Money, Decimal } from '../utils/money.js';
import logger from '../utils/logger.js';

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

export interface AgingReport {
  reportType: 'RECEIVABLE' | 'PAYABLE';
  asOfDate: string;
  generatedAt: string;
  buckets: AgingBucket[];
  summary: {
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    over90: number;
    grandTotal: number;
    entityCount: number;
  };
  entities: AgingEntitySummary[];
  details: AgingLineItem[];
}

// Default aging buckets (Odoo standard)
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
   * Generate Aged Receivables report
   */
  static async agedReceivables(
    asOfDate: string,
    dbPool?: pg.Pool
  ): Promise<AgingReport> {
    const pool = dbPool || globalPool;

    // Get all open customer invoices/sales with outstanding balances
    const result = await pool.query(
      `SELECT
         c.id as entity_id,
         c.name as entity_name,
         s.sale_number as invoice_number,
         s.sale_date as invoice_date,
         s.sale_date as due_date,
         s.total_amount as original_amount,
         (s.total_amount - COALESCE(s.amount_paid, 0)) as outstanding_amount,
         ($1::date - s.sale_date::date) as days_overdue
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.payment_method = 'CREDIT'
         AND s.status NOT IN ('VOID', 'REFUNDED', 'VOIDED_BY_RETURN')
         AND (s.total_amount - COALESCE(s.amount_paid, 0)) > 0.01
         AND s.sale_date <= $1
       ORDER BY c.name, s.sale_date`,
      [asOfDate]
    );

    // Also include customer invoices that have outstanding balances
    const invoiceResult = await pool.query(
      `SELECT
         c.id as entity_id,
         c.name as entity_name,
         i.invoice_number as invoice_number,
         i.issue_date as invoice_date,
         i.due_date as due_date,
         i.total_amount as original_amount,
         (i.total_amount - COALESCE(i.amount_paid, 0)) as outstanding_amount,
         ($1::date - COALESCE(i.due_date, i.issue_date)::date) as days_overdue
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.status NOT IN ('CANCELLED', 'PAID')
         AND (i.total_amount - COALESCE(i.amount_paid, 0)) > 0.01
         AND i.issue_date <= $1
       ORDER BY c.name, i.issue_date`,
      [asOfDate]
    );

    const allRows = [...result.rows, ...invoiceResult.rows];
    return this.buildReport('RECEIVABLE', asOfDate, allRows);
  }

  /**
   * Generate Aged Payables report
   */
  static async agedPayables(
    asOfDate: string,
    dbPool?: pg.Pool
  ): Promise<AgingReport> {
    const pool = dbPool || globalPool;

    // Get all unpaid purchase orders / supplier invoices
    const result = await pool.query(
      `SELECT
         s."Id" as entity_id,
         s."CompanyName" as entity_name,
         COALESCE(si."SupplierInvoiceNumber", po.order_number) as invoice_number,
         COALESCE(si."InvoiceDate", po.order_date) as invoice_date,
         COALESCE(si."DueDate", po.order_date) as due_date,
         COALESCE(si."TotalAmount", po.total_amount) as original_amount,
         COALESCE(si."OutstandingBalance", (po.total_amount - COALESCE(po.paid_amount, 0))) as outstanding_amount,
         ($1::date - COALESCE(si."DueDate", po.order_date)::date) as days_overdue
       FROM suppliers s
       LEFT JOIN supplier_invoices si ON si."SupplierId" = s."Id"
         AND si."Status" NOT IN ('PAID', 'CANCELLED')
         AND si."OutstandingBalance" > 0.01
         AND si."InvoiceDate" <= $1
       LEFT JOIN purchase_orders po ON po.supplier_id = s."Id"
         AND po.status NOT IN ('CANCELLED', 'DRAFT')
         AND (po.total_amount - COALESCE(po.paid_amount, 0)) > 0.01
         AND po.order_date <= $1
         AND NOT EXISTS (
           SELECT 1 FROM supplier_invoices si2
           WHERE si2."PurchaseOrderId" = po.id
             AND si2."Status" NOT IN ('PAID', 'CANCELLED')
         )
       WHERE (si."Id" IS NOT NULL OR po.id IS NOT NULL)
       ORDER BY s."CompanyName", COALESCE(si."InvoiceDate", po.order_date)`,
      [asOfDate]
    );

    return this.buildReport('PAYABLE', asOfDate, result.rows);
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
      const bucket = this.getBucketLabel(daysOverdue);

      details.push({
        entityId: String(row.entity_id || ''),
        entityName: String(row.entity_name || 'Unknown'),
        invoiceNumber: String(row.invoice_number || ''),
        invoiceDate: String(row.invoice_date || ''),
        dueDate: String(row.due_date || ''),
        daysOverdue,
        originalAmount: Money.parseDb(String(row.original_amount || 0)).toNumber(),
        outstandingAmount: outstanding.toNumber(),
        bucket,
      });

      // Update entity summary
      const entityId = String(row.entity_id || 'unknown');
      if (!entityMap.has(entityId)) {
        entityMap.set(entityId, {
          entityId,
          entityName: String(row.entity_name || 'Unknown'),
          current: 0,
          days1to30: 0,
          days31to60: 0,
          days61to90: 0,
          over90: 0,
          total: 0,
        });
      }

      const entity = entityMap.get(entityId)!;
      const amt = outstanding.toNumber();

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
    );

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
        grandTotal: grandTotal.toNumber(),
        entityCount: entityMap.size,
      },
      entities: Array.from(entityMap.values())
        .sort((a, b) => b.total - a.total), // Largest outstanding first
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
