/**
 * Quotation content hash (BR-QUOTE-012) — shared for create/update + unit tests.
 *
 * Duplicate prevention is meant for *open* quotes that are truly the same cart.
 * Terminal statuses (converted/cancelled/expired/rejected) must not block recreation.
 */

import crypto from 'crypto';

/** Statuses that still "own" a content hash (index + service check must match). */
export const OPEN_CONTENT_HASH_STATUSES = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
] as const;

/** Statuses that must NOT block a new quote with the same content. */
export const TERMINAL_CONTENT_HASH_STATUSES = [
  'CONVERTED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
] as const;

export type QuotationHashLine = {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number | null;
  taxRate?: number | null;
  isTaxable?: boolean | null;
  uomName?: string | null;
};

/**
 * Hash customer identity + line economics.
 * Prefer customerId; else name+phone so walk-in/name collisions are rarer.
 */
export function computeContentHash(
  customerId: string | null | undefined,
  customerName: string | null | undefined,
  items: QuotationHashLine[],
  customerPhone?: string | null | undefined,
): string {
  const customerKey = customerId?.trim()
    || [customerName?.trim() || '', customerPhone?.trim() || ''].filter(Boolean).join('|')
    || 'walk-in';

  const sortedItems = [...items]
    .sort((a, b) => (a.description || '').localeCompare(b.description || ''))
    .map((i) => {
      const discount = Number(i.discountAmount || 0);
      const taxRate = i.isTaxable === false ? 0 : Number(i.taxRate || 0);
      const uom = String(i.uomName || '').trim().toLowerCase();
      return [
        i.productId || '',
        i.description || '',
        Number(i.quantity),
        Number(i.unitPrice),
        discount,
        taxRate,
        uom,
      ].join('|');
    });

  const payload = `${customerKey}::${sortedItems.join(';')}`;
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 64);
}
