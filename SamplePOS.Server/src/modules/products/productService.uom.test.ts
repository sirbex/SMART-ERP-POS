/**
 * Product create — MUoM bootstrap on create (Quick Add / API)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockRepo = {
  listProductUoms: jest.fn<MockFn>(),
  listUoms: jest.fn<MockFn>(),
  createProductUom: jest.fn<MockFn>(),
  setProductBaseUomId: jest.fn<MockFn>(),
  getUomById: jest.fn<MockFn>(),
  deleteItemUomConversionBySource: jest.fn<MockFn>(),
  upsertItemUomConversion: jest.fn<MockFn>(),
  listItemUomConversions: jest.fn<MockFn>(),
  getProductBaseUomId: jest.fn<MockFn>(),
};

jest.unstable_mockModule('./uomRepository.js', () => mockRepo);

const { bootstrapProductUomsFromCreateInput } = await import('./uomService.js');

const baseUomId = 'aaaaaaaa-0000-4000-8000-000000000001';
const packUomId = 'bbbbbbbb-0000-4000-8000-000000000002';
const productId = 'cccccccc-0000-4000-8000-000000000003';
const mockClient = {} as PoolClient;

describe('bootstrapProductUomsFromCreateInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let baseUomSet = false;
    mockRepo.listProductUoms.mockResolvedValue([]);
    mockRepo.listUoms.mockResolvedValue([
      { id: baseUomId, name: 'TABLET', symbol: 'TAB', type: 'QUANTITY' },
      { id: packUomId, name: 'BOX', symbol: 'BOX', type: 'QUANTITY' },
    ]);
    mockRepo.getUomById.mockImplementation(async (id: unknown) => {
      if (id === baseUomId) return { id: baseUomId, name: 'TABLET', symbol: 'TAB', type: 'QUANTITY' };
      if (id === packUomId) return { id: packUomId, name: 'BOX', symbol: 'BOX', type: 'QUANTITY' };
      return null;
    });
    mockRepo.createProductUom.mockResolvedValue({ id: 'pu-1' });
    mockRepo.getProductBaseUomId.mockImplementation(async () => (baseUomSet ? baseUomId : null));
    mockRepo.setProductBaseUomId.mockImplementation(async () => {
      baseUomSet = true;
    });
    mockRepo.listItemUomConversions.mockResolvedValue([]);
  });

  it('creates base stock UoM row from unitOfMeasure on product create', async () => {
    await bootstrapProductUomsFromCreateInput(
      productId,
      { unitOfMeasure: 'TABLET', conversionFactor: 1 },
      mockClient,
    );

    expect(mockRepo.createProductUom).toHaveBeenCalledWith(
      expect.objectContaining({
        productId,
        uomId: baseUomId,
        conversionFactor: 1,
        isDefault: true,
      }),
      mockClient,
    );
    expect(mockRepo.setProductBaseUomId).toHaveBeenCalledWith(productId, baseUomId, mockClient);
  });

  it('creates purchase UoM conversion when purchaseUomId differs from base', async () => {
    await bootstrapProductUomsFromCreateInput(
      productId,
      {
        unitOfMeasure: 'TABLET',
        purchaseUomId: packUomId,
        conversionFactor: 12,
      },
      mockClient,
    );

    expect(mockRepo.createProductUom).toHaveBeenCalledTimes(2);
    expect(mockRepo.createProductUom).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        productId,
        uomId: packUomId,
        conversionFactor: 12,
        isDefault: false,
      }),
      mockClient,
    );
  });

  it('skips bootstrap when product already has UoM rows', async () => {
    mockRepo.listProductUoms.mockResolvedValue([{ id: 'existing' }]);

    await bootstrapProductUomsFromCreateInput(
      productId,
      { unitOfMeasure: 'TABLET', purchaseUomId: packUomId, conversionFactor: 12 },
      mockClient,
    );

    expect(mockRepo.createProductUom).not.toHaveBeenCalled();
  });
});
