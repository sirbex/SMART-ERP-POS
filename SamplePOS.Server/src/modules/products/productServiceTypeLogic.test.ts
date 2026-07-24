/**
 * Server proof: normalizeProductSaveForType + planSaleStockDeduction for service dishes.
 */
import { describe, it, expect } from '@jest/globals';
import {
  normalizeProductSaveForType,
  planSaleStockDeduction,
  productFormSectionVisibility,
} from '../../../../shared/utils/productTypeRules.js';

describe('Service product type — server business rules', () => {
  it('matooke-as-service save clears supplier/expiry/reorder', () => {
    const normalized = normalizeProductSaveForType({
      productType: 'service',
      name: 'matooke with beans',
      category: 'local foods',
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
    });

    expect(normalized.productType).toBe('service');
    expect(normalized.trackExpiry).toBe(false);
    expect(normalized.preferredSupplierId).toBeNull();
    expect(normalized.supplierProductCode).toBeNull();
    expect(normalized.purchaseUomId).toBeNull();
    expect(normalized.reorderLevel).toBe(0);
    expect(normalized.costingMethod).toBe('STANDARD');
    expect(normalized.sellingPrice).toBe(15000);
  });

  it('form sections hide procurement/stock for service', () => {
    expect(productFormSectionVisibility('service').showProcurement).toBe(false);
    expect(productFormSectionVisibility('service').showStockLevels).toBe(false);
  });

  it('pay path: service + recipe consumes ingredients only', () => {
    expect(planSaleStockDeduction('service', true)).toEqual({ kind: 'ingredients' });
    expect(planSaleStockDeduction('service', false)).toEqual({ kind: 'skip' });
  });
});
