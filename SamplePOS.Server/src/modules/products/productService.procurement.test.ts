/**
 * Procurement search — honest purchase UoM for PO lines
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockProductRepo = {
  procurementSearch: jest.fn<MockFn>(),
};

const mockIntegrity = {
  checkProductPurchaseUomIntegrity: jest.fn<MockFn>(),
};

jest.unstable_mockModule('./productRepository.js', () => mockProductRepo);
jest.unstable_mockModule('./uomService.js', () => ({
  bootstrapProductUomsFromCreateInput: jest.fn<MockFn>(),
  validateProductPurchaseUomIntegrity: jest.fn<MockFn>(),
  checkProductPurchaseUomIntegrity: mockIntegrity.checkProductPurchaseUomIntegrity,
}));

const { procurementSearchForPo } = await import('./productService.js');

const mockPool = {} as Pool;

describe('procurementSearchForPo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back effectivePurchaseUomId to null when purchase UoM is invalid', async () => {
    const productId = '4e6994bb-5cf8-42d1-a312-0093f28f9eb6';
    const baseUomId = '97c8b6ea-1d45-48c8-bf5a-2b738051aa15';
    const pktUomId = 'f9c13a3e-7c00-4d5f-9147-55158753c00d';

    mockProductRepo.procurementSearch.mockResolvedValue([
      {
        id: productId,
        name: 'Ritalin 10MG',
        sku: '5551',
        purchaseUomId: pktUomId,
        quantityOnHand: 0,
        reorderLevel: 0,
        reorderQuantity: 0,
        costPrice: 0,
        lastCost: 0,
        trackExpiry: false,
        leadTimeDays: 0,
      },
    ]);

    mockIntegrity.checkProductPurchaseUomIntegrity.mockResolvedValue({
      productId,
      valid: false,
      baseUomId,
      purchaseUomId: pktUomId,
      effectivePoUomId: null,
      missingProductUomsRow: true,
      missingConversionPath: true,
    });

    const results = await procurementSearchForPo('ritalin', null, 20, mockPool);

    expect(results[0].purchaseUomIncomplete).toBe(true);
    expect(results[0].effectivePurchaseUomId).toBeNull();
    expect(results[0].baseUomId).toBe(baseUomId);
  });

  it('returns effectivePurchaseUomId when purchase UoM is valid', async () => {
    const productId = 'p1';
    const baseUomId = 'base-1';
    const packUomId = 'pack-1';

    mockProductRepo.procurementSearch.mockResolvedValue([
      {
        id: productId,
        name: 'Valid',
        sku: 'V1',
        purchaseUomId: packUomId,
        quantityOnHand: 10,
        reorderLevel: 5,
        reorderQuantity: 1,
        costPrice: 100,
        lastCost: 100,
        trackExpiry: false,
        leadTimeDays: 0,
      },
    ]);

    mockIntegrity.checkProductPurchaseUomIntegrity.mockResolvedValue({
      productId,
      valid: true,
      baseUomId,
      purchaseUomId: packUomId,
      effectivePoUomId: packUomId,
    });

    const results = await procurementSearchForPo('valid', null, 20, mockPool);

    expect(results[0].purchaseUomIncomplete).toBe(false);
    expect(results[0].effectivePurchaseUomId).toBe(packUomId);
  });
});
