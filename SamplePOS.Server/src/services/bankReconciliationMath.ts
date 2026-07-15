/**
 * Bank reconciliation cleared-balance math (QBO / classic register style).
 * Cleared = last reconciled + Σ selected (deposits − withdrawals).
 * Difference = statement ending − cleared. Must be ~0 to post.
 */
import { Money } from '../utils/money.js';

export const BANK_RECON_IN_TYPES = ['DEPOSIT', 'TRANSFER_IN', 'INTEREST'] as const;
export const BANK_RECON_OUT_TYPES = ['WITHDRAWAL', 'TRANSFER_OUT', 'FEE'] as const;

export type BankReconTxnType =
  | (typeof BANK_RECON_IN_TYPES)[number]
  | (typeof BANK_RECON_OUT_TYPES)[number]
  | string;

/** Signed amount for bank book / reconcile: inflows +, outflows −. */
export function signedBankReconAmount(type: BankReconTxnType, amount: number): number {
  const n = Money.toNumber(Money.round(amount));
  if ((BANK_RECON_IN_TYPES as readonly string[]).includes(type)) return n;
  if ((BANK_RECON_OUT_TYPES as readonly string[]).includes(type)) return Money.toNumber(Money.round(-n));
  return 0;
}

export function computeClearedBalance(
  lastReconciledBalance: number | null | undefined,
  selected: Array<{ type: string; amount: number }>,
): number {
  const opening = Money.toNumber(Money.round(Number(lastReconciledBalance ?? 0)));
  const net = selected.reduce(
    (sum, t) => Money.toNumber(Money.round(sum + signedBankReconAmount(t.type, t.amount))),
    0,
  );
  return Money.toNumber(Money.round(opening + net));
}

/** statement ending − cleared balance (0 when balanced). */
export function computeReconciliationDifference(
  statementEndingBalance: number,
  clearedBalance: number,
): number {
  return Money.toNumber(
    Money.round(
      Money.toNumber(Money.round(statementEndingBalance)) -
        Money.toNumber(Money.round(clearedBalance)),
    ),
  );
}

export function isReconciliationBalanced(difference: number, tolerance = 0.01): boolean {
  return Math.abs(difference) <= tolerance;
}
