import { describe, it, expect } from '@jest/globals';
import { deriveArPaymentAllocationStatus } from './arPaymentRepository.js';

describe('deriveArPaymentAllocationStatus', () => {
  it('returns POSTED when nothing is allocated (after full reverse)', () => {
    expect(deriveArPaymentAllocationStatus(0, 1_000_000)).toBe('POSTED');
    expect(deriveArPaymentAllocationStatus(0.001, 999_999.999)).toBe('POSTED');
  });

  it('returns FULLY_ALLOCATED when unallocated is cleared', () => {
    expect(deriveArPaymentAllocationStatus(1_000_000, 0)).toBe('FULLY_ALLOCATED');
    expect(deriveArPaymentAllocationStatus(500_000, 0.005)).toBe('FULLY_ALLOCATED');
  });

  it('returns PARTIALLY_ALLOCATED when both sides remain', () => {
    expect(deriveArPaymentAllocationStatus(400_000, 600_000)).toBe('PARTIALLY_ALLOCATED');
  });
});
