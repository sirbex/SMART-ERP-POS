/**
 * Regression test for `quotationRepository.listQuotations({ openOnly: true })`.
 *
 * Business rule (P1):
 *   "A quotation that has been converted to a Sale, POS Sale, Invoice, or
 *    Delivery workflow must NEVER appear in Open Quotations."
 *
 * The server, not the client, is the source of truth for what "open" means.
 * When `openOnly` is true the WHERE clause MUST exclude every terminal
 * status (CONVERTED, CANCELLED, EXPIRED, REJECTED) so pagination totals
 * reflect the visible set.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import { quotationRepository } from './quotationRepository.js';
import { CLOSED_QUOTATION_STATUSES } from '../../../../shared/zod/quotation.js';

type QueryFn = (...args: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;

const makePool = () => {
  const query = jest.fn<QueryFn>().mockImplementation(async (sql: unknown) => {
    if (typeof sql === 'string' && /COUNT\(\*\)/i.test(sql)) {
      return { rows: [{ count: '0' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { query } as unknown as Pool;
};

describe('quotationRepository.listQuotations openOnly filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('excludes every closed status when openOnly=true', async () => {
    const pool = makePool();

    await quotationRepository.listQuotations(pool, {
      page: 1,
      limit: 20,
      openOnly: true,
    });

    const calls = (pool.query as jest.Mock).mock.calls;
    expect(calls.length).toBe(2); // COUNT then SELECT

    const [countSql, countValues] = calls[0] as [string, unknown[]];
    const [pageSql, pageValues] = calls[1] as [string, unknown[]];

    // SQL shape: NOT IN with one placeholder per closed status
    expect(countSql).toMatch(/status NOT IN \(/);
    expect(pageSql).toMatch(/status NOT IN \(/);

    // Every closed status is bound as a parameter (no string interpolation)
    for (const status of CLOSED_QUOTATION_STATUSES) {
      expect(countValues).toContain(status);
      expect(pageValues).toContain(status);
    }
  });

  it('does NOT add the NOT IN clause when openOnly is false or omitted', async () => {
    const pool = makePool();

    await quotationRepository.listQuotations(pool, {
      page: 1,
      limit: 20,
    });

    const [countSql, countValues] = (pool.query as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(countSql).not.toMatch(/status NOT IN/);
    for (const status of CLOSED_QUOTATION_STATUSES) {
      expect(countValues).not.toContain(status);
    }
  });

  it('explicit status filter wins over openOnly (no double-filter)', async () => {
    const pool = makePool();

    await quotationRepository.listQuotations(pool, {
      page: 1,
      limit: 20,
      status: 'DRAFT',
      openOnly: true,
    });

    const [countSql, countValues] = (pool.query as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(countSql).toMatch(/status = \$\d+::quotation_status/);
    expect(countSql).not.toMatch(/status NOT IN/);
    expect(countValues).toContain('DRAFT');
  });

  it('CLOSED_QUOTATION_STATUSES covers every terminal lifecycle state', () => {
    // Snapshot guard: if a new closed status is added to the enum we must
    // intentionally decide whether it is also "closed" for the open filter.
    expect([...CLOSED_QUOTATION_STATUSES].sort()).toEqual(
      ['CANCELLED', 'CONVERTED', 'EXPIRED', 'REJECTED'].sort(),
    );
  });
});
