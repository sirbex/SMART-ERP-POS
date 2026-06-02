import { describe, it, expect } from '@jest/globals';
import { AR_SSOT_INVOICE_PAYMENT_METHODS } from './arPaymentService.js';

describe('AR payment SSOT routing', () => {
  it('routes standard clearing methods through AR SSOT', () => {
    expect(AR_SSOT_INVOICE_PAYMENT_METHODS.has('CASH')).toBe(true);
    expect(AR_SSOT_INVOICE_PAYMENT_METHODS.has('CARD')).toBe(true);
    expect(AR_SSOT_INVOICE_PAYMENT_METHODS.has('MOBILE_MONEY')).toBe(true);
    expect(AR_SSOT_INVOICE_PAYMENT_METHODS.has('BANK_TRANSFER')).toBe(true);
  });

  it('keeps DEPOSIT and CREDIT on legacy invoice payment path', () => {
    expect(AR_SSOT_INVOICE_PAYMENT_METHODS.has('DEPOSIT')).toBe(false);
    expect(AR_SSOT_INVOICE_PAYMENT_METHODS.has('CREDIT')).toBe(false);
  });
});
