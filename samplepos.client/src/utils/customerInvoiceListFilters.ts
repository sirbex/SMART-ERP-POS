/**
 * Customer Invoices tab list vs Adjust eligibility.
 * List must keep paid invoices visible; Adjust only when AR remains.
 */

export type CustomerInvoiceListRow = {
  invoiceNumber?: string;
  invoice_number?: string;
  documentType?: string;
  document_type?: string;
  status?: string;
  totalAmount?: number | string;
  total_amount?: number | string;
  amountPaid?: number | string;
  amount_paid?: number | string;
  balance?: number | string;
  amount_due?: number | string;
};

export function invoiceOutstandingAmount(inv: CustomerInvoiceListRow): number {
  const total = Number(inv.totalAmount ?? inv.total_amount ?? 0);
  const paid = Number(inv.amountPaid ?? inv.amount_paid ?? 0);
  const due = inv.balance ?? inv.amount_due;
  if (due !== undefined && due !== null && due !== '') {
    return Number(due);
  }
  return total - paid;
}

/** Rows for the Invoices tab — invoices + opening balances; CN/DN live on Transactions. */
export function isListableCustomerInvoice(inv: CustomerInvoiceListRow): boolean {
  const num = String(inv.invoiceNumber ?? inv.invoice_number ?? '').toUpperCase();
  if (num.startsWith('CN-') || num.startsWith('DN-')) return false;
  const docType = String(inv.documentType ?? inv.document_type ?? 'INVOICE').toUpperCase();
  if (docType === 'CREDIT_NOTE' || docType === 'DEBIT_NOTE') return false;
  const status = String(inv.status ?? '').toUpperCase();
  if (['CANCELLED', 'VOIDED', 'VOID'].includes(status)) return false;
  return true;
}

/** Adjust wizard only — real invoice with outstanding AR. */
export function isAdjustableCustomerInvoice(inv: CustomerInvoiceListRow): boolean {
  if (!isListableCustomerInvoice(inv)) return false;
  const docType = String(inv.documentType ?? inv.document_type ?? 'INVOICE').toUpperCase();
  if (docType !== 'INVOICE') return false;
  return invoiceOutstandingAmount(inv) > 0.009;
}
