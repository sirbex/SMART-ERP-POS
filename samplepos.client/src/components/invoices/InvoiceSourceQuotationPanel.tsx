interface SourceQuotation {
  quoteId: string;
  quoteNumber: string;
  reference?: string | null;
  referenceDetails?: string | null;
  quotationAuthorisedByName?: string | null;
}

interface BillToCustomer {
  name: string;
  email?: string | null;
  phone?: string | null;
}

interface InvoiceSourceQuotationPanelProps {
  source: SourceQuotation;
  customer: BillToCustomer;
  invoiceAuthorisedByName?: string | null;
  className?: string;
}

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || '—';
}

/** Mirrors invoice PDF: Bill To (name, email, phone + reference); quote + authorisation meta. */
export function InvoiceSourceQuotationPanel({
  source,
  customer,
  invoiceAuthorisedByName,
  className = '',
}: InvoiceSourceQuotationPanelProps) {
  const refText = source.reference?.trim() || null;

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
      <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-800 mb-1">Bill To</p>
        <p className="font-medium text-gray-900">{customer.name?.trim() || '—'}</p>
        {customer.email?.trim() ? (
          <p className="text-sm text-gray-700">{customer.email.trim()}</p>
        ) : null}
        {customer.phone?.trim() ? (
          <p className="text-sm text-gray-700">{customer.phone.trim()}</p>
        ) : null}
        <div className="pt-2 border-t border-gray-200">
          <p className="text-xs text-gray-600">Reference</p>
          <p className="font-medium text-gray-900 break-words mt-1">{refText || '—'}</p>
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-gray-600">Quotation Number</span>
          <span className="font-semibold text-gray-900 text-right">{source.quoteNumber}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600">Quotation Authorised By</span>
          <span className="font-semibold text-gray-900 text-right">{displayValue(source.quotationAuthorisedByName)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600">Invoice Authorised By</span>
          <span className="font-semibold text-gray-900 text-right">{displayValue(invoiceAuthorisedByName)}</span>
        </div>
      </div>
    </div>
  );
}
