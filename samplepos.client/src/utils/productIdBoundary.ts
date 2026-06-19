const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
