import {
    assertInventoryCouplingUnchanged,
    batchValuationReduction,
    INVENTORY_COUPLING_TOLERANCE,
    type InventoryCouplingSnapshot,
} from './inventorySubledgerCoupling.js';
import { BusinessError } from '../middleware/errorHandler.js';

const snap = (gap: number, batchValuation = 1000): InventoryCouplingSnapshot => ({
    glNet1300: batchValuation + gap,
    batchValuation,
    gap,
});

describe('assertInventoryCouplingUnchanged', () => {
    it('allows unchanged gap within tolerance', () => {
        expect(() =>
            assertInventoryCouplingUnchanged(snap(50), snap(50 + INVENTORY_COUPLING_TOLERANCE / 2), 'test'),
        ).not.toThrow();
    });

    it('rejects 1 UGX gap movement when GL credit ≠ batch delta (SALE-4872 class)', () => {
        expect(() =>
            assertInventoryCouplingUnchanged(snap(0), snap(1), 'sale SALE-4872'),
        ).toThrow(BusinessError);
    });

    it('throws when gap moves beyond tolerance', () => {
        expect(() =>
            assertInventoryCouplingUnchanged(snap(0), snap(100), 'sale SALE-1'),
        ).toThrow(BusinessError);

        try {
            assertInventoryCouplingUnchanged(snap(0), snap(100), 'sale SALE-1');
        } catch (e) {
            expect(e).toBeInstanceOf(BusinessError);
            expect((e as BusinessError).errorCode).toBe('ERR_INVENTORY_GL_COUPLING');
        }
    });
});

describe('batchValuationReduction', () => {
    it('returns batch valuation delta for GL inventory credit', () => {
        const before = snap(0, 109742573);
        const after = snap(1, 109732583);
        expect(batchValuationReduction(before, after)).toBe(9990);
    });

    it('matches Henber-class 1 UGX sale mismatch scenario (10290 batch vs 10289 JS sum)', () => {
        const before = snap(0, 109742573);
        const after = snap(0, 109732283);
        expect(batchValuationReduction(before, after)).toBe(10290);
    });
});
