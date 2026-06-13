/**
 * Delivery note MUoM — mocked uomService resolution.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { PoolClient } from 'pg';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockResolveSaleItemUom = jest.fn<MockFn>();

jest.unstable_mockModule('../products/uomService.js', () => ({
  resolveSaleItemUom: mockResolveSaleItemUom,
}));

const { resolveDeliveryLineBaseQuantity } = await import('./deliveryNoteUom.js');

const mockClient = {} as PoolClient;

describe('resolveDeliveryLineBaseQuantity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates to resolveSaleItemUom and returns base snapshot', async () => {
    mockResolveSaleItemUom.mockResolvedValue({
      baseQuantity: 24,
      conversionFactor: 12,
      baseUomId: 'base-uom',
      sellingUomId: 'box-uom',
    });

    const result = await resolveDeliveryLineBaseQuantity(mockClient, 'prod-1', 2, 'box-uom');

    expect(mockResolveSaleItemUom).toHaveBeenCalledWith(
      'prod-1',
      { quantity: 2, uomId: 'box-uom' },
      mockClient,
    );
    expect(result.baseQuantity).toBe(24);
    expect(result.conversionFactor).toBe(12);
  });
});
