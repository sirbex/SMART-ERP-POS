/**
 * Quotation → sale MUoM: verifies base quantity used for FEFO (mocked).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Decimal from 'decimal.js';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockResolveSaleItemUom = jest.fn<MockFn>();

jest.unstable_mockModule('../products/uomService.js', () => ({
  resolveSaleItemUom: mockResolveSaleItemUom,
}));

const { buildQuoteConversionLineSnapshots } = await import('./quotationSaleUom.js');

describe('buildQuoteConversionLineSnapshots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves base quantity per quote line for stock deduction', async () => {
    mockResolveSaleItemUom.mockResolvedValue({
      baseQuantity: 120,
      conversionFactor: 10,
      baseUomId: 'uom-pc',
      sellingUomId: 'uom-box',
    });

    const client = {};
    const snapshots = await buildQuoteConversionLineSnapshots(client, [
      { productId: 'p1', quantity: 12, uomId: 'uom-box' },
    ]);

    expect(snapshots[0].baseQuantity).toBe(120);
    expect(snapshots[0].deductQuantity.toNumber()).toBe(120);
  });
});
