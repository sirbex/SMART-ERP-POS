import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import Decimal from 'decimal.js';
import type { Customer } from '../../../../../shared/zod/customer.js';

type AnyMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

// ESM-compatible module mock — must come before dynamic import
jest.unstable_mockModule('../customerRepository.js', () => ({
  findCustomerById: jest.fn(),
  getOpeningBalance: jest.fn(),
  getStatementEntries: jest.fn(),
  getDepositEntries: jest.fn(),
  getCustomerDepositSummary: jest.fn(),
}));

const { findCustomerById, getOpeningBalance, getStatementEntries, getDepositEntries, getCustomerDepositSummary } =
  (await import('../customerRepository.js')) as unknown as {
    findCustomerById: AnyMock;
    getOpeningBalance: AnyMock;
    getStatementEntries: AnyMock;
    getDepositEntries: AnyMock;
    getCustomerDepositSummary: AnyMock;
  };

const { getCustomerStatement } = await import('../customerService.js');

describe('getCustomerStatement', () => {
  const customerId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    jest.resetAllMocks();
    (getDepositEntries as AnyMock).mockResolvedValue([]);
    (getCustomerDepositSummary as AnyMock).mockResolvedValue({ totalDeposits: 0, totalApplied: 0, balance: 0 });
    (findCustomerById as AnyMock).mockResolvedValue({
      id: customerId,
      name: 'Test Customer',
      email: null,
      phone: null,
      address: null,
      customerGroupId: null,
      balance: 0,
      creditLimit: 100000,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Customer);
  });

  test('no entries returns opening=closing and empty array', async () => {
    (getOpeningBalance as AnyMock).mockResolvedValue(0);
    (getStatementEntries as AnyMock).mockResolvedValue([]);
    const stmt = await getCustomerStatement(customerId);
    expect(stmt.openingBalance).toBe(0);
    expect(stmt.closingBalance).toBe(0);
    expect(stmt.entries).toHaveLength(0);
  });

  test('only payments reduces balance', async () => {
    (getOpeningBalance as AnyMock).mockResolvedValue(50000);
    (getStatementEntries as AnyMock).mockResolvedValue([
      { date: new Date(), type: 'PAYMENT', reference: 'RCPT-1', description: 'Payment', debit: 0, credit: 20000 },
      { date: new Date(Date.now() + 1000), type: 'PAYMENT', reference: 'RCPT-2', description: 'Payment', debit: 0, credit: 30000 },
    ]);
    const stmt = await getCustomerStatement(customerId);
    expect(stmt.openingBalance).toBe(50000);
    expect(stmt.entries[0].balanceAfter).toBe(30000); // 50k - 20k
    expect(stmt.entries[1].balanceAfter).toBe(0); // 30k - 30k
    expect(stmt.closingBalance).toBe(0);
  });

  test('large debit then many credits maintains precision', async () => {
    (getOpeningBalance as AnyMock).mockResolvedValue(0);
    (getStatementEntries as AnyMock).mockResolvedValue([
      { date: new Date(), type: 'INVOICE', reference: 'SALE-1', description: 'Big Sale', debit: 99999.99, credit: 0 },
      { date: new Date(Date.now() + 1000), type: 'PAYMENT', reference: 'RCPT-1', description: 'Part Pay', debit: 0, credit: 33333.33 },
      { date: new Date(Date.now() + 2000), type: 'PAYMENT', reference: 'RCPT-2', description: 'Part Pay', debit: 0, credit: 33333.33 },
      { date: new Date(Date.now() + 3000), type: 'PAYMENT', reference: 'RCPT-3', description: 'Final Pay', debit: 0, credit: 33333.33 },
    ]);
    const stmt = await getCustomerStatement(customerId);
    const balances = stmt.entries.map(e => new Decimal(e.balanceAfter));
    expect(balances[0].toNumber()).toBeCloseTo(99999.99, 2);
    expect(balances[1].toNumber()).toBeCloseTo(66666.66, 2);
    expect(balances[2].toNumber()).toBeCloseTo(33333.33, 2);
    expect(balances[3].toNumber()).toBeCloseTo(0, 2);
    expect(new Decimal(stmt.closingBalance).toNumber()).toBeCloseTo(0, 2);
  });

  test('pagination slices entries correctly', async () => {
    (getOpeningBalance as AnyMock).mockResolvedValue(0);
    const entries: Array<{ date: Date; type: string; reference: string; description: string; debit: number; credit: number }> = [];
    for (let i = 0; i < 25; i++) {
      entries.push({ date: new Date(Date.now() + i * 1000), type: 'INVOICE', reference: `SALE-${i}`, description: 'Sale', debit: 100, credit: 0 });
    }
    (getStatementEntries as AnyMock).mockResolvedValue(entries);
    const stmtPage1 = await getCustomerStatement(customerId, undefined, undefined, 1, 10);
    const stmtPage3 = await getCustomerStatement(customerId, undefined, undefined, 3, 10);
    expect(stmtPage1.entries).toHaveLength(10);
    expect(stmtPage3.entries).toHaveLength(5); // remaining
    expect(stmtPage1.totalEntries).toBe(25);
    expect(stmtPage3.totalEntries).toBe(25);
  });
});