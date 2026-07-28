import { describe, expect, it } from 'vitest';
import {
  buildSupplierBillSettlement,
  deriveCreditsApplied,
  formatScnApplySuccessMessage,
  formatSupplierBillDisplayStatus,
} from '@shared/utils/supplierBillSettlement';

describe('supplierBillSettlement — stop Paid vs Outstanding confusion', () => {
  it('shows payments / credits / balance due for SCN-only settlement (SBILL-0806 pattern)', () => {
    const s = buildSupplierBillSettlement({
      totalAmount: 985_000,
      amountPaid: 0,
      creditsApplied: 40_000,
      outstandingBalance: 945_000,
      status: 'PARTIALLY_PAID',
    });
    expect(s.payments).toBe(0);
    expect(s.creditsApplied).toBe(40_000);
    expect(s.balanceDue).toBe(945_000);
    expect(s.settledByCreditsOnly).toBe(true);
    expect(s.displayStatus).toBe('Partially settled');
    expect(s.equationHint).toContain('Payments');
    expect(s.equationHint).toContain('Credits');
  });

  it('derives credits from the Total − Paid − Outstanding gap when credits omitted', () => {
    expect(deriveCreditsApplied(985_000, 0, 945_000)).toBe(40_000);
    const s = buildSupplierBillSettlement({
      totalAmount: 985_000,
      amountPaid: 0,
      outstandingBalance: 945_000,
      status: 'PARTIALLY_PAID',
    });
    expect(s.creditsApplied).toBe(40_000);
    expect(s.displayStatus).toBe('Partially settled');
  });

  it('labels mixed settlement as Partially paid', () => {
    const s = buildSupplierBillSettlement({
      totalAmount: 100_000,
      amountPaid: 30_000,
      creditsApplied: 20_000,
      outstandingBalance: 50_000,
      status: 'PARTIALLY_PAID',
    });
    expect(s.mixedSettlement).toBe(true);
    expect(s.displayStatus).toBe('Partially paid');
  });

  it('formats SCN apply toast without implying a second AP reduction', () => {
    const msg = formatScnApplySuccessMessage({
      applied: 40_000,
      billCount: 1,
      residual: 0,
      formatMoney: (n) => `UGX ${n.toLocaleString()}`,
    });
    expect(msg).toMatch(/Allocated/);
    expect(msg).toMatch(/already reduced when this credit was posted/i);
    expect(msg).not.toMatch(/supplier balance (decreased|reduced) by/i);
  });

  it('keeps credit-note on-account wording clear', () => {
    expect(
      formatSupplierBillDisplayStatus({
        status: 'POSTED',
        documentType: 'SUPPLIER_CREDIT_NOTE',
        payments: 0,
        creditsApplied: 0,
        balanceDue: 40_000,
      }),
    ).toBe('On account — apply to bill');
  });
});
