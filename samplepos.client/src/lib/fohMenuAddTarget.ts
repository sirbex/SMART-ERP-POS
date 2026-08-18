/**
 * FOH menu-add targeting SSOT (Toast / Samba).
 *
 * "Select a ticket" is ONLY when 2+ tickets are listed or the party list is up.
 * Floor count > 1 with an empty strip is wait-check (hydrate, then pick) — never
 * toast select while the phone menu is the only surface.
 */
export type FohMenuAddDecision =
  | { action: 'select-ticket' }
  | { action: 'create-first' }
  | { action: 'bind'; orderId: string }
  | { action: 'wait-check' };

export function resolveFohMenuAddTarget(input: {
  /** Party list is on screen (multi-ticket AND view === list). */
  partyListVisible: boolean;
  ticketCount: number;
  soleTicketId: string | null | undefined;
  activeOrderId: string | null | undefined;
  currentOrderId: string | null | undefined;
  /** Check query has settled for this table (not the first-paint loading gap). */
  checkSettled: boolean;
  /** Floor says this table already has a check (status occupied / openCheckCount). */
  tableOccupied: boolean;
  /** Floor open-check count when known (0 if unknown). */
  floorOpenCount?: number;
}): FohMenuAddDecision {
  if (input.partyListVisible) return { action: 'select-ticket' };

  const sole =
    input.ticketCount === 1 && input.soleTicketId ? input.soleTicketId : null;
  const target = input.activeOrderId || input.currentOrderId || sole || null;
  if (target) return { action: 'bind', orderId: target };

  if (input.ticketCount > 1) return { action: 'select-ticket' };

  const floorCount = Number(input.floorOpenCount || 0);
  // Occupied / 2+ on the floor but the strip is not listed yet — fetch, don't toast.
  if (!target && floorCount > 1) return { action: 'wait-check' };
  if (!input.checkSettled && (input.tableOccupied || floorCount === 1)) {
    return { action: 'wait-check' };
  }

  return { action: 'create-first' };
}

export function fohMenuAddBlockedMessage(decision: FohMenuAddDecision): string | null {
  if (decision.action === 'select-ticket') return 'Select a ticket to add items';
  if (decision.action === 'wait-check') return 'Loading ticket…';
  return null;
}

/**
 * One-shot table-open view. Does not hide the check (merge/close/strip need it).
 * hold = do not touch sambaTicketView (loading, or user already landed).
 */
export function resolveTableOpenLand(input: {
  alreadyLanded: boolean;
  ticketCount: number;
  siblingCount: number;
  floorOpenCount: number;
  settled: boolean;
}): 'hold' | 'list' | 'detail' {
  if (input.alreadyLanded) return 'hold';
  const multi =
    Number(input.ticketCount || 0) > 1 ||
    Number(input.siblingCount || 0) > 1 ||
    Number(input.floorOpenCount || 0) > 1;
  if (multi) return 'list';
  if (!input.settled) return 'hold';
  return 'detail';
}

/**
 * First paint on table pick (before GET). Occupied with unknown count must not
 * flash last-touched detail, then jump to the party list.
 */
export function resolveTablePickView(input: {
  floorOpenCount: number;
  occupied: boolean;
}): 'list' | 'detail' {
  const n = Number(input.floorOpenCount || 0);
  if (n > 1) return 'list';
  if (input.occupied && n !== 1) return 'list';
  return 'detail';
}

/**
 * After KOT / party-list Close: 2+ tickets leave the table (waiter logout is
 * decided separately). Sole ticket stays so sent lines remain visible.
 */
export function resolveKotSessionLeave(input: {
  ticketCount: number;
  partyListVisible: boolean;
}): boolean {
  return Number(input.ticketCount || 0) > 1 || !!input.partyListVisible;
}

/** Close/KOT fires the chosen ticket; last-touched only if none chosen yet. */
export function resolveKotFireOrderId(input: {
  activeOrderId?: string | null;
  paintedOrderId?: string | null;
}): string | null {
  return input.activeOrderId || input.paintedOrderId || null;
}

export type KotSessionFinish = 'logout' | 'floor' | 'stay';

/**
 * Close/KOT session end. Waiter logout wins (shared terminal). Else 2+ / party
 * list returns to the floor. Sole ticket stays so sent lines remain visible.
 */
export function resolveKotSessionFinish(input: {
  ticketCount: number;
  partyListVisible: boolean;
  waiterShouldLogout: boolean;
}): KotSessionFinish {
  if (input.waiterShouldLogout) return 'logout';
  if (resolveKotSessionLeave(input)) return 'floor';
  return 'stay';
}

/**
 * Ticket board may only show the selected check. Wrong-id paint → blank the
 * board (never another party's lines). Missing paint → blank until cache/GET.
 */
export function resolvePaintedOrder<T extends { id: string }>(
  painted: T | null | undefined,
  activeOrderId: string | null | undefined,
): T | null {
  if (!painted) return null;
  if (activeOrderId && painted.id !== activeOrderId) return null;
  return painted;
}
