/**
 * Credit/Debit Note Report Types
 *
 * Type definitions for all CN/DN-related reports:
 * - Sales Returns & Allowances (P&L)
 * - Purchase Returns & Allowances (P&L)
 * - AR Ledger (GL view)
 * - AP Ledger (GL view)
 * - Credit/Debit Note Register
 * - Tax Reversal Report
 * - Invoice Adjustment History
 * - Supplier Statement
 * - Supplier (Aged Payables)
 */

// ── Sales / Purchase Returns & Allowances (P&L) ──
export interface ReturnsAllowancesRow {
    period: string;           // YYYY-MM
    totalSales: number;       // Revenue (4000)
    salesReturns: number;     // Sales Returns (4010) — from CN
    netSales: number;         // totalSales - salesReturns
    creditNoteCount: number;
}

export interface PurchaseReturnsAllowancesRow {
    period: string;
    totalPurchases: number;   // COGS (5000)
    purchaseReturns: number;  // Purchase Returns (5010) — from SCN
    netPurchases: number;
    creditNoteCount: number;
}

// ── AR / AP Ledger (GL view) ──
export interface LedgerEntryRow {
    date: string;
    transactionNumber: string;
    referenceType: string;    // SALE, CREDIT_NOTE, DEBIT_NOTE, CUSTOMER_PAYMENT, etc.
    referenceNumber: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;          // Running balance (computed in service)
}

// ── Credit/Debit Note Register ──
export interface NoteRegisterRow {
    noteId: string;
    noteNumber: string;
    documentType: string;     // CREDIT_NOTE, DEBIT_NOTE, SUPPLIER_CREDIT_NOTE, SUPPLIER_DEBIT_NOTE
    side: 'CUSTOMER' | 'SUPPLIER';
    partyName: string;        // Customer or Supplier name
    referenceInvoiceNumber: string;
    reason: string | null;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    status: string;           // Draft, Posted, Cancelled
    issueDate: string;
    createdAt: string;
}

// ── Tax Reversal Report ──
export interface TaxReversalRow {
    taxRate: number;
    salesTax: number;          // Output VAT from invoices
    taxReversedByCN: number;   // Output VAT reversed by credit notes
    netSalesTax: number;
    purchaseTax: number;       // Input VAT from supplier invoices
    taxReversedBySCN: number;  // Input VAT reversed by supplier credit notes
    netPurchaseTax: number;
}

// ── Invoice Adjustment History ──
export interface InvoiceAdjustmentRow {
    noteId: string;
    noteNumber: string;
    documentType: string;
    reason: string | null;
    totalAmount: number;
    taxAmount: number;
    status: string;
    issueDate: string;
}

// ── Supplier Statement ──
export interface SupplierStatementEntry {
    date: string;
    type: string;   // SUPPLIER_INVOICE, SUPPLIER_CREDIT_NOTE, SUPPLIER_DEBIT_NOTE, PAYMENT
    reference: string;
    description: string;
    debit: number;
    credit: number;
}

export interface SupplierStatementData {
    supplierId: string;
    supplierName: string;
    periodStart: string;
    periodEnd: string;
    openingBalance: number;
    closingBalance: number;
    entries: Array<SupplierStatementEntry & { balanceAfter: number }>;
}

// ── Supplier Aging (Aged Payables) ──
export interface SupplierAgingRow {
    supplierId: string;
    supplierName: string;
    totalInvoices: number;
    totalOutstanding: number;
    current: number;
    days30: number;
    days60: number;
    days90: number;
    over90: number;
    maxDaysOverdue: number;
}
