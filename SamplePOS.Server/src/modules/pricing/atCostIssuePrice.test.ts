/**
 * AT_COST FIFO issue-cost preview — blended layer cost per base unit.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Decimal from 'decimal.js';
import {
    previewFefoIssueCostForBaseQty,
    previewFefoIssueLayers,
    resolveAtCostPerBaseUnit,
    resolveAtCostWithLayers,
    normalizeLegacyFefoBatchRows,
    type ProductValuationForAtCost,
} from './atCostIssuePrice.js';

type MockQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, string>> }>;

describe('atCostIssuePrice', () => {
    let mockQuery: jest.Mock<MockQuery>;

    beforeEach(() => {
        mockQuery = jest.fn<MockQuery>();
    });

    const pool = { query: (...args: unknown[]) => mockQuery(args[0] as string, args[1] as unknown[]) } as never;

    function mockFefoOnly(rows: Array<Record<string, string>>) {
        mockQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('product_uoms')) {
                return { rows: [{ max_factor: '1' }] };
            }
            return { rows };
        });
    }

    it('previewFefoIssueCostForBaseQty blends FEFO layers (10@110 + 10@125 → 11,000 / 20)', async () => {
        mockFefoOnly([
            { remaining_quantity: '10', cost_price: '110' },
            { remaining_quantity: '10', cost_price: '125' },
        ]);

        const preview = await previewFefoIssueCostForBaseQty(pool, 'product-1', new Decimal(20));
        expect(preview.totalCost.toNumber()).toBe(2350);
        expect(preview.coveredQty.toNumber()).toBe(20);
        expect(preview.shortfall.toNumber()).toBe(0);
    });

    it('resolveAtCostPerBaseUnit returns blended FIFO issue cost per base (2350/20 → 118 UGX)', async () => {
        mockFefoOnly([
            { remaining_quantity: '10', cost_price: '110' },
            { remaining_quantity: '10', cost_price: '125' },
        ]);

        const valuation: ProductValuationForAtCost = {
            sellingPrice: '1500',
            costPrice: '1250',
            averageCost: '0',
            costingMethod: 'FIFO',
        };

        const result = await resolveAtCostPerBaseUnit(pool, 'product-1', 20, valuation);
        expect(result.unitPricePerBase).toBe(118);
        expect(result.ruleName).toBe('At Cost (FIFO issue)');
    });

    it('previewFefoIssueLayers returns separate segments per batch cost (20k + 18k)', async () => {
        mockFefoOnly([
            { remaining_quantity: '1', cost_price: '20000' },
            { remaining_quantity: '1', cost_price: '18000' },
        ]);

        const layers = await previewFefoIssueLayers(pool, 'product-1', new Decimal(2));
        expect(layers).toHaveLength(2);
        expect(layers[0]).toMatchObject({ baseQuantity: 1, unitCostPerBase: 20000 });
        expect(layers[1]).toMatchObject({ baseQuantity: 1, unitCostPerBase: 18000 });
    });

    it('resolveAtCostWithLayers exposes layers and blended per-base (38k/2 → 19k)', async () => {
        mockFefoOnly([
            { remaining_quantity: '1', cost_price: '20000' },
            { remaining_quantity: '1', cost_price: '18000' },
        ]);

        const valuation: ProductValuationForAtCost = {
            sellingPrice: '25000',
            costPrice: '19000',
            averageCost: '0',
            costingMethod: 'FIFO',
        };

        const result = await resolveAtCostWithLayers(pool, 'product-1', 2, valuation);
        expect(result.layers).toHaveLength(2);
        expect(result.unitPricePerBase).toBe(19000);
    });

    it('resolveAtCostPerBaseUnit uses average for AVCO', async () => {
        const valuation: ProductValuationForAtCost = {
            sellingPrice: '1500',
            costPrice: '1250',
            averageCost: '800',
            costingMethod: 'AVCO',
        };

        const result = await resolveAtCostPerBaseUnit(pool, 'product-1', 5, valuation);
        expect(result.unitPricePerBase).toBe(800);
        expect(result.ruleName).toBe('At Cost (average)');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('normalizeLegacyFefoBatchRows converts strip batches to base (Ozempic pattern)', () => {
        const rows = [
            { remaining_quantity: '1', cost_price: '1600000' },
            { remaining_quantity: '2', cost_price: '1150000' },
        ];
        const normalized = normalizeLegacyFefoBatchRows(
            rows,
            new Decimal(30),
            10,
            new Decimal(130000),
        );
        expect(normalized[0]).toMatchObject({ remaining_quantity: '10.0000', cost_price: '160000' });
        expect(normalized[1]).toMatchObject({ remaining_quantity: '20.0000', cost_price: '115000' });
    });

    it('previewFefoIssueLayers splits legacy strip batches for 3-strip AT_COST sale', async () => {
        mockQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('product_uoms')) {
                return { rows: [{ max_factor: '10' }] };
            }
            return {
                rows: [
                    { remaining_quantity: '1', cost_price: '1600000' },
                    { remaining_quantity: '2', cost_price: '1150000' },
                ],
            };
        });

        const layers = await previewFefoIssueLayers(
            pool,
            'ozempic',
            new Decimal(30),
            new Decimal(130000),
        );
        expect(layers).toHaveLength(2);
        expect(layers[0]).toMatchObject({ baseQuantity: 10, unitCostPerBase: 160000, totalCost: 1600000 });
        expect(layers[1]).toMatchObject({ baseQuantity: 20, unitCostPerBase: 115000, totalCost: 2300000 });
    });

    it('resolveAtCostWithLayers returns 130000 per base for 3-strip Ozempic FEFO blend', async () => {
        mockQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('product_uoms')) {
                return { rows: [{ max_factor: '10' }] };
            }
            return {
                rows: [
                    { remaining_quantity: '1', cost_price: '1600000' },
                    { remaining_quantity: '2', cost_price: '1150000' },
                ],
            };
        });

        const valuation: ProductValuationForAtCost = {
            sellingPrice: '1700000',
            costPrice: '130000',
            averageCost: '130000',
            costingMethod: 'FIFO',
        };

        const result = await resolveAtCostWithLayers(pool, 'ozempic', 30, valuation);
        expect(result.unitPricePerBase).toBe(130000);
        expect(result.layers).toHaveLength(2);
    });
});
