/**
 * MUoM purchase UoM integrity — PO procurement + product save guards
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockRepo = {
  getProductBaseUomId: jest.fn<MockFn>(),
  getProductPurchaseUomContext: jest.fn<MockFn>(),
  getProductSummary: jest.fn<MockFn>(),
  getUomById: jest.fn<MockFn>(),
  listProductUoms: jest.fn<MockFn>(),
  listItemUomConversions: jest.fn<MockFn>(),
  getProductName: jest.fn<MockFn>(),
  getProductLegacyUnitOfMeasure: jest.fn<MockFn>(),
  deleteItemUomConversionBySource: jest.fn<MockFn>(),
  upsertItemUomConversion: jest.fn<MockFn>(),
};

jest.unstable_mockModule('./uomRepository.js', () => mockRepo);

jest.unstable_mockModule('../audit/auditService.js', () => ({
  logUomPriceOverride: jest.fn<MockFn>(),
}));

const {
  checkProductPurchaseUomIntegrity,
  validateProductPurchaseUomIntegrity,
  resolveCanonicalProductUom,
} = await import('./uomService.js');

const mockDb = { query: jest.fn<MockFn>() } as unknown as Pool;

// Fixture IDs aligned with local SKU 13 / 5551 pattern
const sku13ProductId = '98cc5e26-bd41-462d-b072-0e73a2c02229';
const sku13BaseUomId = '96f87d23-c3ba-476e-bcc5-40a42a17457b';
const sku13BoxUomId = '78bf1928-1113-4208-a688-059ca75a9b7c';
const sku13StripUomId = 'aa015d2d-3307-41e2-8351-b1ba4c97c3c0';

const sku5551ProductId = '4e6994bb-5cf8-42d1-a312-0093f28f9eb6';
const sku5551BaseUomId = '97c8b6ea-1d45-48c8-bf5a-2b738051aa15';
const sku5551PktUomId = 'f9c13a3e-7c00-4d5f-9147-55158753c00d';

describe('checkProductPurchaseUomIntegrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.listItemUomConversions.mockResolvedValue([]);
    mockRepo.deleteItemUomConversionBySource.mockResolvedValue(undefined);
    mockRepo.upsertItemUomConversion.mockResolvedValue(undefined);
  });

  it('SKU 13 pattern: BOX purchase UoM missing from product_uoms → invalid', async () => {
    mockRepo.getProductSummary.mockResolvedValue({ name: 'Abchlor eye drops', sku: '13' });
    mockRepo.getProductBaseUomId.mockResolvedValue(sku13BaseUomId);
    mockRepo.getProductPurchaseUomContext.mockResolvedValue({
      purchaseUomId: sku13BoxUomId,
      conversionFactor: 1,
      baseUomId: sku13BaseUomId,
    });
    mockRepo.getUomById.mockImplementation(async (id: unknown) => {
      if (id === sku13BaseUomId) return { id, name: 'tablet', symbol: 'tb' };
      if (id === sku13BoxUomId) return { id, name: 'Box', symbol: 'BOX' };
      return null;
    });
    mockRepo.listProductUoms.mockResolvedValue([
      {
        id: 'pu-base',
        productId: sku13ProductId,
        uomId: sku13BaseUomId,
        uomName: 'tablet',
        conversionFactor: '1',
        isDefault: true,
      },
      {
        id: 'pu-strip',
        productId: sku13ProductId,
        uomId: sku13StripUomId,
        uomName: 'strip',
        conversionFactor: '10',
        isDefault: false,
      },
    ]);

    const check = await checkProductPurchaseUomIntegrity(sku13ProductId, mockDb);

    expect(check.valid).toBe(false);
    expect(check.missingProductUomsRow).toBe(true);
    expect(check.missingConversionPath).toBe(true);
    expect(check.effectivePoUomId).toBeNull();
  });

  it('SKU 5551 pattern: PACKET purchase UoM missing from product_uoms → invalid', async () => {
    mockRepo.getProductSummary.mockResolvedValue({ name: 'Ritalin 10MG', sku: '5551' });
    mockRepo.getProductBaseUomId.mockResolvedValue(sku5551BaseUomId);
    mockRepo.getProductPurchaseUomContext.mockResolvedValue({
      purchaseUomId: sku5551PktUomId,
      conversionFactor: 1,
      baseUomId: sku5551BaseUomId,
    });
    mockRepo.getUomById.mockImplementation(async (id: unknown) => {
      if (id === sku5551BaseUomId) return { id, name: 'Each', symbol: 'EA' };
      if (id === sku5551PktUomId) return { id, name: 'PACKET', symbol: 'PKT' };
      return null;
    });
    mockRepo.listProductUoms.mockResolvedValue([
      {
        id: 'pu-base',
        productId: sku5551ProductId,
        uomId: sku5551BaseUomId,
        uomName: 'Each',
        conversionFactor: '1',
        isDefault: true,
      },
    ]);

    const check = await checkProductPurchaseUomIntegrity(sku5551ProductId, mockDb);

    expect(check.valid).toBe(false);
    expect(check.missingProductUomsRow).toBe(true);
  });

  it('valid purchase UoM in product_uoms with conversion → effectivePoUomId set', async () => {
    const packUomId = 'bbbbbbbb-0000-4000-8000-000000000002';
    mockRepo.getProductSummary.mockResolvedValue({ name: 'Test', sku: 'T1' });
    mockRepo.getProductBaseUomId.mockResolvedValue(sku5551BaseUomId);
    mockRepo.getProductPurchaseUomContext.mockResolvedValue({
      purchaseUomId: packUomId,
      conversionFactor: 12,
      baseUomId: sku5551BaseUomId,
    });
    mockRepo.getUomById.mockImplementation(async (id: unknown) => ({
      id,
      name: id === packUomId ? 'BOX' : 'Each',
      symbol: id === packUomId ? 'BOX' : 'EA',
    }));
    mockRepo.listProductUoms.mockResolvedValue([
      {
        id: 'pu-base',
        productId: 'p1',
        uomId: sku5551BaseUomId,
        uomName: 'Each',
        conversionFactor: '1',
        isDefault: true,
      },
      {
        id: 'pu-pack',
        productId: 'p1',
        uomId: packUomId,
        uomName: 'BOX',
        conversionFactor: '12',
        isDefault: false,
      },
    ]);

    const check = await checkProductPurchaseUomIntegrity('p1', mockDb);

    expect(check.valid).toBe(true);
    expect(check.effectivePoUomId).toBe(packUomId);
  });
});

describe('validateProductPurchaseUomIntegrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.listItemUomConversions.mockResolvedValue([]);
  });

  it('throws user-friendly error when purchase UoM missing from product_uoms', async () => {
    mockRepo.getProductSummary.mockResolvedValue({ name: 'Ritalin 10MG', sku: '5551' });
    mockRepo.getProductBaseUomId.mockResolvedValue(sku5551BaseUomId);
    mockRepo.getProductPurchaseUomContext.mockResolvedValue({
      purchaseUomId: sku5551PktUomId,
      conversionFactor: 1,
      baseUomId: sku5551BaseUomId,
    });
    mockRepo.getUomById.mockImplementation(async (id: unknown) => ({
      id,
      name: id === sku5551PktUomId ? 'PACKET' : 'Each',
      symbol: id === sku5551PktUomId ? 'PKT' : 'EA',
    }));
    mockRepo.listProductUoms.mockResolvedValue([
      {
        id: 'pu-base',
        productId: sku5551ProductId,
        uomId: sku5551BaseUomId,
        uomName: 'Each',
        conversionFactor: '1',
        isDefault: true,
      },
    ]);

    await expect(validateProductPurchaseUomIntegrity(sku5551ProductId, mockDb)).rejects.toThrow(
      /Purchase UoM "PKT" is not configured/i,
    );
  });
});

describe('resolveCanonicalProductUom with valid purchase UoM', () => {
  const productId = 'p-valid';
  const baseUomId = sku5551BaseUomId;
  const packUomId = 'bbbbbbbb-0000-4000-8000-000000000002';

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.getProductSummary.mockResolvedValue({ name: 'Valid Product', sku: 'V1' });
    mockRepo.getProductBaseUomId.mockResolvedValue(baseUomId);
    mockRepo.getProductPurchaseUomContext.mockResolvedValue({
      purchaseUomId: packUomId,
      conversionFactor: 12,
      baseUomId,
    });
    mockRepo.getProductLegacyUnitOfMeasure.mockResolvedValue('Each');
    mockRepo.listProductUoms.mockResolvedValue([
      {
        id: 'pu-base',
        productId,
        uomId: baseUomId,
        uomName: 'Each',
        conversionFactor: '1',
        isDefault: true,
      },
      {
        id: 'pu-pack',
        productId,
        uomId: packUomId,
        uomName: 'BOX',
        conversionFactor: '12',
        isDefault: false,
      },
    ]);
    mockRepo.listItemUomConversions.mockResolvedValue([]);
    mockRepo.getUomById.mockImplementation(async (id: unknown) => ({
      id,
      name: id === packUomId ? 'BOX' : 'Each',
    }));
    mockRepo.deleteItemUomConversionBySource.mockResolvedValue(undefined);
    mockRepo.upsertItemUomConversion.mockResolvedValue(undefined);
  });

  it('resolves PO line when purchase UoM is fully configured', async () => {
    const result = await resolveCanonicalProductUom(productId, packUomId, mockDb);
    expect(result.conversionFactor).toBe(12);
    expect(result.baseUomId).toBe(baseUomId);
  });
});
