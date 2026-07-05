import { describe, it, expect, jest, beforeEach } from '@jest/globals';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockGetCustomerPricingMode = jest.fn<MockFn>();
const mockGetFinalPricesBulk = jest.fn<MockFn>();
const mockResolveSaleItemUom = jest.fn<MockFn>();

jest.unstable_mockModule('../pricing/pricingRepository.js', () => ({
  getCustomerPricingMode: mockGetCustomerPricingMode,
}));

jest.unstable_mockModule('../pricing/pricingEngineService.js', () => ({
  getFinalPricesBulk: mockGetFinalPricesBulk,
}));

jest.unstable_mockModule('../products/uomService.js', () => ({
  resolveSaleItemUom: mockResolveSaleItemUom,
}));

const { repriceSaleItemsForAtCostCustomer, isAtCostCustomer } = await import('./orderAtCostPricing.js');

const pool = {} as never;

describe('orderAtCostPricing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveSaleItemUom.mockResolvedValue({
      baseUomId: 'base-uom',
      sellingUomId: null,
      conversionFactor: 1,
      baseQuantity: 2,
    });
  });

  it('passes through unchanged for non-AT_COST customers', async () => {
    mockGetCustomerPricingMode.mockResolvedValue('STANDARD');
    const items = [
      { productId: 'p1', productName: 'Test', quantity: 2, unitPrice: 1050 },
    ];

    const result = await repriceSaleItemsForAtCostCustomer(pool, items, 'cust-1');

    expect(result.hasDrift).toBe(false);
    expect(result.repricedItems[0].unitPrice).toBe(1050);
    expect(mockGetFinalPricesBulk).not.toHaveBeenCalled();
  });

  it('reprices AT_COST lines to FEFO and flags drift (Safelevo scenario)', async () => {
    mockGetCustomerPricingMode.mockResolvedValue('AT_COST');
    mockGetFinalPricesBulk.mockResolvedValue([
      {
        finalPrice: 1300,
        appliedRule: { scope: 'at_cost', ruleName: 'At Cost (FIFO issue)' },
        atCostLayers: [{ baseQuantity: 2, unitCostPerBase: 1300, totalCost: 2600 }],
      },
    ]);

    const items = [
      {
        productId: 'ebadc2e2-6cda-4727-a780-65006d6fef86',
        productName: 'Safelevo 750mg',
        quantity: 2,
        unitPrice: 1050,
      },
    ];

    const result = await repriceSaleItemsForAtCostCustomer(pool, items, 'at-cost-cust');

    expect(result.hasDrift).toBe(true);
    expect(result.repricedItems[0].unitPrice).toBe(1300);
    expect(result.preview[0]).toMatchObject({
      orderUnitPrice: 1050,
      fefoUnitPrice: 1300,
      priceDrift: true,
    });
    expect(mockGetFinalPricesBulk).toHaveBeenCalledWith(
      [{ productId: items[0].productId, quantity: 2, baseQuantity: 2 }],
      'at-cost-cust',
      undefined,
      pool,
    );
  });

  it('isAtCostCustomer returns true only for AT_COST mode', async () => {
    mockGetCustomerPricingMode.mockResolvedValue('AT_COST');
    expect(await isAtCostCustomer(pool, 'c1')).toBe(true);

    mockGetCustomerPricingMode.mockResolvedValue('STANDARD');
    expect(await isAtCostCustomer(pool, 'c1')).toBe(false);

    expect(await isAtCostCustomer(pool, null)).toBe(false);
  });
});
