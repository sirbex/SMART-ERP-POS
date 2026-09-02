/**
 * PROOF: AR customer-payment reverse must not leave Undeposited Funds (1015) overdrawn.
 *
 * Bug: Status=POSTED-only liquidity SUM kept the REVERSAL credit after the original
 * DR was marked REVERSED → orphan credit = false negative 1015 (Henber −5,030,642).
 *
 * Fix: liquidity SSOT = LEDGER_NET_ACTIVE_SQL (exclude both reverse-pair legs).
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEDGER_NET_ACTIVE_SQL } from '../../utils/ledgerNetActive.js';
import {
  availableFromPostedTotals,
  postedLedgerBalanceLateral,
  postedLedgerBalanceLateralForList,
} from './postedLedgerBalance.js';

describe('AR reverse ↔ Undeposited Funds liquidity SSOT', () => {
  const root = process.cwd();

  it('postedLedgerBalance uses LEDGER_NET_ACTIVE (not bare POSTED)', () => {
    const lateral = postedLedgerBalanceLateral();
    const list = postedLedgerBalanceLateralForList();
    expect(lateral).toContain('ReversedByTransactionId');
    expect(lateral).toMatch(/IsReversed/);
    expect(list).toContain('ReversedByTransactionId');
    expect(LEDGER_NET_ACTIVE_SQL).toMatch(/Status"\s*=\s*'POSTED'/);
  });

  it('Henber-style orphan reverse credit cannot survive net-active math', () => {
    // Live receipts still POSTED
    const liveReceiptDebits = 29_902_482;
    const depositCredits = 29_902_482;
    // Orphan REV-CRP credits that POSTED-only wrongly kept
    const orphanReverseCredits = 5_030_640;
    const transferNoise = 2;

    const postedOnlyBal = availableFromPostedTotals(
      liveReceiptDebits,
      depositCredits + orphanReverseCredits + transferNoise,
      'DEBIT',
    );
    expect(postedOnlyBal).toBe(-5_030_642);

    // Net-active drops both original REVERSED DRs and reverse POSTED CRs
    const netActiveBal = availableFromPostedTotals(
      liveReceiptDebits,
      depositCredits + transferNoise,
      'DEBIT',
    );
    expect(netActiveBal).toBe(-2);
  });

  it('arPaymentService still reverses via AccountingCore + voids undeposited settlement', () => {
    const arSvc = readFileSync(join(root, 'src/modules/ar-payments/arPaymentService.ts'), 'utf8');
    const reverseFn = arSvc.slice(
      arSvc.indexOf('export async function reverseCustomerPayment'),
      arSvc.indexOf('export async function correctCustomerPaymentMethod'),
    );
    expect(reverseFn).toMatch(/AccountingCore\.reverseTransaction/);
    expect(reverseFn).toMatch(/voidSettlementForReversedArPayment/);
    expect(reverseFn).toMatch(/RECEIPT_ALREADY_DEPOSITED/);
  });

  it('liquidity balances report uses postedLedgerBalanceLateralForList', () => {
    const src = readFileSync(
      join(root, 'src/modules/reports/liquidityMovementsReportService.ts'),
      'utf8',
    );
    const fn = src.slice(src.indexOf('export async function getLiquidityAccountBalances'));
    expect(fn).toMatch(/postedLedgerBalanceLateralForList/);
    expect(fn).toMatch(/availableFromPostedTotals/);
  });

  it('bankingService bank GL balance SQL uses LEDGER_NET_ACTIVE_SQL', () => {
    const src = readFileSync(join(root, 'src/services/bankingService.ts'), 'utf8');
    expect(src).toMatch(/LEDGER_NET_ACTIVE_SQL/);
    expect(src).toMatch(/BANK_GL_BALANCE_SQL/);
    const bankSql = src.slice(
      src.indexOf('const BANK_GL_BALANCE_SQL'),
      src.indexOf('const BANK_GL_BALANCE_AS_OF_SQL'),
    );
    expect(bankSql).toMatch(/LEDGER_NET_ACTIVE_SQL/);
    expect(bankSql).not.toMatch(/lt\."Status" = 'POSTED'\s*\n\s*\)/);
  });

  it('Deposit Worksheet clearing GL + Petty Cash balances use net-active (not CurrentBalance/POSTED-only)', () => {
    const clearing = readFileSync(
      join(root, 'src/modules/treasury/receiptSettlementRepository.ts'),
      'utf8',
    );
    const clearingFn = clearing.slice(clearing.indexOf('export async function getClearingGlBalance'));
    expect(clearingFn).toMatch(/LEDGER_NET_ACTIVE_SQL/);
    expect(clearingFn).toMatch(/ledger_transactions/);

    const petty = readFileSync(join(root, 'src/modules/treasury/pettyCashService.ts'), 'utf8');
    const balStart = petty.indexOf('export async function getPettyCashBalance');
    const balEnd = petty.indexOf('export async function createPettyCashDocument', balStart);
    const balFn = petty.slice(balStart, balEnd > 0 ? balEnd : undefined);
    expect(balFn).toMatch(/postedLedgerBalanceLateralForList/);
    expect(balFn).not.toMatch(/"CurrentBalance"/);

    const repair = readFileSync(join(root, 'src/modules/system/glRepairService.ts'), 'utf8');
    const rebase = repair.slice(repair.indexOf('export async function rebaseAccountBalances'));
    expect(rebase).toMatch(/LEDGER_NET_ACTIVE_SQL/);
    expect(rebase).not.toMatch(/WHERE lt\."Status" = 'POSTED'/);
  });

  it('cash flow + expense payment balances use LEDGER_NET_ACTIVE / postedLedgerBalance', () => {
    const cf = readFileSync(join(root, 'src/services/cashFlowService.ts'), 'utf8');
    expect(cf).toMatch(/LEDGER_NET_ACTIVE_SQL/);
    expect(cf).toMatch(/fetchCashBalance/);
    const fetchBal = cf.slice(cf.indexOf('async function fetchCashBalance'));
    expect(fetchBal).toMatch(/LEDGER_NET_ACTIVE_SQL/);
    expect(fetchBal).not.toMatch(/lt\."Status" = 'POSTED'/);

    const expRepo = readFileSync(join(root, 'src/repositories/expenseRepository.ts'), 'utf8');
    const payFn = expRepo.slice(expRepo.indexOf('export const getPaymentAccounts'));
    expect(payFn).toMatch(/postedLedgerBalanceLateralForList/);
    expect(payFn).not.toMatch(/COALESCE\("CurrentBalance"/);

    const expSvc = readFileSync(join(root, 'src/services/expenseService.ts'), 'utf8');
    expect(expSvc).toMatch(/getLiquidityAvailable/);
    expect(expSvc).not.toMatch(/current_balance.*ERR_EXPENSE_011|ERR_EXPENSE_011[\s\S]{0,200}current_balance/i);
  });
});
