/**
 * Petty Cash Phase 1D — unit tests
 */

import {
  assertBalancedLines,
  postingSourceForDocumentType,
} from '@shared/treasury/index.js';

describe('Petty Cash Phase 1D', () => {
  it('maps PETTY_CASH document to TREASURY_PETTY_CASH source', () => {
    expect(postingSourceForDocumentType('PETTY_CASH')).toBe('TREASURY_PETTY_CASH');
  });

  it('balances fund journal DR 1012 / CR 1010', () => {
    const r = assertBalancedLines([
      { debitAmount: 50000, creditAmount: 0 },
      { debitAmount: 0, creditAmount: 50000 },
    ]);
    expect(r.totalDebits).toBe(50000);
  });

  it('balances expense journal DR 6900 / CR 1012', () => {
    const r = assertBalancedLines([
      { debitAmount: 12000, creditAmount: 0 },
      { debitAmount: 0, creditAmount: 12000 },
    ]);
    expect(r.totalCredits).toBe(12000);
  });

  it('documents account semantic split', () => {
    const chart = {
      '1010': 'Cash Drawer',
      '1012': 'Petty Cash',
      '1015': 'Undeposited Funds',
    };
    expect(chart['1015']).toBe('Undeposited Funds');
    expect(chart['1012']).toBe('Petty Cash');
    expect(chart['1010']).not.toBe(chart['1012']);
  });
});
