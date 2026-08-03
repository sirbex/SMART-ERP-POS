import { describe, it, expect } from 'vitest';
import {
  evaluateCustomerCreditLimit,
  creditAvailable,
  isUnlimitedCustomerCredit,
} from './customerCreditLimit.js';

describe('customerCreditLimit (enterprise)', () => {
  it('allows unlimited credit regardless of projected balance', () => {
    const r = evaluateCustomerCreditLimit({
      unlimitedCredit: true,
      creditLimit: 0,
      currentBalance: 9_000_000,
      additionalCredit: 5_000_000,
    });
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.unlimited).toBe(true);
  });

  it('enforces finite limit when not unlimited', () => {
    const r = evaluateCustomerCreditLimit({
      unlimitedCredit: false,
      creditLimit: 100_000,
      currentBalance: 80_000,
      additionalCredit: 30_000,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe('CREDIT_LIMIT_EXCEEDED');
  });

  it('allows sale within finite limit', () => {
    const r = evaluateCustomerCreditLimit({
      unlimitedCredit: false,
      creditLimit: 100_000,
      currentBalance: 40_000,
      additionalCredit: 50_000,
    });
    expect(r.allowed).toBe(true);
  });

  it('creditAvailable is null for unlimited and residual for finite', () => {
    expect(isUnlimitedCustomerCredit(true)).toBe(true);
    expect(creditAvailable(true, 0, 50_000)).toBeNull();
    expect(creditAvailable(false, 100_000, 40_000)).toBe(60_000);
  });
});
