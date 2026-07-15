/**
 * VAT Remittance domain types (ADR-005 Phase 3A)
 */

/** Net VAT control — never use 1250/2350 for product VAT (VR-INV-5/6). */
export const VAT_CONTROL_ACCOUNT = '2300' as const;

/** WHT accounts — off-limits to VAT remittance journals. */
export const WHT_OFF_LIMITS_ACCOUNTS = ['1250', '2350'] as const;

export const VAT_DOCUMENT_TYPES = [
  'VAT_ACCRUAL',
  'VAT_REMITTANCE',
  'VAT_REFUND',
  'VAT_REVERSAL',
] as const;

export type VatDocumentType = (typeof VAT_DOCUMENT_TYPES)[number];

/** Treasury Document type for authority settlement (ADR-003 / ADR-005). */
export const VAT_REMITTANCE_TD_TYPE = 'VAT_REMITTANCE' as const;

/** PostingSource for remittance journals (Rule D). */
export const VAT_REMITTANCE_POSTING_SOURCE = 'VAT_REMITTANCE' as const;

export function roundMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function isWhtOffLimitsAccount(code: string | null | undefined): boolean {
  return (WHT_OFF_LIMITS_ACCOUNTS as readonly string[]).includes(code ?? '');
}
