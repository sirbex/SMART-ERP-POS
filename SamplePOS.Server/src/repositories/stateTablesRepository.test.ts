/**
 * stateTablesRepository — Unit tests for batch UPSERT functions
 *
 * Verifies:
 * 1. SQL column count matches value count (no parameter misalignment)
 * 2. Parameter arrays are correctly populated from input
 * 3. Decimal precision (toFixed(2) for money, toFixed(4) for quantities)
 * 4. Movement type logic (SOLD/RECEIVED/ADJUSTED) produces correct deltas
 * 5. Empty input short-circuits without query
 * 6. Gross profit is computed correctly (revenue - costOfGoods)
 * 7. ON CONFLICT columns match primary keys from DDL
 * 8. Customer/supplier balance math (invoiced - paid = balance)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { PoolClient, QueryResult } from 'pg';

type MockFn = (...args: unknown[]) => Promise<unknown>;

const mockClient = {
    query: jest.fn<MockFn>().mockResolvedValue({ rows: [], rowCount: 0 }),
} as unknown as PoolClient;

const {
    batchUpsertProductDailySummary,
    batchDecrementProductDailySummary,
    batchUpsertInventoryBalance,
    upsertProductDailySummary,
    decrementProductDailySummary,
    upsertCustomerBalance,
    upsertSupplierBalance,
    upsertInventoryBalance,
} = await import('./stateTablesRepository.js');

describe('stateTablesRepository', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (mockClient.query as jest.Mock<MockFn>).mockResolvedValue({ rows: [], rowCount: 0 });
    });

    // ========================================================================
    // batchUpsertProductDailySummary
    // ========================================================================
    describe('batchUpsertProductDailySummary', () => {
        it('should not query when items array is empty', async () => {
            await batchUpsertProductDailySummary(mockClient, '2025-06-15', []);
            expect(mockClient.query).not.toHaveBeenCalled();
        });

        it('should send 8 parameters with correct types and precision', async () => {
            const items = [
                { productId: 'aaa-111', category: 'Electronics', unitsSold: 3, revenue: 150.50, costOfGoods: 90.30, discountGiven: 10.25 },
                { productId: 'bbb-222', category: 'Food', unitsSold: 1.5, revenue: 25.00, costOfGoods: 12.50, discountGiven: 0 },
            ];

            await batchUpsertProductDailySummary(mockClient, '2025-06-15', items);

            expect(mockClient.query).toHaveBeenCalledTimes(1);
            const [sql, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];

            // 8 parameters: $1=date, $2-$8=arrays
            expect(params).toHaveLength(8);
            expect(params[0]).toBe('2025-06-15');

            // $2: productIds (uuid[])
            expect(params[1]).toEqual(['aaa-111', 'bbb-222']);

            // $3: categories (text[])
            expect(params[2]).toEqual(['Electronics', 'Food']);

            // $4: unitsSold (numeric[] — 4 decimal places)
            expect(params[3]).toEqual(['3.0000', '1.5000']);

            // $5: revenue (numeric[] — 2 decimal places)
            expect(params[4]).toEqual(['150.50', '25.00']);

            // $6: costOfGoods (numeric[] — 2 decimal places)
            expect(params[5]).toEqual(['90.30', '12.50']);

            // $7: grossProfit = revenue - cog (computed, 2dp)
            expect(params[6]).toEqual(['60.20', '12.50']);

            // $8: discountGiven (numeric[] — 2 decimal places)
            expect(params[7]).toEqual(['10.25', '0.00']);
        });

        it('should compute gross profit correctly for each item', async () => {
            const items = [
                { productId: 'x1', category: 'A', unitsSold: 1, revenue: 200, costOfGoods: 150, discountGiven: 0 },
                { productId: 'x2', category: 'B', unitsSold: 1, revenue: 50, costOfGoods: 60, discountGiven: 5 },
            ];

            await batchUpsertProductDailySummary(mockClient, '2025-01-01', items);

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            // item 1: 200 - 150 = 50.00, item 2: 50 - 60 = -10.00
            expect(params[6]).toEqual(['50.00', '-10.00']);
        });

        it('should default empty category to Uncategorized', async () => {
            const items = [
                { productId: 'z1', category: '', unitsSold: 1, revenue: 10, costOfGoods: 5, discountGiven: 0 },
            ];

            await batchUpsertProductDailySummary(mockClient, '2025-01-01', items);

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(params[2]).toEqual(['Uncategorized']);
        });

        it('SQL should contain ON CONFLICT (business_date, product_id)', async () => {
            const items = [{ productId: 'p1', category: 'A', unitsSold: 1, revenue: 10, costOfGoods: 5, discountGiven: 0 }];
            await batchUpsertProductDailySummary(mockClient, '2025-01-01', items);

            const [sql] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(sql).toContain('ON CONFLICT (business_date, product_id)');
        });

        it('SQL should INSERT 10 columns matching DDL', async () => {
            const items = [{ productId: 'p1', category: 'A', unitsSold: 1, revenue: 10, costOfGoods: 5, discountGiven: 0 }];
            await batchUpsertProductDailySummary(mockClient, '2025-01-01', items);

            const [sql] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            // Verify all 10 DDL columns are present in INSERT
            expect(sql).toContain('business_date');
            expect(sql).toContain('product_id');
            expect(sql).toContain('category');
            expect(sql).toContain('units_sold');
            expect(sql).toContain('revenue');
            expect(sql).toContain('cost_of_goods');
            expect(sql).toContain('gross_profit');
            expect(sql).toContain('discount_given');
            expect(sql).toContain('transaction_count');
            expect(sql).toContain('updated_at');
        });
    });

    // ========================================================================
    // batchDecrementProductDailySummary
    // ========================================================================
    describe('batchDecrementProductDailySummary', () => {
        it('should not query when items array is empty', async () => {
            await batchDecrementProductDailySummary(mockClient, '2025-06-15', []);
            expect(mockClient.query).not.toHaveBeenCalled();
        });

        it('should send 7 parameters with correct array structure', async () => {
            const items = [
                { productId: 'aaa-111', category: 'Electronics', unitsSold: 3, revenue: 150.50, costOfGoods: 90.30, discountGiven: 10 },
            ];

            await batchDecrementProductDailySummary(mockClient, '2025-06-15', items);

            expect(mockClient.query).toHaveBeenCalledTimes(1);
            const [sql, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];

            // 7 parameters: $1=date, $2-$7=arrays
            expect(params).toHaveLength(7);
            expect(params[0]).toBe('2025-06-15');
            expect(params[1]).toEqual(['aaa-111']); // productIds
            expect(params[2]).toEqual(['3.0000']);   // unitsSold
            expect(params[3]).toEqual(['150.50']);   // revenue
            expect(params[4]).toEqual(['90.30']);    // cog
            expect(params[5]).toEqual(['60.20']);    // gp (150.50 - 90.30)
            expect(params[6]).toEqual(['10.00']);    // discount
        });

        it('SQL should use UPDATE with FROM unnest pattern', async () => {
            const items = [{ productId: 'p1', category: 'A', unitsSold: 1, revenue: 10, costOfGoods: 5, discountGiven: 0 }];
            await batchDecrementProductDailySummary(mockClient, '2025-01-01', items);

            const [sql] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(sql).toContain('UPDATE product_daily_summary');
            expect(sql).toContain('FROM');
            expect(sql).toContain('unnest');
            expect(sql).toContain('WHERE pds.business_date = $1');
            expect(sql).toContain('pds.product_id = v.product_id');
        });

        it('SQL should subtract values (decrement pattern)', async () => {
            const items = [{ productId: 'p1', category: 'A', unitsSold: 1, revenue: 10, costOfGoods: 5, discountGiven: 0 }];
            await batchDecrementProductDailySummary(mockClient, '2025-01-01', items);

            const [sql] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            // All SET clauses should use subtraction
            expect(sql).toContain('pds.units_sold - v.units_sold');
            expect(sql).toContain('pds.revenue - v.revenue');
            expect(sql).toContain('pds.cost_of_goods - v.cog');
            expect(sql).toContain('pds.gross_profit - v.gp');
            expect(sql).toContain('pds.discount_given - v.discount');
            // transaction_count uses GREATEST to prevent negative
            expect(sql).toContain('GREATEST(pds.transaction_count - 1, 0)');
        });
    });

    // ========================================================================
    // batchUpsertInventoryBalance
    // ========================================================================
    describe('batchUpsertInventoryBalance', () => {
        it('should not query when items array is empty', async () => {
            await batchUpsertInventoryBalance(mockClient, [], 'SOLD', '2025-06-15');
            expect(mockClient.query).not.toHaveBeenCalled();
        });

        it('should send 6 parameters for SOLD movement', async () => {
            const items = [
                { productId: 'prod-1', quantity: 5 },
                { productId: 'prod-2', quantity: 3.5 },
            ];

            await batchUpsertInventoryBalance(mockClient, items, 'SOLD', '2025-06-15');

            expect(mockClient.query).toHaveBeenCalledTimes(1);
            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];

            expect(params).toHaveLength(6);
            // $1: productIds
            expect(params[0]).toEqual(['prod-1', 'prod-2']);
            // $2: qohDeltas — SOLD means negative QOH
            expect(params[1]).toEqual(['-5.0000', '-3.5000']);
            // $3: receivedDeltas — zero for SOLD
            expect(params[2]).toEqual(['0', '0']);
            // $4: soldDeltas — positive for SOLD
            expect(params[3]).toEqual(['5.0000', '3.5000']);
            // $5: adjustedDeltas — zero for SOLD
            expect(params[4]).toEqual(['0', '0']);
            // $6: movementDate
            expect(params[5]).toBe('2025-06-15');
        });

        it('should produce correct deltas for RECEIVED movement', async () => {
            const items = [{ productId: 'prod-1', quantity: 10 }];

            await batchUpsertInventoryBalance(mockClient, items, 'RECEIVED', '2025-06-15');

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];

            // RECEIVED: qoh=+qty, received=+qty, sold=0, adjusted=0
            expect(params[1]).toEqual(['10.0000']); // qohDeltas: positive
            expect(params[2]).toEqual(['10.0000']); // receivedDeltas: positive
            expect(params[3]).toEqual(['0']);        // soldDeltas: zero
            expect(params[4]).toEqual(['0']);        // adjustedDeltas: zero
        });

        it('should produce correct deltas for ADJUSTED movement', async () => {
            const items = [{ productId: 'prod-1', quantity: 7 }];

            await batchUpsertInventoryBalance(mockClient, items, 'ADJUSTED', '2025-06-15');

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];

            // ADJUSTED: qoh=+qty, received=0, sold=0, adjusted=+qty
            expect(params[1]).toEqual(['7.0000']); // qohDeltas: positive
            expect(params[2]).toEqual(['0']);       // receivedDeltas: zero
            expect(params[3]).toEqual(['0']);       // soldDeltas: zero
            expect(params[4]).toEqual(['7.0000']); // adjustedDeltas: positive
        });

        it('SQL should INSERT 7 columns matching inventory_balances DDL', async () => {
            const items = [{ productId: 'p1', quantity: 1 }];
            await batchUpsertInventoryBalance(mockClient, items, 'SOLD', '2025-01-01');

            const [sql] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(sql).toContain('product_id');
            expect(sql).toContain('quantity_on_hand');
            expect(sql).toContain('total_received');
            expect(sql).toContain('total_sold');
            expect(sql).toContain('total_adjusted');
            expect(sql).toContain('last_movement_date');
            expect(sql).toContain('updated_at');
        });

        it('SQL should ON CONFLICT on (product_id) matching PK', async () => {
            const items = [{ productId: 'p1', quantity: 1 }];
            await batchUpsertInventoryBalance(mockClient, items, 'SOLD', '2025-01-01');

            const [sql] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(sql).toContain('ON CONFLICT (product_id)');
        });

        it('SQL DO UPDATE should use additive math for running totals', async () => {
            const items = [{ productId: 'p1', quantity: 1 }];
            await batchUpsertInventoryBalance(mockClient, items, 'SOLD', '2025-01-01');

            const [sql] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(sql).toContain('inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand');
            expect(sql).toContain('inventory_balances.total_received + EXCLUDED.total_received');
            expect(sql).toContain('inventory_balances.total_sold + EXCLUDED.total_sold');
            expect(sql).toContain('inventory_balances.total_adjusted + EXCLUDED.total_adjusted');
        });
    });

    // ========================================================================
    // Single-item upsert functions (pre-existing, verify contract)
    // ========================================================================
    describe('upsertProductDailySummary', () => {
        it('should send 8 parameters with correct precision', async () => {
            await upsertProductDailySummary(mockClient, {
                businessDate: '2025-06-15',
                productId: 'uuid-1',
                category: 'Food',
                unitsSold: 2.5,
                revenue: 100.99,
                costOfGoods: 60.50,
                discountGiven: 5.10,
            });

            expect(mockClient.query).toHaveBeenCalledTimes(1);
            const [sql, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];

            expect(params).toHaveLength(8);
            expect(params[0]).toBe('2025-06-15');
            expect(params[1]).toBe('uuid-1');
            expect(params[2]).toBe('Food');
            expect(params[3]).toBe('2.5000');  // 4dp
            expect(params[4]).toBe('100.99');  // 2dp
            expect(params[5]).toBe('60.50');   // 2dp
            expect(params[6]).toBe('40.49');   // gross profit = 100.99 - 60.50
            expect(params[7]).toBe('5.10');    // 2dp

            expect(sql).toContain('ON CONFLICT (business_date, product_id)');
        });
    });

    describe('upsertCustomerBalance', () => {
        it('should compute balance = invoiced - paid', async () => {
            await upsertCustomerBalance(mockClient, {
                customerId: 'cust-1',
                invoicedAmount: 500,
                paidAmount: 200,
                invoiceDate: '2025-06-15',
            });

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(params[0]).toBe('cust-1');
            expect(params[1]).toBe('500.00');  // invoiced
            expect(params[2]).toBe('200.00');  // paid
            expect(params[3]).toBe('300.00');  // balance = 500 - 200
            expect(params[4]).toBe('2025-06-15'); // invoiceDate
            expect(params[5]).toBeNull();      // paymentDate (not provided)
        });

        it('should handle negative reversal amounts', async () => {
            await upsertCustomerBalance(mockClient, {
                customerId: 'cust-1',
                invoicedAmount: -500,
                paidAmount: -200,
                invoiceDate: '2025-06-15',
            });

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(params[1]).toBe('-500.00');  // negative invoiced
            expect(params[2]).toBe('-200.00');  // negative paid
            expect(params[3]).toBe('-300.00');  // balance = -500 - (-200) = -300
        });

        it('should handle payment-only (invoiced=0)', async () => {
            await upsertCustomerBalance(mockClient, {
                customerId: 'cust-1',
                invoicedAmount: 0,
                paidAmount: 300,
                paymentDate: '2025-06-15',
            });

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(params[1]).toBe('0.00');     // invoiced
            expect(params[2]).toBe('300.00');   // paid
            expect(params[3]).toBe('-300.00');  // balance = 0 - 300 = -300
            expect(params[4]).toBeNull();       // invoiceDate (not provided)
            expect(params[5]).toBe('2025-06-15'); // paymentDate
        });

        it('SQL should ON CONFLICT on (customer_id) matching PK', async () => {
            await upsertCustomerBalance(mockClient, {
                customerId: 'cust-1', invoicedAmount: 100, paidAmount: 0,
            });

            const [sql] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(sql).toContain('ON CONFLICT (customer_id)');
        });
    });

    describe('upsertSupplierBalance', () => {
        it('should compute balance = invoiced - paid', async () => {
            await upsertSupplierBalance(mockClient, {
                supplierId: 'sup-1',
                invoicedAmount: 1000,
                paidAmount: 0,
                grDate: '2025-06-15',
            });

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(params[0]).toBe('sup-1');
            expect(params[1]).toBe('1000.00');
            expect(params[2]).toBe('0.00');
            expect(params[3]).toBe('1000.00'); // balance = 1000 - 0
            expect(params[4]).toBe('2025-06-15'); // grDate
            expect(params[5]).toBeNull();      // paymentDate
        });

        it('SQL should ON CONFLICT on (supplier_id) matching PK', async () => {
            await upsertSupplierBalance(mockClient, {
                supplierId: 'sup-1', invoicedAmount: 100, paidAmount: 0,
            });

            const [sql] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(sql).toContain('ON CONFLICT (supplier_id)');
        });
    });

    describe('upsertInventoryBalance (single)', () => {
        it('should produce correct deltas for SOLD movement', async () => {
            await upsertInventoryBalance(mockClient, {
                productId: 'prod-1', quantity: 5, movementType: 'SOLD', movementDate: '2025-06-15',
            });

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(params[0]).toBe('prod-1');
            expect(params[1]).toBe('-5.0000');  // qoh: negative for SOLD
            expect(params[2]).toBe('0');        // received: zero
            expect(params[3]).toBe('5.0000');   // sold: positive
            expect(params[4]).toBe('0');        // adjusted: zero
            expect(params[5]).toBe('2025-06-15');
        });

        it('should produce correct deltas for RECEIVED movement', async () => {
            await upsertInventoryBalance(mockClient, {
                productId: 'prod-1', quantity: 10, movementType: 'RECEIVED', movementDate: '2025-06-15',
            });

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(params[1]).toBe('10.0000');  // qoh: positive for RECEIVED
            expect(params[2]).toBe('10.0000');  // received: positive
            expect(params[3]).toBe('0');        // sold: zero
            expect(params[4]).toBe('0');        // adjusted: zero
        });

        it('should produce correct deltas for ADJUSTED movement', async () => {
            await upsertInventoryBalance(mockClient, {
                productId: 'prod-1', quantity: 3, movementType: 'ADJUSTED', movementDate: '2025-06-15',
            });

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(params[1]).toBe('3.0000');  // qoh: positive for ADJUSTED
            expect(params[2]).toBe('0');       // received: zero
            expect(params[3]).toBe('0');       // sold: zero
            expect(params[4]).toBe('3.0000'); // adjusted: positive
        });
    });

    // ========================================================================
    // Decimal precision edge cases
    // ========================================================================
    describe('decimal precision edge cases', () => {
        it('batch UPSERT should not lose precision on repeating decimals', async () => {
            // 1/3 = 0.3333... — should be truncated to toFixed(4) = 0.3333
            const items = [
                { productId: 'p1', category: 'A', unitsSold: 1 / 3, revenue: 100 / 3, costOfGoods: 50 / 3, discountGiven: 10 / 3 },
            ];

            await batchUpsertProductDailySummary(mockClient, '2025-01-01', items);

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            // unitsSold: toFixed(4) of 0.33333...
            expect(params[3]).toEqual(['0.3333']);
            // revenue: toFixed(2) of 33.33333...
            expect(params[4]).toEqual(['33.33']);
            // cog: toFixed(2) of 16.66666...
            expect(params[5]).toEqual(['16.67']);
            // gp: 33.33 - 16.67 = 16.66 (but computed from full precision: 100/3 - 50/3 = 50/3 = 16.67)
            expect(params[6]).toEqual(['16.67']);
        });

        it('batch inventory should handle zero quantity correctly', async () => {
            // Zero quantity should still produce valid arrays
            const items = [{ productId: 'p1', quantity: 0 }];
            await batchUpsertInventoryBalance(mockClient, items, 'SOLD', '2025-01-01');

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(params[1]).toEqual(['0.0000']); // qoh: -0 = 0
            expect(params[3]).toEqual(['0.0000']); // sold: 0
        });

        it('batch inventory should handle very large quantities', async () => {
            const items = [{ productId: 'p1', quantity: 99999999.9999 }];
            await batchUpsertInventoryBalance(mockClient, items, 'RECEIVED', '2025-01-01');

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];
            expect(params[1]).toEqual(['99999999.9999']);
            expect(params[2]).toEqual(['99999999.9999']);
        });
    });

    // ========================================================================
    // Multi-item batch consistency
    // ========================================================================
    describe('multi-item batch consistency', () => {
        it('all arrays should have same length as items', async () => {
            const items = [
                { productId: 'a', category: 'X', unitsSold: 1, revenue: 10, costOfGoods: 5, discountGiven: 0 },
                { productId: 'b', category: 'Y', unitsSold: 2, revenue: 20, costOfGoods: 10, discountGiven: 1 },
                { productId: 'c', category: 'Z', unitsSold: 3, revenue: 30, costOfGoods: 15, discountGiven: 2 },
            ];

            await batchUpsertProductDailySummary(mockClient, '2025-01-01', items);

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];

            // All array params ($2-$8) must have length 3
            for (let i = 1; i <= 7; i++) {
                expect(Array.isArray(params[i])).toBe(true);
                expect((params[i] as unknown[]).length).toBe(3);
            }
        });

        it('inventory batch arrays should stay parallel across items', async () => {
            const items = [
                { productId: 'a', quantity: 5 },
                { productId: 'b', quantity: 10 },
            ];

            await batchUpsertInventoryBalance(mockClient, items, 'SOLD', '2025-01-01');

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];

            // All array params ($1-$5) must have length 2
            for (let i = 0; i <= 4; i++) {
                expect(Array.isArray(params[i])).toBe(true);
                expect((params[i] as unknown[]).length).toBe(2);
            }
            // Verify index alignment: item[0] → arrays[0], item[1] → arrays[1]
            expect((params[0] as string[])[0]).toBe('a');
            expect((params[0] as string[])[1]).toBe('b');
            expect((params[1] as string[])[0]).toBe('-5.0000');
            expect((params[1] as string[])[1]).toBe('-10.0000');
        });

        it('decrement batch arrays should stay parallel', async () => {
            const items = [
                { productId: 'a', category: 'X', unitsSold: 1, revenue: 10, costOfGoods: 5, discountGiven: 0 },
                { productId: 'b', category: 'Y', unitsSold: 2, revenue: 20, costOfGoods: 10, discountGiven: 1 },
            ];

            await batchDecrementProductDailySummary(mockClient, '2025-01-01', items);

            const [, params] = (mockClient.query as jest.Mock<MockFn>).mock.calls[0] as [string, unknown[]];

            // All array params ($2-$7) must have length 2
            for (let i = 1; i <= 6; i++) {
                expect(Array.isArray(params[i])).toBe(true);
                expect((params[i] as unknown[]).length).toBe(2);
            }
        });
    });
});
