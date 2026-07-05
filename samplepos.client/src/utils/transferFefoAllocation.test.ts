import { describe, expect, it } from 'vitest';
import { allocateTransferQuantityFefo } from './transferFefoAllocation';
import type { TransferLotSearchResult } from '../components/inventory/TransferLotSearch';

function lot(id: string, qty: number): TransferLotSearchResult {
  return {
    productLotId: id,
    lotNumber: `LOT-${id}`,
    productId: 'prod-1',
    productName: 'Test',
    availableQuantity: qty,
    expiryDate: null,
  };
}

describe('allocateTransferQuantityFefo', () => {
  it('allocates from earliest lots first', () => {
    const { lines, shortfall } = allocateTransferQuantityFefo(
      [lot('a', 5), lot('b', 10)],
      8,
    );
    expect(shortfall).toBe(0);
    expect(lines).toEqual([
      { productLotId: 'a', quantity: 5, lot: lot('a', 5) },
      { productLotId: 'b', quantity: 3, lot: lot('b', 10) },
    ]);
  });

  it('reports shortfall when insufficient stock', () => {
    const { lines, shortfall } = allocateTransferQuantityFefo([lot('a', 2)], 5);
    expect(lines).toEqual([{ productLotId: 'a', quantity: 2, lot: lot('a', 2) }]);
    expect(shortfall).toBe(3);
  });
});
