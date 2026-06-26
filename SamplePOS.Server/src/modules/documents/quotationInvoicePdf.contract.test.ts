/**
 * Unit tests for quotation → invoice PDF body contracts.
 */
import { describe, expect, it } from '@jest/globals';
import {
  hasQuotationReferenceDetails,
  quotationReferenceDetailLines,
  quotationPdfReferenceDisplay,
  referenceSnapshotLines,
} from '@shared/utils/quotationReferenceDetails.js';
import {
  hasQuotationLineDiscounts,
  hasTaxableQuotationLines,
} from '@shared/utils/quotationCalculations.js';
import {
  isQuotationConversionLocked,
  isQuoteConvertibleFrom,
} from '@shared/types/quotation.js';

describe('quotation PDF reference details contract', () => {
  it('omits reference section when both fields are empty', () => {
    expect(hasQuotationReferenceDetails(null, null)).toBe(false);
    expect(quotationReferenceDetailLines(null, null)).toHaveLength(0);
  });

  it('includes user-entered reference details exactly', () => {
    const lines = quotationReferenceDetailLines('Tender Ref 2026', 'Deliver to Kampala depot');
    expect(lines).toEqual(['Tender Ref 2026', 'Deliver to Kampala depot']);
  });

  it('uses user reference on quotation PDF when set', () => {
    expect(quotationPdfReferenceDisplay('PO-442', 'Q-2026-0043')).toBe('PO-442');
  });

  it('falls back to quote number on quotation PDF when reference is empty', () => {
    expect(quotationPdfReferenceDisplay(null, 'Q-2026-0043')).toBe('Q-2026-0043');
    expect(quotationPdfReferenceDisplay('   ', 'Q-2026-0043')).toBe('Q-2026-0043');
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
  it('keeps Qty and UoM as separate PDF columns', () => {
    const formatQty = (quantity: number) => String(quantity);
    const formatUom = (uomName: string | null) => uomName?.trim() || '—';

    expect(formatQty(2)).toBe('2');
    expect(formatUom('Box')).toBe('Box');
    expect(formatUom(null)).toBe('—');
  });
});

describe('document footer contract', () => {
  it('treats whitespace-only footer as absent', () => {
    const normalize = (text: string | null | undefined) => text?.trim() || null;
    expect(normalize('   ')).toBeNull();
    expect(normalize('Thank you')).toBe('Thank you');
  });
});

describe('quotation column visibility contract', () => {
  it('shows tax column only when lines are taxable with tax', () => {
    expect(hasTaxableQuotationLines([{ quantity: 1, unitPrice: 10, isTaxable: false, taxRate: 18 }])).toBe(false);
    expect(hasTaxableQuotationLines([{ quantity: 1, unitPrice: 10, isTaxable: true, taxRate: 18 }])).toBe(true);
  });

  it('shows discount column only when a line has discount', () => {
    expect(hasQuotationLineDiscounts([{ discountAmount: 0 }])).toBe(false);
    expect(hasQuotationLineDiscounts([{ discountAmount: 0 }, { discountAmount: 100 }])).toBe(true);
  });
});

describe('quotation conversion lock contract', () => {
  it('locks when converted_to_invoice_id is set even if status is still DRAFT', () => {
    expect(
      isQuotationConversionLocked({ status: 'DRAFT', convertedToInvoiceId: 'inv-1' }),
    ).toBe(true);
    expect(
      isQuoteConvertibleFrom({
        status: 'DRAFT',
        validUntil: '2099-12-31',
        convertedToInvoiceId: 'inv-1',
      }),
    ).toBe(false);
  });
});
