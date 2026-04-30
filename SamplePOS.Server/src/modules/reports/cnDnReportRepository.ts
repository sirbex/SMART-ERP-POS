/**
 * Credit/Debit Note Reports Repository
 *
 * SQL queries for CN/DN reporting surface (SAP/Odoo pattern):
 * 1. Sales Returns & Allowances (P&L)
 * 2. Purchase Returns & Allowances (P&L)
 * 3. AR Ledger (GL view)
 * 4. AP Ledger (GL view)
 * 5. Credit/Debit Note Register
 * 6. Tax Reversal Report
 * 7. Invoice Adjustment History
 * 8. Supplier Statement
 * 9. Supplier Aging (Aged Payables)
 */

import type { Pool } from 'pg';
import Decimal from 'decimal.js';
import type {
  ReturnsAllowancesRow,
  PurchaseReturnsAllowancesRow,
  LedgerEntryRow,
  NoteRegisterRow,
  TaxReversalRow,
  InvoiceAdjustmentRow,
  SupplierStatementEntry,
  SupplierAgingRow,
} from './cnDnReportTypes.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

function toNum(v: unknown): number {
  return new Decimal(String(v ?? 0)).toDecimalPlaces(2).toNumber();
}

// ─── 1. Sales Returns & Allowances (P&L) ───────────────────────────
// Groups by month. Uses GL entries for accuracy (DR 4010 = Sales Returns).
export async function getSalesReturnsReport(
  pool: Pool,
  startDate: string,
  endDate: string,
): Promise<ReturnsAllowancesRow[]> {
  const result = await pool.query(
    `WITH monthly_sales AS (
       SELECT
         to_char(lt."TransactionDate", 'YYYY-MM') AS period,
         COALESCE(SUM(le."CreditAmount"), 0) AS total_sales
       FROM ledger_transactions lt
       JOIN ledger_entries le ON le."TransactionId" = lt."Id"
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE a."AccountCode" = '4000'
         AND lt."Status" = 'POSTED'
         AND lt."IsReversed" = false
         AND lt."TransactionDate" >= $1::date
         AND lt."TransactionDate" <= $2::date
       GROUP BY to_char(lt."TransactionDate", 'YYYY-MM')
     ),
     monthly_returns AS (
       SELECT
         to_char(lt."TransactionDate", 'YYYY-MM') AS period,
         COALESCE(SUM(le."DebitAmount"), 0) AS sales_returns,
         COUNT(DISTINCT lt."Id") AS cn_count
       FROM ledger_transactions lt
       JOIN ledger_entries le ON le."TransactionId" = lt."Id"
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE a."AccountCode" = '4010'
         AND lt."Status" = 'POSTED'
         AND lt."IsReversed" = false
         AND lt."TransactionDate" >= $1::date
         AND lt."TransactionDate" <= $2::date
       GROUP BY to_char(lt."TransactionDate", 'YYYY-MM')
     )
     SELECT
       COALESCE(s.period, r.period) AS period,
       COALESCE(s.total_sales, 0) AS total_sales,
       COALESCE(r.sales_returns, 0) AS sales_returns,
       COALESCE(s.total_sales, 0) - COALESCE(r.sales_returns, 0) AS net_sales,
       COALESCE(r.cn_count, 0) AS cn_count
     FROM monthly_sales s
     FULL OUTER JOIN monthly_returns r ON r.period = s.period
     ORDER BY period`,
    [startDate, endDate],
  );

  return result.rows.map((r) => ({
    period: r.period,
    totalSales: toNum(r.total_sales),
    salesReturns: toNum(r.sales_returns),
    netSales: toNum(r.net_sales),
    creditNoteCount: Number(r.cn_count),
  }));
}

// ─── 2. Purchase Returns & Allowances (P&L) ────────────────────────
export async function getPurchaseReturnsReport(
  pool: Pool,
  startDate: string,
  endDate: string,
): Promise<PurchaseReturnsAllowancesRow[]> {
  const result = await pool.query(
    `WITH monthly_purchases AS (
       SELECT
         to_char(lt."TransactionDate", 'YYYY-MM') AS period,
         COALESCE(SUM(le."DebitAmount"), 0) AS total_purchases
       FROM ledger_transactions lt
       JOIN ledger_entries le ON le."TransactionId" = lt."Id"
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE a."AccountCode" = '5000'
         AND lt."Status" = 'POSTED'
         AND lt."IsReversed" = false
         AND lt."TransactionDate" >= $1::date
         AND lt."TransactionDate" <= $2::date
       GROUP BY to_char(lt."TransactionDate", 'YYYY-MM')
     ),
     monthly_returns AS (
       SELECT
         to_char(lt."TransactionDate", 'YYYY-MM') AS period,
         COALESCE(SUM(le."CreditAmount"), 0) AS purchase_returns,
         COUNT(DISTINCT lt."Id") AS scn_count
       FROM ledger_transactions lt
       JOIN ledger_entries le ON le."TransactionId" = lt."Id"
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE a."AccountCode" = '5010'
         AND lt."Status" = 'POSTED'
         AND lt."IsReversed" = false
         AND lt."TransactionDate" >= $1::date
         AND lt."TransactionDate" <= $2::date
       GROUP BY to_char(lt."TransactionDate", 'YYYY-MM')
     )
     SELECT
       COALESCE(p.period, r.period) AS period,
       COALESCE(p.total_purchases, 0) AS total_purchases,
       COALESCE(r.purchase_returns, 0) AS purchase_returns,
       COALESCE(p.total_purchases, 0) - COALESCE(r.purchase_returns, 0) AS net_purchases,
       COALESCE(r.scn_count, 0) AS scn_count
     FROM monthly_purchases p
     FULL OUTER JOIN monthly_returns r ON r.period = p.period
     ORDER BY period`,
    [startDate, endDate],
  );

  return result.rows.map((r) => ({
    period: r.period,
    totalPurchases: toNum(r.total_purchases),
    purchaseReturns: toNum(r.purchase_returns),
    netPurchases: toNum(r.net_purchases),
    creditNoteCount: Number(r.scn_count),
  }));
}

// ─── 3. AR Ledger (GL view from Accounts Receivable 1200) ──────────
export async function getArLedger(
  pool: Pool,
  startDate: string,
  endDate: string,
  customerId?: string,
): Promise<Omit<LedgerEntryRow, 'balance'>[]> {
  const params: (string | undefined)[] = [startDate, endDate];
  let customerFilter = '';
  if (customerId) {
    params.push(customerId);
    customerFilter = `AND le."EntityId" = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT
       lt."TransactionDate" AS date,
       lt."TransactionNumber" AS transaction_number,
       lt."ReferenceType" AS reference_type,
       lt."ReferenceNumber" AS reference_number,
       COALESCE(le."Description", lt."Description") AS description,
       le."DebitAmount" AS debit,
       le."CreditAmount" AS credit
     FROM ledger_transactions lt
     JOIN ledger_entries le ON le."TransactionId" = lt."Id"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE a."AccountCode" = '1200'
       AND lt."Status" = 'POSTED'
       AND lt."IsReversed" = false
       AND lt."TransactionDate" >= $1::date
       AND lt."TransactionDate" <= $2::date
       ${customerFilter}
     ORDER BY lt."TransactionDate" ASC, lt."CreatedAt" ASC`,
    params,
  );

  return result.rows.map((r) => ({
    date: r.date,
    transactionNumber: r.transaction_number,
    referenceType: r.reference_type || '',
    referenceNumber: r.reference_number || '',
    description: r.description || '',
    debit: toNum(r.debit),
    credit: toNum(r.credit),
  }));
}

// ─── 4. AP Ledger (GL view from Accounts Payable 2100) ─────────────
export async function getApLedger(
  pool: Pool,
  startDate: string,
  endDate: string,
  supplierId?: string,
): Promise<Omit<LedgerEntryRow, 'balance'>[]> {
  const params: (string | undefined)[] = [startDate, endDate];
  let supplierFilter = '';
  if (supplierId) {
    params.push(supplierId);
    supplierFilter = `AND le."EntityId" = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT
       lt."TransactionDate" AS date,
       lt."TransactionNumber" AS transaction_number,
       lt."ReferenceType" AS reference_type,
       lt."ReferenceNumber" AS reference_number,
       COALESCE(le."Description", lt."Description") AS description,
       le."DebitAmount" AS debit,
       le."CreditAmount" AS credit
     FROM ledger_transactions lt
     JOIN ledger_entries le ON le."TransactionId" = lt."Id"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE a."AccountCode" = '2100'
       AND lt."Status" = 'POSTED'
       AND lt."IsReversed" = false
       AND lt."TransactionDate" >= $1::date
       AND lt."TransactionDate" <= $2::date
       ${supplierFilter}
     ORDER BY lt."TransactionDate" ASC, lt."CreatedAt" ASC`,
    params,
  );

  return result.rows.map((r) => ({
    date: r.date,
    transactionNumber: r.transaction_number,
    referenceType: r.reference_type || '',
    referenceNumber: r.reference_number || '',
    description: r.description || '',
    debit: toNum(r.debit),
    credit: toNum(r.credit),
  }));
}

// ─── 5. Credit/Debit Note Register ─────────────────────────────────
export async function getNoteRegister(
  pool: Pool,
  options: {
    startDate: string;
    endDate: string;
    side?: 'CUSTOMER' | 'SUPPLIER';
    documentType?: string;
    status?: string;
  },
): Promise<NoteRegisterRow[]> {
  const rows: NoteRegisterRow[] = [];

  // Customer-side notes
  if (!options.side || options.side === 'CUSTOMER') {
    const params: string[] = [options.startDate, options.endDate];
    let typeFilter = '';
    let statusFilter = '';
    if (options.documentType && ['CREDIT_NOTE', 'DEBIT_NOTE'].includes(options.documentType)) {
      params.push(options.documentType);
      typeFilter = `AND i.document_type = $${params.length}`;
    }
    if (options.status) {
      params.push(options.status);
      statusFilter = `AND i.status = $${params.length}`;
    }

    const custResult = await pool.query(
      `SELECT
         i.id AS note_id,
         i.invoice_number AS note_number,
         i.document_type,
         i.customer_name AS party_name,
         ref.invoice_number AS ref_invoice_number,
         i.reason,
         i.subtotal AS subtotal,
         i.tax_amount AS tax_amount,
         i.total_amount AS total_amount,
         i.status AS status,
         i.issue_date AS issue_date,
         i.created_at AS created_at
       FROM invoices i
       LEFT JOIN invoices ref ON ref.id = i.reference_invoice_id
       WHERE i.document_type IN ('CREDIT_NOTE', 'DEBIT_NOTE')
         AND i.issue_date >= $1::date
         AND i.issue_date <= $2::date
         ${typeFilter}
         ${statusFilter}
       ORDER BY i.issue_date DESC, i.created_at DESC`,
      params,
    );

    for (const r of custResult.rows) {
      rows.push({
        noteId: r.note_id,
        noteNumber: r.note_number,
        documentType: r.document_type,
        side: 'CUSTOMER',
        partyName: r.party_name || '',
        referenceInvoiceNumber: r.ref_invoice_number || '',
        reason: r.reason,
        subtotal: toNum(r.subtotal),
        taxAmount: toNum(r.tax_amount),
        totalAmount: toNum(r.total_amount),
        status: r.status,
        issueDate: r.issue_date,
        createdAt: r.created_at,
      });
    }
  }

  // Supplier-side notes
  if (!options.side || options.side === 'SUPPLIER') {
    const params: string[] = [options.startDate, options.endDate];
    let typeFilter = '';
    let statusFilter = '';
    if (
      options.documentType &&
      ['SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE'].includes(options.documentType)
    ) {
      params.push(options.documentType);
      typeFilter = `AND si.document_type = $${params.length}`;
    }
    if (options.status) {
      params.push(options.status);
      statusFilter = `AND si."Status" = $${params.length}`;
    }

    const suppResult = await pool.query(
      `SELECT
         si."Id" AS note_id,
         si."SupplierInvoiceNumber" AS note_number,
         si.document_type,
         s."CompanyName" AS party_name,
         ref."SupplierInvoiceNumber" AS ref_invoice_number,
         si.reason,
         si."Subtotal" AS subtotal,
         si."TaxAmount" AS tax_amount,
         si."TotalAmount" AS total_amount,
         si."Status" AS status,
         si."InvoiceDate" AS issue_date,
         si."CreatedAt" AS created_at
       FROM supplier_invoices si
       LEFT JOIN suppliers s ON s."Id" = si."SupplierId"
       LEFT JOIN supplier_invoices ref ON ref."Id" = si.reference_invoice_id
       WHERE si.document_type IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE')
         AND si.deleted_at IS NULL
         AND si."InvoiceDate" >= $1::date
         AND si."InvoiceDate" <= $2::date
         ${typeFilter}
         ${statusFilter}
       ORDER BY si."InvoiceDate" DESC, si."CreatedAt" DESC`,
      params,
    );

    for (const r of suppResult.rows) {
      rows.push({
        noteId: r.note_id,
        noteNumber: r.note_number,
        documentType: r.document_type,
        side: 'SUPPLIER',
        partyName: r.party_name || '',
        referenceInvoiceNumber: r.ref_invoice_number || '',
        reason: r.reason,
        subtotal: toNum(r.subtotal),
        taxAmount: toNum(r.tax_amount),
        totalAmount: toNum(r.total_amount),
        status: r.status,
        issueDate: r.issue_date,
        createdAt: r.created_at,
      });
    }
  }

  return rows;
}

// ─── 6. Tax Reversal Report ────────────────────────────────────────
export async function getTaxReversalReport(
  pool: Pool,
  startDate: string,
  endDate: string,
): Promise<TaxReversalRow[]> {
  // Output VAT from customer invoices/notes, Input VAT from supplier invoices/notes
  // Grouped by tax rate from line items

  const result = await pool.query(
    `WITH customer_tax AS (
       SELECT
         COALESCE(ili."TaxRate", 0) AS tax_rate,
         SUM(CASE
           WHEN i.document_type IS NULL OR i.document_type = 'INVOICE'
           THEN ili."TaxAmount" ELSE 0
         END) AS sales_tax,
         SUM(CASE
           WHEN i.document_type = 'CREDIT_NOTE'
           THEN ili."TaxAmount" ELSE 0
         END) AS tax_reversed_cn
       FROM invoice_line_items ili
       JOIN invoices i ON i.id = ili."InvoiceId"
       WHERE i.status NOT IN ('CANCELLED', 'DRAFT')
         AND i.issue_date >= $1::date
         AND i.issue_date <= $2::date
       GROUP BY COALESCE(ili."TaxRate", 0)
     ),
     supplier_tax AS (
       SELECT
         COALESCE(sili."TaxRate", 0) AS tax_rate,
         SUM(CASE
           WHEN si.document_type IS NULL OR si.document_type = 'SUPPLIER_INVOICE'
           THEN sili."TaxAmount" ELSE 0
         END) AS purchase_tax,
         SUM(CASE
           WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
           THEN sili."TaxAmount" ELSE 0
         END) AS tax_reversed_scn
       FROM supplier_invoice_line_items sili
       JOIN supplier_invoices si ON si."Id" = sili."SupplierInvoiceId"
       WHERE si."Status" NOT IN ('Cancelled', 'CANCELLED', 'Draft', 'DRAFT')
         AND si.deleted_at IS NULL
         AND si."InvoiceDate" >= $1::date
         AND si."InvoiceDate" <= $2::date
       GROUP BY COALESCE(sili."TaxRate", 0)
     )
     SELECT
       COALESCE(ct.tax_rate, st.tax_rate) AS tax_rate,
       COALESCE(ct.sales_tax, 0) AS sales_tax,
       COALESCE(ct.tax_reversed_cn, 0) AS tax_reversed_cn,
       COALESCE(ct.sales_tax, 0) - COALESCE(ct.tax_reversed_cn, 0) AS net_sales_tax,
       COALESCE(st.purchase_tax, 0) AS purchase_tax,
       COALESCE(st.tax_reversed_scn, 0) AS tax_reversed_scn,
       COALESCE(st.purchase_tax, 0) - COALESCE(st.tax_reversed_scn, 0) AS net_purchase_tax
     FROM customer_tax ct
     FULL OUTER JOIN supplier_tax st ON st.tax_rate = ct.tax_rate
     ORDER BY tax_rate`,
    [startDate, endDate],
  );

  return result.rows.map((r) => ({
    taxRate: toNum(r.tax_rate),
    salesTax: toNum(r.sales_tax),
    taxReversedByCN: toNum(r.tax_reversed_cn),
    netSalesTax: toNum(r.net_sales_tax),
    purchaseTax: toNum(r.purchase_tax),
    taxReversedBySCN: toNum(r.tax_reversed_scn),
    netPurchaseTax: toNum(r.net_purchase_tax),
  }));
}

// ─── 7. Invoice Adjustment History (for a single invoice) ──────────
export async function getInvoiceAdjustments(
  pool: Pool,
  invoiceId: string,
  side: 'CUSTOMER' | 'SUPPLIER' = 'CUSTOMER',
): Promise<InvoiceAdjustmentRow[]> {
  if (side === 'CUSTOMER') {
    const result = await pool.query(
      `SELECT
         i.id AS note_id,
         i.invoice_number AS note_number,
         i.document_type,
         i.reason,
         i.total_amount AS total_amount,
         i.tax_amount AS tax_amount,
         i.status AS status,
         i.issue_date AS issue_date
       FROM invoices i
       WHERE i.reference_invoice_id = $1
         AND i.document_type IN ('CREDIT_NOTE', 'DEBIT_NOTE')
       ORDER BY i.issue_date ASC, i.created_at ASC`,
      [invoiceId],
    );

    return result.rows.map((r) => ({
      noteId: r.note_id,
      noteNumber: r.note_number,
      documentType: r.document_type,
      reason: r.reason,
      totalAmount: toNum(r.total_amount),
      taxAmount: toNum(r.tax_amount),
      status: r.status,
      issueDate: r.issue_date,
    }));
  }

  // Supplier side
  const result = await pool.query(
    `SELECT
       si."Id" AS note_id,
       si."SupplierInvoiceNumber" AS note_number,
       si.document_type,
       si.reason,
       si."TotalAmount" AS total_amount,
       si."TaxAmount" AS tax_amount,
       si."Status" AS status,
       si."InvoiceDate" AS issue_date
     FROM supplier_invoices si
     WHERE si.reference_invoice_id = $1
       AND si.document_type IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE')
       AND si.deleted_at IS NULL
     ORDER BY si."InvoiceDate" ASC, si."CreatedAt" ASC`,
    [invoiceId],
  );

  return result.rows.map((r) => ({
    noteId: r.note_id,
    noteNumber: r.note_number,
    documentType: r.document_type,
    reason: r.reason,
    totalAmount: toNum(r.total_amount),
    taxAmount: toNum(r.tax_amount),
    status: r.status,
    issueDate: r.issue_date,
  }));
}

// ─── 8. Supplier Statement ─────────────────────────────────────────
/**
 * GL-driven opening balance for supplier statement.
 * Reads from AP (2100) ledger entries tagged to this supplier.
 * Balance = SUM(Credit) - SUM(Debit) on AP account before startDate.
 * (Credit to AP = we owe more, Debit to AP = we paid / reduced)
 */
export async function getSupplierStatementOpeningBalance(
  pool: Pool,
  supplierId: string,
  beforeDate: string,
): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(
           SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0
         ) AS opening
         FROM ledger_entries le
         JOIN accounts a ON le."AccountId" = a."Id"
         JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
         WHERE a."AccountCode" = '2100'
           AND le."EntityId" = $1
           AND le."EntityType" = 'supplier'
           AND lt."Status" = 'POSTED'
           AND le."EntryDate"::date < $2::date`,
    [supplierId, beforeDate],
  );

  return toNum(result.rows[0]?.opening);
}

/**
 * GL-driven supplier statement entries.
 * Reads from AP (2100) ledger entries tagged to this supplier.
 * - Credit to AP → "debit" column (liability increased: GR, debit note)  → itemStatus = 'Open'
 * - Debit to AP  → "credit" column (liability reduced: payment, credit note)
 *     - SUPPLIER_PAYMENT → itemStatus = 'Applied'
 *     - RETURN_GRN / SUPPLIER_CREDIT_NOTE → itemStatus = 'Return'
 * - IsReversed = true → itemStatus = 'Voided'
 */
export async function getSupplierStatementEntries(
  pool: Pool,
  supplierId: string,
  startDate: string,
  endDate: string,
): Promise<SupplierStatementEntry[]> {
  const result = await pool.query(
    `SELECT
           le."EntryDate"::date AS date,
           COALESCE(lt."TransactionNumber", '') AS doc_number,
           lt."ReferenceType" AS type,
           COALESCE(lt."ReferenceNumber", '') AS reference,
           COALESCE(le."Description", lt."Description", '') AS description,
           le."CreditAmount" AS debit,
           le."DebitAmount" AS credit,
           COALESCE(lt."IsReversed", false) AS is_reversed,
           sp."PaymentMethod" AS payment_method
         FROM ledger_entries le
         JOIN accounts a ON le."AccountId" = a."Id"
         JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
         LEFT JOIN supplier_payments sp
           ON lt."ReferenceType" = 'SUPPLIER_PAYMENT'
           AND sp."PaymentNumber" = lt."ReferenceNumber"
         WHERE a."AccountCode" = '2100'
           AND le."EntityId" = $1
           AND UPPER(le."EntityType") = 'SUPPLIER'
           AND lt."Status" = 'POSTED'
           AND le."EntryDate"::date >= $2::date
           AND le."EntryDate"::date <= $3::date
         ORDER BY le."EntryDate" ASC, le."CreatedAt" ASC`,
    [supplierId, startDate, endDate],
  );

  return result.rows.map((r) => {
    const isReversed = r.is_reversed as boolean;
    const debit = toNum(r.debit);
    const credit = toNum(r.credit);
    const type = r.type as string;
    let itemStatus: 'Open' | 'Applied' | 'Return' | 'Voided';
    if (isReversed) {
      itemStatus = 'Voided';
    } else if (debit > 0) {
      itemStatus = 'Open';
    } else if (type === 'RETURN_GRN' || type === 'SUPPLIER_CREDIT_NOTE') {
      itemStatus = 'Return';
    } else {
      itemStatus = 'Applied';
    }
    return {
      date: r.date,
      docNumber: r.doc_number || '',
      type,
      reference: r.reference || '',
      description: r.description || '',
      debit,
      credit,
      itemStatus,
      paymentMethod: r.payment_method ?? undefined,
    };
  });
}

// ─── 9. Supplier Aging (Aged Payables) — GL-driven ─────────────────
// Reads AP (2100) ledger entries per supplier.
// Net balance per transaction = Credit - Debit on AP.
// Ages outstanding transactions by their entry date against asOfDate.
// Only includes transactions with net positive balance (still owed).
export async function getSupplierAging(
  pool: Pool,
  asOfDate: string,
): Promise<SupplierAgingRow[]> {
  const result = await pool.query(
    `WITH ap_transactions AS (
       SELECT
         le."EntityId" AS supplier_id,
         lt."Id" AS txn_id,
         le."EntryDate"::date AS entry_date,
         SUM(le."CreditAmount") - SUM(le."DebitAmount") AS net_amount
       FROM ledger_entries le
       JOIN accounts a ON le."AccountId" = a."Id"
       JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
       WHERE a."AccountCode" = '2100'
         AND le."EntityType" = 'supplier'
         AND le."EntityId" IS NOT NULL
         AND lt."Status" = 'POSTED'
         AND le."EntryDate"::date <= $1::date
       GROUP BY le."EntityId", lt."Id", le."EntryDate"::date
       HAVING SUM(le."CreditAmount") - SUM(le."DebitAmount") > 0
     ),
     with_supplier AS (
       SELECT
         apt.supplier_id,
         s."CompanyName" AS supplier_name,
         apt.txn_id,
         apt.net_amount,
         ($1::date - apt.entry_date) AS days_overdue
       FROM ap_transactions apt
       JOIN suppliers s ON s."Id" = apt.supplier_id::uuid
     )
     SELECT
       supplier_id,
       supplier_name,
       COUNT(txn_id) AS total_invoices,
       SUM(net_amount) AS total_outstanding,
       SUM(CASE WHEN days_overdue <= 0 THEN net_amount ELSE 0 END) AS current_amount,
       SUM(CASE WHEN days_overdue > 0 AND days_overdue <= 30 THEN net_amount ELSE 0 END) AS days_1_30,
       SUM(CASE WHEN days_overdue > 30 AND days_overdue <= 60 THEN net_amount ELSE 0 END) AS days_31_60,
       SUM(CASE WHEN days_overdue > 60 AND days_overdue <= 90 THEN net_amount ELSE 0 END) AS days_61_90,
       SUM(CASE WHEN days_overdue > 90 THEN net_amount ELSE 0 END) AS days_over_90,
       MAX(days_overdue) AS max_days_overdue
     FROM with_supplier
     GROUP BY supplier_id, supplier_name
     ORDER BY total_outstanding DESC`,
    [asOfDate],
  );

  return result.rows.map((r) => ({
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    totalInvoices: Number(r.total_invoices),
    totalOutstanding: toNum(r.total_outstanding),
    current: toNum(r.current_amount),
    days30: toNum(r.days_1_30),
    days60: toNum(r.days_31_60),
    days90: toNum(r.days_61_90),
    over90: toNum(r.days_over_90),
    maxDaysOverdue: Number(r.max_days_overdue || 0),
  }));
}
