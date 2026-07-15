/**
 * Treasury Transfer invariants — Phase 1C (TD-INV-6)
 */

import {
  assertLiquidityAccountsOnly,
  TreasuryInvariantError,
} from '@shared/treasury/index.js';

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error(`Expected ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TreasuryInvariantError);
    expect((err as TreasuryInvariantError).code).toBe(code);
  }
}

describe('Treasury Transfer invariants (Phase 1C)', () => {
  it('allows known liquidity codes', () => {
    expect(() =>
      assertLiquidityAccountsOnly([
        { accountCode: '1010', systemAccountTag: 'CASH' },
        { accountCode: '1030', systemAccountTag: 'BANK' },
      ]),
    ).not.toThrow();
  });

  it('allows codes even when tag missing', () => {
    expect(() =>
      assertLiquidityAccountsOnly([
        { accountCode: '1040', systemAccountTag: null },
        { accountCode: '1020' },
      ]),
    ).not.toThrow();
  });

  it('allows bank ↔ cash ↔ mobile money route matrix', () => {
    const routes: Array<[{ accountCode: string; systemAccountTag: string }, { accountCode: string; systemAccountTag: string }]> = [
      [
        { accountCode: '1030', systemAccountTag: 'BANK' },
        { accountCode: '1040', systemAccountTag: 'MOBILE_MONEY' },
      ],
      [
        { accountCode: '1030', systemAccountTag: 'BANK' },
        { accountCode: '1010', systemAccountTag: 'CASH' },
      ],
      [
        { accountCode: '1040', systemAccountTag: 'MOBILE_MONEY' },
        { accountCode: '1030', systemAccountTag: 'BANK' },
      ],
      [
        { accountCode: '1010', systemAccountTag: 'CASH' },
        { accountCode: '1030', systemAccountTag: 'BANK' },
      ],
    ];
    for (const [from, to] of routes) {
      expect(() => assertLiquidityAccountsOnly([from, to])).not.toThrow();
    }
  });

  it('rejects expense / AR accounts', () => {
    expectCode(
      () =>
        assertLiquidityAccountsOnly([
          { accountCode: '1010', systemAccountTag: 'CASH' },
          { accountCode: '6900', systemAccountTag: null },
        ]),
      'TD_INV_6_NON_LIQUIDITY',
    );
    expectCode(
      () =>
        assertLiquidityAccountsOnly([
          { accountCode: '1200', systemAccountTag: 'ACCOUNTS_RECEIVABLE' },
          { accountCode: '1030', systemAccountTag: 'BANK' },
        ]),
      'TD_INV_6_NON_LIQUIDITY',
    );
  });
});
