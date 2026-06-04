import { describe, expect, it } from 'vitest';
import {
  atCostCartGroupNeedsUpdate,
  buildAtCostBlendedCartLine,
  buildAtCostSplitCartLines,
  canSplitAtCostLayersToSellingUom,
  mustSplitAtCostFifoLayers,
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
      { uomId: 'base', name: 'Tablet', symbol: 'tb', conversionFactor: 1, price: 25000, cost: 19000, isDefault: true },
    ],
    selectedUomId: 'base',
  };

  it('does not require split when blended line matches FIFO total (20k + 18k → 19k)', () => {
    const layers = [
      { baseQuantity: 1, unitCostPerBase: 20000, totalCost: 20000 },
      { baseQuantity: 1, unitCostPerBase: 18000, totalCost: 18000 },
    ];
    expect(shouldSplitAtCostFifoLayers(layers)).toBe(true);
    expect(mustSplitAtCostFifoLayers(layers, 2, 19000)).toBe(false);
    const line = buildAtCostBlendedCartLine(template, 2, 19000, layers);
    expect(line.unitPrice).toBe(19000);
    expect(line.subtotal).toBe(38000);
  });

  it('requires split when blended unit cannot match FIFO total (rounding)', () => {
    const layers = [
      { baseQuantity: 1, unitCostPerBase: 20000, totalCost: 20000 },
      { baseQuantity: 1, unitCostPerBase: 18001, totalCost: 18001 },
    ];
    expect(mustSplitAtCostFifoLayers(layers, 2, 19000)).toBe(true);
    expect(mustSplitAtCostFifoLayers(layers, 2, 19001)).toBe(true);
    const lines = buildAtCostSplitCartLines(template, layers);
    expect(lines).toHaveLength(2);
    expect(lines[0].subtotal + lines[1].subtotal).toBe(38001);
  });

  it('does not split when all layers share the same unit cost', () => {
    const layers = [
      { baseQuantity: 1, unitCostPerBase: 20000, totalCost: 20000 },
      { baseQuantity: 1, unitCostPerBase: 20000, totalCost: 20000 },
    ];
    expect(shouldSplitAtCostFifoLayers(layers)).toBe(false);
    expect(mustSplitAtCostFifoLayers(layers, 2, 20000)).toBe(false);
  });

  it('scales layer costs for multi-UoM (strip ×10)', () => {
    const stripTemplate = {
      ...template,
      uom: 'st',
      availableUoms: [
        { uomId: 'base', name: 'Tablet', symbol: 'tb', conversionFactor: 1, price: 4000, cost: 1100, isDefault: true },
        { uomId: 'strip', name: 'Strip', symbol: 'st', conversionFactor: 10, price: 40000, cost: 11000, isDefault: false },
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

  it('keeps one blended line for Ozempic-style strip FIFO (1@1.6M + 2@1.15M)', () => {
    const layers = [
      { baseQuantity: 10, unitCostPerBase: 160000, totalCost: 1600000 },
      { baseQuantity: 20, unitCostPerBase: 115000, totalCost: 2300000 },
    ];
    expect(shouldSplitAtCostFifoLayers(layers)).toBe(true);
    expect(mustSplitAtCostFifoLayers(layers, 3, 1300000)).toBe(false);
    expect(canSplitAtCostLayersToSellingUom(layers, 10)).toBe(true);
  });
});

