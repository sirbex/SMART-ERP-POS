/**
 * Loss & Quarantine domain types (ADR-004 Phase 2A)
 */

export const LOSS_DOCUMENT_TYPES = [
  'QUARANTINE_TRANSFER',
  'LOSS_DISPOSAL',
  'LOSS_REVERSAL',
] as const;

export type LossDocumentType = (typeof LOSS_DOCUMENT_TYPES)[number];

/** Economic classifier on stock_movements (and future loss documents). */
export const ECONOMIC_EVENTS = [
  'QUARANTINE_TRANSFER',
  'LOSS_DISPOSAL',
  'LOSS_REVERSAL',
  'OTHER',
] as const;

export type EconomicEvent = (typeof ECONOMIC_EVENTS)[number];

export const LOSS_EXPENSE_ACCOUNTS = {
  SHRINKAGE: '5110',
  DAMAGE: '5120',
  EXPIRY: '5130',
  OVERAGE: '4110',
} as const;

export type LossExpenseReason = 'SHRINKAGE' | 'DAMAGE' | 'EXPIRY' | 'WRITE_OFF' | 'PHYSICAL_COUNT';

/** Map disposal reason → expense (or overage) account. LQ-INV-7 */
export function expenseAccountForLossReason(reason: LossExpenseReason): string {
  switch (reason) {
    case 'DAMAGE':
      return LOSS_EXPENSE_ACCOUNTS.DAMAGE;
    case 'EXPIRY':
      return LOSS_EXPENSE_ACCOUNTS.EXPIRY;
    case 'SHRINKAGE':
    case 'WRITE_OFF':
    case 'PHYSICAL_COUNT':
    default:
      return LOSS_EXPENSE_ACCOUNTS.SHRINKAGE;
  }
}

/**
 * WRITE_OFF from a DAMAGE quarantine store defaults to 5120 (ADR-004).
 * Generic WRITE_OFF / count short stays on 5110.
 */
export function expenseAccountForDisposal(input: {
  reason: LossExpenseReason;
  fromStoreType?: string | null;
}): string {
  if (input.reason === 'WRITE_OFF' && input.fromStoreType === 'DAMAGE') {
    return LOSS_EXPENSE_ACCOUNTS.DAMAGE;
  }
  if (input.reason === 'WRITE_OFF' && input.fromStoreType === 'EXPIRED') {
    return LOSS_EXPENSE_ACCOUNTS.EXPIRY;
  }
  if (input.reason === 'WRITE_OFF' && input.fromStoreType === 'RETURN') {
    return LOSS_EXPENSE_ACCOUNTS.SHRINKAGE;
  }
  return expenseAccountForLossReason(input.reason);
}

/**
 * Map disposal reason + store type → stock movement type for GL shape.
 * WRITE_OFF from DAMAGE/EXPIRED uses DAMAGE/EXPIRY types so GL hits 5120/5130.
 */
export function movementTypeForDisposal(input: {
  reason: LossExpenseReason;
  fromStoreType?: string | null;
}): 'DAMAGE' | 'EXPIRY' | 'ADJUSTMENT_OUT' {
  const account = expenseAccountForDisposal(input);
  if (account === LOSS_EXPENSE_ACCOUNTS.DAMAGE) return 'DAMAGE';
  if (account === LOSS_EXPENSE_ACCOUNTS.EXPIRY) return 'EXPIRY';
  return 'ADJUSTMENT_OUT';
}

export function roundMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
