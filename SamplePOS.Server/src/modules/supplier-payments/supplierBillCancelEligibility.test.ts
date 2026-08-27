import { describe, expect, it } from 'vitest';
import {
  isSupplierBillCancellable,
  supplierBillCancelBlockReason,
} from '../../../../shared/utils/supplierBillCancelEligibility.js';

describe('supplierBillCancelEligibility SSOT', () => {
  const openBill = {
    status: 'UNPAID',
    documentType: 'SUPPLIER_INVOICE',
    invoiceNumber: 'SBILL-2026-1027',
    amountPaid: 0,
    creditsApplied: 0,
  };

  it('allows unpaid GR-linked bill with no payments or credits', () => {
    expect(isSupplierBillCancellable(openBill)).toBe(true);
    expect(supplierBillCancelBlockReason(openBill)).toBeNull();
  });

  it('blocks when cash payments exist', () => {
    const bill = { ...openBill, amountPaid: 1000 };
    expect(isSupplierBillCancellable(bill)).toBe(false);
    expect(supplierBillCancelBlockReason(bill)).toMatch(/Reverse supplier payments/i);
  });

  it('blocks when supplier credit notes are applied', () => {
    const bill = { ...openBill, creditsApplied: 40_000 };
    expect(isSupplierBillCancellable(bill)).toBe(false);
    expect(supplierBillCancelBlockReason(bill)).toMatch(/Unapply supplier credit notes/i);
  });

  it('blocks terminal and special document types', () => {
    expect(isSupplierBillCancellable({ ...openBill, status: 'Cancelled' })).toBe(false);
    expect(isSupplierBillCancellable({ ...openBill, documentType: 'OPENING_BALANCE' })).toBe(false);
    expect(isSupplierBillCancellable({ ...openBill, invoiceNumber: 'OB-SUP-001' })).toBe(false);
    expect(
      isSupplierBillCancellable({ ...openBill, documentType: 'SUPPLIER_CREDIT_NOTE' }),
    ).toBe(false);
  });
});
