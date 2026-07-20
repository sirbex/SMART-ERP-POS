/**
 * Unit proof: quotation content hash + terminal-status duplicate policy.
 */
import {
  computeContentHash,
  TERMINAL_CONTENT_HASH_STATUSES,
} from './quotationContentHash.js';

const line = {
  productId: 'p1',
  description: 'Paracetamol 500mg',
  quantity: 2,
  unitPrice: 1000,
};

describe('computeContentHash (BR-QUOTE-012)', () => {
  it('same customer+lines → same hash', () => {
    const a = computeContentHash('cust-1', 'Alice', [line]);
    const b = computeContentHash('cust-1', 'Alice', [line]);
    expect(a).toBe(b);
  });

  it('different UOM → different hash (false duplicate fix)', () => {
    const box = computeContentHash('cust-1', null, [{ ...line, uomName: 'Box' }]);
    const each = computeContentHash('cust-1', null, [{ ...line, uomName: 'Each' }]);
    expect(box).not.toBe(each);
  });

  it('different discount → different hash', () => {
    const full = computeContentHash('cust-1', null, [{ ...line, discountAmount: 0 }]);
    const disc = computeContentHash('cust-1', null, [{ ...line, discountAmount: 100 }]);
    expect(full).not.toBe(disc);
  });

  it('walk-in with different phones → different hash', () => {
    const a = computeContentHash(null, 'Walk-in Customer', [line], '+256700111222');
    const b = computeContentHash(null, 'Walk-in Customer', [line], '+256700333444');
    expect(a).not.toBe(b);
  });

  it('terminal statuses include EXPIRED and REJECTED (must not block recreate)', () => {
    expect(TERMINAL_CONTENT_HASH_STATUSES).toEqual(
      expect.arrayContaining(['EXPIRED', 'REJECTED', 'CONVERTED', 'CANCELLED']),
    );
  });
});
