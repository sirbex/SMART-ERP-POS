/**
 * SSOT for which invoice-settings payment accounts appear on documents.
 *
 * Semantics (match Zod defaults on PaymentAccountSchema):
 *   missing isActive / showOnInvoice / showOnReceipt → treated as true
 *   only explicit false excludes an account for that surface
 *
 * Never filters by account type (BANK | MOBILE_MONEY | WALLET) — that was a source of
 * “Airtel prints, bank silently disappears” when flags were uneven.
 */

export type PaymentAccountVisibility = {
  id?: string;
  type?: string;
  provider?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  branchOrCode?: string | null;
  isActive?: boolean | null;
  showOnReceipt?: boolean | null;
  showOnInvoice?: boolean | null;
  sortOrder?: number | null;
  // legacy snake_case tolerated on load
  is_active?: boolean | null;
  show_on_receipt?: boolean | null;
  show_on_invoice?: boolean | null;
  account_name?: string | null;
  account_number?: string | null;
  branch_or_code?: string | null;
  sort_order?: number | null;
};

export type NormalizedPaymentAccount = {
  id?: string;
  type: 'BANK' | 'MOBILE_MONEY' | 'WALLET' | string;
  provider: string;
  accountName: string;
  accountNumber: string;
  branchOrCode?: string;
  isActive: boolean;
  showOnReceipt: boolean;
  showOnInvoice: boolean;
  sortOrder: number;
};

function truthyFlag(value: boolean | null | undefined, fallback = true): boolean {
  if (value === false) return false;
  if (value === true) return true;
  return fallback;
}

function firstString(
  ...vals: Array<string | null | undefined>
): string {
  for (const v of vals) {
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

/**
 * Normalize one stored/API/legacy payment account into a consistent shape.
 */
export function normalizePaymentAccount(
  raw: PaymentAccountVisibility | null | undefined,
): NormalizedPaymentAccount | null {
  if (!raw || typeof raw !== 'object') return null;

  const provider = firstString(raw.provider);
  const accountName = firstString(raw.accountName, raw.account_name);
  const accountNumber = firstString(raw.accountNumber, raw.account_number);
  if (!provider || !accountName || !accountNumber) return null;

  const typeRaw = String(raw.type || 'MOBILE_MONEY').toUpperCase();
  const type =
    typeRaw === 'BANK' || typeRaw === 'MOBILE_MONEY' || typeRaw === 'WALLET'
      ? typeRaw
      : typeRaw || 'MOBILE_MONEY';

  return {
    id: raw.id,
    type,
    provider,
    accountName,
    accountNumber,
    branchOrCode: firstString(raw.branchOrCode, raw.branch_or_code) || undefined,
    isActive: truthyFlag(raw.isActive ?? raw.is_active, true),
    showOnReceipt: truthyFlag(raw.showOnReceipt ?? raw.show_on_receipt, true),
    showOnInvoice: truthyFlag(raw.showOnInvoice ?? raw.show_on_invoice, true),
    sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0) || 0,
  };
}

export function normalizePaymentAccounts(
  accounts: PaymentAccountVisibility[] | null | undefined,
): NormalizedPaymentAccount[] {
  if (!Array.isArray(accounts)) return [];
  return accounts
    .map((a) => normalizePaymentAccount(a))
    .filter((a): a is NormalizedPaymentAccount => a != null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Active accounts flagged for invoice PDF / on-invoice surfaces. */
export function accountsForInvoice(
  accounts: PaymentAccountVisibility[] | null | undefined,
): NormalizedPaymentAccount[] {
  return normalizePaymentAccounts(accounts).filter(
    (a) => a.isActive && a.showOnInvoice,
  );
}

/** Active accounts flagged for receipts / guest bills / thermal. */
export function accountsForReceipt(
  accounts: PaymentAccountVisibility[] | null | undefined,
): NormalizedPaymentAccount[] {
  return normalizePaymentAccounts(accounts).filter(
    (a) => a.isActive && a.showOnReceipt,
  );
}
