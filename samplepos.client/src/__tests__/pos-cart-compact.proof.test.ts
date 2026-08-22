/**
 * BEHAVIORAL proof — compressed retail cart line alerts.
 */
import { describe, expect, it } from 'vitest';
import { posCartCompactAlert } from '../components/pos/PosCartCompactLine';

const baseItem = {
  id: '1',
  name: 'Test',
  uom: 'pcs',
  quantity: 1,
  unitPrice: 1000,
  costPrice: 500,
  subtotal: 1000,
  marginPct: 10,
};

describe('PROOF: POS compact cart line (behavioral)', () => {
  it('prioritizes stock warning and shows discount alert', () => {
    expect(
      posCartCompactAlert({
        item: baseItem,
        lineQtyOverStock: true,
        stockUom: { uomLabel: 'pcs', stockInSellingUom: 0 },
        pricingMode: null,
      }),
    ).toContain('stock');

    expect(
      posCartCompactAlert({
        item: { ...baseItem, discount: { amount: 100 } },
        lineQtyOverStock: false,
        stockUom: { uomLabel: 'pcs' },
        pricingMode: null,
      }),
    ).toContain('Discount');
  });

  it('returns null when no alert is needed', () => {
    expect(
      posCartCompactAlert({
        item: baseItem,
        lineQtyOverStock: false,
        stockUom: { uomLabel: 'pcs' },
        pricingMode: null,
      }),
    ).toBeNull();
  });
});
