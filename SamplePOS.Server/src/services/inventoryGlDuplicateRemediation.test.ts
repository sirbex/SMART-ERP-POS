import {
    selectDuplicateTransactionsToReverse,
} from './inventoryGlDuplicateRemediation.js';

describe('inventoryGlDuplicateRemediation', () => {
    describe('selectDuplicateTransactionsToReverse', () => {
        it('returns empty when only one transaction', () => {
            expect(
                selectDuplicateTransactionsToReverse([
                    { id: 'a', createdAt: '2026-01-01T10:00:00Z' },
                ]),
            ).toEqual([]);
        });

        it('keeps earliest and returns later ids for reversal', () => {
            expect(
                selectDuplicateTransactionsToReverse([
                    { id: 'newest', createdAt: '2026-03-01T10:00:00Z' },
                    { id: 'oldest', createdAt: '2026-01-01T10:00:00Z' },
                    { id: 'middle', createdAt: '2026-02-01T10:00:00Z' },
                ]),
            ).toEqual(['middle', 'newest']);
        });

        it('preserves stable order among duplicates after sort', () => {
            const ids = selectDuplicateTransactionsToReverse([
                { id: 'txn-2', createdAt: '2026-01-02T00:00:00Z' },
                { id: 'txn-1', createdAt: '2026-01-01T00:00:00Z' },
                { id: 'txn-3', createdAt: '2026-01-03T00:00:00Z' },
            ]);
            expect(ids).toEqual(['txn-2', 'txn-3']);
        });
    });
});
