import { describe, expect, it } from '@jest/globals';
import {
  buildReorderDashboardSummary,
  classifyReorderPriority,
  effectiveReorderQty,
} from './reorderDashboardLogic.js';
import type { ReorderDashboardItem } from './reportTypes.js';

describe('classifyReorderPriority', () => {
  const base = {
    currentStock: 10,
    unitsSold30d: 5,
    effectiveVelocity: 1,
    daysUntilStockout: 10,
    leadTimeDays: 7,
    reorderPoint: 8,
    reorderLevel: 5,
    qtyOnOrder: 0,
  };

  it('classifies in-stock zero sales as DEAD_STOCK', () => {
    const r = classifyReorderPriority({ ...base, unitsSold30d: 0, effectiveVelocity: 0 });
    expect(r.priority).toBe('DEAD_STOCK');
  });

  it('classifies inactive OOS (no sales, no min) as DEAD_STOCK not URGENT', () => {
    const r = classifyReorderPriority({
      ...base,
      currentStock: 0,
      unitsSold30d: 0,
      effectiveVelocity: 0,
      reorderLevel: 0,
      daysUntilStockout: null,
    });
    expect(r.priority).toBe('DEAD_STOCK');
  });

  it('classifies OOS with velocity as URGENT', () => {
    const r = classifyReorderPriority({
      ...base,
      currentStock: 0,
      effectiveVelocity: 2,
      daysUntilStockout: 0,
    });
    expect(r.priority).toBe('URGENT');
  });

  it('classifies stockout within 2 days as URGENT', () => {
    const r = classifyReorderPriority({ ...base, daysUntilStockout: 2 });
    expect(r.priority).toBe('URGENT');
  });

  it('classifies within lead time as HIGH', () => {
    const r = classifyReorderPriority({ ...base, daysUntilStockout: 5, leadTimeDays: 7 });
    expect(r.priority).toBe('HIGH');
  });
});

describe('buildReorderDashboardSummary', () => {
  it('summary counts match array lengths', () => {
    const urgent = [{ productId: '1', currentStock: 0, costPrice: 10, suggestedOrderQty: 5, reorderPoint: 5, reorderLevel: 5, qtyOnOrder: 0 } as ReorderDashboardItem];
    const high: ReorderDashboardItem[] = [];
    const medium: ReorderDashboardItem[] = [];
    const deadStock = [{ productId: '2', currentStock: 3, costPrice: 100, suggestedOrderQty: 0, reorderPoint: 0, reorderLevel: 0, qtyOnOrder: 0 } as ReorderDashboardItem];
    const s = buildReorderDashboardSummary(urgent, high, medium, deadStock);
    expect(s.urgentCount).toBe(1);
    expect(s.deadStockCount).toBe(1);
  });
});

describe('effectiveReorderQty', () => {
  it('uses suggested qty when positive', () => {
    expect(
      effectiveReorderQty({
        suggestedOrderQty: 12,
        reorderPoint: 10,
        currentStock: 2,
        qtyOnOrder: 0,
        reorderLevel: 5,
      })
    ).toBe(12);
  });
});
