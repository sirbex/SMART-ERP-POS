/**
 * Deposit Worksheet invariants — Phase 1B unit tests (TD-INV-4 / TD-INV-5)
 */

import {
  assertBalancedLines,
  assertDepositConsumesUnsettled,
  assertSettlementCeiling,
  TreasuryInvariantError,
} from '@shared/treasury/index.js';
import { depositLiquidityGlCode } from './ensureDepositLiquidityBook.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error(`Expected ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TreasuryInvariantError);
    expect((err as TreasuryInvariantError).code).toBe(code);
  }
}

describe('Deposit Worksheet invariants (Phase 1B)', () => {
  describe('TD-INV-4 settlement ceiling', () => {
    it('allows apply within residual', () => {
      expect(() =>
        assertSettlementCeiling({ applyAmount: 400, residualAmount: 1000 }),
      ).not.toThrow();
    });

    it('rejects over-apply', () => {
      expectCode(
        () => assertSettlementCeiling({ applyAmount: 1001, residualAmount: 1000, sourceLabel: 'CRP-1' }),
        'TD_INV_4_EXCEEDS',
      );
    });
  });

  describe('TD-INV-5 unsettled only', () => {
    it('allows UNSETTLED and PARTIALLY_SETTLED with residual', () => {
      expect(() =>
        assertDepositConsumesUnsettled({
          settlementStatus: 'UNSETTLED',
          residualAmount: 500,
        }),
      ).not.toThrow();
      expect(() =>
        assertDepositConsumesUnsettled({
          settlementStatus: 'PARTIALLY_SETTLED',
          residualAmount: 100,
        }),
      ).not.toThrow();
    });

    it('rejects SETTLED / zero residual', () => {
      expectCode(
        () =>
          assertDepositConsumesUnsettled({
            settlementStatus: 'SETTLED',
            residualAmount: 0,
          }),
        'TD_INV_5_FULLY_SETTLED',
      );
      expectCode(
        () =>
          assertDepositConsumesUnsettled({
            settlementStatus: 'SETTLED',
            residualAmount: 50,
          }),
        'TD_INV_5_BAD_STATUS',
      );
    });
  });

  describe('deposit journal shapes', () => {
    it('balances full deposit', () => {
      const result = assertBalancedLines([
        { debitAmount: 1000, creditAmount: 0 },
        { debitAmount: 0, creditAmount: 600 },
        { debitAmount: 0, creditAmount: 400 },
      ]);
      expect(result.totalDebits).toBe(1000);
    });

    it('balances deposit with shortage', () => {
      const result = assertBalancedLines([
        { debitAmount: 950, creditAmount: 0 }, // bank
        { debitAmount: 50, creditAmount: 0 }, // shortage
        { debitAmount: 0, creditAmount: 1000 }, // undeposited
      ]);
      expect(result.totalDebits).toBe(1000);
      expect(result.totalCredits).toBe(1000);
    });

    it('balances deposit with overage', () => {
      const result = assertBalancedLines([
        { debitAmount: 1050, creditAmount: 0 }, // bank
        { debitAmount: 0, creditAmount: 1000 }, // undeposited
        { debitAmount: 0, creditAmount: 50 }, // overage income
      ]);
      expect(result.totalDebits).toBe(1050);
    });
  });

  describe('explicit Cash / Mobile Money destinations', () => {
    it('maps CASH → 1010 and MOBILE_MONEY → 1040', () => {
      expect(depositLiquidityGlCode('CASH')).toBe('1010');
      expect(depositLiquidityGlCode('MOBILE_MONEY')).toBe('1040');
    });

    it('service accepts destinationKind and ensures liquidity books', () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const service = readFileSync(join(here, 'depositWorksheetService.ts'), 'utf8');
      const routes = readFileSync(join(here, 'treasuryRoutes.ts'), 'utf8');
      const ensure = readFileSync(join(here, 'ensureDepositLiquidityBook.ts'), 'utf8');

      expect(service).toMatch(/destinationKind/);
      expect(service).toMatch(/ensureDepositLiquidityBook/);
      expect(service).toMatch(/listDepositDestinations/);
      expect(routes).toMatch(/\/deposit-destinations/);
      expect(routes).toMatch(/CASH.*MOBILE_MONEY.*BANK/);
      expect(ensure).toMatch(/Cash Drawer/);
      expect(ensure).toMatch(/Mobile Money/);
      expect(ensure).toMatch(/'1010'/);
      expect(ensure).toMatch(/'1040'/);
    });
  });
});
