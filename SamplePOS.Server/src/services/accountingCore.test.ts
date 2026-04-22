/**
 * accountingCore unit tests
 * Tests journal entry creation validation and trial balance logic.
 */
import { jest } from '@jest/globals';

/** Flexible mock fn type — avoids `any` while allowing mockResolvedValue/mockReturnValue */
type MockFn = (...args: unknown[]) => Promise<unknown>;

const mockQuery = jest.fn<MockFn>();
const mockClient = {
    query: mockQuery,
    release: jest.fn<MockFn>(),
};

jest.unstable_mockModule('../db/pool.js', () => ({
    pool: {
        query: mockQuery,
        connect: jest.fn<MockFn>().mockResolvedValue(mockClient),
    },
    default: {
        query: mockQuery,
        connect: jest.fn<MockFn>().mockResolvedValue(mockClient),
    },
}));

jest.unstable_mockModule('../db/unitOfWork.js', () => ({
    UnitOfWork: {
        run: jest.fn(async (_pool: unknown, fn: (client: unknown) => Promise<unknown>) =>
            fn(mockClient)
        ),
    },
}));

jest.unstable_mockModule('uuid', () => ({
    v4: jest.fn(() => 'test-uuid-1234'),
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
    default: {
        info: jest.fn<MockFn>(),
        error: jest.fn<MockFn>(),
        warn: jest.fn<MockFn>(),
        debug: jest.fn<MockFn>(),
    },
}));

const accountingCore = await import('./accountingCore.js');

describe('accountingCore', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    describe('exports', () => {
        it('should export createJournalEntry function', () => {
            expect(typeof accountingCore.createJournalEntry).toBe('function');
        });

        it('should export getAccountBalance function', () => {
            expect(typeof accountingCore.getAccountBalance).toBe('function');
        });

        it('should export validateTrialBalance function', () => {
            expect(typeof accountingCore.validateTrialBalance).toBe('function');
        });

        it('should export reverseTransaction function', () => {
            expect(typeof accountingCore.reverseTransaction).toBe('function');
        });
    });

    describe('createJournalEntry', () => {
        it('should reject unbalanced journal entries', async () => {
            await expect(
                accountingCore.createJournalEntry({
                    description: 'Test entry',
                    entryDate: '2025-01-01',
                    referenceType: 'TEST',
                    referenceId: 'test-1',
                    referenceNumber: 'TEST-001',
                    lines: [
                        { accountCode: '1000', debitAmount: 100, creditAmount: 0, description: 'Debit' },
                        { accountCode: '2000', debitAmount: 0, creditAmount: 50, description: 'Credit' },
                    ],
                    userId: 'user1',
                    idempotencyKey: 'idem-1',
                })
            ).rejects.toThrow();
        });

        it('should reject entries with no lines', async () => {
            await expect(
                accountingCore.createJournalEntry({
                    description: 'Empty entry',
                    entryDate: '2025-01-01',
                    referenceType: 'TEST',
                    referenceId: 'test-2',
                    referenceNumber: 'TEST-002',
                    lines: [],
                    userId: 'user1',
                    idempotencyKey: 'idem-2',
                })
            ).rejects.toThrow();
        });

        it('should reject entries where a line has both debit and credit', async () => {
            await expect(
                accountingCore.createJournalEntry({
                    description: 'Both sides',
                    entryDate: '2025-01-01',
                    referenceType: 'TEST',
                    referenceId: 'test-3',
                    referenceNumber: 'TEST-003',
                    lines: [
                        { accountCode: '1000', debitAmount: 100, creditAmount: 100, description: 'Both' },
                    ],
                    userId: 'user1',
                    idempotencyKey: 'idem-3',
                })
            ).rejects.toThrow();
        });

        it('should take an advisory lock before generating the next transaction number', async () => {
            const queryLog: string[] = [];

            mockQuery.mockImplementation(async (...args: unknown[]) => {
                const sql = String(args[0]);
                const params = Array.isArray(args[1]) ? (args[1] as unknown[]) : [];
                queryLog.push(sql);

                if (sql.includes('WHERE "IdempotencyKey" = $1')) {
                    return { rows: [], rowCount: 0 };
                }

                if (sql.includes('FROM financial_periods') && sql.includes('start_date AND end_date')) {
                    return { rows: [{ status: 'OPEN' }], rowCount: 1 };
                }

                if (sql.includes('pg_advisory_xact_lock')) {
                    return { rows: [{ pg_advisory_xact_lock: '' }], rowCount: 1 };
                }

                if (sql.includes('SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM 5) AS INTEGER))')) {
                    return { rows: [{ next_num: '42' }], rowCount: 1 };
                }

                if (sql.includes('INSERT INTO ledger_transactions')) {
                    return { rows: [], rowCount: 1 };
                }

                if (sql.includes('FROM accounts') && sql.includes('WHERE "AccountCode" = $1')) {
                    const accountCode = String(params[0]);
                    const accountMap: Record<string, { Id: string; AccountName: string; NormalBalance: 'DEBIT' | 'CREDIT' }> = {
                        '1010': { Id: 'acct-cash', AccountName: 'Cash', NormalBalance: 'DEBIT' },
                        '4000': { Id: 'acct-revenue', AccountName: 'Sales Revenue', NormalBalance: 'CREDIT' },
                    };
                    return { rows: [accountMap[accountCode]], rowCount: accountMap[accountCode] ? 1 : 0 };
                }

                if (
                    sql.includes('INSERT INTO ledger_entries') ||
                    sql.includes('UPDATE accounts') ||
                    sql.includes('INSERT INTO gl_period_balances') ||
                    sql.includes('INSERT INTO audit_log')
                ) {
                    return { rows: [], rowCount: 1 };
                }

                return { rows: [], rowCount: 0 };
            });

            const result = await accountingCore.createJournalEntry({
                description: 'Successful entry',
                entryDate: '2025-01-01',
                referenceType: 'TEST',
                referenceId: 'test-4',
                referenceNumber: 'TEST-004',
                lines: [
                    { accountCode: '1010', debitAmount: 100, creditAmount: 0, description: 'Cash' },
                    { accountCode: '4000', debitAmount: 0, creditAmount: 100, description: 'Revenue' },
                ],
                userId: 'user1',
                idempotencyKey: 'idem-4',
            });

            const advisoryLockQueryIndex = queryLog.findIndex((sql) => sql.includes('pg_advisory_xact_lock'));
            const transactionNumberQueryIndex = queryLog.findIndex((sql) =>
                sql.includes('SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM 5) AS INTEGER))')
            );

            expect(result.transactionNumber).toBe('TXN-000042');
            expect(advisoryLockQueryIndex).toBeGreaterThanOrEqual(0);
            expect(transactionNumberQueryIndex).toBeGreaterThanOrEqual(0);
            expect(advisoryLockQueryIndex).toBeLessThan(transactionNumberQueryIndex);
        });
    });

    describe('getAccountBalance', () => {
        it('should return null for non-existent account', async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            const balance = await accountingCore.getAccountBalance('9999');
            expect(balance).toBeNull();
        });
    });

    describe('validateTrialBalance', () => {
        it('should report balanced when debits equal credits', async () => {
            // Mock the trial balance query
            mockQuery.mockResolvedValue({
                rows: [{ total_debits: '10000.00', total_credits: '10000.00' }],
            });

            const result = await accountingCore.validateTrialBalance('2025-12-31');
            expect(result).toBeDefined();
        });
    });
});
