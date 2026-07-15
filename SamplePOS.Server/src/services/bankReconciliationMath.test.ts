import { describe, expect, it } from '@jest/globals';
import {
  computeClearedBalance,
  computeReconciliationDifference,
  isReconciliationBalanced,
  signedBankReconAmount,
} from './bankReconciliationMath.js';

describe('bankReconciliationMath', () => {
  it('signs deposits positive and withdrawals negative', () => {
    expect(signedBankReconAmount('DEPOSIT', 1000)).toBe(1000);
    expect(signedBankReconAmount('TRANSFER_IN', 500)).toBe(500);
    expect(signedBankReconAmount('INTEREST', 25)).toBe(25);
    expect(signedBankReconAmount('WITHDRAWAL', 200)).toBe(-200);
    expect(signedBankReconAmount('TRANSFER_OUT', 50)).toBe(-50);
    expect(signedBankReconAmount('FEE', 10)).toBe(-10);
  });

  it('cleared = last reconciled + selected net (never-reconciled starts at 0)', () => {
    expect(computeClearedBalance(undefined, [])).toBe(0);
    expect(computeClearedBalance(null, [{ type: 'DEPOSIT', amount: 1_000_000 }])).toBe(1_000_000);
    expect(
      computeClearedBalance(5_000_000, [
        { type: 'DEPOSIT', amount: 500_000 },
        { type: 'WITHDRAWAL', amount: 200_000 },
        { type: 'FEE', amount: 5_000 },
      ]),
    ).toBe(5_295_000);
  });

  it('difference is zero when statement matches cleared', () => {
    const cleared = computeClearedBalance(10_000_000, [
      { type: 'DEPOSIT', amount: 1_000_000 },
      { type: 'WITHDRAWAL', amount: 250_000 },
    ]);
    expect(cleared).toBe(10_750_000);
    expect(computeReconciliationDifference(10_750_000, cleared)).toBe(0);
    expect(isReconciliationBalanced(0)).toBe(true);
  });

  it('flags inconsistency when statement does not match cleared', () => {
    const cleared = computeClearedBalance(0, [{ type: 'DEPOSIT', amount: 100 }]);
    const diff = computeReconciliationDifference(150, cleared);
    expect(diff).toBe(50);
    expect(isReconciliationBalanced(diff)).toBe(false);
  });

  it('treats last reconciled of exactly 0 as a real opening (not null)', () => {
    expect(computeClearedBalance(0, [{ type: 'DEPOSIT', amount: 100 }])).toBe(100);
  });
});
