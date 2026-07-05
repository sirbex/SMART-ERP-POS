import { describe, it, expect } from 'vitest';
import {
  findSameExpiryDifferentCostBatches,
  normalizeExpiryDate,
} from '@/utils/grFefoExpiryWarning';

describe('grFefoExpiryWarning', () => {
  it('normalizeExpiryDate trims to YYYY-MM-DD', () => {
    expect(normalizeExpiryDate('2027-07-29T21:00:00.000Z')).toBe('2027-07-29');
  });

  it('flags batches with same expiry but different cost', () => {
    const hits = findSameExpiryDifferentCostBatches(
      [
        {
          batchNumber: 'IMP-INIT',
          expiryDate: '2027-07-29',
          costPrice: 1300,
          remainingQuantity: 2,
        },
        {
          batchNumber: 'MAIN',
          expiryDate: '2027-08-01',
          costPrice: 1200,
          remainingQuantity: 5,
        },
      ],
      '2027-07-29',
      1050,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].batchNumber).toBe('IMP-INIT');
  });

  it('ignores batches with matching cost', () => {
    const hits = findSameExpiryDifferentCostBatches(
      [{ expiryDate: '2027-07-29', costPrice: 1050, remainingQuantity: 2 }],
      '2027-07-29',
      1050,
    );
    expect(hits).toHaveLength(0);
  });
});
