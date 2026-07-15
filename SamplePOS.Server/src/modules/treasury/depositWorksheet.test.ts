/**
 * Deposit Worksheet invariants — Phase 1B unit tests (TD-INV-4 / TD-INV-5)
 */

import {
  assertBalancedLines,
  assertDepositConsumesUnsettled,
  assertSettlementCeiling,
  TreasuryInvariantError,
} from '@shared/treasury/index.js';

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error(`Expected ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TreasuryInvariantError);
    expect((err as TreasuryInvariantError).code).toBe(code);
  }
}

describe('Deposit Worksheet invariants (Phase 1B)', () => {
  describe('TD-INV-4 settlement ceiling', () => {
    it('allows apply within residual', () => {
      expect(() =>
        assertSettlementCeiling({ applyAmount: 400, residualAmount: 1000 }),
      ).not.toThrow();
    });

    it('rejects over-apply', () => {
      expectCode(
        () => assertSettlementCeiling({ applyAmount: 1001, residualAmount: 1000, sourceLabel: 'CRP-1' }),
        'TD_INV_4_EXCEEDS',
      );
    });
  });

  describe('TD-INV-5 unsettled only', () => {
    it('allows UNSETTLED and PARTIALLY_SETTLED with residual', () => {
      expect(() =>
        assertDepositConsumesUnsettled({
          settlementStatus: 'UNSETTLED',
          residualAmount: 500,
        }),
      ).not.toThrow();
      expect(() =>
        assertDepositConsumesUnsettled({
          settlementStatus: 'PARTIALLY_SETTLED',
          residualAmount: 100,
        }),
      ).not.toThrow();
    });

    it('rejects SETTLED / zero residual', () => {
      expectCode(
        () =>
          assertDepositConsumesUnsettled({
            settlementStatus: 'SETTLED',
            residualAmount: 0,
          }),
        'TD_INV_5_FULLY_SETTLED',
      );
      expectCode(
        () =>
          assertDepositConsumesUnsettled({
            settlementStatus: 'SETTLED',
            residualAmount: 50,
          }),
        'TD_INV_5_BAD_STATUS',
      );
    });
  });

  describe('deposit journal shapes', () => {
    it('balances full deposit', () => {
      const result = assertBalancedLines([
        { debitAmount: 1000, creditAmount: 0 },
        { debitAmount: 0, creditAmount: 600 },
        { debitAmount: 0, creditAmount: 400 },
      ]);
      expect(result.totalDebits).toBe(1000);
    });

    it('balances deposit with shortage', () => {
      const result = assertBalancedLines([
        { debitAmount: 950, creditAmount: 0 }, // bank
        { debitAmount: 50, creditAmount: 0 }, // shortage
        { debitAmount: 0, creditAmount: 1000 }, // undeposited
      ]);
      expect(result.totalDebits).toBe(1000);
      expect(result.totalCredits).toBe(1000);
    });

    it('balances deposit with overage', () => {
      const result = assertBalancedLines([
        { debitAmount: 1050, creditAmount: 0 }, // bank
        { debitAmount: 0, creditAmount: 1000 }, // undeposited
        { debitAmount: 0, creditAmount: 50 }, // overage income
      ]);
      expect(result.totalDebits).toBe(1050);
    });
  });
});
