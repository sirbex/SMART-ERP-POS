/**
 * importWorker unit tests
 *
 * Tests the product import defaults logic:
 * - Selling price auto-fill at 60% markup when missing/zero
 * - UOM default to EACH via Zod schema
 * - Decimal-safe arithmetic (no floating-point drift)
 */

import { applyProductImportDefaults } from './importWorker.js';
import { ProductCreateSchema } from '../../../../shared/zod/product.js';

// ── applyProductImportDefaults ────────────────────────────

describe('applyProductImportDefaults', () => {
    describe('selling price auto-fill (60% markup)', () => {
        it('should auto-fill sellingPrice = costPrice × 1.6 when sellingPrice is 0', () => {
            const row: Record<string, unknown> = { costPrice: 1000, sellingPrice: 0 };
            applyProductImportDefaults(row);
            expect(row.sellingPrice).toBe(1600);
        });

        it('should auto-fill when sellingPrice is missing (undefined)', () => {
            const row: Record<string, unknown> = { costPrice: 500 };
            applyProductImportDefaults(row);
            expect(row.sellingPrice).toBe(800);
        });

        it('should auto-fill when sellingPrice is a non-number type', () => {
            const row: Record<string, unknown> = { costPrice: 250, sellingPrice: 'abc' };
            applyProductImportDefaults(row);
            expect(row.sellingPrice).toBe(400);
        });

        it('should NOT overwrite an existing positive sellingPrice', () => {
            const row: Record<string, unknown> = { costPrice: 1000, sellingPrice: 2000 };
            applyProductImportDefaults(row);
            expect(row.sellingPrice).toBe(2000);
        });

        it('should NOT auto-fill when costPrice is 0', () => {
            const row: Record<string, unknown> = { costPrice: 0, sellingPrice: 0 };
            applyProductImportDefaults(row);
            expect(row.sellingPrice).toBe(0);
        });

        it('should NOT auto-fill when costPrice is missing', () => {
            const row: Record<string, unknown> = { sellingPrice: 0 };
            applyProductImportDefaults(row);
            expect(row.sellingPrice).toBe(0);
        });

        it('should NOT auto-fill when costPrice is negative', () => {
            const row: Record<string, unknown> = { costPrice: -100, sellingPrice: 0 };
            applyProductImportDefaults(row);
            expect(row.sellingPrice).toBe(0);
        });

        // ── Decimal precision tests (SAP/Tally-grade) ──

        it('should handle 2404.19 cost precisely (no floating-point drift)', () => {
            const row: Record<string, unknown> = { costPrice: 2404.19, sellingPrice: 0 };
            applyProductImportDefaults(row);
            // 2404.19 × 1.6 = 3846.704 → rounds to 3847 (UGX has 0 decimal places)
            expect(row.sellingPrice).toBe(3847);
        });

        it('should handle small fractional cost (UGX rounds to whole)', () => {
            const row: Record<string, unknown> = { costPrice: 0.01, sellingPrice: 0 };
            applyProductImportDefaults(row);
            // 0.01 × 1.6 = 0.016 → rounds to 0 (UGX has 0 decimal places)
            expect(row.sellingPrice).toBe(0);
        });

        it('should handle 999999.99 cost (large value)', () => {
            const row: Record<string, unknown> = { costPrice: 999999.99, sellingPrice: 0 };
            applyProductImportDefaults(row);
            // 999999.99 × 1.6 = 1599999.984 → rounds to 1600000 (UGX whole number)
            expect(row.sellingPrice).toBe(1600000);
        });

        it('should handle 1.005 cost (UGX rounds to whole)', () => {
            const row: Record<string, unknown> = { costPrice: 1.005, sellingPrice: 0 };
            applyProductImportDefaults(row);
            // 1.005 × 1.6 = 1.608 → rounds to 2 (UGX has 0 decimal places)
            expect(row.sellingPrice).toBe(2);
        });

        it('should handle integer cost with clean result', () => {
            const row: Record<string, unknown> = { costPrice: 5000, sellingPrice: 0 };
            applyProductImportDefaults(row);
            expect(row.sellingPrice).toBe(8000);
        });

        it('should produce sellingPrice >= costPrice (satisfies Zod refinement)', () => {
            // Use whole-number costs since UGX rounds to 0 decimals
            const costs = [1, 100, 2404, 999999, 50000];
            for (const cost of costs) {
                const row: Record<string, unknown> = { costPrice: cost, sellingPrice: 0 };
                applyProductImportDefaults(row);
                expect(row.sellingPrice).toBeGreaterThanOrEqual(cost);
            }
        });
    });
});

// ── Zod ProductCreateSchema UOM Default ───────────────────

describe('ProductCreateSchema import defaults', () => {
    it('should default unitOfMeasure to EACH when not provided', () => {
        const result = ProductCreateSchema.safeParse({
            name: 'Imported Widget',
            sku: 'IMP-001',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.unitOfMeasure).toBe('EACH');
        }
    });

    it('should preserve explicit unitOfMeasure when provided', () => {
        const result = ProductCreateSchema.safeParse({
            name: 'Boxed Widget',
            sku: 'BOX-001',
            unitOfMeasure: 'BOX',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.unitOfMeasure).toBe('BOX');
        }
    });

    it('should accept EACH as a valid unitOfMeasure', () => {
        const result = ProductCreateSchema.safeParse({
            name: 'Each Widget',
            sku: 'EA-001',
            unitOfMeasure: 'EACH',
        });
        expect(result.success).toBe(true);
    });

    it('should still accept PIECE as a valid unitOfMeasure', () => {
        const result = ProductCreateSchema.safeParse({
            name: 'Piece Widget',
            sku: 'PC-001',
            unitOfMeasure: 'PIECE',
        });
        expect(result.success).toBe(true);
    });

    it('should pass Zod validation after auto-fill (selling >= cost)', () => {
        // Simulate the import workflow: apply defaults then validate
        const row: Record<string, unknown> = {
            name: 'Test Product',
            sku: 'AUTOFILL-001',
            costPrice: 2404.19,
            sellingPrice: 0,
        };
        applyProductImportDefaults(row);

        const result = ProductCreateSchema.safeParse(row);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.sellingPrice).toBeGreaterThanOrEqual(result.data.costPrice);
            expect(result.data.unitOfMeasure).toBe('EACH');
        }
    });
});
