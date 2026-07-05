import { describe, expect, it } from 'vitest';
import {
  deriveStatusAfterApproval,
  deriveStatusAfterDispatch,
  deriveStatusAfterReceive,
  effectiveApprovedQty,
  remainingToDispatch,
} from '../../../shared/utils/transferNegotiation.ts';

describe('transferNegotiation', () => {
  it('derives partial approval when sugar approved below request', () => {
    const lines = [
      { quantity: 10, quantityApproved: 10, quantityDispatched: 0, quantityReceived: 0 },
      { quantity: 5, quantityApproved: 3, quantityDispatched: 0, quantityReceived: 0 },
      { quantity: 20, quantityApproved: 0, quantityDispatched: 0, quantityReceived: 0 },
    ];
    expect(deriveStatusAfterApproval(lines)).toBe('PARTIALLY_APPROVED');
  });

  it('derives partial dispatch when loaded less than approved', () => {
    const lines = [
      {
        quantity: 10,
        quantityApproved: 10,
        quantityDispatched: 8,
        quantityReceived: 0,
      },
    ];
    expect(deriveStatusAfterDispatch(lines)).toBe('PARTIALLY_DISPATCHED');
    expect(remainingToDispatch(lines[0])).toBe(2);
    expect(effectiveApprovedQty(lines[0])).toBe(10);
  });

  it('derives cancelled when all lines approved at zero', () => {
    const lines = [
      { quantity: 10, quantityApproved: 0, quantityDispatched: 0, quantityReceived: 0 },
      { quantity: 5, quantityApproved: 0, quantityDispatched: 0, quantityReceived: 0 },
    ];
    expect(deriveStatusAfterApproval(lines)).toBe('CANCELLED');
  });

  it('derives partial receive with shortage', () => {
    const lines = [
      {
        quantity: 10,
        quantityApproved: 10,
        quantityDispatched: 8,
        quantityReceived: 7,
      },
    ];
    expect(deriveStatusAfterReceive(lines)).toBe('PARTIALLY_RECEIVED');
  });
});
