/**
 * Product update — blocks save when purchase_uom_id is configured but MUoM graph is incomplete.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockProductRepo = {
  findProductById: jest.fn<MockFn>(),
  findProductBySku: jest.fn<MockFn>(),
  updateProduct: jest.fn<MockFn>(),
};

const mockUomRepo = {
  getProductPurchaseUomContext: jest.fn<MockFn>(),
};

const mockValidate = jest.fn<MockFn>();

jest.unstable_mockModule('./productRepository.js', () => mockProductRepo);
jest.unstable_mockModule('./uomRepository.js', () => mockUomRepo);
jest.unstable_mockModule('./uomService.js', () => ({
  bootstrapProductUomsFromCreateInput: jest.fn<MockFn>(),
  validateProductPurchaseUomIntegrity: mockValidate,
  checkProductPurchaseUomIntegrity: jest.fn<MockFn>(),
}));

jest.unstable_mockModule('../../services/pricingService.js', () => ({
  onCostChange: jest.fn<MockFn>(),
}));

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
  UnitOfWork: {
    run: async (_pool: unknown, fn: (client: PoolClient) => Promise<unknown>) => fn({} as PoolClient),
  },
}));

const { updateProduct } = await import('./productService.js');

const productId = '4e6994bb-5cf8-42d1-a312-0093f28f9eb6';
const pktUomId = 'f9c13a3e-7c00-4d5f-9147-55158753c00d';
const mockPool = {} as Pool;

describe('updateProduct MUoM integrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProductRepo.findProductById.mockResolvedValue({
      id: productId,
      sku: '5551',
      purchaseUomId: pktUomId,
      costPrice: 10,
      sellingPrice: 20,
    });
    mockProductRepo.updateProduct.mockResolvedValue({ id: productId, sku: '5551' });
    mockValidate.mockResolvedValue({});
  });

  it('validates purchase UoM when existing product has purchase_uom_id even if payload omits it', async () => {
    await updateProduct(productId, { costPrice: 11 }, mockPool);
    expect(mockValidate).toHaveBeenCalledWith(productId, expect.anything());
  });

  it('validates when purchaseUomId is explicitly set on update', async () => {
    await updateProduct(productId, { purchaseUomId: pktUomId }, mockPool);
    expect(mockValidate).toHaveBeenCalledWith(productId, expect.anything());
  });

  it('skips validation when product has no purchase UoM', async () => {
    mockProductRepo.findProductById.mockResolvedValue({
      id: productId,
      sku: '5551',
      purchaseUomId: null,
    });
    await updateProduct(productId, { costPrice: 11 }, mockPool);
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('propagates validation failure from validateProductPurchaseUomIntegrity', async () => {
    mockValidate.mockRejectedValue(new Error('Purchase UoM "PKT" is not configured'));
    await expect(updateProduct(productId, { costPrice: 11 }, mockPool)).rejects.toThrow(/not configured/i);
  });
});
