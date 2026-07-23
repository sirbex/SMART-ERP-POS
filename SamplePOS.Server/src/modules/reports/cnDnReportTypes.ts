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
    /** GL transaction number (e.g. TXN-2025-0001) */
    docNumber: string;
    type: string;   // SUPPLIER_INVOICE, SUPPLIER_CREDIT_NOTE, SUPPLIER_DEBIT_NOTE, SUPPLIER_PAYMENT, RETURN_GRN, GOODS_RECEIPT, SYSTEM_CORRECTION
    reference: string;
    description: string;
    debit: number;
    credit: number;
    /**
     * Document classification for the supplier liability workspace:
     *  - Open         = invoice/debit note outstanding (AP 2100 credit)
     *  - Applied      = payment made (AP 2100 debit)
     *  - Credit Note  = supplier credit note issued
     *  - Pending Bill = goods received, awaiting invoice (GR/IR 2150 credit)
     *  - Return       = return-to-supplier reduces unbilled liability (GR/IR 2150 debit)
     *  - Correction   = SYSTEM_CORRECTION journal entry
     *  - Voided       = transaction reversed
     */
    itemStatus: 'Open' | 'Applied' | 'Credit Note' | 'Pending Bill' | 'Return' | 'Correction' | 'Voided';
    /** Payment method — populated for SUPPLIER_PAYMENT entries (e.g. CASH, BANK_TRANSFER) */
    paymentMethod?: string;
    /** GL account this entry posted to: '2100' (AP) or '2150' (GR/IR Clearing) */
    accountCode?: string;
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

// ── Smart Supplier Statement (Tally/SAP/Odoo business-document view) ──
// One row per business document; no accounting internals exposed.
export interface SmartStatementEntry {
    date: string;
    /** Human-readable business description — no accounting jargon */
    particulars: string;
    /** Voucher type label: GRN | Bill | Payment | Return | Credit Note | Debit Note */
    vchType: string;
    /** Human-readable document number (e.g., GR-2026-0047, PAY-000021) */
    vchNo: string;
    /** Liability increase — goods received / direct invoice raised */
    debit: number;
    /** Liability decrease — payment made / credit note / return */
    credit: number;
    /** Running cumulative balance after this entry */
    balanceAfter: number;
    /** Status badge shown to users */
    itemStatus: 'Pending Bill' | 'Unpaid' | 'Paid' | 'Received' | 'Applied' | 'Voided' | 'Cancelled' | 'Reversed' | 'Unallocated' | 'Info';
    paymentMethod?: string;
    /** UUID of the GL ledger_transaction — powers "View GL Journals" drilldown */
    transactionId: string;
    /** Raw reference type for internal filtering */
    referenceType: string;
    isReversed: boolean;
}

export interface SmartStatementData {
    supplierId: string;
    supplierName: string;
    periodStart: string;
    periodEnd: string;
    openingBalance: number;
    closingBalance: number;
    entries: SmartStatementEntry[];
    /** Open-item AP (invoices − credit notes − unallocated prepayments) — SSOT subledger */
    openItemBalance: number;
    /** Net entity balance on AP 2100 as of periodEnd */
    ap2100EntityBalance: number;
    /** Net entity balance on GR/IR 2150 as of periodEnd (received-not-billed) */
    grirBalance: number;
    unallocatedPrepaymentsTotal: number;
    unallocatedPrepayments: SupplierUnallocatedPrepayment[];
}

export interface CustomerUnallocatedReceipt {
    paymentId: string;
    paymentNumber: string;
    paymentDate: string;
    unallocatedAmount: number;
}

export interface SupplierUnallocatedPrepayment {
    paymentId: string;
    paymentNumber: string;
    paymentDate: string;
    unallocatedAmount: number;
}

/** GL-driven customer AR statement (mirrors SmartStatementData for customers). */
export interface CustomerSmartStatementData {
    customerId: string;
    customerName: string;
    periodStart: string;
    periodEnd: string;
    openingBalance: number;
    closingBalance: number;
    entries: SmartStatementEntry[];
    /** Subledger-only rows (reversed allocations) — do not affect closingBalance math */
    openItemEntries: SmartStatementEntry[];
    unallocatedReceiptsTotal: number;
    unallocatedReceipts: CustomerUnallocatedReceipt[];
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
