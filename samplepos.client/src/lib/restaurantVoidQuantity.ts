/**
 * Toast/Samba-style: allocate a void quantity across consolidated ticket lines.
 * Prefers consuming whole unit rows first, then reducing multi-qty rows.
 */
export function allocateVoidQuantity(
  lines: Array<{ id: string; quantity: number }>,
  voidQty: number,
): Array<{ itemId: string; quantity: number }> {
  if (!(voidQty > 0)) return [];
  const sorted = [...lines]
    .map((l) => ({ id: l.id, quantity: Number(l.quantity) || 0 }))
    .filter((l) => l.quantity > 0)
    .sort((a, b) => a.quantity - b.quantity);

  let remaining = voidQty;
  const out: Array<{ itemId: string; quantity: number }> = [];
  for (const line of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(line.quantity, remaining);
    out.push({ itemId: line.id, quantity: take });
    remaining -= take;
  }
  if (remaining > 0) {
    throw new Error(`Cannot void ${voidQty} — only ${voidQty - remaining} available on this line`);
  }
  return out;
}

export function isServerOrderItemId(id: string | null | undefined): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
