/**
 * Diff server pos_order_items vs a ticket/journal line snapshot → void quantities.
 * Prefer UUID line ids (seeded server checks); fall back to productId aggregates for ofl_line_*.
 * SSOT for offline ORDER_UPDATED replay and Complete Sale reconcile.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOrderLineUuid(id: string | null | undefined): boolean {
  return !!id && UUID_RE.test(id);
}

export type ReconcileServerLine = {
  id: string;
  quantity: string | number;
  productId?: string | null;
};

export type ReconcileDesiredLine = {
  lineId?: string;
  productId?: string;
  quantity?: number;
};

export function computeVoidItemsFromUpdatedLines(
  serverItems: ReconcileServerLine[],
  eventLines: ReconcileDesiredLine[],
): Array<{ itemId: string; quantity: number }> {
  const desiredByUuid = new Map<string, number>();
  let hasUuidLine = false;
  for (const line of eventLines) {
    const id = typeof line.lineId === 'string' ? line.lineId : '';
    if (!UUID_RE.test(id)) continue;
    hasUuidLine = true;
    desiredByUuid.set(id, Number(line.quantity) || 0);
  }

  const voids: Array<{ itemId: string; quantity: number }> = [];

  if (hasUuidLine) {
    for (const item of serverItems) {
      const have = Number(item.quantity) || 0;
      if (!(have > 0)) continue;
      if (!desiredByUuid.has(item.id)) {
        voids.push({ itemId: item.id, quantity: have });
        continue;
      }
      const want = desiredByUuid.get(item.id)!;
      if (want < have - 1e-9) {
        voids.push({ itemId: item.id, quantity: have - want });
      }
    }
    return voids;
  }

  const desiredByProduct = new Map<string, number>();
  for (const line of eventLines) {
    const pid = typeof line.productId === 'string' ? line.productId : '';
    if (!pid) continue;
    desiredByProduct.set(pid, (desiredByProduct.get(pid) || 0) + (Number(line.quantity) || 0));
  }
  const haveByProduct = new Map<string, Array<{ id: string; qty: number }>>();
  for (const item of serverItems) {
    const pid = item.productId || '';
    const rows = haveByProduct.get(pid) || [];
    rows.push({ id: item.id, qty: Number(item.quantity) || 0 });
    haveByProduct.set(pid, rows);
  }
  for (const [pid, rows] of haveByProduct) {
    let toVoid = rows.reduce((s, r) => s + r.qty, 0) - (desiredByProduct.get(pid) || 0);
    if (!(toVoid > 1e-9)) continue;
    for (const row of rows) {
      if (!(toVoid > 1e-9)) break;
      const take = Math.min(row.qty, toVoid);
      if (take > 1e-9) {
        voids.push({ itemId: row.id, quantity: take });
        toVoid -= take;
      }
    }
  }
  return voids;
}

export function totalLineQuantity(lines: ReconcileDesiredLine[]): number {
  return lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
}
