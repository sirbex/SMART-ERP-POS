/**
 * Return-to-supplier validation — regression suite for SAP/Odoo return limits.
 * Run: npm run test:return-grn
 */
import { describe, it, expect } from '@jest/globals';
import { ValidationError } from '../../middleware/errorHandler.js';
import {
    pickReturnableRow,
    resolveReturnBatchId,
    assertWithinReturnableLimits,
    validateReturnLinesAgainstSnapshot,
    cloneReturnableSnapshot,
    consumeReturnableQuantity,
    type ReturnableItemRow,
} from './returnGrnValidation.js';

function row(overrides: Partial<ReturnableItemRow> = {}): ReturnableItemRow {
    return {
        productId: 'prod-1',
        grItemId: 'gri-1',
        productName: 'Product A',
        batchId: 'batch-a',
        batchNumber: 'B-A',
        expiryDate: '2026-12-31',
        receivedQuantity: 10,
        returnedQuantity: 0,
        documentReturnableQuantity: 10,
        onHandQuantity: 10,
        consumedQuantity: 0,
        returnableQuantity: 10,
        returnBlockReason: null,
        ...overrides,
    };
}

describe('returnGrnValidation', () => {
    describe('pickReturnableRow', () => {
        it('selects explicit batch when batchId provided', () => {
            const items = [
                row({ batchId: 'batch-a', returnableQuantity: 3, expiryDate: '2026-01-01' }),
                row({ batchId: 'batch-b', returnableQuantity: 7, expiryDate: '2026-06-01' }),
            ];
            const picked = pickReturnableRow(items, 'prod-1', 'batch-b');
            expect(picked?.batchId).toBe('batch-b');
            expect(picked?.returnableQuantity).toBe(7);
        });

        it('uses FIFO by expiry when batchId omitted (not max-qty batch)', () => {
            const items = [
                row({
                    batchId: 'batch-late',
                    returnableQuantity: 20,
                    expiryDate: '2027-01-01',
                }),
                row({
                    batchId: 'batch-early',
                    returnableQuantity: 5,
                    expiryDate: '2026-01-01',
                }),
            ];
            const picked = pickReturnableRow(items, 'prod-1', null);
            expect(picked?.batchId).toBe('batch-early');
        });

        it('skips batches with zero returnable when picking FIFO', () => {
            const items = [
                row({ batchId: 'batch-empty', returnableQuantity: 0, onHandQuantity: 0, consumedQuantity: 10 }),
                row({ batchId: 'batch-stock', returnableQuantity: 4, expiryDate: '2026-03-01' }),
            ];
            const picked = pickReturnableRow(items, 'prod-1', null);
            expect(picked?.batchId).toBe('batch-stock');
        });
    });

    describe('assertWithinReturnableLimits', () => {
        it('allows quantity within on-hand returnable', () => {
            expect(() =>
                assertWithinReturnableLimits(row({ returnableQuantity: 5 }), 5, 'Product A'),
            ).not.toThrow();
        });

        it('rejects over-return with sold/consumed explanation', () => {
            const r = row({
                returnableQuantity: 2,
                onHandQuantity: 2,
                documentReturnableQuantity: 10,
                consumedQuantity: 8,
            });
            expect(() => assertWithinReturnableLimits(r, 5, 'Product A')).toThrow(
                /Maximum returnable is 2/,
            );
            try {
                assertWithinReturnableLimits(r, 5, 'Product A');
            } catch (e) {
                const msg = (e as Error).message;
                expect(msg).toContain('sold or consumed');
                expect(msg).toContain('on hand: 2');
            }
        });

        it('rejects when no matching row', () => {
            expect(() => assertWithinReturnableLimits(undefined, 1, 'X')).toThrow(
                /No returnable stock found/,
            );
        });
    });

    describe('validateReturnLinesAgainstSnapshot', () => {
        it('resolves and pins batch id when omitted on line', () => {
            const snapshot = [
                row({ productId: 'p1', batchId: 'b-fifo', returnableQuantity: 6, expiryDate: '2026-02-01' }),
            ];
            const resolved = validateReturnLinesAgainstSnapshot(snapshot, [
                { productId: 'p1', baseQuantity: 3, productName: 'A' },
            ]);
            expect(resolved[0].batchId).toBe('b-fifo');
        });

        it('rejects two lines that together exceed same batch on-hand', () => {
            const snapshot = [row({ productId: 'p1', batchId: 'b1', returnableQuantity: 7 })];
            expect(() =>
                validateReturnLinesAgainstSnapshot(snapshot, [
                    { productId: 'p1', batchId: 'b1', baseQuantity: 4, productName: 'A' },
                    { productId: 'p1', batchId: 'b1', baseQuantity: 4, productName: 'A' },
                ]),
            ).toThrow(/Maximum returnable is/);
        });

        it('allows two lines that fit within batch on-hand', () => {
            const snapshot = [row({ productId: 'p1', batchId: 'b1', returnableQuantity: 10 })];
            const resolved = validateReturnLinesAgainstSnapshot(snapshot, [
                { productId: 'p1', batchId: 'b1', baseQuantity: 4, productName: 'A' },
                { productId: 'p1', batchId: 'b1', baseQuantity: 5, productName: 'A' },
            ]);
            expect(resolved).toHaveLength(2);
        });

        it('create-then-post consistency: second line fails after first consumes snapshot', () => {
            const working = cloneReturnableSnapshot([
                row({ productId: 'p1', batchId: 'b1', returnableQuantity: 6 }),
            ]);
            consumeReturnableQuantity(working, 'p1', 'b1', 4, 'A');
            expect(() =>
                consumeReturnableQuantity(working, 'p1', 'b1', 4, 'A'),
            ).toThrow(/Maximum returnable is/);
        });
    });

    describe('resolveReturnBatchId', () => {
        it('returns explicit batch when provided', () => {
            const snapshot = [
                row({ batchId: 'b1' }),
                row({ batchId: 'b2', expiryDate: '2025-01-01' }),
            ];
            expect(resolveReturnBatchId(snapshot, 'prod-1', 'b2')).toBe('b2');
        });
    });
});
