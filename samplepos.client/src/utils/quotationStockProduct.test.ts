import { describe, expect, it } from 'vitest';
import {
  applySellingUomToQuoteLine,
  buildQuoteLineFromStockProduct,
  normalizeStockLevelUoms,
} from './quotationStockProduct';

describe('quotationStockProduct', () => {
  const stockRow = {
    product_id: 'p1',
    product_name: 'Ampiclox',
    sku: 'SKU-3401',
    selling_price: 180,
    average_cost: 100,
    total_stock: 500,
    is_taxable: true,
    tax_rate: 0,
    uoms: [
      {
        uomId: 'uom-pcs',
        name: 'Piece',
        symbol: 'PC',
        conversionFactor: 1,
        isDefault: true,
        price: 180,
        cost: 100,
      },
      {
        uomId: 'uom-box',
        name: 'Box',
        symbol: 'BOX',
        conversionFactor: 10,
        isDefault: false,
        price: 1800,
        cost: 1000,
      },
    ],
  };

  it('buildQuoteLineFromStockProduct uses default UoM and selling price', () => {
    const line = buildQuoteLineFromStockProduct(stockRow);
    expect(line.uomId).toBe('uom-pcs');
    expect(line.uomName).toBe('PC');
    expect(line.unitPrice).toBe(180);
    expect(line.availableUoms).toHaveLength(2);
  });

  it('buildQuoteLineFromStockProduct uses cost when atCost', () => {
    const line = buildQuoteLineFromStockProduct(stockRow, { atCost: true });
    expect(line.unitPrice).toBe(100);
  });

  it('applySellingUomToQuoteLine uses cost when atCost', () => {
    const uoms = normalizeStockLevelUoms(stockRow);
    const next = applySellingUomToQuoteLine(uoms, 'uom-box', { atCost: true });
    expect(next?.unitPrice).toBe(1000);
  });

  it('applySellingUomToQuoteLine updates price by conversion', () => {
    const uoms = normalizeStockLevelUoms(stockRow);
    const next = applySellingUomToQuoteLine(uoms, 'uom-box');
    expect(next?.uomName).toBe('BOX');
    expect(next?.unitPrice).toBe(1800);
  });

  it('synthetic PIECE when uoms missing', () => {
    const uoms = normalizeStockLevelUoms({
      product_id: 'p2',
      product_name: 'Legacy',
      selling_price: 50,
    });
    expect(uoms[0].symbol).toBe('PIECE');
    expect(uoms[0].price).toBe(50);
  });
});
