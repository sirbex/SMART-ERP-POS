/**
 * glEntryService — recordOpeningStockToGL unit tests
 *
 * Verifies the opening-stock GL posting creates the correct journal entry:
 *   DR Inventory (1300)              value
 *   CR Opening Balance Equity (3050) value
 */
import { jest } from '@jest/globals';

type MockFn = (...args: unknown[]) => Promise<unknown>;
const mockCreateJournalEntry = jest.fn<MockFn>();

jest.unstable_mockModule('./accountingCore.js', () => ({
    AccountingCore: {
        createJournalEntry: mockCreateJournalEntry,
    },
    AccountingError: class extends Error {
        constructor(message: string) { super(message); }
    },
    JournalLine: {},
}));

jest.unstable_mockModule('../db/pool.js', () => ({
    pool: {},
}));

jest.unstable_mockModule('../utils/constants.js', () => ({
    SYSTEM_USER_ID: 'system-user-id',
}));

const { recordOpeningStockToGL, AccountCodes } = await import('./glEntryService.js');

describe('recordOpeningStockToGL', () => {
    beforeEach(() => jest.clearAllMocks());

    const validData = {
        movementId: 'mov-001',
        movementNumber: 'MOV-2026-0001',
        movementDate: '2026-03-22',
        movementValue: 500,
        productName: 'Widget A',
        productId: 'prod-abc',
        batchNumber: 'BATCH-001',
    };

    it('should create a balanced journal entry (DR 1300 / CR 3050)', async () => {
        mockCreateJournalEntry.mockResolvedValue(undefined);

        await recordOpeningStockToGL(validData);

        expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
        const callArgs = mockCreateJournalEntry.mock.calls[0]![0] as Record<string, unknown>;

        // Verify journal lines
        const lines = callArgs.lines as Array<{
            accountCode: string;
            debitAmount: number;
            creditAmount: number;
        }>;
        expect(lines).toHaveLength(2);

        // DR Inventory (1300)
        const debitLine = lines.find(l => l.debitAmount > 0);
        expect(debitLine).toBeDefined();
        expect(debitLine!.accountCode).toBe(AccountCodes.INVENTORY);       // '1300'
        expect(debitLine!.debitAmount).toBe(500);
        expect(debitLine!.creditAmount).toBe(0);

        // CR Opening Balance Equity (3050)
        const creditLine = lines.find(l => l.creditAmount > 0);
        expect(creditLine).toBeDefined();
        expect(creditLine!.accountCode).toBe(AccountCodes.OPENING_BALANCE_EQUITY); // '3050'
        expect(creditLine!.creditAmount).toBe(500);
        expect(creditLine!.debitAmount).toBe(0);
    });

    it('should use correct reference type and idempotency key', async () => {
        mockCreateJournalEntry.mockResolvedValue(undefined);

        await recordOpeningStockToGL(validData);

        const callArgs = mockCreateJournalEntry.mock.calls[0]![0] as Record<string, unknown>;
        expect(callArgs.referenceType).toBe('OPENING_STOCK');
        expect(callArgs.referenceId).toBe('mov-001');
        expect(callArgs.idempotencyKey).toBe('OPENING_STOCK-prod-abc-BATCH-001');
    });

    it('should skip GL posting when movementValue is zero', async () => {
        await recordOpeningStockToGL({ ...validData, movementValue: 0 });

        expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    });

    it('should create reversal GL entry when movementValue is negative', async () => {
        mockCreateJournalEntry.mockResolvedValue(undefined);

        await recordOpeningStockToGL({ ...validData, movementValue: -10 });

        expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
        const callArgs = mockCreateJournalEntry.mock.calls[0]![0] as Record<string, unknown>;
        const lines = callArgs.lines as Array<{ accountCode: string; debitAmount: number; creditAmount: number }>;
        // Reversal: DR Opening Balance Equity (3050), CR Inventory (1300)
        expect(lines[0].accountCode).toBe('3050');
        expect(lines[0].debitAmount).toBe(10);
        expect(lines[0].creditAmount).toBe(0);
        expect(lines[1].accountCode).toBe('1300');
        expect(lines[1].debitAmount).toBe(0);
        expect(lines[1].creditAmount).toBe(10);
    });

    it('should rethrow if AccountingCore fails', async () => {
        mockCreateJournalEntry.mockRejectedValue(new Error('Account not found'));

        await expect(recordOpeningStockToGL(validData)).rejects.toThrow('GL posting failed');
    });

    it('should use SYSTEM_USER_ID as the posting user', async () => {
        mockCreateJournalEntry.mockResolvedValue(undefined);

        await recordOpeningStockToGL(validData);

        const callArgs = mockCreateJournalEntry.mock.calls[0]![0] as Record<string, unknown>;
        expect(callArgs.userId).toBe('system-user-id');
    });
});
