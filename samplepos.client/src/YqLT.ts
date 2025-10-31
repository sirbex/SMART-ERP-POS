import type { z } from 'zod';
import Decimal from 'decimal.js';

/**
 * Validation helper utilities for accounting operations
 */

/**
 * Validates a Zod schema and returns parsed data or throws error
 */
export function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `${context} validation failed: ${JSON.stringify(result.error.issues)}`
    );
  }
  return result.data;
}

/**
 * Validates that debits equal credits (double-entry rule)
 */
export function validateDoubleEntry(
  entries: Array<{ type: 'debit' | 'credit'; amount: Decimal }>
): void {
  const debitTotal = entries
    .filter((e) => e.type === 'debit')
    .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));

  const creditTotal = entries
    .filter((e) => e.type === 'credit')
    .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));

  if (!debitTotal.equals(creditTotal)) {
    throw new Error(
      `Double-entry violation: debits (${debitTotal}) != credits (${creditTotal})`
    );
  }
}

/**
 * Validates that an amount is positive
 */
export function validatePositiveAmount(amount: Decimal, context: string): void {
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error(`${context}: amount must be positive, got ${amount}`);
  }
}

/**
 * Validates that an account exists
 */
export function validateAccountExists(
  account: unknown,
  accountId: string
): void {
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }
}

/**
 * Validates sufficient balance for a transaction
 */
export function validateSufficientBalance(
  currentBalance: Decimal,
  requiredAmount: Decimal,
  accountId: string
): void {
  if (currentBalance.lessThan(requiredAmount)) {
    throw new Error(
      `Insufficient balance in account ${accountId}: required ${requiredAmount}, available ${currentBalance}`
    );
  }
}

/**
 * Validates currency code format (3-letter ISO code)
 */
export function validateCurrency(currency: string): void {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`Invalid currency code: ${currency} (must be 3-letter ISO code)`);
  }
}

/**
 * Validates date is not in the future
 */
export function validateNotFutureDate(date: Date, context: string): void {
  if (date > new Date()) {
    throw new Error(`${context}: date cannot be in the future`);
  }
}
