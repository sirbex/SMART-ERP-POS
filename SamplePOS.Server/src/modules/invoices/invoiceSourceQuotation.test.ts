import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  resolveInvoiceAuthorisedByName,
  resolveInvoiceSourceQuotation,
} from './invoiceSourceQuotation.js';

describe('resolveInvoiceSourceQuotation', () => {
  const mockQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();
  const db = { query: mockQuery };

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns null when no quote link on invoice or sale', async () => {
    const result = await resolveInvoiceSourceQuotation(db as never, {
      quote_id: null,
      sale_id: null,
      reference: null,
    });
    expect(result).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('resolves from invoices.quote_id and snapshotted reference', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        quote_number: 'Q-2026-0001',
        reference: 'PO-1',
        description: 'Note',
        approved_by_name: 'Quote Approver',
      }],
    });

    const result = await resolveInvoiceSourceQuotation(db as never, {
      quote_id: 'quote-uuid',
      sale_id: 'sale-uuid',
      reference: 'PO-1\nNote',
    });

    expect(result).toEqual({
      quoteId: 'quote-uuid',
      quoteNumber: 'Q-2026-0001',
      reference: 'PO-1',
      referenceDetails: 'PO-1\nNote',
      quotationAuthorisedByName: 'Quote Approver',
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('returns null reference when quotation has no user reference', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        quote_number: 'Q-2026-0002',
        reference: null,
        description: 'Delivery note only',
        approved_by_name: null,
      }],
    });

    const result = await resolveInvoiceSourceQuotation(db as never, {
      quote_id: 'quote-uuid',
      sale_id: null,
      reference: null,
    });

    expect(result?.reference).toBeNull();
    expect(result?.referenceDetails).toBe('Delivery note only');
  });

  it('falls back to sales.quote_id when invoices.quote_id is missing', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ quote_id: 'quote-from-sale', from_order_id: null }] })
      .mockResolvedValueOnce({
        rows: [{
          quote_number: 'Q-2026-0099',
          reference: 'TENDER-A',
          description: null,
          approved_by_name: 'Approver One',
        }],
      });

    const result = await resolveInvoiceSourceQuotation(db as never, {
      quote_id: null,
      sale_id: 'sale-uuid',
      reference: null,
    });

    expect(result).toEqual({
      quoteId: 'quote-from-sale',
      quoteNumber: 'Q-2026-0099',
      reference: 'TENDER-A',
      referenceDetails: 'TENDER-A',
      quotationAuthorisedByName: 'Approver One',
    });
  });
});

describe('resolveInvoiceAuthorisedByName', () => {
  const mockQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();
  const db = { query: mockQuery };

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('uses invoice created_by_id when present', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ full_name: 'Invoice Maker' }] });
    const name = await resolveInvoiceAuthorisedByName(db as never, {
      created_by_id: 'user-1',
      sale_id: 'sale-1',
    });
    expect(name).toBe('Invoice Maker');
  });

  it('falls back to sale cashier when created_by_id is missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ full_name: 'Cashier User' }] });
    const name = await resolveInvoiceAuthorisedByName(db as never, {
      created_by_id: null,
      sale_id: 'sale-1',
    });
    expect(name).toBe('Cashier User');
  });
});
