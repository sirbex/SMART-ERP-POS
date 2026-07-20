/**
 * Bank account UPDATE / Actions / opening-balance correction — mocked proof.
 * Covers PATCH path that UI Actions depend on.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient, QueryResult } from 'pg';

const mockClientQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();
const mockClient = { query: mockClientQuery } as unknown as PoolClient;
const mockPoolQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();
const mockPool = { query: mockPoolQuery } as unknown as Pool;

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
  getBusinessDate: () => '2026-07-20',
  getBusinessYear: () => 2026,
  formatDateBusiness: (d: string) => d,
}));

const { BankingService } = await import('./bankingService.js');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const BANK_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const GL_ID = '11111111-1111-1111-1111-111111111111';
const GL_ASSET_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = '22222222-2222-2222-2222-222222222222';

function qResult(rows: unknown[]): QueryResult {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as QueryResult;
}

function existingBankRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BANK_ID,
    name: 'BOU',
    account_number: '100110316332222',
    bank_name: 'SENTINARY BANK',
    branch: 'WANDEGEYA',
    gl_account_id: GL_ID,
    current_balance: '120020',
    opening_balance: '120020',
    is_default: false,
    is_active: true,
    account_code: '100110316332222',
    account_name: 'BOU',
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

function refreshedAccountRow(overrides: Record<string, unknown> = {}) {
  return {
    ...existingBankRow(overrides),
    gl_account_code: '1030',
    gl_account_name: 'Cash at Bank — Proof',
    current_balance: String(overrides.current_balance ?? '120020'),
  };
}

describe('Bank Account UPDATE (BankingService.updateAccount)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateJournalEntry.mockResolvedValue({ transactionId: 'gl-corr-1' });
  });

  it('updates metadata (name / bank / branch) — Actions Edit Save path', async () => {
    mockClientQuery
      .mockResolvedValueOnce(qResult([existingBankRow()])) // SELECT existing
      .mockResolvedValueOnce(qResult([])) // UPDATE
      .mockResolvedValueOnce(qResult([])); // audit

    mockPoolQuery.mockResolvedValueOnce(
      qResult([refreshedAccountRow({ name: 'BOU Operating', bank_name: 'Stanbic' })]),
    );

    const account = await BankingService.updateAccount(
      BANK_ID,
      {
        name: 'BOU Operating',
        bankName: 'Stanbic',
        branch: 'Main',
      },
      USER_ID,
      mockPool,
    );

    expect(account.name).toBe('BOU Operating');
    expect(account.bankName).toBe('Stanbic');
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();

    const updateSql = mockClientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && String(c[0]).includes('UPDATE bank_accounts SET'),
    );
    expect(updateSql).toBeTruthy();
    expect(updateSql![1]).toEqual(
      expect.arrayContaining(['BOU Operating', 'Stanbic', 'Main']),
    );
  });

  it('deactivate via isActive=false — Actions toggle path', async () => {
    mockClientQuery
      .mockResolvedValueOnce(qResult([existingBankRow()]))
      .mockResolvedValueOnce(qResult([]))
      .mockResolvedValueOnce(qResult([]));

    mockPoolQuery.mockResolvedValueOnce(
      qResult([refreshedAccountRow({ is_active: false })]),
    );

    const account = await BankingService.updateAccount(
      BANK_ID,
      { isActive: false },
      USER_ID,
      mockPool,
    );

    expect(account.isActive).toBe(false);
    const updateCall = mockClientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && String(c[0]).includes('UPDATE bank_accounts SET'),
    );
    expect(updateCall![1]).toEqual(expect.arrayContaining([false]));
  });

  it('rejects changing GL to non-ASSET (Sales Revenue)', async () => {
    mockClientQuery
      .mockResolvedValueOnce(qResult([existingBankRow()]))
      .mockResolvedValueOnce(
        qResult([
          {
            Id: GL_ASSET_2,
            AccountCode: '4000',
            AccountName: 'Sales Revenue',
            AccountType: 'REVENUE',
            IsPostingAccount: true,
          },
        ]),
      );

    await expect(
      BankingService.updateAccount(
        BANK_ID,
        { glAccountId: GL_ASSET_2 },
        USER_ID,
        mockPool,
      ),
    ).rejects.toThrow(/not ASSET/);
  });

  it('corrects wrong opening balance by posting delta JE (BANK_OPENING_ADJ)', async () => {
    // Stored OB 120020 → correct to 100000 → delta -20020
    mockClientQuery
      .mockResolvedValueOnce(qResult([existingBankRow({ opening_balance: '120020' })]))
      .mockResolvedValueOnce(qResult([{ AccountCode: '1030' }])) // resolve GL code
      .mockResolvedValueOnce(qResult([{ AccountCode: '3050' }])) // OBE
      .mockResolvedValueOnce(qResult([])) // advisory lock BTX
      .mockResolvedValueOnce(qResult([{ next_num: 9 }])) // BTX number
      .mockResolvedValueOnce(qResult([])) // insert bank_transactions
      .mockResolvedValueOnce(qResult([])) // UPDATE bank_accounts
      .mockResolvedValueOnce(qResult([])); // audit

    mockPoolQuery.mockResolvedValueOnce(
      qResult([refreshedAccountRow({ opening_balance: '100000', current_balance: '100000' })]),
    );

    await BankingService.updateAccount(
      BANK_ID,
      { openingBalance: 100_000 },
      USER_ID,
      mockPool,
    );

    expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
    const je = mockCreateJournalEntry.mock.calls[0]![0] as {
      referenceType: string;
      source?: string;
      description?: string;
      lines: Array<{ accountCode: string; debitAmount: number; creditAmount: number }>;
    };
    expect(je.referenceType).toBe('BANK_OPENING_ADJ');
    expect(je.source).toBe('CUTOVER_OB');
    expect(je.description).toMatch(/correction/i);
    // Negative delta: CR bank 20020 / DR equity 20020
    expect(je.lines).toEqual([
      expect.objectContaining({ accountCode: '1030', debitAmount: 0, creditAmount: 20_020 }),
      expect.objectContaining({ accountCode: '3050', debitAmount: 20_020, creditAmount: 0 }),
    ]);
  });

  it('does not post JE when opening balance unchanged', async () => {
    mockClientQuery
      .mockResolvedValueOnce(qResult([existingBankRow({ opening_balance: '120020' })]))
      .mockResolvedValueOnce(qResult([]))
      .mockResolvedValueOnce(qResult([]));

    mockPoolQuery.mockResolvedValueOnce(qResult([refreshedAccountRow()]));

    await BankingService.updateAccount(
      BANK_ID,
      { openingBalance: 120_020, name: 'BOU' },
      USER_ID,
      mockPool,
    );

    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it('404-style when bank account missing', async () => {
    mockClientQuery.mockResolvedValueOnce(qResult([]));
    await expect(
      BankingService.updateAccount(BANK_ID, { name: 'X' }, USER_ID, mockPool),
    ).rejects.toThrow(/not found/);
  });
});

describe('Bank Account UPDATE UI + API wiring (Actions / Opening Balance UX)', () => {
  it('PATCH route, updateAccount hook, and money-input UX guards are present', () => {
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
    const shared = readFileSync(path.join(repoRoot, 'shared/types/banking.ts'), 'utf8');
    const service = readFileSync(
      path.join(repoRoot, 'SamplePOS.Server/src/services/bankingService.ts'),
      'utf8',
    );

    // Actions → update
    expect(tab).toMatch(/useUpdateBankAccount/);
    expect(tab).toMatch(/handleOpenEdit/);
    expect(tab).toMatch(/handleToggleActive/);
    expect(hook).toMatch(/method: 'PATCH'/);
    expect(hook).toMatch(/updateAccount/);
    expect(routes).toMatch(/UpdateBankAccountSchema/);
    expect(routes).toMatch(/BankingService\.updateAccount/);
    expect(routes).toMatch(/banking\.update/);
    expect(shared).toMatch(/UpdateBankAccountDto/);
    expect(service).toMatch(/static async updateAccount/);
    expect(service).toMatch(/BANK_OPENING_ADJ/);

    // Opening balance UX: text+inputMode, not sticky type=number value=0
    expect(tab).toMatch(/inputMode="decimal"/);
    expect(tab).toMatch(/onWheel=\{preventNumberScroll\}/);
    expect(tab).toMatch(/onFocus=\{e => e\.target\.select\(\)\}/);
    expect(tab).toMatch(/openingBalance: ''/);
    expect(tab).not.toMatch(/openingBalance: 0,/);
    expect(tab).toMatch(/difference is posted|can be corrected/i);
  });
});
