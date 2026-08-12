/**
 * HR pay-from account SSOT.
 *
 * Cash Drawer 1010 is till-controlled (Rule D): PAYROLL must not credit it.
 * Staff advances and net pay leave through Petty Cash (1012), Bank, or MoMo.
 *
 * To hand notes from the till: Treasury petty-cash fund first
 *   DR 1012 / CR 1010  source TREASURY_PETTY_CASH
 * then HR advance/pay from 1012.
 */
export const HR_TILL_CASH_ACCOUNT = '1010';
export const HR_UNDEPOSITED_ACCOUNT = '1015';
export const HR_PETTY_CASH_ACCOUNT = '1012';

export const HR_FORBIDDEN_DISBURSEMENT_CODES = [
  HR_TILL_CASH_ACCOUNT,
  HR_UNDEPOSITED_ACCOUNT,
] as const;

export const HR_FORBIDDEN_DISBURSEMENT_TAGS = ['CASH', 'UNDEPOSITED_FUNDS'] as const;

export const HR_ALLOWED_DISBURSEMENT_TAGS = ['BANK', 'MOBILE_MONEY', 'PETTY_CASH'] as const;

export const HR_PREFERRED_DISBURSEMENT_CODES = ['1012', '1020', '1030', '1040'] as const;

export function isForbiddenHrDisbursementAccount(
  code: string,
  tag?: string | null,
): boolean {
  const c = String(code || '').trim();
  const t = String(tag || '').trim().toUpperCase();
  if ((HR_FORBIDDEN_DISBURSEMENT_CODES as readonly string[]).includes(c)) return true;
  if ((HR_FORBIDDEN_DISBURSEMENT_TAGS as readonly string[]).includes(t)) return true;
  return false;
}

export function assertHrDisbursementAccount(code: string, tag?: string | null): string {
  const c = String(code || '').trim();
  if (!c) {
    throw new Error('HR_PAY_NO_ACCOUNT: select Petty Cash (1012), Bank, or Mobile Money');
  }
  if (isForbiddenHrDisbursementAccount(c, tag)) {
    throw new Error(
      `HR_PAY_NOT_CASH_DRAWER: Cannot pay payroll or staff advances from ${c} ` +
        `(Cash Drawer / undeposited till). Rule D: PAYROLL must not credit 1010. ` +
        `Pay from Petty Cash (1012), Bank, or Mobile Money. ` +
        `To take notes from the till, first fund petty cash via Treasury ` +
        `(DR 1012 / CR 1010, source TREASURY_PETTY_CASH).`,
    );
  }
  return c;
}

export function pickHrDisbursementAccount(
  accounts: ReadonlyArray<{ code: string; tag?: string | null }>,
): string {
  const allowed = accounts.filter((a) => !isForbiddenHrDisbursementAccount(a.code, a.tag));
  for (const preferred of HR_PREFERRED_DISBURSEMENT_CODES) {
    const hit = allowed.find((a) => a.code === preferred);
    if (hit) return hit.code;
  }
  const first = allowed[0]?.code;
  if (!first) {
    throw new Error(
      'HR_PAY_NO_ACCOUNT: no Petty Cash / Bank / Mobile Money account is available for payroll',
    );
  }
  return first;
}
