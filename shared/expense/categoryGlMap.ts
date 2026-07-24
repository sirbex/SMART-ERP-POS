/**
 * Canonical expense category → GL account mapping.
 * Source of truth for seeds, CRUD defaults, and hardcoded GL fallbacks.
 * Runtime posting should prefer expense_categories.account_id when set.
 */

/** Preferred DB codes (short form used by expense_gl_integration + seeds). */
export const CANONICAL_EXPENSE_CATEGORY_CODES = [
  'OFFICE',
  'TRAVEL',
  'MEALS',
  'FUEL',
  'UTILITIES',
  'MAINTENANCE',
  'MARKETING',
  'EQUIPMENT',
  'SOFTWARE',
  'PROFESSIONAL',
  'ACCOMMODATION',
  'TRAINING',
  'ALLOWANCE',
  'OTHER',
  'RENT',
  'SALARIES',
  'INSURANCE',
] as const;

export type CanonicalExpenseCategoryCode = (typeof CANONICAL_EXPENSE_CATEGORY_CODES)[number];

/** Legacy / TypeScript enum codes → canonical short codes. */
export const EXPENSE_CATEGORY_ALIASES: Record<string, CanonicalExpenseCategoryCode> = {
  OFFICE_SUPPLIES: 'OFFICE',
  PROFESSIONAL_SERVICES: 'PROFESSIONAL',
  GENERAL: 'OTHER',
};

/** Category code → CoA AccountCode (matches AccountCodes + add_missing_accounts.sql). */
export const EXPENSE_CATEGORY_GL_CODES: Record<string, string> = {
  OFFICE: '6400',
  OFFICE_SUPPLIES: '6400',
  TRAVEL: '6800',
  MEALS: '6800',
  FUEL: '6800',
  ACCOMMODATION: '6800',
  UTILITIES: '6200',
  SALARIES: '6000',
  ALLOWANCE: '6000',
  RENT: '6100',
  MARKETING: '6300',
  INSURANCE: '6600',
  PROFESSIONAL: '6700',
  PROFESSIONAL_SERVICES: '6700',
  MAINTENANCE: '6900',
  EQUIPMENT: '6900',
  SOFTWARE: '6900',
  TRAINING: '6900',
  OTHER: '6900',
  GENERAL: '6900',
};

export const DEFAULT_EXPENSE_GL_CODE = '6900';

export function normalizeExpenseCategoryCode(code: string | null | undefined): string {
  if (!code) return 'OTHER';
  const upper = code.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return EXPENSE_CATEGORY_ALIASES[upper] || upper;
}

export function mapExpenseCategoryCodeToGl(code: string | null | undefined): string {
  const normalized = normalizeExpenseCategoryCode(code);
  return (
    EXPENSE_CATEGORY_GL_CODES[normalized] ||
    EXPENSE_CATEGORY_GL_CODES[code?.toUpperCase() || ''] ||
    DEFAULT_EXPENSE_GL_CODE
  );
}
