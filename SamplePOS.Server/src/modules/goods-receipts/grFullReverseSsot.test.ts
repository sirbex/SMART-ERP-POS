/**
 * Unit proof — full GR reverse SSOT: unpaid cancel OK; paid/consumed blocked at plan layer.
 */
import { describe, it, expect } from '@jest/globals';
import { planSupplierBillsForGrFullReverse } from '../../../../shared/domain/grFullReverseSsot.js';

describe('planSupplierBillsForGrFullReverse', () => {
  it('plans cancel for unpaid supplier bill', () => {
    const plan = planSupplierBillsForGrFullReverse([
      {
        id: 'inv-1',
        invoiceNumber: 'SBILL-1',
        documentType: 'SUPPLIER_INVOICE',
        amountPaid: 0,
        outstandingBalance: 100,
        totalAmount: 100,
        isPostedToGl: true,
      },
    ]);
    expect(plan.blockers).toHaveLength(0);
    expect(plan.toCancel).toHaveLength(1);
    expect(plan.toCancel[0].action).toBe('REVERSE_AND_CANCEL');
  });

  it('blocks when bill has payments (no silent unallocate)', () => {
    const plan = planSupplierBillsForGrFullReverse([
      {
        id: 'inv-2',
        invoiceNumber: 'SBILL-PAID',
        documentType: 'SUPPLIER_INVOICE',
        amountPaid: 40,
        outstandingBalance: 60,
        totalAmount: 100,
        status: 'PARTIALLY_PAID',
      },
    ]);
    expect(plan.toCancel).toHaveLength(0);
    expect(plan.blockers.some((b) => /payments applied/i.test(b))).toBe(true);
  });

  it('blocks PAID status even if amountPaid is stale zero', () => {
    const plan = planSupplierBillsForGrFullReverse([
      {
        id: 'inv-3',
        invoiceNumber: 'SBILL-STATUS',
        documentType: 'SUPPLIER_INVOICE',
        amountPaid: 0,
        outstandingBalance: 0,
        totalAmount: 100,
        status: 'PAID',
      },
    ]);
    expect(plan.toCancel).toHaveLength(0);
    expect(plan.blockers.some((b) => /payments applied/i.test(b))).toBe(true);
  });
});
