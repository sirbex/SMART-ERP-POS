/**
 * Aged sale return policy — SSOT.
 *
 * Customer returns / exchanges on sales older than one month (30 calendar days)
 * may only be performed by absolute ADMIN (users.role = ADMIN).
 *
 * Enforced server-side in salesService.refundSale (and thus guided exchange).
 * UI mirrors the rule for clarity; server is authoritative.
 */

/** Calendar days after sale_date before ADMIN-only returns apply. */
export const AGED_SALE_RETURN_DAYS = 30;

export const ERR_REFUND_AGED_ADMIN_ONLY = 'ERR_REFUND_AGED_ADMIN_ONLY';

/** Absolute admin — same convention as RBAC middleware (users.role = ADMIN). */
export function isAbsoluteAdminRole(role: string | null | undefined): boolean {
  const r = (role || '').toUpperCase();
  return r === 'ADMIN' || r === 'SUPER_ADMIN';
}

/**
 * Whole calendar days between two YYYY-MM-DD dates (UTC date arithmetic).
 * Negative if asOfDate is before saleDate.
 */
export function calendarDaysBetween(saleDate: string, asOfDate: string): number {
  const a = String(saleDate).slice(0, 10);
  const b = String(asOfDate).slice(0, 10);
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const t0 = Date.UTC(ay, am - 1, ad);
  const t1 = Date.UTC(by, bm - 1, bd);
  return Math.floor((t1 - t0) / 86_400_000);
}

export function isAgedSaleReturn(
  saleDate: string,
  asOfDate: string,
  limitDays: number = AGED_SALE_RETURN_DAYS,
): boolean {
  return calendarDaysBetween(saleDate, asOfDate) > limitDays;
}

/**
 * Whether the actor may process a return/exchange for this sale date.
 * Non-admin blocked when sale is older than AGED_SALE_RETURN_DAYS.
 */
export function canProcessAgedSaleReturn(params: {
  saleDate: string;
  asOfDate: string;
  actorRole: string | null | undefined;
  limitDays?: number;
}): { allowed: boolean; ageDays: number; requiresAdmin: boolean } {
  const ageDays = calendarDaysBetween(params.saleDate, params.asOfDate);
  const limit = params.limitDays ?? AGED_SALE_RETURN_DAYS;
  const requiresAdmin = ageDays > limit;
  if (!requiresAdmin) {
    return { allowed: true, ageDays, requiresAdmin: false };
  }
  return {
    allowed: isAbsoluteAdminRole(params.actorRole),
    ageDays,
    requiresAdmin: true,
  };
}

export function agedSaleReturnDeniedMessage(ageDays: number, limitDays = AGED_SALE_RETURN_DAYS): string {
  return (
    `This sale is ${ageDays} days old. Customer returns more than ${limitDays} days after the sale ` +
    `can only be processed by an ADMIN.`
  );
}
