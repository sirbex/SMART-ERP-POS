/**
 * Samba-style pending qty before product tap.
 * Empty / 0 → 1; caps at 9999.
 */
export function parsePendingOrderQty(digits: string): number {
  const n = Number.parseInt(String(digits).replace(/\D/g, ''), 10);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(n, 9999);
}

/** Clamp a typed absolute quantity (Set qty sheet). */
export function clampOrderQty(raw: number, max = 9999): number | null {
  if (!Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (n < 0 || n > max) return null;
  return n;
}

export function appendQtyDigit(prev: string, digit: string, maxLen = 4): string {
  if (!/^\d$/.test(digit)) return prev;
  const next = `${prev}${digit}`.replace(/^0+(?=\d)/, '');
  return next.length > maxLen ? next.slice(0, maxLen) : next;
}
