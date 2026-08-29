/**
 * Purchase UoM lifecycle — repoint on rename, transaction atomicity, orphan repair.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockClient = { query: jest.fn<MockFn>() } as unknown as PoolClient;

const mockRepo = {
  getUomById: jest.fn<MockFn>(),
  getProductBaseUomId: jest.fn<MockFn>(),
  listProductUoms: jest.fn<MockFn>(),
  setProductUomAsBase: jest.fn<MockFn>(),
  unsetDefaultForProduct: jest.fn<MockFn>(),
  createProductUom: jest.fn<MockFn>(),
  updateProductUom: jest.fn<MockFn>(),
  getProductUomById: jest.fn<MockFn>(),
  deleteItemUomConversionBySource: jest.fn<MockFn>(),
  deleteAllItemUomConversionsForProduct: jest.fn<MockFn>(),
  upsertItemUomConversion: jest.fn<MockFn>(),
  listItemUomConversions: jest.fn<MockFn>(),
  setProductBaseUomId: jest.fn<MockFn>(),
  setProductPurchaseUomId: jest.fn<MockFn>(),
  getProductPurchaseUomContext: jest.fn<MockFn>(),
  getProductSummary: jest.fn<MockFn>(),
  listOrphanedPurchaseUomProducts: jest.fn<MockFn>(),
  deleteProductUom: jest.fn<MockFn>(),
  getProductOnHandBase: jest.fn<MockFn>(),
};

let transactionShouldCommit = true;

jest.unstable_mockModule('./uomRepository.js', () => mockRepo);

jest.unstable_mockModule('../audit/auditService.js', () => ({
  logUomPriceOverride: jest.fn<MockFn>(),
}));

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
  UnitOfWork: {
    run: async (_pool: unknown, fn: (client: PoolClient) => Promise<unknown>) => {
      if (!transactionShouldCommit) {
        return fn(mockClient);
      }
      return fn(mockClient);
    },
    runOrJoin: async (_handle: unknown, fn: (client: PoolClient) => Promise<unknown>) => {
      if (!transactionShouldCommit) {
        return fn(mockClient);
      }
      return fn(mockClient);
    },
    isPool: (handle: unknown) => typeof (handle as Pool).totalCount === 'number',
  },
}));

const {
  updateProductUom,
  removeProductUom,
  repairOrphanedPurchaseUom,
} = await import('./uomService.js');

const mockPool = { totalCount: 1 } as Pool;

const productId = '98cc5e26-bd41-462d-b072-0e73a2c02229';
const baseUomId = '96f87d23-c3ba-476e-bcc5-40a42a17457b';
const boxUomId = '78bf1928-1113-4208-a688-059ca75a9b7c';
const packetUomId = 'f9c13a3e-7c00-4d5f-9147-55158753c00d';
const stripUomId = 'aa015d2d-3307-41e2-8351-b1ba4c97c3c0';
const boxProductUomId = 'pu-box-0000-0000-0000-000000000001';
const stripProductUomId = 'pu-strip-0000-0000-0000-000000000002';

describe('updateProductUom purchase UoM lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    transactionShouldCommit = true;

    mockRepo.getProductBaseUomId.mockResolvedValue(baseUomId);
    mockRepo.listProductUoms.mockResolvedValue([
      {
        id: boxProductUomId,
        productId,
        uomId: boxUomId,
        uomName: 'Box',
        conversionFactor: '100',
        isDefault: false,
      },
      {
        id: stripProductUomId,
        productId,
        uomId: stripUomId,
        uomName: 'strip',
        conversionFactor: '1',
        isDefault: true,
      },
    ]);
    mockRepo.listItemUomConversions.mockResolvedValue([]);
    mockRepo.getUomById.mockImplementation(async (id: unknown) => {
      if (id === baseUomId) return { id, name: 'tablet', symbol: 'tb' };
      if (id === boxUomId) return { id, name: 'Box', symbol: 'BOX' };
      if (id === packetUomId) return { id, name: 'PACKET', symbol: 'PKT' };
      if (id === stripUomId) return { id, name: 'strip', symbol: 'STRIP' };
      return null;
    });
    mockRepo.getProductPurchaseUomContext.mockResolvedValue({
      purchaseUomId: boxUomId,
      conversionFactor: 100,
      baseUomId,
    });
    mockRepo.getProductSummary.mockResolvedValue({ name: 'Abchlor eye drops', sku: '13' });
    mockRepo.getProductOnHandBase.mockResolvedValue(0);
  });

  it('repoints products.purchase_uom_id when renaming the active purchase UoM (BOX → PACKET)', async () => {
    mockRepo.getProductUomById.mockResolvedValue({
      id: boxProductUomId,
      productId,
      uomId: boxUomId,
      conversionFactor: '100',
      isDefault: false,
    });
    mockRepo.updateProductUom.mockResolvedValue({
      id: boxProductUomId,
      productId,
      uomId: packetUomId,
      conversionFactor: '10',
      isDefault: false,
    });
    mockRepo.getProductPurchaseUomContext
      .mockResolvedValueOnce({
        purchaseUomId: boxUomId,
        conversionFactor: 100,
        baseUomId,
      })
      .mockResolvedValue({
        purchaseUomId: packetUomId,
        conversionFactor: 10,
        baseUomId,
      });
    mockRepo.listProductUoms.mockResolvedValue([
      {
        id: boxProductUomId,
        productId,
        uomId: packetUomId,
        uomName: 'PACKET',
        conversionFactor: '10',
        isDefault: false,
      },
      {
        id: stripProductUomId,
        productId,
        uomId: stripUomId,
        uomName: 'strip',
        conversionFactor: '1',
        isDefault: true,
      },
    ]);

    const result = await updateProductUom(
      boxProductUomId,
      { uomId: packetUomId, conversionFactor: 10 },
      undefined,
      mockPool,
    );

    expect(mockRepo.setProductPurchaseUomId).toHaveBeenCalledWith(
      productId,
      packetUomId,
      mockClient,
    );
    expect(result?.uomId).toBe(packetUomId);
  });

  it('does not repoint purchase_uom_id when editing a non-purchase UoM', async () => {
    mockRepo.getProductUomById.mockResolvedValue({
      id: boxProductUomId,
      productId,
      uomId: boxUomId,
      conversionFactor: '100',
      isDefault: false,
    });
    mockRepo.updateProductUom.mockResolvedValue({
      id: boxProductUomId,
      productId,
      uomId: boxUomId,
      conversionFactor: '120',
      isDefault: false,
    });

    await updateProductUom(
      boxProductUomId,
      { conversionFactor: 120 },
      undefined,
      mockPool,
    );

    expect(mockRepo.setProductPurchaseUomId).not.toHaveBeenCalled();
  });

  it('throws after update when purchase_uom_id orphan fails integrity (transaction uses UnitOfWork.runOrJoin)', async () => {
    mockRepo.getProductUomById.mockResolvedValue({
      id: stripProductUomId,
      productId,
      uomId: stripUomId,
      conversionFactor: '1',
      isDefault: false,
    });
    mockRepo.updateProductUom.mockResolvedValue({
      id: stripProductUomId,
      productId,
      uomId: stripUomId,
      conversionFactor: '1',
      isDefault: false,
    });
    mockRepo.listProductUoms.mockResolvedValue([
      {
        id: stripProductUomId,
        productId,
        uomId: stripUomId,
        uomName: 'strip',
        conversionFactor: '1',
        isDefault: false,
      },
    ]);

    await expect(
      updateProductUom(stripProductUomId, { conversionFactor: 1 }, undefined, mockPool),
    ).rejects.toThrow(/Purchase UoM "BOX" is not configured/i);

    expect(mockRepo.updateProductUom).toHaveBeenCalled();
  });
});

describe('removeProductUom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.getProductBaseUomId.mockResolvedValue(baseUomId);
    mockRepo.getProductPurchaseUomContext.mockResolvedValue({
      purchaseUomId: boxUomId,
      conversionFactor: 100,
      baseUomId,
    });
  });

  it('blocks removal of the active purchase UoM row', async () => {
    mockRepo.getProductUomById.mockResolvedValue({
      id: boxProductUomId,
      productId,
      uomId: boxUomId,
      conversionFactor: '100',
      isDefault: false,
    });

    await expect(removeProductUom(boxProductUomId, mockPool)).rejects.toThrow(
      /Cannot remove this unit — it is set as the product Purchase UoM/i,
    );
    expect(mockRepo.deleteProductUom).not.toHaveBeenCalled();
  });
});

describe('repairOrphanedPurchaseUom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.listOrphanedPurchaseUomProducts.mockResolvedValue([
      {
        productId,
        sku: '13',
        productName: 'Abchlor eye drops',
        purchaseUomId: boxUomId,
        purchaseUomLabel: 'BOX',
        baseUomId,
        baseUomLabel: 'tb',
        missingProductUomsRow: true,
        missingConversionPath: true,
        existingConversionFactor: null,
      },
    ]);
    mockRepo.createProductUom.mockResolvedValue({
      id: 'pu-repaired',
      productId,
      uomId: boxUomId,
      conversionFactor: '100',
      isDefault: false,
    });
    mockRepo.getProductBaseUomId.mockResolvedValue(baseUomId);
    mockRepo.getProductSummary.mockResolvedValue({ name: 'Abchlor eye drops', sku: '13' });
    mockRepo.getProductPurchaseUomContext.mockResolvedValue({
      purchaseUomId: boxUomId,
      conversionFactor: 100,
      baseUomId,
    });
    mockRepo.listProductUoms.mockResolvedValue([
      {
        id: 'pu-repaired',
        productId,
        uomId: boxUomId,
        uomName: 'Box',
        conversionFactor: '100',
        isDefault: false,
      },
      {
        id: stripProductUomId,
        productId,
        uomId: stripUomId,
        uomName: 'strip',
        conversionFactor: '1',
        isDefault: true,
      },
    ]);
    mockRepo.listItemUomConversions.mockResolvedValue([]);
    mockRepo.getUomById.mockImplementation(async (id: unknown) => ({
      id,
      name: id === boxUomId ? 'Box' : 'tablet',
      symbol: id === boxUomId ? 'BOX' : 'tb',
    }));
  });

  it('inserts missing product_uoms row and syncs conversion for historical orphan', async () => {
    const result = await repairOrphanedPurchaseUom(productId, mockClient, { conversionFactor: 100 });

    expect(result).toMatchObject({
      productId,
      purchaseUomId: boxUomId,
      conversionFactor: 100,
      insertedProductUomsRow: true,
    });
    expect(mockRepo.createProductUom).toHaveBeenCalledWith(
      expect.objectContaining({
        productId,
        uomId: boxUomId,
        conversionFactor: 100,
        isDefault: false,
      }),
      mockClient,
    );
    expect(mockRepo.upsertItemUomConversion).toHaveBeenCalled();
  });

  it('requires a conversion factor when orphan has no stored factor', async () => {
    await expect(repairOrphanedPurchaseUom(productId, mockClient)).rejects.toThrow(
      /supply a positive conversionFactor/i,
    );
  });
});
