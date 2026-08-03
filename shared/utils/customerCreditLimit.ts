/**
 * Enterprise customer credit limit policy (shared client/server).
 *
 * Modes:
 *   - unlimitedCredit: true → any outstanding AR allowed (no hard ceiling)
 *   - unlimitedCredit: false + creditLimit >= 0 → hard ceiling on projected AR balance
 *
 * Balance convention matches AR: positive outstanding = customer owes more.
 */
import Decimal from 'decimal.js';

export type CreditLimitEvalInput = {
  unlimitedCredit?: boolean | null;
  creditLimit: number | string | Decimal | null | undefined;
  /** Current customer AR balance (positive = owes). */
  currentBalance: number | string | Decimal | null | undefined;
  /** Additional credit this sale (or adjustment) would add to AR. */
  additionalCredit: number | string | Decimal | null | undefined;
};

export type CreditLimitEvalResult =
  | { allowed: true; unlimited: boolean; projectedBalance: number; creditLimit: number }
  | {
      allowed: false;
      unlimited: false;
      projectedBalance: number;
      creditLimit: number;
      code: 'CREDIT_LIMIT_EXCEEDED';
      message: string;
    };

export function isUnlimitedCustomerCredit(flag?: boolean | null): boolean {
  return flag === true;
}

/** Projected AR after adding additional credit to current balance. */
export function projectArBalance(
  currentBalance: number | string | Decimal | null | undefined,
  additionalCredit: number | string | Decimal | null | undefined,
): Decimal {
  return new Decimal(currentBalance || 0).plus(additionalCredit || 0);
}

/**
 * Whether the projected AR stays within policy.
 * Unlimited customers always allow; limited customers must stay ≤ creditLimit.
 */
export function evaluateCustomerCreditLimit(input: CreditLimitEvalInput): CreditLimitEvalResult {
  const projected = projectArBalance(input.currentBalance, input.additionalCredit);
  const projectedBalance = projected.toNumber();
  const limit = new Decimal(input.creditLimit || 0);
  const creditLimit = limit.toNumber();

  if (isUnlimitedCustomerCredit(input.unlimitedCredit)) {
    return { allowed: true, unlimited: true, projectedBalance, creditLimit };
  }

  if (projected.greaterThan(limit)) {
    return {
      allowed: false,
      unlimited: false,
      projectedBalance,
      creditLimit,
      code: 'CREDIT_LIMIT_EXCEEDED',
      message: `Credit limit exceeded. Limit: ${creditLimit}, Current: ${new Decimal(input.currentBalance || 0).toString()}, New: ${projected.toFixed(2)}`,
    };
  }

  return { allowed: true, unlimited: false, projectedBalance, creditLimit };
}

/** Available headroom under a finite limit (null when unlimited). */
export function creditAvailable(
  unlimitedCredit: boolean | null | undefined,
  creditLimit: number,
  outstandingBalance: number,
): number | null {
  if (isUnlimitedCustomerCredit(unlimitedCredit)) return null;
  return Math.max(0, creditLimit - Math.max(0, outstandingBalance));
}
