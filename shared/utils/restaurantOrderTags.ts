/**
 * Samba-style order tags — pure formatters (FOH, KOT line_notes, proofs).
 */

export type RestaurantOrderTagSelection = {
  id?: string | null;
  label: string;
  prefix?: string | null;
  price?: number;
};

/** Kitchen/ticket label: "NO Salt", "EXTRA Lemon", "Very hot". */
export function formatOrderTagLabel(tag: RestaurantOrderTagSelection): string {
  const label = String(tag.label || '').trim();
  if (!label) return '';
  const prefix = String(tag.prefix || '').trim();
  if (!prefix) return label;
  // If label already starts with prefix, don't double it.
  if (label.toUpperCase().startsWith(prefix.toUpperCase() + ' ')) return label;
  return `${prefix.toUpperCase()} ${label}`;
}

/** Denormalize selections into pos_order_items.line_notes / KOT text. */
export function formatOrderTagsAsLineNotes(
  tags: RestaurantOrderTagSelection[] | null | undefined,
  freeText?: string | null,
): string | null {
  const parts = (tags || [])
    .map(formatOrderTagLabel)
    .filter(Boolean);
  const note = String(freeText || '').trim();
  if (note) parts.push(note);
  if (parts.length === 0) return null;
  return parts.join(' · ');
}

export function sumOrderTagPrices(
  tags: RestaurantOrderTagSelection[] | null | undefined,
): number {
  return (tags || []).reduce((s, t) => s + (Number(t.price) || 0), 0);
}

/** Toggle tag in a multi-select list (by id, else label+prefix). */
export function toggleOrderTagSelection(
  current: RestaurantOrderTagSelection[],
  tag: RestaurantOrderTagSelection,
  opts?: { maxSelect?: number | null },
): RestaurantOrderTagSelection[] {
  const key = (t: RestaurantOrderTagSelection) =>
    String(t.id || `${t.prefix || ''}|${t.label}`).toLowerCase();
  const k = key(tag);
  const exists = current.some((t) => key(t) === k);
  if (exists) return current.filter((t) => key(t) !== k);
  const max = opts?.maxSelect;
  if (max != null && max > 0 && current.length >= max) {
    // Replace last when at cap (Samba single-choice groups use max=1).
    return [...current.slice(0, Math.max(0, max - 1)), tag];
  }
  return [...current, tag];
}
