/**
 * FOH menu-add targeting SSOT (Toast / Samba).
 *
 * "Select a ticket" is ONLY for a table that already has 2+ open tickets
 * and the party list is showing. Empty and single-ticket tables must add
 * immediately — especially sheet/phone FOH, where the menu is the first surface
 * and activeOrderId is cleared on table pick.
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
  if (floorCount > 1) return { action: 'select-ticket' };

  // Occupied table, strip not hydrated yet — do not invent a second ticket,
  // and do not tell the waiter to "select" a ticket that is not listed.
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
