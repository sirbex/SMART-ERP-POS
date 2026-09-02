import { describe, expect, it } from '@jest/globals';
import {
  availableFromPostedTotals,
  postedLedgerBalanceLateral,
} from './postedLedgerBalance.js';

describe('postedLedgerBalance', () => {
  it('availableFromPostedTotals respects normal balance side', () => {
    expect(availableFromPostedTotals(100, 30, 'DEBIT')).toBe(70);
    expect(availableFromPostedTotals(100, 30, 'CREDIT')).toBe(-70);
  });

  it('postedLedgerBalanceLateral embeds date param when provided', () => {
    expect(postedLedgerBalanceLateral('$2')).toContain('$2');
    expect(postedLedgerBalanceLateral('$2')).toContain('ReversedByTransactionId');
    expect(postedLedgerBalanceLateral()).not.toContain('$2');
  });
});
