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
  SmartStatementEntry,
  CustomerUnallocatedReceipt,
  SupplierUnallocatedPrepayment,
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
export async function getGlobalArOpeningBalance(
  pool: Pool,
  beforeDate: string,
): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(
           SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0
         ) AS opening
         FROM ledger_entries le
         JOIN accounts a ON le."AccountId" = a."Id"
         JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
         WHERE a."AccountCode" = '1200'
           AND lt."Status" = 'POSTED'
           AND le."EntryDate"::date < $1::date`,
    [beforeDate],
  );
  return toNum(result.rows[0]?.opening);
}

export async function getGlobalApOpeningBalance(
  pool: Pool,
  beforeDate: string,
): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(
           SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0
         ) AS opening
         FROM ledger_entries le
         JOIN accounts a ON le."AccountId" = a."Id"
         JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
         WHERE a."AccountCode" IN ('2100', '2150')
           AND lt."Status" = 'POSTED'
           AND le."EntryDate"::date < $1::date`,
    [beforeDate],
  );
  return toNum(result.rows[0]?.opening);
}

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
    customerFilter = `AND ${customerArScopeSql('le', 'lt', '$3')}`;
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
     WHERE a."AccountCode" IN ('2100', '2150')
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

  // Phase 7: Output VAT boxes = invoice_line_items ∪ sale_items (DocumentTax 584).
  // sale_items included only when the sale has no non-draft AR invoice (avoids double-count).
  // Partial returns net tax by remaining qty (quantity - refunded_qty). GL 2300 unchanged.
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
     pos_sale_tax AS (
       SELECT
         COALESCE(si.tax_rate, 0) AS tax_rate,
         SUM(
           si.tax_amount
           * (si.quantity - COALESCE(si.refunded_qty, 0))
           / NULLIF(si.quantity, 0)
         ) AS sales_tax
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE si.tax_amount > 0
         AND (si.quantity - COALESCE(si.refunded_qty, 0)) > 0
         AND s.status IN ('COMPLETED', 'PARTIALLY_RETURNED')
         AND s.sale_date::date >= $1::date
         AND s.sale_date::date <= $2::date
         AND NOT EXISTS (
           SELECT 1
           FROM invoices i
           WHERE i.sale_id = s.id
             AND COALESCE(i.document_type, 'INVOICE') = 'INVOICE'
             AND i.status NOT IN ('CANCELLED', 'DRAFT')
         )
       GROUP BY COALESCE(si.tax_rate, 0)
     ),
     output_tax AS (
       SELECT
         COALESCE(ct.tax_rate, pst.tax_rate) AS tax_rate,
         COALESCE(ct.sales_tax, 0) + COALESCE(pst.sales_tax, 0) AS sales_tax,
         COALESCE(ct.tax_reversed_cn, 0) AS tax_reversed_cn
       FROM customer_tax ct
       FULL OUTER JOIN pos_sale_tax pst ON pst.tax_rate = ct.tax_rate
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
       COALESCE(ot.tax_rate, st.tax_rate) AS tax_rate,
       COALESCE(ot.sales_tax, 0) AS sales_tax,
       COALESCE(ot.tax_reversed_cn, 0) AS tax_reversed_cn,
       COALESCE(ot.sales_tax, 0) - COALESCE(ot.tax_reversed_cn, 0) AS net_sales_tax,
       COALESCE(st.purchase_tax, 0) AS purchase_tax,
       COALESCE(st.tax_reversed_scn, 0) AS tax_reversed_scn,
       COALESCE(st.purchase_tax, 0) - COALESCE(st.tax_reversed_scn, 0) AS net_purchase_tax
     FROM output_tax ot
     FULL OUTER JOIN supplier_tax st ON st.tax_rate = ot.tax_rate
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
 * GL-driven opening balance for supplier statement (SAP supplier-position view).
 * Reads from BOTH Accounts Payable (2100) AND GR/IR Clearing (2150) ledger entries
 * tagged to this supplier.
 *   - 2100 = billed liability (after invoice posted)
 *   - 2150 = received-not-billed liability (after GR, before invoice)
 * Balance = SUM(Credit) - SUM(Debit) on those accounts before startDate.
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
         WHERE a."AccountCode" IN ('2100', '2150')
           AND le."EntityId" = $1
           AND UPPER(le."EntityType") = 'SUPPLIER'
           AND lt."Status" = 'POSTED'
           AND le."EntryDate"::date < $2::date`,
    [supplierId, beforeDate],
  );

  return toNum(result.rows[0]?.opening);
}

/**
 * GL-driven supplier statement entries — SAP Supplier Liability Workspace view.
 *
 * Includes BOTH:
 *   - Accounts Payable (2100): billed liability
 *   - GR/IR Clearing (2150):  received-not-billed liability
 *
 * Why both?
 *   In SAP, the supplier position = billed (AP) + unbilled (GR/IR). Showing only
 *   AP hides goods that were received but not yet invoiced. The supplier ledger
 *   must reflect the full economic obligation.
 *
 * Document categories shown:
 *   - GOODS_RECEIPT      (CR 2150) → itemStatus = 'Pending Bill'
 *   - SUPPLIER_INVOICE   (DR 2150 / CR 2100) → 'Open' until paid
 *   - SUPPLIER_PAYMENT   (DR 2100) → 'Applied'
 *   - SUPPLIER_CREDIT_NOTE (DR 2100 / CR 2150) → 'Credit Note'
 *   - RETURN_GRN         (DR 2150) → 'Return'
 *   - SYSTEM_CORRECTION  → 'Correction'
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
           sp."PaymentMethod" AS payment_method,
           a."AccountCode" AS account_code
         FROM ledger_entries le
         JOIN accounts a ON le."AccountId" = a."Id"
         JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
         LEFT JOIN supplier_payments sp
           ON lt."ReferenceType" = 'SUPPLIER_PAYMENT'
           AND sp."PaymentNumber" = lt."ReferenceNumber"
         WHERE a."AccountCode" IN ('2100', '2150')
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
    const accountCode = r.account_code as string;
    let itemStatus: SupplierStatementEntry['itemStatus'];
    if (isReversed) {
      itemStatus = 'Voided';
    } else if (type === 'GOODS_RECEIPT') {
      itemStatus = 'Pending Bill';
    } else if (type === 'RETURN_GRN') {
      itemStatus = 'Return';
    } else if (type === 'SYSTEM_CORRECTION' || type === 'CORRECTION') {
      itemStatus = 'Correction';
    } else if (type === 'SUPPLIER_INVOICE') {
      itemStatus = 'Open';
    } else if (type === 'SUPPLIER_CREDIT_NOTE') {
      itemStatus = 'Credit Note';
    } else if (debit > 0) {
      // Catch-all for other AP credits (debit in statement = liability increased)
      itemStatus = 'Open';
    } else {
      // SUPPLIER_PAYMENT and any other AP debits
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
      accountCode,
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
         lt."ReferenceNumber" AS reference_number,
         le."EntryDate"::date AS entry_date,
         SUM(le."CreditAmount") - SUM(le."DebitAmount") AS net_amount
       FROM ledger_entries le
       JOIN accounts a ON le."AccountId" = a."Id"
       JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
       WHERE a."AccountCode" IN ('2100', '2150')
         AND le."EntityType" = 'supplier'
         AND le."EntityId" IS NOT NULL
         AND lt."Status" = 'POSTED'
         AND le."EntryDate"::date <= $1::date
       GROUP BY le."EntityId", lt."Id", lt."ReferenceNumber", le."EntryDate"::date
       HAVING SUM(le."CreditAmount") - SUM(le."DebitAmount") > 0
     ),
     with_supplier AS (
       SELECT
         apt.supplier_id,
         s."CompanyName" AS supplier_name,
         apt.txn_id,
         apt.net_amount,
         -- Age against supplier_invoices.DueDate (SAP baseline / Odoo date_maturity)
         -- when the AP credit maps to an invoice; fall back to GL EntryDate otherwise.
         ($1::date - COALESCE(si."DueDate"::date, apt.entry_date)) AS days_overdue
       FROM ap_transactions apt
       JOIN suppliers s ON s."Id" = apt.supplier_id::uuid
       LEFT JOIN supplier_invoices si
         ON si."SupplierInvoiceNumber" = apt.reference_number
        AND si."SupplierId" = apt.supplier_id::uuid
        AND si.deleted_at IS NULL
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

// ─── 10. Smart Supplier Statement (business-document view) ─────────────────
/**
 * Smart Supplier Statement — open-item AP scope (account 2100 only).
 * GR/IR (2150) pending receipts belong on PO/GRN workflows, not AP outstanding.
 *
 * What shows (net ≠ 0):
 *   GOODS_RECEIPT          → net CR 2150 → liability increase (goods received)
 *   SUPPLIER_PAYMENT       → net DR 2100 → liability decrease (payment made)
 *   RETURN_GRN             → net DR 2150 → liability decrease (goods returned)
 *   SUPPLIER_CREDIT_NOTE   → net DR 2100 → liability decrease (credit applied)
 *   Direct SUPPLIER_INVOICE (no prior GRN) → net CR 2100 → liability increase
 *
 * What is silently hidden (net ≈ 0):
 *   SUPPLIER_INVOICE matching a prior GRN (DR 2150 = CR 2100 — zero net)
 *   SYSTEM_CORRECTION, CORRECTION, HIST_REV (excluded by WHERE clause)
 *
 * Mathematical guarantee:
 *   GL opening balance + Σ smart period rows = GL closing balance ✓
 */
export async function getSmartSupplierStatementEntries(
  pool: Pool,
  supplierId: string,
  startDate: string,
  endDate: string,
): Promise<SmartStatementEntry[]> {
  const result = await pool.query(
    `SELECT
         lt."TransactionDate"::date AS date,
         lt."ReferenceType"        AS ref_type,
         COALESCE(lt."ReferenceNumber", lt."TransactionNumber", '') AS reference,
         lt."Id"                                                     AS transaction_id,
         COALESCE(lt."IsReversed", false)                            AS is_reversed,
         ROUND(SUM(le."CreditAmount")::numeric, 4)                   AS total_cr,
         ROUND(SUM(le."DebitAmount")::numeric, 4)                    AS total_dr,
         sp."PaymentMethod"                                          AS payment_method
       FROM ledger_entries le
       JOIN accounts a              ON a."Id"  = le."AccountId"
       JOIN ledger_transactions lt  ON lt."Id" = le."TransactionId"
       LEFT JOIN supplier_payments sp
         ON lt."ReferenceType" = 'SUPPLIER_PAYMENT'
         AND sp."PaymentNumber" = lt."ReferenceNumber"
       WHERE a."AccountCode" = '2100'
         AND le."EntityId" = $1
         AND UPPER(le."EntityType") = 'SUPPLIER'
         AND lt."Status" = 'POSTED'
         AND lt."ReferenceType" NOT IN (
               'SYSTEM_CORRECTION', 'CORRECTION', 'HIST_REV', 'MANUAL_ADJUSTMENT'
             )
         AND le."EntryDate"::date >= $2::date
         AND le."EntryDate"::date <= $3::date
       GROUP BY
         lt."Id", lt."TransactionDate", lt."ReferenceType",
         lt."ReferenceNumber", lt."TransactionNumber", lt."IsReversed",
         sp."PaymentMethod"
       HAVING ABS(SUM(le."CreditAmount") - SUM(le."DebitAmount")) > 0.001
       ORDER BY lt."TransactionDate"::date ASC, MIN(le."CreatedAt") ASC`,
    [supplierId, startDate, endDate],
  );

  return result.rows.map((r): SmartStatementEntry => {
    const referenceType = r.ref_type as string;
    const isReversed = r.is_reversed as boolean;
    const debit = toNum(r.total_cr);  // GL CreditAmount  = liability ↑ = statement debit
    const credit = toNum(r.total_dr);  // GL DebitAmount   = liability ↓ = statement credit

    let particulars: string;
    let vchType: string;
    let itemStatus: SmartStatementEntry['itemStatus'];

    if (isReversed) {
      particulars = 'Voided transaction';
      vchType = vchTypeLabel(referenceType);
      itemStatus = 'Cancelled';
    } else {
      switch (referenceType) {
        case 'GOODS_RECEIPT':
          particulars = 'Goods received — pending invoice';
          vchType = 'GRN';
          itemStatus = 'Pending Bill';
          break;
        case 'SUPPLIER_INVOICE':
          particulars = 'Supplier invoice received';
          vchType = 'Bill';
          itemStatus = 'Unpaid';
          break;
        case 'SUPPLIER_PAYMENT':
          particulars = 'Payment made to supplier';
          vchType = 'Payment';
          itemStatus = 'Paid';
          break;
        case 'RETURN_GRN':
          particulars = 'Goods returned to supplier';
          vchType = 'Return';
          itemStatus = 'Applied';
          break;
        case 'SUPPLIER_CREDIT_NOTE':
          particulars = 'Credit note received from supplier';
          vchType = 'Credit Note';
          itemStatus = 'Applied';
          break;
        case 'DEBIT_NOTE':
          particulars = 'Debit note issued to supplier';
          vchType = 'Debit Note';
          itemStatus = 'Applied';
          break;
        default:
          particulars = referenceType.replace(/_/g, ' ').toLowerCase();
          vchType = referenceType.replace(/_/g, ' ');
          itemStatus = credit > 0 ? 'Applied' : 'Unpaid';
      }
    }

    return {
      date: r.date,
      particulars,
      vchType,
      vchNo: r.reference as string,
      debit,
      credit,
      balanceAfter: 0, // computed in service layer
      itemStatus,
      paymentMethod: r.payment_method ?? undefined,
      transactionId: r.transaction_id as string,
      referenceType,
      isReversed,
    };
  });
}

function vchTypeLabel(referenceType: string): string {
  switch (referenceType) {
    case 'GOODS_RECEIPT': return 'GRN';
    case 'SUPPLIER_INVOICE': return 'Bill';
    case 'SUPPLIER_PAYMENT': return 'Payment';
    case 'RETURN_GRN': return 'Return';
    case 'SUPPLIER_CREDIT_NOTE': return 'Credit Note';
    case 'DEBIT_NOTE': return 'Debit Note';
    default: return referenceType.replace(/_/g, ' ');
  }
}

// ─── 11. Smart Customer Statement (GL account 1200) ─────────────────────────

/** AR lines tagged to customer, plus invoice payments resolved via invoice_payments. */
const customerArScopeSql = (leAlias: string, ltAlias: string, customerParam: string): string => `
  (
    (${leAlias}."EntityId" = ${customerParam}::text AND UPPER(${leAlias}."EntityType") = 'CUSTOMER')
    OR (
      ${ltAlias}."ReferenceType" = 'INVOICE_PAYMENT'
      AND EXISTS (
        SELECT 1 FROM invoice_payments ip
        INNER JOIN invoices i ON i.id = ip.invoice_id
        WHERE ip.id = ${ltAlias}."ReferenceId"
          AND i.customer_id = ${customerParam}::uuid
      )
    )
  )`;

export async function getCustomerStatementOpeningBalance(
  pool: Pool,
  customerId: string,
  beforeDate: string,
): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(
           SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0
         ) AS opening
         FROM ledger_entries le
         JOIN accounts a ON le."AccountId" = a."Id"
         JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
         WHERE a."AccountCode" = '1200'
           AND ${customerArScopeSql('le', 'lt', '$1')}
           AND lt."Status" = 'POSTED'
           AND le."EntryDate"::date < $2::date`,
    [customerId, beforeDate],
  );

  return toNum(result.rows[0]?.opening);
}

export async function getSmartCustomerStatementEntries(
  pool: Pool,
  customerId: string,
  startDate: string,
  endDate: string,
): Promise<SmartStatementEntry[]> {
  const result = await pool.query(
    `SELECT
         lt."TransactionDate"::date AS date,
         lt."ReferenceType"        AS ref_type,
         COALESCE(lt."ReferenceNumber", lt."TransactionNumber", '') AS reference,
         lt."Id"                                                     AS transaction_id,
         COALESCE(lt."IsReversed", false)                            AS is_reversed,
         ROUND(SUM(le."DebitAmount")::numeric, 4)                    AS total_dr,
         ROUND(SUM(le."CreditAmount")::numeric, 4)                   AS total_cr,
         MAX(COALESCE(acp.payment_method, ip.payment_method::text))    AS payment_method
       FROM ledger_entries le
       JOIN accounts a              ON a."Id"  = le."AccountId"
       JOIN ledger_transactions lt  ON lt."Id" = le."TransactionId"
       LEFT JOIN ar_customer_payments acp
         ON lt."ReferenceType" = 'CUSTOMER_PAYMENT'
         AND acp.payment_number = lt."ReferenceNumber"
       LEFT JOIN invoice_payments ip
         ON lt."ReferenceType" = 'INVOICE_PAYMENT'
         AND ip.id = lt."ReferenceId"
       WHERE a."AccountCode" = '1200'
         AND ${customerArScopeSql('le', 'lt', '$1')}
         AND lt."Status" = 'POSTED'
         AND lt."ReferenceType" NOT IN (
               'SYSTEM_CORRECTION', 'CORRECTION', 'HIST_REV', 'MANUAL_ADJUSTMENT', 'SALE_COGS'
             )
         AND le."EntryDate"::date >= $2::date
         AND le."EntryDate"::date <= $3::date
       GROUP BY
         lt."Id", lt."TransactionDate", lt."ReferenceType",
         lt."ReferenceNumber", lt."TransactionNumber", lt."IsReversed"
       HAVING ABS(SUM(le."DebitAmount") - SUM(le."CreditAmount")) > 0.001
       ORDER BY lt."TransactionDate"::date ASC, MIN(le."CreatedAt") ASC`,
    [customerId, startDate, endDate],
  );

  return result.rows.map((r): SmartStatementEntry => {
    const referenceType = r.ref_type as string;
    const isReversed = r.is_reversed as boolean;
    const debit = toNum(r.total_dr);
    const credit = toNum(r.total_cr);
    const paymentMethod = (r.payment_method as string | null) ?? undefined;
    const paymentMethodLabel = formatCustomerPaymentMethodLabel(paymentMethod);

    let particulars: string;
    let vchType: string;
    let itemStatus: SmartStatementEntry['itemStatus'];

    if (isReversed) {
      particulars = 'Voided transaction';
      vchType = customerVchTypeLabel(referenceType);
      itemStatus = 'Cancelled';
    } else {
      switch (referenceType) {
        case 'INVOICE':
          particulars = 'Customer invoice issued';
          vchType = 'Invoice';
          itemStatus = 'Unpaid';
          break;
        case 'SALE':
          particulars = 'Credit sale';
          vchType = 'Sale';
          itemStatus = 'Unpaid';
          break;
        case 'INVOICE_PAYMENT':
        case 'CUSTOMER_PAYMENT':
          particulars = paymentMethodLabel
            ? `Payment received (${paymentMethodLabel})`
            : 'Payment received';
          vchType = 'Payment';
          // GL receipt is always "received"; open-item may still be unallocated (on account).
          itemStatus = 'Received';
          break;
        case 'CREDIT_NOTE':
          particulars = 'Credit note issued';
          vchType = 'Credit Note';
          itemStatus = 'Applied';
          break;
        case 'DEBIT_NOTE':
          particulars = 'Debit note issued';
          vchType = 'Debit Note';
          itemStatus = 'Unpaid';
          break;
        case 'CUSTOMER_OPENING_BALANCE':
          particulars = 'Opening balance brought forward';
          vchType = 'Opening';
          itemStatus = 'Unpaid';
          break;
        case 'SALE_REFUND':
          particulars = 'Sale refund / return';
          vchType = 'Refund';
          itemStatus = 'Applied';
          break;
        default:
          particulars = referenceType.replace(/_/g, ' ').toLowerCase();
          vchType = customerVchTypeLabel(referenceType);
          itemStatus = credit > 0 ? 'Applied' : 'Unpaid';
      }
    }

    return {
      date: r.date,
      particulars,
      vchType,
      vchNo: r.reference as string,
      debit,
      credit,
      balanceAfter: 0,
      itemStatus,
      paymentMethod,
      transactionId: r.transaction_id as string,
      referenceType,
      isReversed,
    };
  });
}

function formatCustomerPaymentMethodLabel(method?: string | null): string | undefined {
  if (!method) return undefined;
  switch (method.toUpperCase()) {
    case 'CASH': return 'Cash';
    case 'CARD': return 'Card';
    case 'MOBILE_MONEY': return 'MTN Mobile Money';
    case 'AIRTEL_MONEY': return 'Airtel Money';
    case 'BANK_TRANSFER': return 'Bank Transfer';
    case 'CREDIT': return 'Credit';
    case 'DEPOSIT': return 'Deposit';
    case 'OTHER': return 'Other';
    default: return method.replace(/_/g, ' ');
  }
}

function customerVchTypeLabel(referenceType: string): string {
  switch (referenceType) {
    case 'INVOICE': return 'Invoice';
    case 'SALE': return 'Sale';
    case 'INVOICE_PAYMENT':
    case 'CUSTOMER_PAYMENT': return 'Payment';
    case 'CREDIT_NOTE': return 'Credit Note';
    case 'DEBIT_NOTE': return 'Debit Note';
    case 'CUSTOMER_OPENING_BALANCE': return 'Opening';
    case 'SALE_REFUND': return 'Refund';
    default: return referenceType.replace(/_/g, ' ');
  }
}

/** Reversed AR allocations in period (open-item subledger; no GL mirror). */
export async function getCustomerReversedAllocationEntries(
  pool: Pool,
  customerId: string,
  startDate: string,
  endDate: string,
): Promise<SmartStatementEntry[]> {
  const result = await pool.query(
    `SELECT
       a.reversed_at::date AS date,
       a.id AS allocation_id,
       a.amount_allocated AS amount,
       i.invoice_number,
       p.payment_number
     FROM ar_payment_allocations a
     JOIN ar_customer_payments p ON p.id = a.payment_id
     JOIN invoices i ON i.id = a.invoice_id
     WHERE p.customer_id = $1
       AND a.status = 'REVERSED'
       AND a.reversed_at IS NOT NULL
       AND a.reversed_at::date >= $2::date
       AND a.reversed_at::date <= $3::date
     ORDER BY a.reversed_at ASC`,
    [customerId, startDate, endDate],
  );

  return result.rows.map((r): SmartStatementEntry => {
    const amount = toNum(r.amount);
    const invoiceNumber = String(r.invoice_number || '');
    const paymentNumber = String(r.payment_number || '');
    return {
      date: r.date,
      particulars: `Allocation reversed — invoice ${invoiceNumber} (receipt ${paymentNumber})`,
      vchType: 'Allocation',
      vchNo: String(r.allocation_id),
      debit: amount,
      credit: 0,
      balanceAfter: 0,
      itemStatus: 'Reversed',
      transactionId: String(r.allocation_id),
      referenceType: 'AR_ALLOCATION_REVERSED',
      isReversed: true,
    };
  });
}

/** Current unallocated customer receipt balance (open-item; GL already posted on receipt). */
export async function getCustomerUnallocatedReceipts(
  pool: Pool,
  customerId: string,
): Promise<{ total: number; receipts: CustomerUnallocatedReceipt[] }> {
  const result = await pool.query(
    `SELECT id, payment_number, payment_date::date AS payment_date, unallocated_amount
     FROM ar_customer_payments
     WHERE customer_id = $1
       AND status NOT IN ('REVERSED', 'CANCELLED')
       AND unallocated_amount > 0.009
     ORDER BY payment_date ASC`,
    [customerId],
  );

  let total = new Decimal(0);
  const receipts = result.rows.map((r) => {
    const unallocatedAmount = toNum(r.unallocated_amount);
    total = total.plus(unallocatedAmount);
    return {
      paymentId: r.id as string,
      paymentNumber: r.payment_number as string,
      paymentDate: String(r.payment_date).slice(0, 10),
      unallocatedAmount,
    };
  });

  return { total: total.toDecimalPlaces(2).toNumber(), receipts };
}

/** Current unallocated supplier prepayments (open-item; GL already posted on payment). */
export async function getSupplierUnallocatedPrepayments(
  pool: Pool,
  supplierId: string,
): Promise<{ total: number; prepayments: SupplierUnallocatedPrepayment[] }> {
  const result = await pool.query(
    `SELECT "Id" AS id,
            "PaymentNumber" AS payment_number,
            "PaymentDate"::date AS payment_date,
            COALESCE("UnallocatedAmount", "Amount" - COALESCE("AllocatedAmount", 0)) AS unallocated_amount
     FROM supplier_payments
     WHERE "SupplierId" = $1
       AND deleted_at IS NULL
       AND "Status" = 'COMPLETED'
       AND COALESCE("UnallocatedAmount", "Amount" - COALESCE("AllocatedAmount", 0)) > 0.009
     ORDER BY "PaymentDate" ASC`,
    [supplierId],
  );

  let total = new Decimal(0);
  const prepayments = result.rows.map((r) => {
    const unallocatedAmount = toNum(r.unallocated_amount);
    total = total.plus(unallocatedAmount);
    return {
      paymentId: r.id as string,
      paymentNumber: r.payment_number as string,
      paymentDate: String(r.payment_date).slice(0, 10),
      unallocatedAmount,
    };
  });

  return { total: total.toDecimalPlaces(2).toNumber(), prepayments };
}

/** Net entity GL balance on 2100 and 2150 as of endDate (supplier position components). */
export async function getSupplierEntityGlBalances(
  pool: Pool,
  supplierId: string,
  asOfDate: string,
): Promise<{ ap2100: number; grir2150: number }> {
  const result = await pool.query(
    `SELECT a."AccountCode" AS acct,
            COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS net
     FROM ledger_entries le
     JOIN accounts a ON le."AccountId" = a."Id"
     JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
     WHERE a."AccountCode" IN ('2100', '2150')
       AND le."EntityId" = $1
       AND UPPER(le."EntityType") = 'SUPPLIER'
       AND lt."Status" = 'POSTED'
       AND lt."IsReversed" = FALSE
       AND lt."Id" NOT IN (
         SELECT "ReversedByTransactionId" FROM ledger_transactions
         WHERE "ReversedByTransactionId" IS NOT NULL
       )
       AND le."EntryDate"::date <= $2::date
     GROUP BY a."AccountCode"`,
    [supplierId, asOfDate],
  );

  const ap2100 = toNum(result.rows.find((r) => r.acct === '2100')?.net);
  const grir2150 = toNum(result.rows.find((r) => r.acct === '2150')?.net);
  return { ap2100, grir2150 };
}
