/**
 * Behavioral evidence: multi-bank / MoMo pay-from resolution for supplier payments.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { PoolClient, QueryResult } from 'pg';
import {
  defaultCreditAccountForMethod,
  paymentMethodFromLiquidityTag,
  paymentMethodRequiresBankBook,
  resolveSupplierPaymentCreditAccount,
} from './supplierPaymentPayFrom.js';

function qResult(rows: unknown[]): QueryResult {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as QueryResult;
}

describe('supplierPaymentPayFrom — pure helpers', () => {
  it('maps methods to default GLs', () => {
    expect(defaultCreditAccountForMethod('CASH')).toBe('1010');
    expect(defaultCreditAccountForMethod('BANK_TRANSFER')).toBe('1030');
    expect(defaultCreditAccountForMethod('MOBILE_MONEY')).toBe('1040');
  });

  it('requires a bank book for bank transfer and check only', () => {
    expect(paymentMethodRequiresBankBook('BANK_TRANSFER')).toBe(true);
    expect(paymentMethodRequiresBankBook('CHECK')).toBe(true);
    expect(paymentMethodRequiresBankBook('MOBILE_MONEY')).toBe(false);
    expect(paymentMethodRequiresBankBook('CASH')).toBe(false);
  });

  it('infers method from liquidity tag', () => {
    expect(paymentMethodFromLiquidityTag('BANK')).toBe('BANK_TRANSFER');
    expect(paymentMethodFromLiquidityTag('MOBILE_MONEY')).toBe('MOBILE_MONEY');
    expect(paymentMethodFromLiquidityTag('CASH')).toBe('CASH');
  });
});

describe('resolveSupplierPaymentCreditAccount — behavioral', () => {
  const query = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();
  const client = { query } as unknown as PoolClient;

  beforeEach(() => {
    query.mockReset();
  });

  it('credits the selected bank book GL (Centenary 1032), not hardcoded 1030', async () => {
    query.mockResolvedValueOnce(
      qResult([
        {
          id: 'ba-centenary',
          name: 'Centenary Operating',
          gl_account_code: '1032',
          system_account_tag: 'BANK',
        },
      ]),
    );

    const resolved = await resolveSupplierPaymentCreditAccount(client, {
      paymentMethod: 'BANK_TRANSFER',
      bankAccountId: 'ba-centenary',
    });

    expect(resolved.creditAccountCode).toBe('1032');
    expect(resolved.bankAccountId).toBe('ba-centenary');
    expect(resolved.bankAccountName).toBe('Centenary Operating');
    expect(resolved.glAccountTag).toBe('BANK');
  });

  it('credits MoMo book GL 1040 when MOBILE_MONEY book selected', async () => {
    query.mockResolvedValueOnce(
      qResult([
        {
          id: 'ba-momo',
          name: 'MTN MoMo',
          gl_account_code: '1040',
          system_account_tag: 'MOBILE_MONEY',
        },
      ]),
    );

    const resolved = await resolveSupplierPaymentCreditAccount(client, {
      paymentMethod: 'MOBILE_MONEY',
      bankAccountId: 'ba-momo',
    });

    expect(resolved.creditAccountCode).toBe('1040');
    expect(resolved.glAccountTag).toBe('MOBILE_MONEY');
  });

  it('rejects pay-from when bank book is linked to AR 1200', async () => {
    query.mockResolvedValueOnce(
      qResult([
        {
          id: 'ba-bad',
          name: 'Wrong Book',
          gl_account_code: '1200',
          system_account_tag: 'ACCOUNTS_RECEIVABLE',
        },
      ]),
    );

    await expect(
      resolveSupplierPaymentCreditAccount(client, {
        paymentMethod: 'BANK_TRANSFER',
        bankAccountId: 'ba-bad',
      }),
    ).rejects.toThrow(/not a Cash\/Bank\/Mobile Money/);
  });

  it('rejects missing bank book id', async () => {
    query.mockResolvedValueOnce(qResult([]));

    await expect(
      resolveSupplierPaymentCreditAccount(client, {
        paymentMethod: 'BANK_TRANSFER',
        bankAccountId: 'missing',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('requires selecting a book when BANK_TRANSFER and active bank_accounts exist', async () => {
    query.mockResolvedValueOnce(qResult([{ n: '2' }]));

    await expect(
      resolveSupplierPaymentCreditAccount(client, {
        paymentMethod: 'BANK_TRANSFER',
        bankAccountId: null,
      }),
    ).rejects.toThrow(/Select which bank/);
  });

  it('allows CASH without bank book → default 1010', async () => {
    const resolved = await resolveSupplierPaymentCreditAccount(client, {
      paymentMethod: 'CASH',
      bankAccountId: null,
    });

    expect(resolved.creditAccountCode).toBe('1010');
    expect(resolved.bankAccountId).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('allows BANK_TRANSFER without book only when no bank_accounts rows', async () => {
    query.mockResolvedValueOnce(qResult([{ n: '0' }]));

    const resolved = await resolveSupplierPaymentCreditAccount(client, {
      paymentMethod: 'BANK_TRANSFER',
      bankAccountId: null,
    });

    expect(resolved.creditAccountCode).toBe('1030');
  });
});
