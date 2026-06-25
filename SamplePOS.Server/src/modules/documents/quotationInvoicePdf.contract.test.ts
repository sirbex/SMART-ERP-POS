/**
 * Unit tests for quotation → invoice PDF body contracts.
 */
import { describe, expect, it } from '@jest/globals';
import {
  hasQuotationReferenceDetails,
  quotationReferenceDetailLines,
  referenceSnapshotLines,
} from '@shared/utils/quotationReferenceDetails.js';

describe('quotation PDF reference details contract', () => {
  it('omits reference section when both fields are empty', () => {
    expect(hasQuotationReferenceDetails(null, null)).toBe(false);
    expect(quotationReferenceDetailLines(null, null)).toHaveLength(0);
  });

  it('includes user-entered reference details exactly', () => {
    const lines = quotationReferenceDetailLines('Tender Ref 2026', 'Deliver to Kampala depot');
    expect(lines).toEqual(['Tender Ref 2026', 'Deliver to Kampala depot']);
  });
});

describe('invoice PDF source quotation contract', () => {
  it('shows quotation number only when reference snapshot is empty', () => {
    expect(referenceSnapshotLines(null)).toEqual([]);
  });

  it('renders historically snapshotted reference details from invoice.reference', () => {
    const snapshot = 'PO-442\nOriginal scope — do not change';
    expect(referenceSnapshotLines(snapshot)).toEqual(['PO-442', 'Original scope — do not change']);
  });
});

describe('quotation UoM display contract', () => {
  it('formats quantity with exact UoM name and space', () => {
    const formatQty = (quantity: number, uomName: string | null) =>
      uomName ? `${quantity} ${uomName}` : String(quantity);

    expect(formatQty(2, 'Box')).toBe('2 Box');
    expect(formatQty(5, 'Carton')).toBe('5 Carton');
    expect(formatQty(12, 'Piece')).toBe('12 Piece');
  });
});

describe('document footer contract', () => {
  it('treats whitespace-only footer as absent', () => {
    const normalize = (text: string | null | undefined) => text?.trim() || null;
    expect(normalize('   ')).toBeNull();
    expect(normalize('Thank you')).toBe('Thank you');
  });
});
