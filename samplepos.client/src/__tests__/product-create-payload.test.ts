import { describe, it, expect } from 'vitest';
import { buildCreateProductInput, resolveDefaultStockUomId, PRODUCT_FORM_FIELD_DOM_IDS } from '@/validation/product';
import type { ProductFormValues } from '@/components/products/ProductForm';

const masterUoms = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'EACH' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'BOX' },
];

const baseValues: ProductFormValues = {
  name: 'Test Product',
  sku: 'SKU-001',
  barcode: '',
  description: '',
  category: '',
  genericName: '',
  costPrice: '10',
  sellingPrice: '15',
  costingMethod: 'FIFO',
  isTaxable: false,
  taxRate: '0',
  pricingFormula: '',
  autoUpdatePrice: false,
  reorderLevel: '5',
  trackExpiry: false,
  minDaysBeforeExpirySale: '0',
  isActive: true,
  preferredSupplierId: '',
  supplierProductCode: '',
  purchaseUomId: '',
  leadTimeDays: '0',
  reorderQuantity: '0',
};

describe('buildCreateProductInput', () => {
  it('includes unitOfMeasure from base stock UoM', () => {
    const result = buildCreateProductInput(baseValues, {
      stockUomId: '11111111-1111-4111-8111-111111111111',
      masterUoms,
      purchaseConversionFactor: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.unitOfMeasure).toBe('EACH');
      expect(result.data.conversionFactor).toBe(1);
    }
  });

  it('preserves purchase conversion factor when purchase UoM differs', () => {
    const result = buildCreateProductInput(
      { ...baseValues, purchaseUomId: '22222222-2222-4222-8222-222222222222' },
      {
        stockUomId: '11111111-1111-4111-8111-111111111111',
        masterUoms,
        purchaseConversionFactor: 12,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.unitOfMeasure).toBe('EACH');
      expect(result.data.conversionFactor).toBe(12);
      expect(result.data.purchaseUomId).toBe('22222222-2222-4222-8222-222222222222');
    }
  });

  it('defaults stock UoM to EACH when not specified', () => {
    expect(resolveDefaultStockUomId('', masterUoms)).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('maps validation fields to focusable DOM ids', () => {
    expect(PRODUCT_FORM_FIELD_DOM_IDS.name).toBe('product-name');
    expect(PRODUCT_FORM_FIELD_DOM_IDS.costPrice).toBe('cost-price');
  });
});

describe('focusFirstProductValidationError', () => {
  it('resolves DOM id for the first validation error field', () => {
    const errors = { name: 'Required', costPrice: 'Invalid' };
    const firstField = Object.keys(errors)[0] as keyof typeof PRODUCT_FORM_FIELD_DOM_IDS;
    expect(PRODUCT_FORM_FIELD_DOM_IDS[firstField]).toBe('product-name');
  });
});
