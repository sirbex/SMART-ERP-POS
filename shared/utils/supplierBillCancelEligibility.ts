/** Shared rules: when an unpaid supplier bill may be cancelled (reverse GL + rebill GR). */
export function isSupplierBillCancellable(bill: {
  status?: string | null;
  documentType?: string | null;
  invoiceNumber?: string | null;
  amountPaid?: number | string | null;
  creditsApplied?: number | string | null;
}): boolean {
  const status = String(bill.status || '').toUpperCase();
  if (['CANCELLED', 'VOIDED', 'DELETED'].includes(status)) return false;

  const docType = String(bill.documentType || '').toUpperCase();
  if (docType === 'OPENING_BALANCE') return false;
  if (docType === 'SUPPLIER_CREDIT_NOTE' || docType === 'SUPPLIER_DEBIT_NOTE') return false;
  if ((bill.invoiceNumber || '').startsWith('OB-')) return false;

  const paid = Number(bill.amountPaid ?? 0);
  if (Number.isFinite(paid) && paid > 0.005) return false;

  const credits = Number(bill.creditsApplied ?? 0);
  if (Number.isFinite(credits) && credits > 0.005) return false;

  return true;
}

/** User-facing hint when cancel is blocked (null = cancellable). */
export function supplierBillCancelBlockReason(bill: {
  status?: string | null;
  documentType?: string | null;
  invoiceNumber?: string | null;
  amountPaid?: number | string | null;
  creditsApplied?: number | string | null;
}): string | null {
  if (isSupplierBillCancellable(bill)) return null;

  const status = String(bill.status || '').toUpperCase();
  if (['CANCELLED', 'VOIDED', 'DELETED'].includes(status)) {
    return 'This bill is already cancelled.';
  }

  const docType = String(bill.documentType || '').toUpperCase();
  if (docType === 'OPENING_BALANCE' || (bill.invoiceNumber || '').startsWith('OB-')) {
    return 'Opening balance documents use a separate cancel workflow.';
  }
  if (docType === 'SUPPLIER_CREDIT_NOTE' || docType === 'SUPPLIER_DEBIT_NOTE') {
    return 'Credit and debit notes cannot be cancelled here.';
  }

  const paid = Number(bill.amountPaid ?? 0);
  if (Number.isFinite(paid) && paid > 0.005) {
    return 'Reverse supplier payments on this bill before cancelling.';
  }

  const credits = Number(bill.creditsApplied ?? 0);
  if (Number.isFinite(credits) && credits > 0.005) {
    return 'Unapply supplier credit notes on this bill before cancelling.';
  }

  return 'This bill cannot be cancelled.';
}
