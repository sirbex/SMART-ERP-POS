/**
 * expenseService unit tests
 * Tests expense CRUD and approval workflow with mocked repository.
 */
import { jest } from '@jest/globals';

/** Flexible mock fn type — avoids `any` while allowing mockResolvedValue/mockReturnValue */
type MockFn = (...args: unknown[]) => Promise<unknown>;

const mockExpenseRepo = {
    getExpenses: jest.fn<MockFn>(),
    getExpenseById: jest.fn<MockFn>(),
    createExpense: jest.fn<MockFn>(),
    updateExpense: jest.fn<MockFn>(),
    deleteExpense: jest.fn<MockFn>(),
    getExpenseCategories: jest.fn<MockFn>(),
    createExpenseCategory: jest.fn<MockFn>(),
    getExpenseCategoryByCode: jest.fn<MockFn>(),
    getExpenseDocuments: jest.fn<MockFn>(),
    deleteExpenseDocument: jest.fn<MockFn>(),
    createApprovalRecord: jest.fn<MockFn>(),
    updateApprovalRecord: jest.fn<MockFn>(),
    getExpenseCountByCategory: jest.fn<MockFn>(),
    getPaymentAccounts: jest.fn<MockFn>(),
};

jest.unstable_mockModule('../repositories/expenseRepository', () => ({
    ...mockExpenseRepo,
    default: mockExpenseRepo,
}));

jest.unstable_mockModule('../db/pool.js', () => ({
    pool: { query: jest.fn<MockFn>(), connect: jest.fn<MockFn>() },
    default: { query: jest.fn<MockFn>(), connect: jest.fn<MockFn>() },
}));

jest.unstable_mockModule('../db/unitOfWork.js', () => ({
    UnitOfWork: {
        run: jest.fn(async (_pool: unknown, fn: (client: unknown) => Promise<unknown>) => {
            const mockClient = { query: jest.fn<MockFn>().mockResolvedValue({ rows: [] }) };
            return fn(mockClient);
        }),
    },
}));

jest.unstable_mockModule('../middleware/errorHandler.js', () => ({
    BusinessError: class extends Error {
        errorCode: string;
        constructor(msg: string, code: string) {
            super(msg);
            this.name = 'BusinessError';
            this.errorCode = code;
        }
    },
    NotFoundError: class extends Error {
        constructor(msg: string) {
            super(`${msg} not found`);
            this.name = 'NotFoundError';
        }
    },
}));

jest.unstable_mockModule('./glEntryService.js', () => ({
    createExpenseGLEntries: jest.fn<MockFn>().mockResolvedValue(undefined),
    reverseExpenseGLEntries: jest.fn<MockFn>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('./bankingService.js', () => ({
    BankingService: jest.fn(() => ({
        recordExpensePayment: jest.fn<MockFn>().mockResolvedValue(undefined),
    })),
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
    default: {
        info: jest.fn<MockFn>(),
        error: jest.fn<MockFn>(),
        warn: jest.fn<MockFn>(),
        debug: jest.fn<MockFn>(),
    },
}));

const expenseService = await import('./expenseService.js');

describe('expenseService', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('getExpenseById', () => {
        it('should return expense when found', async () => {
            mockExpenseRepo.getExpenseById.mockResolvedValue({
                id: 'e1',
                title: 'Office Supplies',
                amount: '150.00',
                status: 'DRAFT',
            });

            const expense = await expenseService.getExpenseById('e1');
            expect(expense!.title).toBe('Office Supplies');
        });

        it('should return null for non-existent expense', async () => {
            mockExpenseRepo.getExpenseById.mockResolvedValue(null);

            const expense = await expenseService.getExpenseById('ghost');
            expect(expense).toBeNull();
        });
    });

    describe('getExpenseCategories', () => {
        it('should return all categories', async () => {
            mockExpenseRepo.getExpenseCategories.mockResolvedValue([
                { id: 'cat1', name: 'Travel', code: 'TRAVEL' },
                { id: 'cat2', name: 'Office', code: 'OFFICE' },
            ]);

            const categories = await expenseService.getExpenseCategories();
            expect(categories).toHaveLength(2);
        });
    });

    describe('createExpenseCategory', () => {
        it('should create category when code is unique', async () => {
            mockExpenseRepo.getExpenseCategoryByCode.mockResolvedValue(null);
            mockExpenseRepo.createExpenseCategory.mockResolvedValue({
                id: 'cat3',
                name: 'Marketing',
                code: 'MKT',
            });

            const category = await expenseService.createExpenseCategory({
                name: 'Marketing',
                code: 'MKT',
            });
            expect(category.name).toBe('Marketing');
        });

        it('should throw when category code already exists', async () => {
            mockExpenseRepo.getExpenseCategoryByCode.mockResolvedValue({ id: 'existing' });

            await expect(
                expenseService.createExpenseCategory({ name: 'Dup', code: 'TRAVEL' })
            ).rejects.toThrow();
        });
    });

    describe('approveExpense', () => {
        it('should approve pending expense', async () => {
            mockExpenseRepo.getExpenseById.mockResolvedValue({
                id: 'e1',
                status: 'PENDING_APPROVAL',
                createdBy: 'user1',
            });
            mockExpenseRepo.updateExpense.mockResolvedValue({
                id: 'e1',
                status: 'APPROVED',
            });
            mockExpenseRepo.updateApprovalRecord.mockResolvedValue(undefined);

            const result = await expenseService.approveExpense('e1', 'approver1', 'Looks good');
            expect(result).toBeDefined();
        });

        it('should throw when expense is not pending approval', async () => {
            mockExpenseRepo.getExpenseById.mockResolvedValue({
                id: 'e1',
                status: 'DRAFT',
            });

            await expect(expenseService.approveExpense('e1', 'approver1')).rejects.toThrow();
        });
    });

    describe('rejectExpense', () => {
        it('should reject pending expense', async () => {
            mockExpenseRepo.getExpenseById.mockResolvedValue({
                id: 'e1',
                status: 'PENDING_APPROVAL',
            });
            mockExpenseRepo.updateExpense.mockResolvedValue({ id: 'e1', status: 'REJECTED' });
            mockExpenseRepo.updateApprovalRecord.mockResolvedValue(undefined);

            const result = await expenseService.rejectExpense('e1', 'rejector1', 'Too expensive');
            expect(result).toBeDefined();
        });
    });
});
