import { describe, expect, it } from 'vitest';
import {
  atCostCartGroupNeedsUpdate,
  buildAtCostBlendedCartLine,
  buildAtCostSplitCartLines,
  canSplitAtCostLayersToSellingUom,
  shouldSplitAtCostFifoLayers,
} from '../utils/posCartAtCost';

describe('posCartAtCost FIFO split', () => {
  const template = {
    id: 'p1',
    name: 'Test Product',
    sku: 'SKU1',
    uom: 'tb',
    costPrice: 0,
    marginPct: 0,
    isTaxable: false,
    taxRate: 0,
    availableUoms: [
      { uomId: 'base', symbol: 'tb', conversionFactor: 1, price: 25000, cost: 19000, isDefault: true },
    ],
    selectedUomId: 'base',
  };

  it('splits two batch costs into two cart lines (20k + 18k)', () => {
    const layers = [
      { baseQuantity: 1, unitCostPerBase: 20000, totalCost: 20000 },
      { baseQuantity: 1, unitCostPerBase: 18000, totalCost: 18000 },
    ];
    expect(shouldSplitAtCostFifoLayers(layers)).toBe(true);
    const lines = buildAtCostSplitCartLines(template, layers);
    expect(lines).toHaveLength(2);
    expect(lines[0].unitPrice).toBe(20000);
    expect(lines[1].unitPrice).toBe(18000);
    expect(lines[0].quantity).toBe(1);
    expect(lines[1].quantity).toBe(1);
    expect(lines[0].subtotal + lines[1].subtotal).toBe(38000);
    expect(lines[0].costPrice).toBe(20000);
    expect(lines[1].costPrice).toBe(18000);
  });

  it('does not split when all layers share the same unit cost', () => {
    const layers = [
      { baseQuantity: 1, unitCostPerBase: 20000, totalCost: 20000 },
      { baseQuantity: 1, unitCostPerBase: 20000, totalCost: 20000 },
    ];
    expect(shouldSplitAtCostFifoLayers(layers)).toBe(false);
  });

  it('blended line preserves total when not splitting', () => {
    const layers = [
      { baseQuantity: 1, unitCostPerBase: 20000, totalCost: 20000 },
      { baseQuantity: 1, unitCostPerBase: 18000, totalCost: 18000 },
    ];
    const line = buildAtCostBlendedCartLine(template, 2, 19000, layers);
    expect(line.unitPrice).toBe(19000);
    expect(line.subtotal).toBe(38000);
    expect(line.costPrice).toBe(19000);
  });

  it('scales layer costs for multi-UoM (strip ×10)', () => {
    const stripTemplate = {
      ...template,
      uom: 'st',
      availableUoms: [
        { uomId: 'base', symbol: 'tb', conversionFactor: 1, price: 4000, cost: 1100, isDefault: true },
        { uomId: 'strip', symbol: 'st', conversionFactor: 10, price: 40000, cost: 11000, isDefault: false },
      ],
      selectedUomId: 'strip',
    };
    const layers = [{ baseQuantity: 10, unitCostPerBase: 1100, totalCost: 11000 }];
    expect(canSplitAtCostLayersToSellingUom(layers, 10)).toBe(true);
    const lines = buildAtCostSplitCartLines(stripTemplate, layers);
    expect(lines[0].unitPrice).toBe(11000);
    expect(lines[0].quantity).toBe(1);
  });

  it('does not split UoM when layer yields fractional selling qty', () => {
    const layers = [
      { baseQuantity: 5, unitCostPerBase: 20000, totalCost: 100000 },
      { baseQuantity: 5, unitCostPerBase: 18000, totalCost: 90000 },
    ];
    expect(canSplitAtCostLayersToSellingUom(layers, 10)).toBe(false);
  });

  it('atCostCartGroupNeedsUpdate detects stale costPrice', () => {
    const oldLines = [{ quantity: 1, unitPrice: 11000, costPrice: 11632, pricingRule: { scope: 'at_cost' } }];
    const newLines = [{ quantity: 1, unitPrice: 11000, costPrice: 11000, pricingRule: { scope: 'at_cost' } }];
    expect(atCostCartGroupNeedsUpdate(oldLines, newLines, true)).toBe(true);
  });
});
