import { describe, it, expect } from 'vitest';
import { filterSpecialStoresWithStock } from './warehouseNetworkUtils';
import type { StoreLocation } from '../../../../shared/types/warehouseNetwork';

function store(id: string, storeType: StoreLocation['storeType']): StoreLocation {
  return {
    id,
    code: storeType,
    name: storeType,
    storeType,
    isActive: true,
    isDefaultReceiving: false,
    isPosSelling: false,
    parentStoreId: null,
    notes: null,
    createdAt: '',
    updatedAt: '',
  };
}

describe('filterSpecialStoresWithStock', () => {
  it('hides special stores with zero qty', () => {
    const returnStore = store('r1', 'RETURN');
    const damageStore = store('d1', 'DAMAGE');
    const qty = new Map([
      ['r1', 3],
      ['d1', 0],
    ]);
    const visible = filterSpecialStoresWithStock([returnStore, damageStore], qty);
    expect(visible.map((s) => s.id)).toEqual(['r1']);
  });

  it('shows none when all special stores are empty', () => {
    const transit = store('t1', 'TRANSIT');
    expect(filterSpecialStoresWithStock([transit], new Map())).toEqual([]);
  });
});
