import { describe, expect, it } from '@jest/globals';
import type { PoolClient } from 'pg';
import { ensureBadDebtExpenseAccount } from './ensureBadDebtAccount.js';
import { AccountCodes } from '../../services/glEntryService.js';

describe('ensureBadDebtExpenseAccount (Phase 4A)', () => {
  it('returns existing 5210 when present', async () => {
    const queries: unknown[] = [];
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        queries.push([sql, params]);
        if (sql.includes('SELECT') && sql.includes('AccountCode')) {
          return { rows: [{ id: 'existing-id' }] };
        }
        return { rows: [] };
      },
    } as unknown as PoolClient;

    const code = await ensureBadDebtExpenseAccount(client);
    expect(code).toBe(AccountCodes.BAD_DEBT_EXPENSE);
    expect(queries.length).toBe(1);
  });

  it('inserts when missing then verifies', async () => {
    let selectAccountCount = 0;
    const client = {
      query: async (sql: string) => {
        if (sql.includes('SELECT "Id" AS id FROM accounts')) {
          selectAccountCount += 1;
          return { rows: selectAccountCount === 1 ? [] : [{ id: 'new-id' }] };
        }
        return { rows: [] };
      },
    } as unknown as PoolClient;

    const code = await ensureBadDebtExpenseAccount(client);
    expect(code).toBe('5210');
    expect(selectAccountCount).toBe(2);
  });
});
