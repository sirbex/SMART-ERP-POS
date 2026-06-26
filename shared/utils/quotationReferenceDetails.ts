/**
 * SSOT for quotation "reference details" — the user-entered reference + description
 * fields shown on quotation and invoice PDFs.
 */

/** True when there is any non-whitespace reference detail to render. */
export function hasQuotationReferenceDetails(
  reference: string | null | undefined,
  description: string | null | undefined,
): boolean {
  return Boolean(reference?.trim() || description?.trim());
}

/**
 * Snapshot quotation reference details onto an invoice at conversion time.
 * Preserves each field exactly as entered; joins with newline when both are set.
 */
export function snapshotQuotationReferenceDetails(
  reference: string | null | undefined,
  description: string | null | undefined,
): string | null {
  const parts: string[] = [];
  if (reference != null && reference !== '') parts.push(reference);
  if (description != null && description !== '') parts.push(description);
  return parts.length > 0 ? parts.join('\n') : null;
}

/** Lines to render on PDF — preserves exact text, skips whitespace-only fields. */
export function quotationReferenceDetailLines(
  reference: string | null | undefined,
  description: string | null | undefined,
): string[] {
  const lines: string[] = [];
  if (reference != null && reference.trim() !== '') lines.push(reference);
  if (description != null && description.trim() !== '') lines.push(description);
  return lines;
}

/** Parse a snapshot stored on invoices.reference back into display lines. */
export function referenceSnapshotLines(snapshot: string | null | undefined): string[] {
  if (snapshot == null || snapshot.trim() === '') return [];
  return snapshot.split('\n').filter((line) => line.trim() !== '');
}

/**
 * Quotation PDF "Reference" on the Quoted To card:
 * user-entered reference when set, otherwise the system quote number.
 */
export function quotationPdfReferenceDisplay(
  reference: string | null | undefined,
  quoteNumber: string,
): string {
  const trimmed = reference?.trim();
  return trimmed || quoteNumber;
}
