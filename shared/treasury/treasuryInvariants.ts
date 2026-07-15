/**
 * Treasury Document invariants (ADR-003) — contractual domain rules.
 * Runtime enforcement in TreasuryService; certification in proof charter.
 */

import {
  roundMoney,
  isLiquidityAccountCode,
  isLiquidityAccountTag,
  type TreasuryDocumentLineInput,
  type TreasuryDocumentStatus,
} from './treasuryTypes.js';

export class TreasuryInvariantError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'TreasuryInvariantError';
  }
}

/** TD-INV-1: lines must form a balanced journal (debits === credits). */
export function assertBalancedLines(
  lines: Array<{ debitAmount?: number; creditAmount?: number }>,
): { totalDebits: number; totalCredits: number } {
  let totalDebits = 0;
  let totalCredits = 0;
  for (const line of lines) {
    totalDebits = roundMoney(totalDebits + Number(line.debitAmount ?? 0));
    totalCredits = roundMoney(totalCredits + Number(line.creditAmount ?? 0));
  }
  if (lines.length === 0) {
    throw new TreasuryInvariantError(
      'Treasury Document must have at least one line before posting',
      'TD_INV_1_NO_LINES',
    );
  }
  if (Math.abs(totalDebits - totalCredits) > 0.009) {
    throw new TreasuryInvariantError(
      `Treasury Document journal is unbalanced: debits ${totalDebits} ≠ credits ${totalCredits}`,
      'TD_INV_1_UNBALANCED',
    );
  }
  if (totalDebits <= 0) {
    throw new TreasuryInvariantError(
      'Treasury Document journal total must be greater than zero',
      'TD_INV_1_ZERO_TOTAL',
    );
  }
  return { totalDebits, totalCredits };
}

/** TD-INV-3: posted documents are immutable. */
export function assertMutableStatus(status: TreasuryDocumentStatus): void {
  if (status === 'POSTED') {
    throw new TreasuryInvariantError(
      'Posted Treasury Documents are immutable; create a TREASURY_REVERSAL to correct',
      'TD_INV_3_IMMUTABLE',
    );
  }
  if (status === 'CANCELLED') {
    throw new TreasuryInvariantError(
      'Cancelled Treasury Documents cannot be modified',
      'TD_INV_3_CANCELLED',
    );
  }
}

/** TD-INV-7: required audit fields for a POSTED document. */
export function assertPostedAuditFields(doc: {
  createdBy?: string | null;
  postedAt?: string | null;
  journalEntryId?: string | null;
  requiresApproval?: boolean;
  approvedBy?: string | null;
}): void {
  if (!doc.createdBy) {
    throw new TreasuryInvariantError('createdBy is required', 'TD_INV_7_CREATED_BY');
  }
  if (!doc.postedAt) {
    throw new TreasuryInvariantError('postedAt is required after post', 'TD_INV_7_POSTED_AT');
  }
  if (!doc.journalEntryId) {
    throw new TreasuryInvariantError('journalEntryId is required after post', 'TD_INV_7_JOURNAL');
  }
  if (doc.requiresApproval && !doc.approvedBy) {
    throw new TreasuryInvariantError(
      'approvedBy is required when document required approval',
      'TD_INV_7_APPROVER',
    );
  }
}

/** TD-INV-4: settlement cannot exceed originating residual. */
export function assertSettlementCeiling(input: {
  applyAmount: number;
  residualAmount: number;
  sourceLabel?: string;
}): void {
  const apply = roundMoney(input.applyAmount);
  const residual = roundMoney(input.residualAmount);
  if (apply <= 0) {
    throw new TreasuryInvariantError(
      'Settlement amount must be greater than zero',
      'TD_INV_4_ZERO',
    );
  }
  if (apply - residual > 0.009) {
    throw new TreasuryInvariantError(
      `Settlement ${apply} exceeds residual ${residual}` +
        (input.sourceLabel ? ` for ${input.sourceLabel}` : ''),
      'TD_INV_4_EXCEEDS',
    );
  }
}

/** TD-INV-5: Deposit Worksheet may only consume unsettled / partially settled receipts. */
export function assertDepositConsumesUnsettled(input: {
  settlementStatus: string;
  residualAmount: number;
  sourceLabel?: string;
}): void {
  const residual = roundMoney(input.residualAmount);
  if (residual <= 0.009) {
    throw new TreasuryInvariantError(
      `Receipt has no unsettled residual` +
        (input.sourceLabel ? ` (${input.sourceLabel})` : ''),
      'TD_INV_5_FULLY_SETTLED',
    );
  }
  if (
    input.settlementStatus !== 'UNSETTLED' &&
    input.settlementStatus !== 'PARTIALLY_SETTLED'
  ) {
    throw new TreasuryInvariantError(
      `Deposit Worksheet can only consume unsettled receipts; status=${input.settlementStatus}` +
        (input.sourceLabel ? ` (${input.sourceLabel})` : ''),
      'TD_INV_5_BAD_STATUS',
    );
  }
}

/** TD-INV-6: Treasury Transfers may only touch liquidity-tagged (or known liquidity) accounts. */
export function assertLiquidityAccountsOnly(
  accounts: Array<{ accountCode: string; systemAccountTag?: string | null }>,
): void {
  if (accounts.length === 0) {
    throw new TreasuryInvariantError(
      'Treasury Transfer requires at least one account',
      'TD_INV_6_NO_ACCOUNTS',
    );
  }
  for (const acct of accounts) {
    const ok =
      isLiquidityAccountCode(acct.accountCode) ||
      isLiquidityAccountTag(acct.systemAccountTag ?? null);
    if (!ok) {
      throw new TreasuryInvariantError(
        `Account ${acct.accountCode} is not a liquidity account (TD-INV-6). ` +
          `Transfers may only use cash, bank, card clearing, mobile money, petty cash, or undeposited funds.`,
        'TD_INV_6_NON_LIQUIDITY',
      );
    }
  }
}

/** Normalize draft lines: ensure one-sided debit/credit. */
export function normalizeLineAmounts(
  line: TreasuryDocumentLineInput,
): { debitAmount: number; creditAmount: number; amount: number } {
  const debit = roundMoney(Number(line.debitAmount ?? 0));
  const credit = roundMoney(Number(line.creditAmount ?? 0));
  if (debit > 0 && credit > 0) {
    throw new TreasuryInvariantError(
      'Line cannot have both debit and credit amounts',
      'TD_LINE_BOTH_SIDES',
    );
  }
  if (debit < 0 || credit < 0) {
    throw new TreasuryInvariantError('Line amounts cannot be negative', 'TD_LINE_NEGATIVE');
  }
  if (debit === 0 && credit === 0) {
    const amount = roundMoney(Number(line.amount ?? 0));
    if (amount < 0) {
      throw new TreasuryInvariantError('Line amounts cannot be negative', 'TD_LINE_NEGATIVE');
    }
    return { debitAmount: amount, creditAmount: 0, amount };
  }
  return {
    debitAmount: debit,
    creditAmount: credit,
    amount: debit > 0 ? debit : credit,
  };
}
