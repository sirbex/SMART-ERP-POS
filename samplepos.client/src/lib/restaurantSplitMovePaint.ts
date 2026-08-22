/**
 * Samba Move / same-table split — pure SSOT for post-move paint + guards.
 * Keeps FOH deterministic: moved lines always land on the new ticket that becomes active.
 */

export type SplitMoveTicketTab = {
  id: string;
  orderNumber: string;
  totalAmount: string;
  note?: string | null;
};

export type SplitMovePartyPin = {
  tableId: string;
  orderIds: string[];
  /** Epoch ms — retain until both tickets appear in server openIds or pin expires. */
  untilMs: number;
};

/** Whole-ticket move is forbidden — leave at least one unit on source. */
export function canMoveSelectedUnits(selectedUnits: number, totalUnits: number): boolean {
  if (!(selectedUnits > 0) || !(totalUnits > 0)) return false;
  return selectedUnits < totalUnits - 1e-9;
}

/** Max units movable for a single consolidated group (qty pad). */
export function maxMoveUnitsForGroup(groupQty: number, totalUnits: number): number {
  if (!(groupQty > 0) || !(totalUnits > 0)) return 0;
  const otherRemain = totalUnits - groupQty;
  if (otherRemain > 0) return groupQty;
  return Math.max(0, groupQty - 1);
}

/**
 * After Move, FOH must activate the NEW ticket (moved lines).
 * Staying on source makes Move look like a no-op — the intermittent UX bug.
 */
export function resolveActiveOrderIdAfterSplitMove(splitOrderId: string): string {
  return splitOrderId;
}

/** Party strip after split: source remainder + destination with moved lines. */
export function buildPartyTabsAfterSplitMove(input: {
  priorTabs: SplitMoveTicketTab[];
  source: { id: string; orderNumber: string; totalAmount: string | number };
  split: { id: string; orderNumber: string; totalAmount: string | number };
}): SplitMoveTicketTab[] {
  const byId = new Map<string, SplitMoveTicketTab>();
  for (const t of input.priorTabs) {
    if (!t?.id) continue;
    byId.set(t.id, { ...t, totalAmount: String(t.totalAmount ?? 0) });
  }
  byId.set(input.source.id, {
    id: input.source.id,
    orderNumber: input.source.orderNumber || byId.get(input.source.id)?.orderNumber || '…',
    totalAmount: String(input.source.totalAmount ?? 0),
    note: byId.get(input.source.id)?.note ?? null,
  });
  byId.set(input.split.id, {
    id: input.split.id,
    orderNumber: input.split.orderNumber || byId.get(input.split.id)?.orderNumber || '…',
    totalAmount: String(input.split.totalAmount ?? 0),
    note: byId.get(input.split.id)?.note ?? null,
  });
  return Array.from(byId.values());
}

/** Pin both tickets so strip scrubbing cannot drop the new ticket mid-refetch. */
export function createSplitMovePartyPin(
  tableId: string,
  sourceOrderId: string,
  splitOrderId: string,
  nowMs = Date.now(),
  ttlMs = 60_000,
): SplitMovePartyPin {
  return {
    tableId,
    orderIds: [sourceOrderId, splitOrderId].filter(Boolean),
    untilMs: nowMs + ttlMs,
  };
}

export function isSplitMovePartyPinActive(
  pin: SplitMovePartyPin | null | undefined,
  tableId: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!pin || !tableId) return false;
  if (pin.tableId !== tableId) return false;
  if (nowMs > pin.untilMs) return false;
  return pin.orderIds.length > 0;
}

/**
 * Open-id set for strip scrubbing: never drop pinned party tickets before server
 * sibling list catches up (the day-to-day flake after Move).
 */
export function retainOpenTicketIdsWithPartyPin(
  openIds: ReadonlySet<string>,
  pin: SplitMovePartyPin | null | undefined,
  tableId: string | null | undefined,
  nowMs = Date.now(),
): Set<string> {
  const next = new Set(openIds);
  if (!isSplitMovePartyPinActive(pin, tableId, nowMs)) return next;
  for (const id of pin!.orderIds) {
    if (id) next.add(id);
  }
  return next;
}

/**
 * Clear pin once server open set contains every pinned id (stable multi-ticket SSOT).
 */
export function resolveSplitMovePartyPinAfterOpenIds(input: {
  pin: SplitMovePartyPin | null;
  tableId: string | null | undefined;
  openIds: ReadonlySet<string>;
  nowMs?: number;
}): SplitMovePartyPin | null {
  const { pin, tableId, openIds, nowMs = Date.now() } = input;
  if (!isSplitMovePartyPinActive(pin, tableId, nowMs)) return null;
  const allPresent = pin!.orderIds.every((id) => openIds.has(id));
  return allPresent ? null : pin;
}

/** Paint invariant: active ticket is the split, and it carries moved units. */
export function assertSplitMovePaintShowsMovedLines(input: {
  activeOrderId: string | null | undefined;
  splitOrderId: string;
  splitLineUnitCount: number;
}): boolean {
  if (!input.splitOrderId || input.activeOrderId !== input.splitOrderId) return false;
  return input.splitLineUnitCount > 0;
}
