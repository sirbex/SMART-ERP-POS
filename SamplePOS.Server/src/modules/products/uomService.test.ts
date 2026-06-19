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
  updateProductUom: jest.fn<MockFn>(),
  getProductUomById: jest.fn<MockFn>(),
  deleteItemUomConversionBySource: jest.fn<MockFn>(),
  deleteAllItemUomConversionsForProduct: jest.fn<MockFn>(),
  upsertItemUomConversion: jest.fn<MockFn>(),
  listItemUomConversions: jest.fn<MockFn>(),
  setProductBaseUomId: jest.fn<MockFn>(),
  listUoms: jest.fn<MockFn>(),
  createUom: jest.fn<MockFn>(),
  getProductLegacyUnitOfMeasure: jest.fn<MockFn>(),
  getProductName: jest.fn<MockFn>(),
  getProductPurchaseUomContext: jest.fn<MockFn>(),
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

const { addProductUom, resolveCanonicalProductUom, resolveSaleItemUom } = await import('./uomService.js');

const mockPool = {} as Pool;

describe('uomService.addProductUom base UoM', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.getProductBaseUomId.mockResolvedValue(null);
    mockRepo.listProductUoms.mockResolvedValue([]);
    mockRepo.getProductLegacyUnitOfMeasure.mockResolvedValue(null);
    mockRepo.getProductName.mockResolvedValue('Test Product');
    mockRepo.listUoms.mockResolvedValue([]);
    mockRepo.createUom.mockResolvedValue({ id: 'seed-each', name: 'EACH' });
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

  it('updates existing row when canonical duplicate already exists (bootstrap + UI add)', async () => {
    const productId = '099172ce-f327-4e1f-8ce4-b10e61d5bc50';
    const eachUomId = 'c0000000-0000-4000-8000-000000000003';
    const existingProductUomId = 'd0000000-0000-4000-8000-000000000004';

    mockRepo.getProductBaseUomId.mockResolvedValue(eachUomId);
    mockRepo.getUomById.mockResolvedValue({ id: eachUomId, name: 'Each' });
    mockRepo.listProductUoms.mockResolvedValue([
      {
        id: existingProductUomId,
        productId,
        uomId: eachUomId,
        uomName: 'Each',
        conversionFactor: '1',
        isDefault: true,
      },
    ]);
    mockRepo.getProductUomById.mockResolvedValue({
      id: existingProductUomId,
      productId,
      uomId: eachUomId,
      conversionFactor: '1',
      isDefault: true,
    });
    mockRepo.updateProductUom.mockResolvedValue({
      id: existingProductUomId,
      productId,
      uomId: eachUomId,
      conversionFactor: '1',
      isDefault: true,
    });

    await addProductUom(
      {
        productId,
        uomId: eachUomId,
        conversionFactor: 1,
        isDefault: true,
      },
      undefined,
      mockPool,
    );

    expect(mockRepo.createProductUom).not.toHaveBeenCalled();
    expect(mockRepo.updateProductUom).toHaveBeenCalledWith(
      existingProductUomId,
      expect.objectContaining({
        uomId: eachUomId,
        conversionFactor: 1,
        isDefault: true,
      }),
      expect.anything(),
    );
  });
});

describe('resolveCanonicalProductUom', () => {
  const productId = '099172ce-f327-4e1f-8ce4-b10e61d5bc50';
  const baseUomId = 'c0000000-0000-4000-8000-000000000003';
  const packUomId = 'b0000000-0000-4000-8000-000000000002';

  const mockDb = {
    query: jest.fn<MockFn>().mockResolvedValue({ rows: [{ name: 'Test Product' }] }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.getProductBaseUomId.mockResolvedValue(baseUomId);
    mockRepo.getProductPurchaseUomContext.mockResolvedValue({
      purchaseUomId: null,
      conversionFactor: 1,
      baseUomId,
    });
    mockRepo.listProductUoms.mockResolvedValue([
      {
        id: 'd0000000-0000-4000-8000-000000000004',
        productId,
        uomId: baseUomId,
        uomName: 'TABLET',
        conversionFactor: '1',
        isDefault: true,
      },
      {
        id: 'e0000000-0000-4000-8000-000000000005',
        productId,
        uomId: packUomId,
        uomName: 'PACK',
        conversionFactor: '12',
        isDefault: false,
      },
    ]);
    mockRepo.listItemUomConversions.mockResolvedValue([]);
    mockRepo.getUomById.mockImplementation(async (id: unknown) => {
      if (id === baseUomId) return { id: baseUomId, name: 'TABLET' };
      if (id === packUomId) return { id: packUomId, name: 'PACK' };
      return null;
    });
  });

  it('resolves from product_uoms when item_uom_conversions is empty', async () => {
    const result = await resolveCanonicalProductUom(productId, packUomId, mockDb as unknown as Pool);
    expect(result.conversionFactor).toBe(12);
    expect(result.baseUomId).toBe(baseUomId);
  });

  it('merges product_uoms over partial item_uom_conversions (PO multi-line fix)', async () => {
    mockRepo.listItemUomConversions.mockResolvedValue([
      {
        id: 'conv-1',
        itemId: productId,
        fromUomId: 'stale-uom',
        toUomId: 'old-base',
        factor: '6',
        isCanonical: true,
      },
    ]);

    const result = await resolveCanonicalProductUom(productId, packUomId, mockDb as unknown as Pool);
    expect(result.conversionFactor).toBe(12);
    expect(mockRepo.upsertItemUomConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        fromUomId: packUomId,
        toUomId: baseUomId,
        factor: 12,
      }),
      expect.anything(),
    );
  });

  it('maps legacy product_uoms row id to master uom id', async () => {
    const result = await resolveCanonicalProductUom(
      productId,
      'e0000000-0000-4000-8000-000000000005',
      mockDb as unknown as Pool,
    );
    expect(result.conversionFactor).toBe(12);
  });
});

describe('resolveSaleItemUom — Wave 4 MUoM hardening', () => {
  const productId = '099172ce-f327-4e1f-8ce4-b10e61d5bc50';
  const baseUomId = 'b0000000-0000-4000-8000-000000000001';
  const packUomId = 'b0000000-0000-4000-8000-000000000002';

  const mockDb = {
    query: jest.fn<MockFn>().mockResolvedValue({ rows: [{ name: 'Test Product' }] }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.getProductBaseUomId.mockResolvedValue(baseUomId);
    mockRepo.listProductUoms.mockResolvedValue([
      {
        id: 'pu-base',
        productId,
        uomId: baseUomId,
        uomName: 'Piece',
        uomSymbol: 'PC',
        conversionFactor: '1',
        isDefault: true,
      },
      {
        id: 'pu-pack',
        productId,
        uomId: packUomId,
        uomName: 'Pack',
        uomSymbol: 'PK',
        conversionFactor: '12',
        isDefault: false,
      },
    ]);
    mockRepo.listItemUomConversions.mockResolvedValue([]);
    mockRepo.getUomById.mockImplementation(async (id: string) => ({
      id,
      name: id === baseUomId ? 'Piece' : 'Pack',
    }));
  });

  it('computes base quantity for pack UoM via canonical graph', async () => {
    const result = await resolveSaleItemUom(
      productId,
      { quantity: 2, uomId: packUomId },
      mockDb as unknown as Pool,
    );
    expect(result.baseUomId).toBe(baseUomId);
    expect(result.conversionFactor).toBe(12);
    expect(result.baseQuantity).toBe(24);
    expect(result.sellingUomId).toBe(packUomId);
  });

  it('bootstraps legacy product from unit_of_measure on first sale resolve', async () => {
    let legacyBootstrapped = false;
    mockRepo.getProductBaseUomId.mockImplementation(async () =>
      legacyBootstrapped ? baseUomId : null,
    );
    mockRepo.listProductUoms.mockImplementation(async () =>
      legacyBootstrapped
        ? [
            {
              id: 'pu-base',
              productId,
              uomId: baseUomId,
              uomName: 'Tablet',
              conversionFactor: '1',
              isDefault: true,
            },
          ]
        : [],
    );
    mockRepo.listUoms.mockResolvedValue([
      { id: baseUomId, name: 'TABLET', symbol: 'TAB', type: 'QUANTITY' },
    ]);
    mockRepo.getProductLegacyUnitOfMeasure.mockResolvedValue('TABLET');
    mockRepo.getProductName.mockResolvedValue('Cefixime 100mg tabs cefiwel');
    mockRepo.createProductUom.mockImplementation(async (input: { productId: string }) => {
      legacyBootstrapped = true;
      return { id: 'pu-base', ...input };
    });

    const result = await resolveSaleItemUom(
      productId,
      { quantity: 28 },
      mockDb as unknown as Pool,
    );

    expect(mockRepo.createProductUom).toHaveBeenCalledWith(
      expect.objectContaining({
        productId,
        uomId: baseUomId,
        conversionFactor: 1,
        isDefault: true,
      }),
      expect.anything(),
    );
    expect(result.baseUomId).toBe(baseUomId);
    expect(result.baseQuantity).toBe(28);
  });

  it('throws when base UoM is missing and legacy bootstrap cannot run', async () => {
    mockRepo.getProductBaseUomId.mockResolvedValue(null);
    mockRepo.listProductUoms.mockResolvedValue([]);
    mockRepo.listUoms.mockResolvedValue([]);
    mockRepo.getProductLegacyUnitOfMeasure.mockResolvedValue('TABLET');
    mockRepo.getProductName.mockResolvedValue('Legacy Product X');
    await expect(
      resolveSaleItemUom(productId, { quantity: 1 }, mockDb as unknown as Pool),
    ).rejects.toThrow(/Legacy Product X.*base stock unit/i);
  });

  it('throws when selling UoM label is not configured', async () => {
    await expect(
      resolveSaleItemUom(productId, { quantity: 1, uom: 'CARTON' }, mockDb as unknown as Pool),
    ).rejects.toThrow(/not configured/i);
  });
});
