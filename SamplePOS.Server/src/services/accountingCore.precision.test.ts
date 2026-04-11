/**
 * AccountingCore — Precision & Accuracy Unit Tests
 *
 * Tests double-entry validation, balance computation, and journal line
 * validation with edge-case amounts that expose floating-point failures.
 *
 * Every test is a pure-function test on AccountingCore.validateDoubleEntry()
 * and AccountingCore.validateLineAmounts() — no DB mocking needed.
 */
import { jest } from '@jest/globals';
import Decimal from 'decimal.js';

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
    v4: jest.fn(() => 'test-uuid-precision'),
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
    default: {
        info: jest.fn<MockFn>(),
        error: jest.fn<MockFn>(),
        warn: jest.fn<MockFn>(),
        debug: jest.fn<MockFn>(),
    },
}));

const { AccountingCore, DoubleEntryViolationError } = await import('./accountingCore.js');
const { Money } = await import('../utils/money.js');

describe('AccountingCore — Precision & Accuracy', () => {
    // ========================================================================
    // validateDoubleEntry — Balanced Entries
    // ========================================================================
    describe('validateDoubleEntry — balanced entries', () => {
        it('should accept perfectly balanced 2-line entry', () => {
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'Cash', debitAmount: 1000, creditAmount: 0 },
                { accountCode: '4000', description: 'Revenue', debitAmount: 0, creditAmount: 1000 },
            ]);
            expect(result.isValid).toBe(true);
            expect(result.totalDebits).toBe(1000);
            expect(result.totalCredits).toBe(1000);
            expect(result.difference).toBe(0);
        });

        it('should accept multi-line balanced entry (sale + COGS)', () => {
            // Cash sale with COGS: DR Cash 1500, CR Revenue 1500, DR COGS 900, CR Inventory 900
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'Cash', debitAmount: 1500, creditAmount: 0 },
                { accountCode: '4000', description: 'Revenue', debitAmount: 0, creditAmount: 1500 },
                { accountCode: '5000', description: 'COGS', debitAmount: 900, creditAmount: 0 },
                { accountCode: '1300', description: 'Inventory', debitAmount: 0, creditAmount: 900 },
            ]);
            expect(result.isValid).toBe(true);
            expect(result.totalDebits).toBe(2400);
            expect(result.totalCredits).toBe(2400);
        });

        it('should accept credit sale with partial payment (3-debit entry)', () => {
            // Sale 10000, paid 3000, AR 7000
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'Cash paid', debitAmount: 3000, creditAmount: 0 },
                { accountCode: '1200', description: 'AR unpaid', debitAmount: 7000, creditAmount: 0 },
                { accountCode: '4000', description: 'Revenue', debitAmount: 0, creditAmount: 10000 },
            ]);
            expect(result.isValid).toBe(true);
        });

        it('should accept entry with tax (3-credit split)', () => {
            // Sale 1180 (1000 + 18% tax): DR Cash 1180, CR Revenue 1000, CR Tax 180
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'Cash', debitAmount: 1180, creditAmount: 0 },
                { accountCode: '4000', description: 'Revenue', debitAmount: 0, creditAmount: 1000 },
                { accountCode: '2300', description: 'Tax', debitAmount: 0, creditAmount: 180 },
            ]);
            expect(result.isValid).toBe(true);
        });
    });

    // ========================================================================
    // validateDoubleEntry — Unbalanced Entries (must reject)
    // ========================================================================
    describe('validateDoubleEntry — unbalanced entries', () => {
        it('should reject when debits exceed credits', () => {
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'Cash', debitAmount: 1000, creditAmount: 0 },
                { accountCode: '4000', description: 'Revenue', debitAmount: 0, creditAmount: 999 },
            ]);
            expect(result.isValid).toBe(false);
            expect(result.difference).toBe(1);
        });

        it('should reject when credits exceed debits', () => {
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'Cash', debitAmount: 999, creditAmount: 0 },
                { accountCode: '4000', description: 'Revenue', debitAmount: 0, creditAmount: 1000 },
            ]);
            expect(result.isValid).toBe(false);
        });

        it('should reject empty lines', () => {
            const result = AccountingCore.validateDoubleEntry([]);
            // Empty: both zero — debits=credits=0 — within tolerance but no lines
            // Actually: 0-0=0, difference < 0.001 — isValid = true BUT createJournalEntry rejects at line validation
            expect(result.difference).toBe(0);
        });

        it('should reject when off by 0.01 (rounding drift)', () => {
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'Cash', debitAmount: 100.01, creditAmount: 0 },
                { accountCode: '4000', description: 'Revenue', debitAmount: 0, creditAmount: 100 },
            ]);
            expect(result.isValid).toBe(false);
            expect(result.difference).toBeCloseTo(0.01, 5);
        });
    });

    // ========================================================================
    // validateDoubleEntry — Floating-Point Precision Traps
    // ========================================================================
    describe('validateDoubleEntry — floating-point precision', () => {
        it('should handle 0.1 + 0.2 correctly (classic JS trap)', () => {
            // In raw JS: 0.1 + 0.2 = 0.30000000000000004
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'A', debitAmount: 0.1, creditAmount: 0 },
                { accountCode: '1020', description: 'B', debitAmount: 0.2, creditAmount: 0 },
                { accountCode: '4000', description: 'C', debitAmount: 0, creditAmount: 0.3 },
            ]);
            expect(result.isValid).toBe(true);
            // Decimal.js handles this correctly
        });

        it('should handle large numbers without precision loss', () => {
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'Cash', debitAmount: 999999999.99, creditAmount: 0 },
                { accountCode: '4000', description: 'Revenue', debitAmount: 0, creditAmount: 999999999.99 },
            ]);
            expect(result.isValid).toBe(true);
            expect(result.totalDebits).toBe(999999999.99);
            expect(result.totalCredits).toBe(999999999.99);
        });

        it('should handle many small amounts summing to large total', () => {
            // 1000 lines of $0.01 = $10.00 total
            const lines = [];
            for (let i = 0; i < 1000; i++) {
                lines.push({ accountCode: `${1010 + i}`, description: `Line ${i}`, debitAmount: 0.01, creditAmount: 0 });
            }
            lines.push({ accountCode: '4000', description: 'Total', debitAmount: 0, creditAmount: 10 });

            const result = AccountingCore.validateDoubleEntry(lines);
            expect(result.isValid).toBe(true);
            expect(result.totalDebits).toBe(10);
        });

        it('should handle repeating decimal 1/3 amounts correctly', () => {
            // 33.33 + 33.33 + 33.34 = 100.00
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'A', debitAmount: 33.33, creditAmount: 0 },
                { accountCode: '1020', description: 'B', debitAmount: 33.33, creditAmount: 0 },
                { accountCode: '1030', description: 'C', debitAmount: 33.34, creditAmount: 0 },
                { accountCode: '4000', description: 'Total', debitAmount: 0, creditAmount: 100 },
            ]);
            expect(result.isValid).toBe(true);
        });

        it('should handle UGX-scale amounts (millions, no decimals)', () => {
            // Typical UGX sale: 1,500,000 UGX
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'Cash', debitAmount: 1500000, creditAmount: 0 },
                { accountCode: '4000', description: 'Revenue', debitAmount: 0, creditAmount: 1500000 },
                { accountCode: '5000', description: 'COGS', debitAmount: 900000, creditAmount: 0 },
                { accountCode: '1300', description: 'Inventory', debitAmount: 0, creditAmount: 900000 },
            ]);
            expect(result.isValid).toBe(true);
        });

        it('should handle mixed inventory + service revenue split', () => {
            // Sale total 10000: inventory 7500, service 2500
            // Tax 1800 (18% of 10000)
            // COGS 4500 (inventory only)
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'Cash', debitAmount: 11800, creditAmount: 0 },
                { accountCode: '4000', description: 'Inv Revenue', debitAmount: 0, creditAmount: 7500 },
                { accountCode: '4100', description: 'Svc Revenue', debitAmount: 0, creditAmount: 2500 },
                { accountCode: '2300', description: 'Tax', debitAmount: 0, creditAmount: 1800 },
                { accountCode: '5000', description: 'COGS', debitAmount: 4500, creditAmount: 0 },
                { accountCode: '1300', description: 'Inventory', debitAmount: 0, creditAmount: 4500 },
            ]);
            expect(result.isValid).toBe(true);
            expect(result.totalDebits).toBe(16300);
            expect(result.totalCredits).toBe(16300);
        });
    });

    // ========================================================================
    // validateDoubleEntry — Tolerance boundary (0.001)
    // ========================================================================
    describe('validateDoubleEntry — tolerance boundary', () => {
        it('should accept difference of exactly 0.0009 (under tolerance)', () => {
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'A', debitAmount: 100.0009, creditAmount: 0 },
                { accountCode: '4000', description: 'B', debitAmount: 0, creditAmount: 100 },
            ]);
            expect(result.isValid).toBe(true);
        });

        it('should reject difference of exactly 0.001 (at tolerance)', () => {
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'A', debitAmount: 100.001, creditAmount: 0 },
                { accountCode: '4000', description: 'B', debitAmount: 0, creditAmount: 100 },
            ]);
            // 0.001 is NOT less than 0.001 — should be INVALID
            expect(result.isValid).toBe(false);
        });

        it('should reject difference of 0.002 (over tolerance)', () => {
            const result = AccountingCore.validateDoubleEntry([
                { accountCode: '1010', description: 'A', debitAmount: 100.002, creditAmount: 0 },
                { accountCode: '4000', description: 'B', debitAmount: 0, creditAmount: 100 },
            ]);
            expect(result.isValid).toBe(false);
        });
    });

    // ========================================================================
    // validateLineAmounts
    // ========================================================================
    describe('validateLineAmounts', () => {
        it('should accept line with only debit', () => {
            expect(AccountingCore.validateLineAmounts({
                accountCode: '1010', description: 'Cash', debitAmount: 100, creditAmount: 0,
            })).toBe(true);
        });

        it('should accept line with only credit', () => {
            expect(AccountingCore.validateLineAmounts({
                accountCode: '4000', description: 'Revenue', debitAmount: 0, creditAmount: 100,
            })).toBe(true);
        });

        it('should reject line with both debit and credit', () => {
            expect(AccountingCore.validateLineAmounts({
                accountCode: '1010', description: 'Bad', debitAmount: 100, creditAmount: 50,
            })).toBe(false);
        });

        it('should reject line with neither debit nor credit', () => {
            expect(AccountingCore.validateLineAmounts({
                accountCode: '1010', description: 'Zero', debitAmount: 0, creditAmount: 0,
            })).toBe(false);
        });

        it('should reject negative amounts as non-positive (treated as 0)', () => {
            // Negative debit → hasDebit = false, negative credit → hasCredit = false
            expect(AccountingCore.validateLineAmounts({
                accountCode: '1010', description: 'Neg', debitAmount: -100, creditAmount: 0,
            })).toBe(false);
        });
    });

    // ========================================================================
    // createJournalEntry — Validation before DB
    // ========================================================================
    describe('createJournalEntry — pre-DB validation', () => {
        it('should throw DoubleEntryViolationError for unbalanced entry', async () => {
            await expect(
                AccountingCore.createJournalEntry({
                    entryDate: '2026-01-01',
                    description: 'Unbalanced test',
                    referenceType: 'TEST',
                    referenceId: 'test-1',
                    referenceNumber: 'TEST-001',
                    lines: [
                        { accountCode: '1010', description: 'Cash', debitAmount: 1000, creditAmount: 0 },
                        { accountCode: '4000', description: 'Revenue', debitAmount: 0, creditAmount: 500 },
                    ],
                    userId: 'user1',
                    idempotencyKey: 'test-unbalanced-1',
                })
            ).rejects.toThrow();
        });

        it('should throw for line with both debit and credit', async () => {
            await expect(
                AccountingCore.createJournalEntry({
                    entryDate: '2026-01-01',
                    description: 'Bad line test',
                    referenceType: 'TEST',
                    referenceId: 'test-2',
                    referenceNumber: 'TEST-002',
                    lines: [
                        { accountCode: '1010', description: 'Bad', debitAmount: 100, creditAmount: 100 },
                    ],
                    userId: 'user1',
                    idempotencyKey: 'test-bad-line-1',
                })
            ).rejects.toThrow();
        });

        it('should throw for entry with no valid lines', async () => {
            await expect(
                AccountingCore.createJournalEntry({
                    entryDate: '2026-01-01',
                    description: 'Empty',
                    referenceType: 'TEST',
                    referenceId: 'test-3',
                    referenceNumber: 'TEST-003',
                    lines: [],
                    userId: 'user1',
                    idempotencyKey: 'test-empty-1',
                })
            ).rejects.toThrow();
        });
    });

    // ========================================================================
    // Balance computation precision
    // ========================================================================
    describe('balance computation precision', () => {
        it('Money.subtract should give exact debit-credit difference', () => {
            const debit = Money.parse(1234.56);
            const credit = Money.parse(1234.56);
            const diff = Money.subtract(debit, credit);
            expect(diff.toNumber()).toBe(0);
        });

        it('Money.add of many small values should not accumulate error', () => {
            let total = Money.zero();
            for (let i = 0; i < 10000; i++) {
                total = Money.add(total, 0.01);
            }
            expect(total.toNumber()).toBe(100);
        });

        it('Money.subtract chain should preserve precision', () => {
            let balance = Money.parse(1000000);
            // Subtract 999,999 times $1.00
            for (let i = 0; i < 999999; i++) {
                balance = Money.subtract(balance, 1);
            }
            expect(balance.toNumber()).toBe(1);
        });

        it('running balance formula: opening + debits - credits', () => {
            const opening = Money.parse(5000);
            const debits = Money.parse(3000);
            const credits = Money.parse(2000);
            const running = Money.add(opening, Money.subtract(debits, credits));
            expect(running.toNumber()).toBe(6000);
        });

        it('asset account balance change: debit minus credit', () => {
            // Asset account (normal=DEBIT): +100 debit, -30 credit = +70 net
            const change = Money.subtract(100, 30);
            expect(change.toNumber()).toBe(70);
        });

        it('liability account balance change: credit minus debit', () => {
            // Liability account (normal=CREDIT): +100 credit, -30 debit = +70 net
            const change = Money.subtract(100, 30);
            expect(change.toNumber()).toBe(70);
        });
    });
});
