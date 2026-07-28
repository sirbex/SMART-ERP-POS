/**
 * Guest-facing priced line consolidation (bill / receipt).
 * Same product + same unit price + same notes → one qty line.
 * Different prices or modifiers stay separate.
 * Kitchen KOT uses consolidateKotLines (no prices).
 */

import { kotLineNotesMergeKey } from './consolidateKotLines.js';

export type PricedLineInput = {
  productId?: string | null;
  productName: string;
  quantity: number | string;
  unitPrice: number | string;
  lineTotal?: number | string | null;
  lineNotes?: string | null;
  /** Not printed — e.g. UOM so same SKU different UOM stay separate. */
  mergeKeyExtra?: string | null;
};

export type PricedLineConsolidated = {
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  lineNotes: string | null;
  mergeKeyExtra: string | null;
};

function moneyKey(n: number): string {
  // Stable merge across float noise from DB strings.
  return (Math.round(n * 10000) / 10000).toFixed(4);
}

export function pricedLineMergeKey(item: {
  productId?: string | null;
  productName: string;
  unitPrice: number;
  lineNotes?: string | null;
  mergeKeyExtra?: string | null;
}): string {
  const product = item.productId || `name:${String(item.productName || '').trim().toLowerCase()}`;
  const extra = String(item.mergeKeyExtra || '').trim().toLowerCase();
  return `${product}|${moneyKey(item.unitPrice)}|${kotLineNotesMergeKey(item.lineNotes)}|${extra}`;
}

/**
 * Collapse identical priced lines into summed qty + lineTotal.
 * Empty input → []. Qty ≤ 0 rows are skipped.
 */
export function consolidatePricedLines(items: PricedLineInput[]): PricedLineConsolidated[] {
  const map = new Map<string, PricedLineConsolidated>();
  for (const it of items) {
    const qty = Number(it.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const productName = String(it.productName || '').trim() || 'Item';
    const unitPrice = Number(it.unitPrice);
    if (!Number.isFinite(unitPrice)) continue;
    const notesRaw = String(it.lineNotes || '').trim();
    const extraRaw = String(it.mergeKeyExtra || '').trim();
    const explicitTotal = it.lineTotal == null || it.lineTotal === '' ? null : Number(it.lineTotal);
    const lineTotal =
      explicitTotal != null && Number.isFinite(explicitTotal) ? explicitTotal : qty * unitPrice;
    const key = pricedLineMergeKey({
      productId: it.productId,
      productName,
      unitPrice,
      lineNotes: notesRaw || null,
      mergeKeyExtra: extraRaw || null,
    });
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        productId: it.productId ?? null,
        productName,
        quantity: qty,
        unitPrice,
        lineTotal,
        lineNotes: notesRaw || null,
        mergeKeyExtra: extraRaw || null,
      });
    } else {
      existing.quantity += qty;
      existing.lineTotal += lineTotal;
    }
  }
  return Array.from(map.values());
}
