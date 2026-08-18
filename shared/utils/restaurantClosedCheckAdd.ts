/**
 * Toast / Samba: voiding the last lines closes that check.
 * The next menu tap must not fail with "Check is not open".
 *
 * - No remaining PENDING tickets → open a new check
 * - Exactly one remaining → bind it
 * - Two or more → waiter picks (party list)
 */
export type ClosedCheckAddRetry =
  | { action: 'open-new' }
  | { action: 'bind'; orderId: string }
  | { action: 'select-ticket'; openOrderIds: string[] };

export function openOrderIdsFromDetails(
  details: Record<string, unknown> | null | undefined,
): string[] {
  const raw = details?.openOrderIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export function resolveClosedCheckAddRetry(
  closedOrderId: string | null | undefined,
  openOrderIds: readonly string[] | null | undefined,
): ClosedCheckAddRetry {
  const closed = String(closedOrderId || '').trim();
  const open = [
    ...new Set(
      (openOrderIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => id.length > 0 && id !== closed),
    ),
  ];
  if (open.length === 0) return { action: 'open-new' };
  if (open.length === 1) return { action: 'bind', orderId: open[0]! };
  return { action: 'select-ticket', openOrderIds: open };
}
