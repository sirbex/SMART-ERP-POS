/**
 * AT_COST FIFO issue-cost preview — blended layer cost per base unit.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Decimal from 'decimal.js';
import {
    previewFefoIssueCostForBaseQty,
    resolveAtCostPerBaseUnit,
    type ProductValuationForAtCost,
} from './atCostIssuePrice.js';

type MockQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, string>> }>;

describe('atCostIssuePrice', () => {
    let mockQuery: jest.Mock<MockQuery>;

    beforeEach(() => {
        mockQuery = jest.fn<MockQuery>();
    });

    const pool = { query: (...args: unknown[]) => mockQuery(args[0] as string, args[1] as unknown[]) } as never;

    it('previewFefoIssueCostForBaseQty blends FEFO layers (10@110 + 10@125 → 11,000 / 20)', async () => {
        mockQuery.mockResolvedValue({
            rows: [
                { remaining_quantity: '10', cost_price: '110' },
                { remaining_quantity: '10', cost_price: '125' },
            ],
        });

        const preview = await previewFefoIssueCostForBaseQty(pool, 'product-1', new Decimal(20));
        expect(preview.totalCost.toNumber()).toBe(2350);
        expect(preview.coveredQty.toNumber()).toBe(20);
        expect(preview.shortfall.toNumber()).toBe(0);
    });

    it('resolveAtCostPerBaseUnit returns blended FIFO issue cost per base (2350/20 → 118 UGX)', async () => {
        mockQuery.mockResolvedValue({
            rows: [
                { remaining_quantity: '10', cost_price: '110' },
                { remaining_quantity: '10', cost_price: '125' },
            ],
        });

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
});
