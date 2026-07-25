import { describe, expect, it } from 'vitest';
import { allocateVoidQuantity, isServerOrderItemId } from './restaurantVoidQuantity';

describe('allocateVoidQuantity (Toast/Samba partial void)', () => {
  it('voids 1 from a single qty=3 row', () => {
    expect(allocateVoidQuantity([{ id: 'a', quantity: 3 }], 1)).toEqual([
      { itemId: 'a', quantity: 1 },
    ]);
  });

  it('voids across unit rows first', () => {
    expect(
      allocateVoidQuantity(
        [
          { id: 'big', quantity: 5 },
          { id: 'unit', quantity: 1 },
        ],
        2,
      ),
    ).toEqual([
      { itemId: 'unit', quantity: 1 },
      { itemId: 'big', quantity: 1 },
    ]);
  });

  it('throws when asking for more than on hand', () => {
    expect(() => allocateVoidQuantity([{ id: 'a', quantity: 2 }], 3)).toThrow(/only 2/);
  });

  it('detects server UUID line ids', () => {
    expect(isServerOrderItemId('b52111c8-f1df-4c8d-be39-752c7a1f66e1')).toBe(true);
    expect(isServerOrderItemId('ofl_line_abc')).toBe(false);
  });
});
