import { describe, expect, it } from '@jest/globals';
import {
  splitCustomerPaymentDebits,
  splitSupplierPaymentCredits,
} from './supplierPaymentWht.js';

describe('supplierPaymentWht', () => {
  it('splits 6% WHT on 1,000,000 into cash 940,000 and WHT 60,000', () => {
    const r = splitSupplierPaymentCredits(1_000_000, 60_000);
    expect(r.apDebit).toBe(1_000_000);
    expect(r.cashCredit).toBe(940_000);
    expect(r.whtCredit).toBe(60_000);
  });

  it('with no WHT, cash equals gross', () => {
    const r = splitSupplierPaymentCredits(250_000, 0);
    expect(r.apDebit).toBe(250_000);
    expect(r.cashCredit).toBe(250_000);
    expect(r.whtCredit).toBe(0);
  });

  it('rejects WHT greater than gross', () => {
    expect(() => splitSupplierPaymentCredits(100, 150)).toThrow(/cannot exceed/);
  });
});

describe('customerPaymentWht', () => {
  it('splits customer withholding: cash 940k + receivable 60k clears AR 1M', () => {
    const r = splitCustomerPaymentDebits(1_000_000, 60_000);
    expect(r.arCredit).toBe(1_000_000);
    expect(r.cashDebit).toBe(940_000);
    expect(r.whtDebit).toBe(60_000);
  });
});
