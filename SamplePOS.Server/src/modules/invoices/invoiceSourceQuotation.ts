/**
 * Resolve quotation provenance for an invoice (PDF + API).
 * Falls back to sales.quote_id when invoices.quote_id was not persisted (legacy credit-sale path).
 */
import type { Pool, PoolClient } from 'pg';
import { snapshotQuotationReferenceDetails } from '@shared/utils/quotationReferenceDetails.js';

export type DbConn = Pool | PoolClient;

export interface InvoiceSourceQuotation {
  quoteId: string;
  quoteNumber: string;
  /** User-entered quotation reference only (not description). */
  reference: string | null;
  /** Full snapshot on invoice row (reference + description). */
  referenceDetails: string | null;
  quotationAuthorisedByName: string | null;
}

export async function resolveInvoiceAuthorisedByName(
  db: DbConn,
  invoice: {
    created_by_id?: string | null;
    sale_id?: string | null;
  },
): Promise<string | null> {
  if (invoice.created_by_id) {
    const row = await db.query<{ full_name: string | null }>(
      'SELECT full_name FROM users WHERE id = $1',
      [invoice.created_by_id],
    );
    if (row.rows[0]?.full_name?.trim()) return row.rows[0].full_name.trim();
  }

  if (invoice.sale_id) {
    const row = await db.query<{ full_name: string | null }>(
      `SELECT u.full_name
       FROM sales s
       LEFT JOIN users u ON u.id = s.cashier_id
       WHERE s.id = $1`,
      [invoice.sale_id],
    );
    if (row.rows[0]?.full_name?.trim()) return row.rows[0].full_name.trim();
  }

  return null;
}

export async function resolveInvoiceSourceQuotation(
  db: DbConn,
  invoice: {
    quote_id?: string | null;
    reference?: string | null;
    sale_id?: string | null;
  },
): Promise<InvoiceSourceQuotation | null> {
  let quoteId = invoice.quote_id ?? null;

  if (!quoteId && invoice.sale_id) {
    const saleRow = await db.query<{ quote_id: string | null; from_order_id: string | null }>(
      'SELECT quote_id, from_order_id FROM sales WHERE id = $1',
      [invoice.sale_id],
    );
    const sale = saleRow.rows[0];
    quoteId = sale?.quote_id ?? null;

    if (!quoteId && sale?.from_order_id) {
      const orderRow = await db.query<{ quote_id: string | null }>(
        'SELECT quote_id FROM pos_orders WHERE id = $1',
        [sale.from_order_id],
      );
      quoteId = orderRow.rows[0]?.quote_id ?? null;
    }
  }

  if (!quoteId) return null;

  const quoteRow = await db.query<{
    quote_number: string;
    reference: string | null;
    description: string | null;
    approved_by_name: string | null;
  }>(
    `SELECT q.quote_number, q.reference, q.description,
            u.full_name AS approved_by_name
     FROM quotations q
     LEFT JOIN users u ON u.id = q.approved_by_id
     WHERE q.id = $1`,
    [quoteId],
  );
  const quote = quoteRow.rows[0];
  if (!quote?.quote_number) return null;

  const referenceDetails =
    invoice.reference?.trim()
      ? invoice.reference
      : snapshotQuotationReferenceDetails(quote.reference, quote.description);

  const reference = quote.reference?.trim() ? quote.reference.trim() : null;

  return {
    quoteId,
    quoteNumber: quote.quote_number,
    reference,
    referenceDetails,
    quotationAuthorisedByName: quote.approved_by_name?.trim() || null,
  };
}
