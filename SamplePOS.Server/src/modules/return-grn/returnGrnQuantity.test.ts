import { describe, expect, it } from '@jest/globals';
import {
    returnGrnBaseToDisplayQuantity,
    returnGrnEnteredToBaseQuantity,
    returnGrnPurchaseQuantityFromBase,
} from './returnGrnQuantity.js';
import {
    assertWithinReturnableLimits,
    validateReturnLinesAgainstSnapshot,
    type ReturnableItemRow,
} from './returnGrnValidation.js';

const BOX_FACTOR = 10;
const MAX_BASE = 20;

function snapshotRow(overrides: Partial<ReturnableItemRow> = {}): ReturnableItemRow {
    return {
        productId: 'p1',
        batchId: 'b1',
        receivedQuantity: MAX_BASE,
        documentReturnableQuantity: MAX_BASE,
        onHandQuantity: MAX_BASE,
        consumedQuantity: 0,
        returnableQuantity: MAX_BASE,
        ...overrides,
    };
}

describe('returnGrnQuantity — MUoM single conversion (2 BOX = 20 PCS)', () => {
    it('1 BOX → 10 base', () => {
        expect(returnGrnEnteredToBaseQuantity(1, BOX_FACTOR)).toBe(10);
        expect(returnGrnPurchaseQuantityFromBase(10, BOX_FACTOR)).toBe(1);
    });

    it('10 PCS → 10 base (factor 1)', () => {
        expect(returnGrnEnteredToBaseQuantity(10, 1)).toBe(10);
    });

    it('4 PCS → 4 base', () => {
        expect(returnGrnEnteredToBaseQuantity(4, 1)).toBe(4);
    });

    it('14 PCS → 14 base', () => {
        expect(returnGrnEnteredToBaseQuantity(14, 1)).toBe(14);
    });

    it('0.5 BOX → 5 base', () => {
        expect(returnGrnEnteredToBaseQuantity(0.5, BOX_FACTOR)).toBe(5);
    });

    it('does not double-convert: 20 PCS stays 20 base (not 200)', () => {
        expect(returnGrnEnteredToBaseQuantity(20, 1)).toBe(20);
        expect(returnGrnEnteredToBaseQuantity(20, BOX_FACTOR)).toBe(200);
    });

    it('base to display: 20 PCS max → 2 BOX', () => {
        expect(returnGrnBaseToDisplayQuantity(MAX_BASE, BOX_FACTOR)).toBe(2);
    });
});

describe('returnGrnQuantity — validation matrix (max 20 PCS)', () => {
    const row = snapshotRow();

    const cases: Array<{ label: string; qty: number; factor: number; symbol: string; ok: boolean }> = [
        { label: '1 BOX', qty: 1, factor: BOX_FACTOR, symbol: 'BOX', ok: true },
        { label: '10 PCS', qty: 10, factor: 1, symbol: 'PCS', ok: true },
        { label: '4 PCS', qty: 4, factor: 1, symbol: 'PCS', ok: true },
        { label: '14 PCS', qty: 14, factor: 1, symbol: 'PCS', ok: true },
        { label: '0.5 BOX', qty: 0.5, factor: BOX_FACTOR, symbol: 'BOX', ok: true },
        { label: '25 PCS over-return', qty: 25, factor: 1, symbol: 'PCS', ok: false },
        { label: '3 BOX over-return', qty: 3, factor: BOX_FACTOR, symbol: 'BOX', ok: false },
    ];

    for (const c of cases) {
        it(`${c.label} — ${c.ok ? 'allowed' : 'rejected'}`, () => {
            const base = returnGrnEnteredToBaseQuantity(c.qty, c.factor);
            const display = {
                enteredQuantity: c.qty,
                enteredUomSymbol: c.symbol,
                factorToBase: c.factor,
                baseUomSymbol: 'PCS',
            };
            const run = () =>
                assertWithinReturnableLimits(row, base, 'test pro 1', display);

            if (c.ok) {
                expect(run).not.toThrow();
            } else {
                expect(run).toThrow(
                    new RegExp(
                        `Cannot return ${c.qty} ${c.symbol}\\. Maximum returnable is`,
                    ),
                );
            }
        });
    }

    it('25 PCS error includes units', () => {
        try {
            assertWithinReturnableLimits(
                row,
                25,
                'test pro 1',
                { enteredQuantity: 25, enteredUomSymbol: 'PCS', factorToBase: 1 },
            );
        } catch (e) {
            expect((e as Error).message).toBe(
                'Cannot return 25 PCS. Maximum returnable is 20 PCS.',
            );
        }
    });

    it('3 BOX error includes units', () => {
        try {
            assertWithinReturnableLimits(
                row,
                30,
                'test pro 1',
                { enteredQuantity: 3, enteredUomSymbol: 'BOX', factorToBase: BOX_FACTOR },
            );
        } catch (e) {
            expect((e as Error).message).toBe(
                'Cannot return 3 BOX. Maximum returnable is 2 BOX.',
            );
        }
    });

    it('multi-line snapshot: 1 BOX + 10 PCS fits 20 PCS', () => {
        const snapshot = [snapshotRow()];
        const resolved = validateReturnLinesAgainstSnapshot(snapshot, [
            {
                productId: 'p1',
                baseQuantity: returnGrnEnteredToBaseQuantity(1, BOX_FACTOR),
                productName: 'test pro 1',
            },
            {
                productId: 'p1',
                baseQuantity: returnGrnEnteredToBaseQuantity(10, 1),
                productName: 'test pro 1',
            },
        ]);
        expect(resolved).toHaveLength(2);
    });
});
