/**
 * Sale line base quantity from UoM conversion factor.
 */
import { describe, it, expect } from '@jest/globals';
import type { ProductUomRow } from '../../db/batchFetch.js';
import { computeSaleItemBaseQuantity } from './saleItemBaseQuantity.js';

describe('computeSaleItemBaseQuantity', () => {
    const baseUomId = 'uom-base';
    const packUomId = 'uom-pack';

    const productUoms: ProductUomRow[] = [
        {
            id: 'pu-base',
            product_id: 'p1',
            uom_id: baseUomId,
            name: 'Piece',
            symbol: 'PC',
            conversion_factor: '1',
            is_default: true,
        },
        {
            id: 'pu-pack',
            product_id: 'p1',
            uom_id: packUomId,
            name: 'Pack',
            symbol: 'PK',
            conversion_factor: '12',
            is_default: false,
        },
    ];

    it('returns selling qty when default UoM is used', () => {
        const result = computeSaleItemBaseQuantity({ quantity: 2 }, productUoms);
        expect(result.baseQuantity).toBe(2);
        expect(result.conversionFactor.toNumber()).toBe(1);
    });

    it('multiplies by conversion factor when selling in pack UoM', () => {
        const result = computeSaleItemBaseQuantity(
            { quantity: 2, uomId: 'pu-pack' },
            productUoms,
        );
        expect(result.baseQuantity).toBe(24);
        expect(result.conversionFactor.toNumber()).toBe(12);
    });
});
