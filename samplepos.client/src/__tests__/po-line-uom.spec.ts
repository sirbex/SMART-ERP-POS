import { describe, it, expect } from 'vitest';
import {
  convertPoLineQuantityForUomChange,
  poLineBaseCostFromDisplay,
  poLineBaseQuantity,
  poLineDisplayUnitCost,
  poLineTotal,
} from '../../../shared/utils/po-line-uom';

describe('PO line UoM conversions', () => {
  it('converts reorder qty from base to pack when purchase UoM is selected (60 PC → 5 BOX)', () => {
    expect(convertPoLineQuantityForUomChange('60', 1, 12)).toBe('5');
  });

  it('converts pack qty back to base when switching to base UoM (5 BOX → 60 PC)', () => {
    expect(convertPoLineQuantityForUomChange('5', 12, 1)).toBe('60');
  });

  it('keeps line total stable when switching UoM with cost recalc (SAP MUoM)', () => {
    const baseCost = 200;
    const qtyBase = '60';
    const packFactor = 12;

    const packQty = convertPoLineQuantityForUomChange(qtyBase, 1, packFactor);
    const packUnitCost = poLineDisplayUnitCost(baseCost, packFactor);
    const baseTotal = poLineTotal(qtyBase, String(baseCost));
    const packTotal = poLineTotal(packQty, packUnitCost);

    expect(packQty).toBe('5');
    expect(packUnitCost).toBe('2400.00');
    expect(baseTotal).toBe('12000.00');
    expect(packTotal).toBe('12000.00');
  });

  it('documents the reorder-qty bug: base qty treated as pack qty inflates total 12×', () => {
    const wrongTotal = poLineTotal('60', poLineDisplayUnitCost(200, 12));
    const correctTotal = poLineTotal('5', poLineDisplayUnitCost(200, 12));
    expect(wrongTotal).toBe('144000.00');
    expect(correctTotal).toBe('12000.00');
    expect(poLineBaseQuantity('60', 12)).toBe(720);
  });

  it('derives base cost when user edits display unit cost on a pack line', () => {
    expect(poLineBaseCostFromDisplay('2400', 12)).toBe('200.00');
  });
});
