/**
 * Kitchen / KOT line consolidation — Samba/Toast business rule.
 *
 * Same product + same modifiers (line notes / tags) → one qty line.
 * Different conditions stay separate (e.g. 1× Mild, 3× Spicy).
 * Never include prices here — KOT is kitchen-facing only.
 */

export type KotLineInput = {
  productId?: string | null;
  productName: string;
  quantity: number | string;
  lineNotes?: string | null;
  /** Preserved for DB KOT rows (first line wins when merged). */
  orderItemId?: string | null;
  lineId?: string | null;
};

export type KotLineConsolidated = {
  productId: string | null;
  productName: string;
  quantity: number;
  lineNotes: string | null;
  orderItemId: string | null;
  lineId: string | null;
  /** Source row ids merged into this kitchen line. */
  sourceIds: string[];
};

/** Stable merge key: ignore tag order ("Mild · Spicy" ≡ "Spicy · Mild"). */
export function kotLineNotesMergeKey(notes: string | null | undefined): string {
  const raw = String(notes || '').trim();
  if (!raw) return '';
  return raw
    .split(/\s*·\s*/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
}

export function kotLineMergeKey(item: {
  productId?: string | null;
  productName: string;
  lineNotes?: string | null;
}): string {
  const product = item.productId || `name:${String(item.productName || '').trim().toLowerCase()}`;
  return `${product}|${kotLineNotesMergeKey(item.lineNotes)}`;
}

/**
 * Collapse identical kitchen lines into summed quantities.
 * Empty input → []. Qty ≤ 0 rows are skipped.
 */
export function consolidateKotLines(items: KotLineInput[]): KotLineConsolidated[] {
  const map = new Map<string, KotLineConsolidated>();
  for (const it of items) {
    const qty = Number(it.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const productName = String(it.productName || '').trim() || 'Item';
    const notesRaw = String(it.lineNotes || '').trim();
    const key = kotLineMergeKey({
      productId: it.productId,
      productName,
      lineNotes: notesRaw || null,
    });
    const sourceId = it.orderItemId || it.lineId || '';
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        productId: it.productId ?? null,
        productName,
        quantity: qty,
        lineNotes: notesRaw || null,
        orderItemId: it.orderItemId ?? null,
        lineId: it.lineId ?? null,
        sourceIds: sourceId ? [sourceId] : [],
      });
    } else {
      existing.quantity += qty;
      if (sourceId) existing.sourceIds.push(sourceId);
    }
  }
  return Array.from(map.values());
}
