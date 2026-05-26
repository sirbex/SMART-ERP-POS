import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import { invoiceRepository } from './invoiceRepository.js';

describe('invoiceRepository.listInvoices payment filters', () => {
  const mockPool = {
    query: jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>(),
  } as unknown as Pool;

  beforeEach(() => {
    jest.resetAllMocks();
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
  });

  test('OVERDUE applies due_date and amount_due predicates server-side', async () => {
    await invoiceRepository.listInvoices(mockPool, 1, 20, { status: 'OVERDUE' });

    const countSql = String((mockPool.query as jest.Mock).mock.calls[0][0]);
    expect(countSql).toContain('i.due_date < CURRENT_DATE');
    expect(countSql).toContain('i.amount_due > 0');
    expect(countSql).not.toMatch(/i\.status = '\$1'/);
  });

  test('UNPAID passes exact status match', async () => {
    await invoiceRepository.listInvoices(mockPool, 1, 20, { status: 'UNPAID' });

    const countSql = String((mockPool.query as jest.Mock).mock.calls[0][0]);
    expect(countSql).toContain('i.status = $1');
    const countParams = (mockPool.query as jest.Mock).mock.calls[0][1] as unknown[];
    expect(countParams).toContain('UNPAID');
  });
});
