/** UUID v4 pattern for persisted catalog / customer rows. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POS / quotation placeholders that must never hit UUID FK columns.
 * Matches salesRepository + hold cart behaviour (custom_, temp_, default-).
 */
export function isSyntheticProductId(id: string | null | undefined): boolean {
  if (!id || !id.trim()) return true;
  if (id.startsWith('custom_')) return true;
  if (id.startsWith('temp_')) return true;
  if (id.startsWith('default-')) return true;
  return !UUID_RE.test(id);
}

export function isPersistedProductId(id: string | null | undefined): boolean {
  return !isSyntheticProductId(id);
}

/** DB-safe product_id for INSERT (null when synthetic). */
export function normalizeProductIdForDb(id: string | null | undefined): string | null {
  return isSyntheticProductId(id) ? null : (id as string);
}
