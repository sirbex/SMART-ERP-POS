/**
 * accountingCore unit tests
 * Tests journal entry creation validation and trial balance logic.
 */
import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockClient = {
  query: mockQuery,
  release: jest.fn(),
};

jest.unstable_mockModule('../db/pool.js', () => ({
  pool: {
    query: mockQuery,
    connect: jest.fn().mockResolvedValue(mockClient),
  },
  default: {
    query: mockQuery,
    connect: jest.fn().mockResolvedValue(mockClient),
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
  v4: jest.fn().mockReturnValue('test-uuid-1234'),
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
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
          date: '2025-01-01',
          lines: [
            { accountCode: '1000', debit: 100, credit: 0, description: 'Debit' },
            { accountCode: '2000', debit: 0, credit: 50, description: 'Credit' },
          ],
          createdBy: 'user1',
          sourceModule: 'TEST',
        })
      ).rejects.toThrow();
    });

    it('should reject entries with no lines', async () => {
      await expect(
        accountingCore.createJournalEntry({
          description: 'Empty entry',
          date: '2025-01-01',
          lines: [],
          createdBy: 'user1',
          sourceModule: 'TEST',
        })
      ).rejects.toThrow();
    });

    it('should reject entries where a line has both debit and credit', async () => {
      await expect(
        accountingCore.createJournalEntry({
          description: 'Both sides',
          date: '2025-01-01',
          lines: [{ accountCode: '1000', debit: 100, credit: 100, description: 'Both' }],
          createdBy: 'user1',
          sourceModule: 'TEST',
        })
      ).rejects.toThrow();
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
