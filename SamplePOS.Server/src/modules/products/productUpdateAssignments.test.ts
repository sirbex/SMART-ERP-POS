/**
 * Regression: PUT products/:id with productType=service + trackExpiry must not
 * emit multiple assignments to the same column (Postgres 42601).
 */
import { describe, it, expect } from '@jest/globals';
import { planProductUpdateAssignments } from './productRepository.js';
import { normalizeProductSaveForType } from '../../../../shared/utils/productTypeRules.js';

function columnCounts(columns: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const col of columns) {
    counts.set(col, (counts.get(col) ?? 0) + 1);
  }
  return counts;
}

describe('planProductUpdateAssignments — service product save', () => {
  it('does not double-assign track_expiry when form sends service + trackExpiry false', () => {
    const payload = normalizeProductSaveForType({
      productType: 'service' as const,
      name: 'matooke with beans',
      trackExpiry: false,
      minDaysBeforeExpirySale: 0,
      preferredSupplierId: null,
      supplierProductCode: null,
      purchaseUomId: null,
      leadTimeDays: 0,
      reorderLevel: 0,
      reorderQuantity: 0,
      autoUpdatePrice: false,
      sellingPrice: 15000,
      availableInRestaurant: true,
    });

    const plan = planProductUpdateAssignments(payload);
    const masterCols = plan.master.map((a) => a.column);
    const counts = columnCounts(masterCols);

    expect(counts.get('track_expiry')).toBe(1);
    expect(counts.get('min_days_before_expiry_sale')).toBe(1);
    expect(counts.get('preferred_supplier_id')).toBe(1);
    expect(counts.get('purchase_uom_id')).toBe(1);
    expect(plan.master.find((a) => a.column === 'track_expiry')?.value).toBe(false);
    expect(plan.master.find((a) => a.column === 'product_type')?.value).toBe('service');
  });

  it('service type forces track_expiry false even if payload says true', () => {
    const plan = planProductUpdateAssignments({
      productType: 'service',
      trackExpiry: true,
    });
    expect(plan.master.find((a) => a.column === 'track_expiry')?.value).toBe(false);
    expect(columnCounts(plan.master.map((a) => a.column)).get('track_expiry')).toBe(1);
  });
});
