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
  });

  it('does not require confirm when amount unchanged and nothing allocated', async () => {
    const pool = mockPool([
      [{ total_amount: 1_000_000 }],
      [{ total: 0 }],
      [{ total: 0 }],
    ]);

    const impact = await assessCustomerObReplaceImpact(pool, 'cust-1', 'ob-1', 1_000_000);
    expect(impact.requiresConfirmation).toBe(false);
    expect(impact.projectedSurplusOnAccount).toBe(0);
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

    // Must not proceed to cancel/create — only the 4 assessment queries
    expect((pool as unknown as { query: jest.Mock }).query).toHaveBeenCalledTimes(4);
  });

  it('BusinessError code is the UI handshake', () => {
    const err = new BusinessError('confirm', 'OB_REPLACE_CONFIRM_REQUIRED', { projectedSurplusOnAccount: 1 });
    expect(err.errorCode).toBe('OB_REPLACE_CONFIRM_REQUIRED');
  });
});
