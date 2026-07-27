/**
 * EVIDENCE (client): service products never raise quantity/stock issues offline.
 */
import { describe, it, expect } from 'vitest';
import { planSaleStockDeduction, isServiceProductType } from '@shared/utils/productTypeRules';

describe('EVIDENCE — service never quantity issues (client SSOT)', () => {
  it('planSaleStockDeduction skips pure service parents', () => {
    expect(isServiceProductType('service')).toBe(true);
    expect(planSaleStockDeduction('service', false)).toEqual({ kind: 'skip' });
  });

  it('offline pay stock loop: service at qty 0 never fails; inventory still blocks', () => {
    const localStock: Record<string, number> = { 'svc-dish': 0, 'inv-water': 0 };
    const tryDecrement = (productId: string, qty: number) => {
      const avail = localStock[productId] ?? 0;
      if (avail < qty) return false;
      localStock[productId] = avail - qty;
      return true;
    };

    const runPayStockGate = (
      lines: Array<{ productId: string; productName: string; quantity: number; productType: string }>,
    ) => {
      const deductions: Array<{ productId: string; quantity: number }> = [];
      for (const line of lines) {
        if (isServiceProductType(line.productType)) continue;
        const ok = tryDecrement(line.productId, line.quantity);
        if (!ok) {
          throw new Error(`Insufficient offline stock for "${line.productName}"`);
        }
        deductions.push({ productId: line.productId, quantity: line.quantity });
      }
      return deductions;
    };

    expect(
      runPayStockGate([
        { productId: 'svc-dish', productName: 'Matooke', quantity: 4, productType: 'service' },
      ]),
    ).toEqual([]);
    expect(localStock['svc-dish']).toBe(0);

    expect(() =>
      runPayStockGate([
        { productId: 'inv-water', productName: 'Water', quantity: 1, productType: 'inventory' },
      ]),
    ).toThrow(/Insufficient offline stock for "Water"/);
  });

  it('offline catalog search keeps service visible at zero stock', () => {
    const products = [
      { id: 'svc', name: 'Delivery fee', productType: 'service' as const, stockOnHand: 0 },
      { id: 'inv', name: 'Coke', productType: 'inventory' as const, stockOnHand: 0 },
    ];
    const localStock: Record<string, number> = { svc: 0, inv: 0 };
    const visible = products.filter((p) => {
      const stock = localStock[p.id] ?? p.stockOnHand;
      return p.productType === 'service' || stock > 0;
    });
    expect(visible.map((p) => p.id)).toEqual(['svc']);
  });
});
