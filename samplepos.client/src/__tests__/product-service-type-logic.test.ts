/**
 * Proof: service product type business logic (menu dish / fee).
 * Real rules — form clears, save normalize, sale stock plan matrix.
 */
import { describe, it, expect } from 'vitest';
import {
  isServiceProductType,
  normalizeProductSaveForType,
  productFormSectionVisibility,
  resolveRestaurantKitchenCatalogFlags,
  serviceInventoryClearsForm,
  showRestaurantKitchenCatalogFields,
} from '@shared/utils/productTypeRules';
import { planSaleStockDeduction } from '../../../SamplePOS.Server/src/modules/sales/saleRecipeExplosion';
import { buildCreateProductInput, validateProductValues } from '@/validation/product';
import type { ProductFormValues } from '@/components/products/ProductForm';

const masterUoms = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'EACH' },
];

function dishForm(overrides: Partial<ProductFormValues> = {}): ProductFormValues {
  const { isPreparedFood, isBuffetCover, ...rest } = overrides;
  return {
    name: 'matooke with beans',
    sku: 'PRD-MENU-MATOOKE',
    barcode: '',
    description: '',
    category: 'local foods',
    productType: 'service',
    genericName: '',
    costPrice: '0',
    sellingPrice: '15000',
    costingMethod: 'FIFO',
    isTaxable: true,
    taxRate: '18',
    pricingFormula: 'cost * 1.2',
    autoUpdatePrice: true,
    reorderLevel: '10',
    trackExpiry: true,
    minDaysBeforeExpirySale: '90',
    isActive: true,
    availableInRestaurant: true,
    preferredSupplierId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    supplierProductCode: 'SUP-OLD',
    purchaseUomId: '11111111-1111-4111-8111-111111111111',
    leadTimeDays: '7',
    reorderQuantity: '50',
    isPreparedFood: isPreparedFood ?? false,
    isBuffetCover: isBuffetCover ?? false,
    ...rest,
  };
}

describe('Service product type — form / save business logic', () => {
  it('recognizes service type', () => {
    expect(isServiceProductType('service')).toBe(true);
    expect(isServiceProductType('SERVICE')).toBe(true);
    expect(isServiceProductType('inventory')).toBe(false);
  });

  it('hides stock, procurement, expiry, inventory snapshot for service', () => {
    const v = productFormSectionVisibility('service');
    expect(v.showStockLevels).toBe(false);
    expect(v.showProcurement).toBe(false);
    expect(v.showExpiry).toBe(false);
    expect(v.showInventorySnapshot).toBe(false);
    expect(v.showPricingFormula).toBe(false);
    expect(v.showCostingMethod).toBe(false);
    expect(v.showActiveOnlyAvailability).toBe(true);
  });

  it('keeps inventory sections for inventory type', () => {
    const v = productFormSectionVisibility('inventory');
    expect(v.showStockLevels).toBe(true);
    expect(v.showProcurement).toBe(true);
    expect(v.showInventorySnapshot).toBe(true);
  });

  it('kitchen catalog flags resolve only when restaurant mode is on', () => {
    expect(showRestaurantKitchenCatalogFields(false)).toBe(false);
    expect(showRestaurantKitchenCatalogFields(true)).toBe(true);

    expect(
      resolveRestaurantKitchenCatalogFlags(false, { isPreparedFood: true, isBuffetCover: true }),
    ).toEqual({ isPreparedFood: false, isBuffetCover: false });

    expect(
      resolveRestaurantKitchenCatalogFlags(true, { isPreparedFood: true, isBuffetCover: true }),
    ).toEqual({ isPreparedFood: true, isBuffetCover: true });

    expect(
      resolveRestaurantKitchenCatalogFlags(
        true,
        { isPreparedFood: true, isBuffetCover: true },
        { isService: true },
      ),
    ).toEqual({ isPreparedFood: false, isBuffetCover: true });
  });

  it('form clears wipe supplier / expiry / reorder when switching to service', () => {
    const clears = serviceInventoryClearsForm();
    expect(clears.trackExpiry).toBe(false);
    expect(clears.preferredSupplierId).toBe('');
    expect(clears.supplierProductCode).toBe('');
    expect(clears.purchaseUomId).toBe('');
    expect(clears.reorderLevel).toBe('0');
    expect(clears.minDaysBeforeExpirySale).toBe('0');
    expect(clears.autoUpdatePrice).toBe(false);
  });

  it('normalizeProductSaveForType strips inventory fields for service dish', () => {
    const raw = {
      productType: 'service' as const,
      name: 'matooke with beans',
      costPrice: 0,
      sellingPrice: 15000,
      trackExpiry: true,
      preferredSupplierId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      supplierProductCode: 'SUP-OLD',
      purchaseUomId: '11111111-1111-4111-8111-111111111111',
      reorderLevel: 10,
      reorderQuantity: 50,
      leadTimeDays: 7,
      minDaysBeforeExpirySale: 90,
      autoUpdatePrice: true,
      pricingFormula: 'cost * 1.2',
      costingMethod: 'FIFO',
    };
    const normalized = normalizeProductSaveForType(raw);
    expect(normalized.productType).toBe('service');
    expect(normalized.trackExpiry).toBe(false);
    expect(normalized.preferredSupplierId).toBeNull();
    expect(normalized.supplierProductCode).toBeNull();
    expect(normalized.purchaseUomId).toBeNull();
    expect(normalized.reorderLevel).toBe(0);
    expect(normalized.reorderQuantity).toBe(0);
    expect(normalized.leadTimeDays).toBe(0);
    expect(normalized.minDaysBeforeExpirySale).toBe(0);
    expect(normalized.autoUpdatePrice).toBe(false);
    expect(normalized.pricingFormula).toBeNull();
    expect(normalized.costingMethod).toBe('STANDARD');
    expect(normalized.sellingPrice).toBe(15000);
    expect(normalized.costPrice).toBe(0);
  });

  it('normalize leaves inventory products unchanged', () => {
    const raw = {
      productType: 'inventory' as const,
      trackExpiry: true,
      preferredSupplierId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      reorderLevel: 10,
    };
    expect(normalizeProductSaveForType(raw)).toEqual(raw);
  });

  it('validateProductValues accepts service dish with cost 0 and menu selling price', () => {
    const result = validateProductValues(dishForm(), 'create');
    expect(result.valid).toBe(true);
  });

  it('buildCreateProductInput keeps service type and selling price for matooke dish', () => {
    const cleared = { ...dishForm(), ...serviceInventoryClearsForm(), productType: 'service' as const };
    const built = buildCreateProductInput(cleared, {
      stockUomId: masterUoms[0].id,
      masterUoms,
      purchaseConversionFactor: 1,
    });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.data.productType).toBe('service');
      expect(built.data.name).toBe('matooke with beans');
      expect(built.data.category).toBe('local foods');
      expect(built.data.sellingPrice).toBe(15000);
      expect(built.data.costPrice).toBe(0);
      expect(built.data.trackExpiry).toBe(false);
      expect(built.data.preferredSupplierId).toBeUndefined();
    }
  });
});

describe('Service product type — sale stock plan (pay SSOT)', () => {
  it('EVIDENCE service without recipe → skip stock (never quantity-check parent)', () => {
    expect(planSaleStockDeduction('service', false)).toEqual({ kind: 'skip' });
  });

  it('service with recipe → deduct ingredients only (parent still not stocked)', () => {
    expect(planSaleStockDeduction('service', true)).toEqual({ kind: 'ingredients' });
  });

  it('inventory without recipe → deduct parent (Coke) — control', () => {
    expect(planSaleStockDeduction('inventory', false)).toEqual({ kind: 'parent' });
  });
});
