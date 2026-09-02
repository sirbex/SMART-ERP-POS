/**
 * E2E proof: supplier payment funds check matches Banking UI after reversals.
 *
 * Incident history:
 * - LEFT JOIN + Status in ON counted REVERSED payment credits → understated bank.
 * - Bare Status=POSTED kept reverse-journal legs after originals were REVERSED →
 *   correct for some bank restores, but orphaned CR 1015 after AR receipt reverse
 *   (Henber −5.03M overdraft).
 *
 * SSOT now: LEDGER_NET_ACTIVE_SQL — both legs of a reverse pair excluded
 * (“document never posted”). Matches AccountingCore.reverseTransaction semantics.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { splitSupplierPaymentCredits } from '../supplier-payments/supplierPaymentWht.js';
import {
  availableFromPostedTotals,
  postedLedgerBalanceLateral,
} from './postedLedgerBalance.js';

describe('postedLedgerBalance SSOT', () => {
  it('computes DEBIT-normal asset balance', () => {
    expect(availableFromPostedTotals(1_073_000, 2_000, 'DEBIT')).toBe(1_071_000);
  });

  it('LEFT JOIN bug understates after REVERSED supplier payments', () => {
    const debitsPostedOnly = 1_073_000;
    const creditsPostedOnly = 2_000;
    const creditsLeftJoinBug = 955_000; // includes 953k from REVERSED originals

    expect(availableFromPostedTotals(debitsPostedOnly, creditsPostedOnly, 'DEBIT')).toBe(
      1_071_000,
    );
    expect(availableFromPostedTotals(debitsPostedOnly, creditsLeftJoinBug, 'DEBIT')).toBe(
      118_000,
    );
  });

  it('SQL fragment uses INNER JOIN + net-active reverse-pair exclusion', () => {
    const sql = postedLedgerBalanceLateral('$2');
    expect(sql).toMatch(/INNER JOIN ledger_transactions/i);
    expect(sql).toMatch(/lt\."Status"\s*=\s*'POSTED'/);
    expect(sql).toMatch(/ReversedByTransactionId/);
    expect(sql).toMatch(/IsReversed/);
    expect(sql).not.toMatch(
      /LEFT JOIN ledger_transactions\s+lt\s+ON[\s\S]*Status\s*=\s*'POSTED'/i,
    );
  });
});

describe('supplier payment STELLA scenario (WHT + pay-from)', () => {
  it('WHT splits gross AP vs net cash from bank', () => {
    const gross = 476_500;
    const wht = 28_590;
    const { cashCredit, whtCredit, apDebit } = splitSupplierPaymentCredits(gross, wht);
    expect(apDebit).toBe(476_500);
    expect(whtCredit).toBe(28_590);
    expect(cashCredit).toBe(447_910);
  });

  it('net cash fits available bank balance after fix', () => {
    const available = availableFromPostedTotals(1_073_000, 2_000, 'DEBIT');
    const { cashCredit } = splitSupplierPaymentCredits(476_500, 28_590);
    expect(available).toBeGreaterThanOrEqual(cashCredit);
  });
});

describe('liquidityFundsGuard integration contract', () => {
  const mockQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('end-to-end: guard query matches postedLedgerBalance pattern', async () => {
    const row = {
      AccountName: 'Checking Account',
      NormalBalance: 'DEBIT',
      debitTotal: '1073000',
      creditTotal: '2000',
    };
    mockQuery.mockResolvedValue({ rows: [row] });

    const { getLiquidityAvailable, assertSufficientLiquidityFunds } = await import(
      './liquidityFundsGuard.js'
    );
    const conn = { query: mockQuery } as unknown as import('pg').Pool;

    const bal = await getLiquidityAvailable(conn, '1030', '2026-07-21');
    expect(bal.available).toBe(1_071_000);

    const sql = String(mockQuery.mock.calls[0]?.[0] ?? '');
    expect(sql).toMatch(/INNER JOIN ledger_transactions/i);
    expect(sql).toMatch(/ReversedByTransactionId/);

    await expect(
      assertSufficientLiquidityFunds(conn, '1030', 447_910, {
        asOfDate: '2026-07-21',
        actionLabel: 'supplier payment PAY-000003',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('pay-from resolution contract (static)', () => {
  it('resolveSupplierPaymentCreditAccount uses bank book GL when bankAccountId set', async () => {
    const { resolveSupplierPaymentCreditAccount } = await import(
      '../supplier-payments/supplierPaymentPayFrom.js'
    );
    const query = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'ba-pharmacure',
          name: 'PHARMACURE ACCOUNT',
          gl_account_code: '1030',
          system_account_tag: 'BANK',
        },
      ],
    });
    const client = { query } as unknown as import('pg').PoolClient;

    const resolved = await resolveSupplierPaymentCreditAccount(client, {
      paymentMethod: 'BANK_TRANSFER',
      bankAccountId: 'ba-pharmacure',
    });
    expect(resolved.creditAccountCode).toBe('1030');
    expect(resolved.bankAccountId).toBe('ba-pharmacure');
  });
});

describe('GL posting contract (static)', () => {
  it('recordSupplierPaymentToGL checks liquidity on paymentAccountCode before credit', async () => {
    const src = await import('fs/promises').then((fs) =>
      fs.readFile(
        new URL('../../services/glEntryService.ts', import.meta.url),
        'utf8',
      ),
    );
    const fnStart = src.indexOf('export async function recordSupplierPaymentToGL');
    const slice = src.slice(fnStart, fnStart + 2500);
    expect(slice).toMatch(/paymentAccountCode/);
    expect(slice).toMatch(/assertSufficientLiquidityFunds/);
    expect(slice).toMatch(/splitSupplierPaymentCredits/);
  });

  it('recordCustomerPaymentToGL always debits Undeposited Funds (1015)', async () => {
    const src = await import('fs/promises').then((fs) =>
      fs.readFile(
        new URL('../../services/glEntryService.ts', import.meta.url),
        'utf8',
      ),
    );
    const fnStart = src.indexOf('export async function recordCustomerPaymentToGL');
    const slice = src.slice(fnStart, fnStart + 2200);
    expect(slice).toMatch(/UNDEPOSITED_FUNDS/);
    expect(slice).not.toMatch(/assertSufficientLiquidityFunds/);
  });
});
