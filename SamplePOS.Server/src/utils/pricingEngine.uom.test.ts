import { describe, expect, it } from '@jest/globals';
import { PricingEngine } from './pricingEngine.js';

describe('PricingEngine canonical MUoM math', () => {
    it('never multiplies purchase unit price when normalizing to base', () => {
        const baseCost = PricingEngine.normalizeDisplayUnitCost(2400, 12);
        expect(baseCost.toFixed(2)).toBe('200.00');
    });

    it('keeps PO, GRN, and invoice totals equal when derived from base math', () => {
        const enteredQty = 5;
        const enteredUnitPrice = 2400;
        const factorToBase = 12;

        const baseQty = PricingEngine.calculateBaseQuantity(enteredQty, factorToBase);
        const baseUnitCost = PricingEngine.normalizeDisplayUnitCost(enteredUnitPrice, factorToBase);

        const poTotal = PricingEngine.calculateDocumentLineFromBase(baseQty, baseUnitCost);
        const grnTotal = PricingEngine.calculateDocumentLineFromBase(baseQty, baseUnitCost);
        const invoiceTotal = PricingEngine.calculateDocumentLineFromBase(baseQty, baseUnitCost);

        expect(poTotal.toFixed(2)).toBe('12000.00');
        expect(grnTotal.toFixed(2)).toBe(poTotal.toFixed(2));
        expect(invoiceTotal.toFixed(2)).toBe(poTotal.toFixed(2));
    });

    it('preserves inventory valuation after canonical normalization', () => {
        const baseQty = PricingEngine.calculateBaseQuantity(3, 24);
        const baseUnitCost = PricingEngine.normalizeDisplayUnitCost(4800, 24);
        const valuation = PricingEngine.calculateDocumentLineFromBase(baseQty, baseUnitCost);

        expect(baseQty.toString()).toBe('72');
        expect(baseUnitCost.toFixed(2)).toBe('200.00');
        expect(valuation.toFixed(2)).toBe('14400.00');
    });
});