import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import { BusinessError } from '../../middleware/errorHandler.js';
import {
  assessCustomerObReplaceImpact,
  replaceCustomerOpeningBalance,
} from './customerService.js';

function mockPool(rowsByCall: Array<unknown[]>) {
  let i = 0;
  return {
    query: jest.fn(async () => {
      const rows = rowsByCall[i] ?? [];
      i += 1;
      return { rows, rowCount: rows.length };
    }),
  } as unknown as Pool;
}

describe('assessCustomerObReplaceImpact', () => {
  it('flags surplus when receipts exceed new OB (BOU-class)', async () => {
    const pool = mockPool([
      [{ total_amount: 12_820_715 }], // current OB
      [{ total: 12_820_715 }], // allocated on OB
      [{ total: 0 }], // existing unallocated
      [{ due: 2_000_000 }], // other open invoices
      [{ balance: 3_966_415 }], // customer balance
    ]);

    const impact = await assessCustomerObReplaceImpact(
      pool,
      'cust-1',
      'ob-1',
      5_836_800,
    );

    expect(impact.projectedSurplusOnAccount).toBe(6_983_915);
    expect(impact.mayLeaveCustomerInCredit).toBe(true);
    expect(impact.willUnallocateReceipts).toBe(true);
    expect(impact.requiresConfirmation).toBe(true);
    expect(impact.otherOpenInvoicesDue).toBe(2_000_000);
    expect(impact.currentOutstanding).toBe(3_966_415);
    // max(0, 2_000_000 + 5_836_800 - 12_820_715) = 0
    expect(impact.projectedOutstanding).toBe(0);
  });

  it('does not require confirm when amount unchanged and nothing allocated', async () => {
    const pool = mockPool([
      [{ total_amount: 1_000_000 }],
      [{ total: 0 }],
      [{ total: 0 }],
      [{ due: 0 }],
      [{ balance: 1_000_000 }],
    ]);

    const impact = await assessCustomerObReplaceImpact(pool, 'cust-1', 'ob-1', 1_000_000);
    expect(impact.requiresConfirmation).toBe(false);
    expect(impact.projectedSurplusOnAccount).toBe(0);
  });

  it('increase path target: projected outstanding rises when free cash is zero', async () => {
    // cutover 200k, no cash allocated; add to 250k
    const pool = mockPool([
      [{ total_amount: 200_000 }],
      [{ total: 0 }],
      [{ total: 0 }],
      [{ due: 0 }],
      [{ balance: 200_000 }],
    ]);
    const impact = await assessCustomerObReplaceImpact(pool, 'cust-1', 'ob-1', 250_000);
    expect(impact.projectedOutstanding).toBe(250_000);
    expect(impact.requiresConfirmation).toBe(false);
  });

  it('projects outstanding as other invoices + new OB − free cash', async () => {
    // other inv 200k, new OB 50k, free cash 0 → projected 250k
    const pool = mockPool([
      [{ total_amount: 12_820_715 }],
      [{ total: 0 }],
      [{ total: 0 }],
      [{ due: 200_000 }],
      [{ balance: 200_000 }],
    ]);
    const impact = await assessCustomerObReplaceImpact(pool, 'cust-1', 'ob-1', 50_000);
    expect(impact.otherOpenInvoicesDue).toBe(200_000);
    expect(impact.projectedOutstanding).toBe(250_000);
    expect(impact.amountReduced ?? impact.newObAmount < impact.currentObAmount).toBeTruthy();
  });

  it('stacks free cash: large unalloc can zero projected outstanding', async () => {
    const pool = mockPool([
      [{ total_amount: 100_000 }],
      [{ total: 50_000 }], // allocated on OB
      [{ total: 500_000 }], // already unallocated receipts
      [{ due: 200_000 }],
      [{ balance: 0 }],
    ]);
    // freed = 550k, newOb = 100k → projected = max(0, 200k+100k-550k)=0
    const impact = await assessCustomerObReplaceImpact(pool, 'cust-1', 'ob-1', 100_000);
    expect(impact.projectedOutstanding).toBe(0);
    expect(impact.projectedSurplusOnAccount).toBe(450_000);
    expect(impact.mayLeaveCustomerInCredit).toBe(true);
  });
});

describe('replaceCustomerOpeningBalance confirm gate', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('throws OB_REPLACE_CONFIRM_REQUIRED when impact needs confirm and flag omitted', async () => {
    const pool = mockPool([
      [{ id: 'ob-1' }], // existing OB lookup
      [{ total_amount: 12_820_715 }],
      [{ total: 12_820_715 }],
      [{ total: 0 }],
      [{ due: 0 }],
      [{ balance: 0 }],
    ]);

    await expect(
      replaceCustomerOpeningBalance(pool, {
        customerId: 'cust-1',
        amount: 5_836_800,
        asOfDate: '2026-01-01',
        userId: 'user-1',
        postReason: 'placeholder',
        replaceReason: 'correct amount',
      }),
    ).rejects.toMatchObject({
      errorCode: 'OB_REPLACE_CONFIRM_REQUIRED',
    });

    // assessment queries after existing lookup
    expect((pool as unknown as { query: jest.Mock }).query).toHaveBeenCalledTimes(6);
  });

  it('BusinessError code is the UI handshake', () => {
    const err = new BusinessError('confirm', 'OB_REPLACE_CONFIRM_REQUIRED', { projectedSurplusOnAccount: 1 });
    expect(err.errorCode).toBe('OB_REPLACE_CONFIRM_REQUIRED');
  });
});

describe('increaseCustomerOpeningBalance amount derivation', () => {
  it('rejects when no active cutover', async () => {
    const { increaseCustomerOpeningBalance } = await import('./customerService.js');
    const pool = mockPool([[]]);
    await expect(
      increaseCustomerOpeningBalance(pool, {
        customerId: 'cust-1',
        increaseBy: 50_000,
        asOfDate: '2026-01-01',
        reason: 'add legacy amount from old system',
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({ errorCode: 'OB_INCREASE_NO_ACTIVE_CUTOVER' });
  });
});
