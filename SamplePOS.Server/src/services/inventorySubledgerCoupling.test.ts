import {
    assertInventoryCouplingUnchanged,
    INVENTORY_COUPLING_TOLERANCE,
    type InventoryCouplingSnapshot,
} from './inventorySubledgerCoupling.js';
import { BusinessError } from '../middleware/errorHandler.js';

const snap = (gap: number): InventoryCouplingSnapshot => ({
    glNet1300: 1000 + gap,
    batchValuation: 1000,
    gap,
});

describe('assertInventoryCouplingUnchanged', () => {
    it('allows unchanged gap within tolerance', () => {
        expect(() =>
            assertInventoryCouplingUnchanged(snap(50), snap(50 + INVENTORY_COUPLING_TOLERANCE / 2), 'test'),
        ).not.toThrow();
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
