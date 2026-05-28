/**
 * UoM service — base stock UoM bootstrap (legacy + first-add)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockRepo = {
  getUomById: jest.fn<MockFn>().mockResolvedValue({ id: 'uom-1', name: 'PIECE' }),
  getProductBaseUomId: jest.fn<MockFn>(),
  listProductUoms: jest.fn<MockFn>(),
  setProductUomAsBase: jest.fn<MockFn>(),
  unsetDefaultForProduct: jest.fn<MockFn>(),
  createProductUom: jest.fn<MockFn>(),
  deleteItemUomConversionBySource: jest.fn<MockFn>(),
  upsertItemUomConversion: jest.fn<MockFn>(),
  listItemUomConversions: jest.fn<MockFn>(),
  setProductBaseUomId: jest.fn<MockFn>(),
};

jest.unstable_mockModule('./uomRepository.js', () => mockRepo);

jest.unstable_mockModule('../audit/auditService.js', () => ({
  logUomPriceOverride: jest.fn<MockFn>(),
}));

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
  UnitOfWork: {
    run: async (_pool: unknown, fn: (client: unknown) => Promise<unknown>) => fn({}),
  },
}));

const { addProductUom } = await import('./uomService.js');

const mockPool = {} as Pool;

describe('uomService.addProductUom base UoM', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.getProductBaseUomId.mockResolvedValue(null);
    mockRepo.listProductUoms.mockResolvedValue([]);
    mockRepo.createProductUom.mockResolvedValue({
      id: 'a0000000-0000-4000-8000-000000000001',
      productId: '099172ce-f327-4e1f-8ce4-b10e61d5bc50',
      uomId: 'b0000000-0000-4000-8000-000000000002',
      conversionFactor: '12',
      isDefault: false,
    });
    mockRepo.listItemUomConversions.mockResolvedValue([]);
    mockRepo.upsertItemUomConversion.mockResolvedValue({});
  });

  it('treats first UoM as base when client omits isDefault', async () => {
    await addProductUom(
      {
        productId: '099172ce-f327-4e1f-8ce4-b10e61d5bc50',
        uomId: 'c0000000-0000-4000-8000-000000000003',
        conversionFactor: 1,
        isDefault: false,
      },
      undefined,
      mockPool,
    );

    expect(mockRepo.createProductUom).toHaveBeenCalledWith(
      expect.objectContaining({
        isDefault: true,
        conversionFactor: 1,
      }),
      expect.anything(),
    );
    expect(mockRepo.setProductBaseUomId).toHaveBeenCalledWith(
      '099172ce-f327-4e1f-8ce4-b10e61d5bc50',
      'c0000000-0000-4000-8000-000000000003',
      expect.anything(),
    );
  });

  it('repairs legacy product_uoms then adds conversion UoM', async () => {
    mockRepo.getProductBaseUomId
      .mockResolvedValueOnce(null)
      .mockResolvedValue('c0000000-0000-4000-8000-000000000003');
    mockRepo.listProductUoms
      .mockResolvedValueOnce([
        {
          id: 'd0000000-0000-4000-8000-000000000004',
          productId: '099172ce-f327-4e1f-8ce4-b10e61d5bc50',
          uomId: 'c0000000-0000-4000-8000-000000000003',
          uomName: 'PIECE',
          conversionFactor: '1',
          isDefault: false,
        },
      ])
      .mockResolvedValue([]);

    await addProductUom(
      {
        productId: '099172ce-f327-4e1f-8ce4-b10e61d5bc50',
        uomId: 'b0000000-0000-4000-8000-000000000002',
        conversionFactor: 12,
        isDefault: false,
      },
      undefined,
      mockPool,
    );

    expect(mockRepo.setProductUomAsBase).toHaveBeenCalledWith(
      '099172ce-f327-4e1f-8ce4-b10e61d5bc50',
      'd0000000-0000-4000-8000-000000000004',
      'c0000000-0000-4000-8000-000000000003',
      expect.anything(),
    );
    expect(mockRepo.createProductUom).toHaveBeenCalledWith(
      expect.objectContaining({
        uomId: 'b0000000-0000-4000-8000-000000000002',
        isDefault: false,
        conversionFactor: 12,
      }),
      expect.anything(),
    );
  });
});
