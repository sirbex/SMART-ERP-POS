/**
 * Add Bank Account — mocked service proof (no DB mutation).
 * Covers create validations, unique GL, default flag, opening balance GL.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient, QueryResult } from 'pg';

const mockClientQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();
const mockClient = { query: mockClientQuery } as unknown as PoolClient;
const mockPool = { query: jest.fn() } as unknown as Pool;

const mockCreateJournalEntry = jest.fn<(...args: unknown[]) => Promise<{ transactionId: string }>>();

jest.unstable_mockModule('../db/unitOfWork.js', () => ({
  UnitOfWork: {
    run: jest.fn(async (_pool: unknown, fn: unknown) =>
      (fn as (client: PoolClient) => Promise<unknown>)(mockClient),
    ),
  },
}));

jest.unstable_mockModule('../db/pool.js', () => ({
  pool: mockPool,
}));

jest.unstable_mockModule('./accountingCore.js', () => ({
  AccountingCore: { createJournalEntry: mockCreateJournalEntry },
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('../utils/dateRange.js', () => ({
  getBusinessDate: () => '2026-07-15',
  getBusinessYear: () => 2026,
  formatDateBusiness: (d: string) => d,
}));

const { BankingService } = await import('./bankingService.js');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const GL_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

function qResult(rows: unknown[]): QueryResult {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as QueryResult;
}

function mockInsertReturning(overrides: Record<string, unknown> = {}) {
  return qResult([
    {
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Main Operating Account',
      account_number: '9012345678',
      bank_name: 'Stanbic Bank',
      branch: 'Main Branch',
      gl_account_id: GL_ID,
      current_balance: '0',
      is_default: false,
      is_active: true,
      created_at: '2026-07-15T00:00:00.000Z',
      updated_at: '2026-07-15T00:00:00.000Z',
      ...overrides,
    },
  ]);
}

describe('Add Bank Account (BankingService.createAccount)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateJournalEntry.mockResolvedValue({ transactionId: 'gl-open-1' });
  });

  it('creates account with required name + GL and optional bank fields', async () => {
    mockClientQuery
      .mockResolvedValueOnce(
        qResult([{ Id: GL_ID, AccountCode: '1030', AccountName: 'Stanbic Operating', AccountType: 'ASSET', IsPostingAccount: true }]),
      )
      .mockResolvedValueOnce(qResult([])) // no GL conflict
      .mockResolvedValueOnce(mockInsertReturning())
      .mockResolvedValueOnce(qResult([])); // audit_log

    const account = await BankingService.createAccount(
      {
        name: 'Main Operating Account',
        bankName: 'Stanbic Bank',
        branch: 'Main Branch',
        accountNumber: '9012345678',
        glAccountId: GL_ID,
        openingBalance: 0,
        isDefault: false,
      },
      USER_ID,
      mockPool,
    );

    expect(account.name).toBe('Main Operating Account');
    expect(account.glAccountId).toBe(GL_ID);
    expect(account.glAccountCode).toBe('1030');
    expect(account.bankName).toBe('Stanbic Bank');
    expect(account.accountNumber).toBe('9012345678');
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it('rejects inactive / missing GL account', async () => {
    mockClientQuery.mockResolvedValueOnce(qResult([]));
    await expect(
      BankingService.createAccount(
        { name: 'X', glAccountId: GL_ID },
        USER_ID,
        mockPool,
      ),
    ).rejects.toThrow(/not found or inactive/);
  });

  it('rejects GL already linked to another active bank account', async () => {
    mockClientQuery
      .mockResolvedValueOnce(
        qResult([{ Id: GL_ID, AccountCode: '1030', AccountName: 'Bank', AccountType: 'ASSET', IsPostingAccount: true }]),
      )
      .mockResolvedValueOnce(qResult([{ id: 'existing', name: 'Existing Bank' }]));

    await expect(
      BankingService.createAccount(
        { name: 'Duplicate GL', glAccountId: GL_ID },
        USER_ID,
        mockPool,
      ),
    ).rejects.toThrow(/already used by bank account "Existing Bank"/);
  });

  it('rejects non-ASSET GL account (e.g. Sales Revenue)', async () => {
    mockClientQuery.mockResolvedValueOnce(
      qResult([{ Id: GL_ID, AccountCode: '4000', AccountName: 'Sales Revenue', AccountType: 'REVENUE', IsPostingAccount: true }]),
    );
    await expect(
      BankingService.createAccount(
        { name: 'Bad GL', glAccountId: GL_ID },
        USER_ID,
        mockPool,
      ),
    ).rejects.toThrow(/not ASSET/);
  });

  it('clears other defaults when Set as default is true', async () => {
    mockClientQuery
      .mockResolvedValueOnce(
        qResult([{ Id: GL_ID, AccountCode: '1030', AccountName: 'Bank', AccountType: 'ASSET', IsPostingAccount: true }]),
      )
      .mockResolvedValueOnce(qResult([]))
      .mockResolvedValueOnce(qResult([])) // clear defaults UPDATE
      .mockResolvedValueOnce(mockInsertReturning({ is_default: true }))
      .mockResolvedValueOnce(qResult([])); // audit

    await BankingService.createAccount(
      { name: 'Default Bank', glAccountId: GL_ID, isDefault: true },
      USER_ID,
      mockPool,
    );

    const clearDefaults = mockClientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && String(c[0]).includes('is_default = FALSE'),
    );
    expect(clearDefaults).toBeTruthy();
  });

  it('posts opening balance DR bank GL / CR 3050 Opening Balance Equity (CUTOVER_OB)', async () => {
    mockClientQuery
      .mockResolvedValueOnce(
        qResult([{ Id: GL_ID, AccountCode: '1030', AccountName: 'Stanbic Operating', AccountType: 'ASSET', IsPostingAccount: true }]),
      )
      .mockResolvedValueOnce(qResult([])) // no GL conflict
      .mockResolvedValueOnce(mockInsertReturning())
      .mockResolvedValueOnce(qResult([{ AccountCode: '3050' }])) // OBE tagged
      .mockResolvedValueOnce(qResult([])) // advisory lock
      .mockResolvedValueOnce(qResult([{ next_num: 1 }])) // BTX number
      .mockResolvedValueOnce(qResult([])) // insert bank_transactions
      .mockResolvedValueOnce(qResult([])); // audit

    await BankingService.createAccount(
      {
        name: 'Main Operating Account',
        glAccountId: GL_ID,
        openingBalance: 5_000_000,
      },
      USER_ID,
      mockPool,
    );

    expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
    const je = mockCreateJournalEntry.mock.calls[0]![0] as {
      referenceType: string;
      source?: string;
      lines: Array<{ accountCode: string; debitAmount: number; creditAmount: number }>;
    };
    expect(je.referenceType).toBe('BANK_OPENING');
    expect(je.source).toBe('CUTOVER_OB');
    expect(je.lines).toEqual([
      expect.objectContaining({ accountCode: '1030', debitAmount: 5_000_000, creditAmount: 0 }),
      expect.objectContaining({ accountCode: '3050', debitAmount: 0, creditAmount: 5_000_000 }),
    ]);
  });
});

describe('Add Bank Account UI + API wiring', () => {
  it('form fields and save path match service/API contract', () => {
    const tab = readFileSync(
      path.join(repoRoot, 'samplepos.client/src/components/banking/BankAccountsTab.tsx'),
      'utf8',
    );
    const routes = readFileSync(
      path.join(repoRoot, 'SamplePOS.Server/src/routes/bankingRoutes.ts'),
      'utf8',
    );
    const hook = readFileSync(
      path.join(repoRoot, 'samplepos.client/src/hooks/useBanking.ts'),
      'utf8',
    );

    expect(tab).toMatch(/Add Bank Account/);
    expect(tab).toMatch(/Create a new bank account for tracking transactions/);
    expect(tab).toMatch(/Account Name/);
    expect(tab).toMatch(/Bank Name/);
    expect(tab).toMatch(/Branch/);
    expect(tab).toMatch(/Account Number/);
    expect(tab).toMatch(/GL Account/);
    expect(tab).toMatch(/Opening Balance/);
    expect(tab).toMatch(/Set as default account/);
    expect(tab).toMatch(/chart-of-accounts\?type=ASSET/);
    expect(tab).toMatch(/useCreateBankAccount/);
    expect(tab).toMatch(/glAccountId/);
    expect(tab).toMatch(/openingBalance/);

    expect(routes).toMatch(/CreateBankAccountSchema/);
    expect(routes).toMatch(/UpdateBankAccountSchema/);
    expect(routes).toMatch(/glAccountId: z\.string\(\)\.uuid\(\)/);
    expect(routes).toMatch(/BankingService\.createAccount/);
    expect(routes).toMatch(/BankingService\.updateAccount/);
    expect(routes).toMatch(/\/accounts\/:id/);
    expect(routes).toMatch(/requirePermission\('banking\.update'\)/);

    expect(hook).toMatch(/useCreateBankAccount/);
    expect(hook).toMatch(/API_BASE = '\/api\/banking'/);
    expect(hook).toMatch(/\$\{API_BASE\}\/accounts/);
  });
});
