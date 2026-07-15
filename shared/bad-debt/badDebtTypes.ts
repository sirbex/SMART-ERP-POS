/**
 * Bad Debt (AR Write-off) domain types (ADR-006 Phase 4A)
 */

/** Default Bad Debt Expense — never use 4010 (CN) or 5110–5130 (inventory loss). */
export const BAD_DEBT_EXPENSE_ACCOUNT = '5210' as const;

/** AR control account cleared on write-off. */
export const AR_CONTROL_ACCOUNT = '1200' as const;

/** Contra-revenue — off-limits for uncollectible write-offs (BD-INV-4/9). */
export const SALES_RETURNS_ACCOUNT = '4010' as const;

/** Inventory loss expenses — off-limits (BD-INV-5). */
export const INVENTORY_LOSS_OFF_LIMITS_ACCOUNTS = ['5110', '5120', '5130'] as const;

export const BAD_DEBT_REASON_CODES = [
  'UNCOLLECTIBLE',
  'DISPUTE_LOST',
  'BANKRUPTCY',
  'OTHER',
] as const;

export type BadDebtReasonCode = (typeof BAD_DEBT_REASON_CODES)[number];

export const BAD_DEBT_DOCUMENT_TYPES = ['AR_WRITEOFF', 'AR_WRITEOFF_REVERSAL'] as const;

export type BadDebtDocumentType = (typeof BAD_DEBT_DOCUMENT_TYPES)[number];

/** PostingSource for write-off journals (Rule A/B/C allow-list). */
export const AR_WRITEOFF_POSTING_SOURCE = 'AR_WRITEOFF' as const;
export const AR_WRITEOFF_REVERSAL_POSTING_SOURCE = 'AR_WRITEOFF_REVERSAL' as const;

export function roundMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function isInventoryLossAccount(code: string | null | undefined): boolean {
  return (INVENTORY_LOSS_OFF_LIMITS_ACCOUNTS as readonly string[]).includes(code ?? '');
}

export function isSalesReturnsAccount(code: string | null | undefined): boolean {
  return (code ?? '') === SALES_RETURNS_ACCOUNT;
}
