import { describe, expect, it } from '@jest/globals';
import { buildReorderDashboardCsv, buildReorderExportRows } from './reorderDashboardExport.js';
import type { ReorderDashboardItem } from './reportTypes.js';

const sampleLine = {
  productId: 'p1',
  name: 'Paracetamol 500mg',
  sku: 'SKU-IGNORED',
  category: 'Analgesics',
  currentStock: 2,
  unitsSold30d: 10,
  unitsSold7d: 3,
  qtyOnOrder: 0,
  dailySalesVelocity: 0.5,
  daysUntilStockout: 4,
  suggestedOrderQty: 5,
  estimatedOrderCost: 5000,
  priority: 'HIGH' as const,
  reason: 'Within lead time',
  leadTimeDays: 7,
  reorderPoint: 8,
  reorderLevel: 5,
  safetyStock: 2,
  costPrice: 1000,
  preferredSupplier: 'Acme Pharma',
  preferredSupplierId: 's1',
};

describe('reorderDashboardExport', () => {
  it('export rows include category and omit sku field', () => {
    const rows = buildReorderExportRows([sampleLine as ReorderDashboardItem]);
    expect(rows[0].category).toBe('Analgesics');
    expect(rows[0]).not.toHaveProperty('sku');
  });

  it('CSV header has Category and no SKU column', () => {
    const csv = buildReorderDashboardCsv([sampleLine as ReorderDashboardItem]);
    const header = csv.split('\n')[0];
    expect(header).toContain('Category');
    expect(header).not.toContain('SKU');
    expect(header.startsWith('Product,Category,')).toBe(true);
  });
});
