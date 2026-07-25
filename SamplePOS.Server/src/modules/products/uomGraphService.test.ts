import { describe, expect, it } from '@jest/globals';
import Decimal from 'decimal.js';
import {
    assertCanonicalUomGraph,
    canonicalizeUomName,
    convertQuantityToBase,
    denormalizeBaseUnitPrice,
    formatCanonicalConversionLabel,
    normalizeEnteredUnitPriceToBase,
    resolveFactorToBase,
    validateCanonicalUomGraph,
    type ItemUomConversion,
} from './uomGraphService.js';

describe('uomGraphService', () => {
    const itemId = 'item-1';
    const baseUomId = 'tab';
    const conversions: ItemUomConversion[] = [
        { itemId, fromUomId: 'pkt', toUomId: 'box', factor: 2, isCanonical: true },
        { itemId, fromUomId: 'box', toUomId: 'tab', factor: 12, isCanonical: true },
    ];

    it('resolves multi-hop factor to base', () => {
        const resolved = resolveFactorToBase(baseUomId, 'pkt', conversions);
        expect(resolved.factorToBase.toString()).toBe('24');
        expect(resolved.path).toEqual(['pkt', 'box', 'tab']);
    });

    it('normalizes entered larger-unit price by dividing by factor to base', () => {
        const baseUnitPrice = normalizeEnteredUnitPriceToBase('2400', 24);
        expect(baseUnitPrice.toFixed(2)).toBe('100.00');
        expect(denormalizeBaseUnitPrice(baseUnitPrice, 24).toFixed(2)).toBe('2400.00');
    });

    it('converts entered quantity to base with canonical factor', () => {
        expect(convertQuantityToBase(5, new Decimal(24)).toString()).toBe('120');
    });

    it('rejects factors smaller than 1', () => {
        const result = validateCanonicalUomGraph(baseUomId, [
            { itemId, fromUomId: 'pkt', toUomId: 'tab', factor: 0.083333, isCanonical: true },
        ]);
        expect(result.isValid).toBe(false);
        expect(result.issues.join(' ')).toContain('>= 1');
    });

    it('rejects cycles and parallel paths', () => {
        const result = validateCanonicalUomGraph(baseUomId, [
            { itemId, fromUomId: 'pkt', toUomId: 'box', factor: 2, isCanonical: true },
            { itemId, fromUomId: 'pkt', toUomId: 'tab', factor: 24, isCanonical: true },
            { itemId, fromUomId: 'box', toUomId: 'pkt', factor: 2, isCanonical: true },
        ]);
        expect(result.isValid).toBe(false);
        expect(result.issues.join(' ')).toContain('parallel paths');
        expect(result.issues.join(' ')).toContain('Duplicate or reverse conversion');
    });

    it('throws when asserting an invalid graph', () => {
        expect(() =>
            assertCanonicalUomGraph(baseUomId, [
                { itemId, fromUomId: baseUomId, toUomId: 'piece', factor: 10, isCanonical: true },
            ]),
        ).toThrow();
    });

    it('canonicalizes common aliases and formats human-readable labels', () => {
        expect(canonicalizeUomName(' tabs ')).toBe('TABLET');
        expect(canonicalizeUomName('pkt')).toBe('PACKET');
        expect(canonicalizeUomName('PIECE')).toBe('EACH');
        expect(canonicalizeUomName('pcs')).toBe('EACH');
        expect(formatCanonicalConversionLabel('PKT', 'TAB', 12)).toBe('1 PKT = 12 TAB');
    });
});