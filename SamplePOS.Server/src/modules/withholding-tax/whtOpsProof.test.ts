/**
 * Expert proof: WithholdingTaxPage ops — Add Type / Remit / Recover / Tax reports wiring.
 * Mocked pool + AccountingCore — no database mutation.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const mockCreateJournalEntry = jest.fn<(...args: unknown[]) => Promise<{ transactionId: string }>>();
const mockQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>>();

jest.unstable_mockModule('../../utils/dateRange.js', () => ({
  getBusinessYear: () => 2026,
  BUSINESS_TIMEZONE: 'Africa/Kampala',
  toUtcRange: (s: string, e: string) => ({ startUtc: s, endUtc: e }),
}));

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
  AccountCodes: {
    WHT_PAYABLE: '2350',
    WHT_RECEIVABLE: '1250',
    CASH: '1010',
  },
}));

jest.unstable_mockModule('../../services/accountingCore.js', () => ({
  AccountingCore: { createJournalEntry: mockCreateJournalEntry },
}));

jest.unstable_mockModule('../../db/pool.js', () => ({
  pool: { query: mockQuery },
}));

jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { createWhtType, remitWht, recoverWhtReceivable } = await import('./whtService.js');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const mockPool = { query: mockQuery } as unknown as Pool;

function mockBalance(debits: number, credits: number, entries = 1) {
  mockQuery.mockResolvedValueOnce({
    rows: [{ debits, credits, entries }],
  });
}

function mockActivePaymentAccount() {
  mockQuery.mockResolvedValueOnce({ rows: [{ Id: 'acct-1' }] });
}

function mockSettlementAudit() {
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 'type-1' }] }); // active WHT type
  mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // insert entry
}

describe('Add WHT Type (createWhtType)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes percent rate 6 → 0.06 and defaults SUPPLIER → account 2350', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 't1',
          code: 'WHT-6',
          name: 'Service 6%',
          rate: 0.06,
          applies_to: 'SUPPLIER',
          threshold_amount: null,
          account_code: '2350',
          is_active: true,
        },
      ],
    });

    const created = await createWhtType(
      { code: 'WHT-6', name: 'Service 6%', rate: 6 },
      mockPool,
    );

    expect(created.rate).toBe(0.06);
    expect(created.appliesTo).toBe('SUPPLIER');
    expect(created.accountCode).toBe('2350');

    const insertArgs = mockQuery.mock.calls[0]![1] as unknown[];
    expect(insertArgs[3]).toBe(0.06);
    expect(insertArgs[4]).toBe('SUPPLIER');
    expect(insertArgs[6]).toBe('2350');
  });

  it('maps customers-only → CUSTOMER and account 1250', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 't2',
          code: 'WHT-C',
          name: 'Customer WHT',
          rate: 0.06,
          applies_to: 'CUSTOMER',
          threshold_amount: null,
          account_code: '1250',
          is_active: true,
        },
      ],
    });

    const created = await createWhtType(
      {
        code: 'WHT-C',
        name: 'Customer WHT',
        rate: 0.06,
        appliesToSuppliers: false,
        appliesToCustomers: true,
      },
      mockPool,
    );

    expect(created.appliesTo).toBe('CUSTOMER');
    expect(created.accountCode).toBe('1250');
    const insertArgs = mockQuery.mock.calls[0]![1] as unknown[];
    expect(insertArgs[4]).toBe('CUSTOMER');
    expect(insertArgs[6]).toBe('1250');
  });

  it('maps both checkboxes → BOTH', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 't3',
          code: 'WHT-B',
          name: 'Both',
          rate: 0.06,
          applies_to: 'BOTH',
          threshold_amount: null,
          account_code: '2350',
          is_active: true,
        },
      ],
    });

    await createWhtType(
      {
        code: 'WHT-B',
        name: 'Both',
        rate: 6,
        appliesToSuppliers: true,
        appliesToCustomers: true,
      },
      mockPool,
    );

    const insertArgs = mockQuery.mock.calls[0]![1] as unknown[];
    expect(insertArgs[4]).toBe('BOTH');
  });

  it('rejects invalid rates', async () => {
    await expect(createWhtType({ code: 'X', name: 'X', rate: 0 }, mockPool)).rejects.toThrow(
      /between 0 and 100/,
    );
    await expect(createWhtType({ code: 'X', name: 'X', rate: 100 }, mockPool)).rejects.toThrow(
      /between 0 and 100/,
    );
    await expect(createWhtType({ code: 'X', name: 'X', rate: 1 }, mockPool)).rejects.toThrow(
      /between 0 and 100/,
    );
  });

  it('rejects invalid appliesTo string', async () => {
    await expect(
      createWhtType({ code: 'X', name: 'X', rate: 0.06, appliesTo: 'VENDOR' }, mockPool),
    ).rejects.toThrow(/SUPPLIER, CUSTOMER, or BOTH/);
  });
});

describe('Remit Payable (remitWht)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateJournalEntry.mockResolvedValue({ transactionId: 'gl-rem-1' });
  });

  it('posts DR 2350 / CR cash and records settlement', async () => {
    // LIABILITY balance = credits - debits = 80_000
    mockBalance(0, 80_000);
    mockActivePaymentAccount();
    mockSettlementAudit();

    const result = await remitWht(
      {
        amount: 60_000,
        date: '2026-07-15',
        reference: 'URA-JUL',
        userId: 'user-1',
        paymentAccountCode: '1030',
      },
      mockPool,
    );

    expect(result.glTransactionId).toBe('gl-rem-1');
    expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
    const journalArg = mockCreateJournalEntry.mock.calls[0]![0] as {
      source: string;
      referenceType: string;
      idempotencyKey: string;
      lines: Array<{ accountCode: string; debitAmount: number; creditAmount: number }>;
    };
    expect(journalArg.source).toBe('WHT_REMITTANCE');
    expect(journalArg.referenceType).toBe('WHT_REMITTANCE');
    expect(journalArg.idempotencyKey).toBe('WHT-REM-URA-JUL-2026-07-15');
    expect(journalArg.lines).toEqual([
      expect.objectContaining({ accountCode: '2350', debitAmount: 60_000, creditAmount: 0 }),
      expect.objectContaining({ accountCode: '1030', debitAmount: 0, creditAmount: 60_000 }),
    ]);

    const settlementInsert = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && String(c[0]).includes('INSERT INTO withholding_tax_entries'),
    );
    expect(settlementInsert).toBeTruthy();
    expect(settlementInsert![1]).toEqual(
      expect.arrayContaining(['WHT_REMITTANCE', 'gl-rem-1', 60_000, 60_000, 0, 'URA-JUL', 'gl-rem-1']),
    );
  });

  it('rejects remittance exceeding payable balance', async () => {
    mockBalance(0, 50_000);
    await expect(
      remitWht(
        { amount: 51_000, date: '2026-07-15', reference: 'URA', userId: 'u1' },
        mockPool,
      ),
    ).rejects.toThrow(/exceeds WHT payable balance/);
  });

  it('rejects zero amount and empty reference', async () => {
    await expect(
      remitWht({ amount: 0, date: '2026-07-15', reference: 'URA', userId: 'u1' }, mockPool),
    ).rejects.toThrow(/greater than zero/);
    await expect(
      remitWht({ amount: 100, date: '2026-07-15', reference: '  ', userId: 'u1' }, mockPool),
    ).rejects.toThrow(/reference is required/);
  });

  it('rejects inactive payment account', async () => {
    mockBalance(0, 80_000);
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(
      remitWht(
        {
          amount: 10_000,
          date: '2026-07-15',
          reference: 'URA',
          userId: 'u1',
          paymentAccountCode: '9999',
        },
        mockPool,
      ),
    ).rejects.toThrow(/not an active posting account/);
  });
});

describe('Recover Receivable (recoverWhtReceivable)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateJournalEntry.mockResolvedValue({ transactionId: 'gl-rec-1' });
  });

  it('posts DR cash / CR 1250 and records settlement', async () => {
    // ASSET balance = debits - credits = 40_000
    mockBalance(40_000, 0);
    mockActivePaymentAccount();
    mockSettlementAudit();

    const result = await recoverWhtReceivable(
      {
        amount: 25_000,
        date: '2026-07-15',
        reference: 'URA-REC',
        userId: 'user-1',
        paymentAccountCode: '1010',
      },
      mockPool,
    );

    expect(result.glTransactionId).toBe('gl-rec-1');
    const journalArg = mockCreateJournalEntry.mock.calls[0]![0] as {
      source: string;
      idempotencyKey: string;
      lines: Array<{ accountCode: string; debitAmount: number; creditAmount: number }>;
    };
    expect(journalArg.source).toBe('WHT_RECEIVABLE_RECOVERY');
    expect(journalArg.idempotencyKey).toBe('WHT-REC-URA-REC-2026-07-15');
    expect(journalArg.lines).toEqual([
      expect.objectContaining({ accountCode: '1010', debitAmount: 25_000, creditAmount: 0 }),
      expect.objectContaining({ accountCode: '1250', debitAmount: 0, creditAmount: 25_000 }),
    ]);

    const settlementInsert = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && String(c[0]).includes('INSERT INTO withholding_tax_entries'),
    );
    expect(settlementInsert![1]).toEqual(
      expect.arrayContaining([
        'WHT_RECEIVABLE_RECOVERY',
        'gl-rec-1',
        25_000,
        25_000,
        0,
        'URA-REC',
        'gl-rec-1',
      ]),
    );
  });

  it('rejects recovery exceeding Tax Receivable balance', async () => {
    mockBalance(10_000, 0);
    await expect(
      recoverWhtReceivable(
        { amount: 11_000, date: '2026-07-15', reference: 'REC', userId: 'u1' },
        mockPool,
      ),
    ).rejects.toThrow(/exceeds Tax Receivable balance/);
  });
});

describe('Tax reports + page wiring (static SSOT)', () => {
  it('Tax reports link targets /reports/tax-compliance and ops buttons call correct APIs', () => {
    const page = readFileSync(
      path.join(repoRoot, 'samplepos.client/src/pages/accounting/WithholdingTaxPage.tsx'),
      'utf8',
    );
    expect(page).toMatch(/to="\/reports\/tax-compliance"/);
    expect(page).toMatch(/Tax reports/);
    expect(page).toMatch(/Remit Payable/);
    expect(page).toMatch(/Recover Receivable/);
    expect(page).toMatch(/Add WHT Type/);
    expect(page).toMatch(/useRemitWht|remitMutation/);
    expect(page).toMatch(/useRecoverWhtReceivable|recoverMutation/);
    expect(page).toMatch(/useCreateWhtType|createMutation/);
    expect(page).toMatch(/appliesToCustomers/);
  });

  it('routes expose types, remit, recover, and tax-compliance reports', () => {
    const whtRoutes = readFileSync(
      path.join(repoRoot, 'SamplePOS.Server/src/modules/withholding-tax/whtRoutes.ts'),
      'utf8',
    );
    const reportRoutes = readFileSync(
      path.join(repoRoot, 'SamplePOS.Server/src/modules/reports/reportsRoutes.ts'),
      'utf8',
    );
    const controller = readFileSync(
      path.join(repoRoot, 'SamplePOS.Server/src/modules/reports/taxComplianceReportController.ts'),
      'utf8',
    );

    expect(whtRoutes).toMatch(/router\.post\('\/types'/);
    expect(whtRoutes).toMatch(/router\.post\('\/remit'/);
    expect(whtRoutes).toMatch(/router\.post\('\/recover'/);
    expect(whtRoutes).toMatch(/requirePermission\('accounting\.manage'\)/);

    expect(reportRoutes).toMatch(/\/tax-compliance\/summary/);
    expect(reportRoutes).toMatch(/\/tax-compliance\/register/);
    expect(reportRoutes).toMatch(/\/tax-compliance\/liability/);
    expect(controller).toMatch(/getTaxComplianceSummary|whtReportService/);
  });

  it('client API maps to withholding-tax and tax-compliance endpoints', () => {
    const api = readFileSync(path.join(repoRoot, 'samplepos.client/src/utils/api.ts'), 'utf8');
    expect(api).toMatch(/withholding-tax\/types/);
    expect(api).toMatch(/withholding-tax\/remit/);
    expect(api).toMatch(/withholding-tax\/recover/);
    expect(api).toMatch(/reports\/tax-compliance/);
  });
});
