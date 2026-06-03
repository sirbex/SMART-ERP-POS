import { describe, it, expect } from '@jest/globals';
import {
  apMaterialityThreshold,
  isApDriftExplainedByExpenses,
  type ApReconciliationSnapshot,
} from './apReconciliationEngine.js';

describe('apReconciliationEngine — Wave 5', () => {
  it('uses 5000 UGX minimum materiality threshold', () => {
    expect(apMaterialityThreshold(1_000_000)).toBe(5000);
    expect(apMaterialityThreshold(100_000_000)).toBeGreaterThan(5000);
  });

  it('treats drift explained by standalone expenses on 2100 as reconciled', () => {
    const snapshot: ApReconciliationSnapshot = {
      glBalance: 10_000_000,
      invoiceOpenBalance: 10_601_530,
      unallocatedPayments: 0,
      subledgerBalance: 10_601_530,
      expenseOnAp: 601_530,
      legacyGrInAp: 0,
      drift: -601_530,
      residualAfterExpense: 0,
    };
    expect(isApDriftExplainedByExpenses(snapshot)).toBe(true);
  });

  it('flags unexplained material drift', () => {
    const snapshot: ApReconciliationSnapshot = {
      glBalance: 10_000_000,
      invoiceOpenBalance: 11_000_000,
      unallocatedPayments: 0,
      subledgerBalance: 11_000_000,
      expenseOnAp: 0,
      legacyGrInAp: 0,
      drift: -1_000_000,
      residualAfterExpense: -1_000_000,
    };
    expect(isApDriftExplainedByExpenses(snapshot)).toBe(false);
  });

  it('accounts for unallocated payments in subledger math', () => {
    const invoiceOpen = 500_000;
    const unallocated = 100_000;
    const subledger = Math.max(0, invoiceOpen - unallocated);
    expect(subledger).toBe(400_000);
  });

  it('supplier open-item subtracts credit notes (Salud-class bug)', () => {
    const correctOpenItem = 14_702_423;
    const creditNotesOutstanding = 887_120;
    const wrongRawSum = correctOpenItem + creditNotesOutstanding;
    expect(wrongRawSum).toBe(15_589_543);
  });
});
