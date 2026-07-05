import { describe, it, expect } from '@jest/globals';
import { WAREHOUSE_LAYER_TOLERANCE } from './warehouseInventoryCoupling.js';

describe('WAREHOUSE_LAYER_TOLERANCE', () => {
    it('is a small positive epsilon for numeric compares', () => {
        expect(WAREHOUSE_LAYER_TOLERANCE).toBeGreaterThan(0);
        expect(WAREHOUSE_LAYER_TOLERANCE).toBeLessThan(0.01);
    });
});
