/**
 * Restaurant multi-waiter ownership — Toast / Aloha / Micros pattern.
 *
 * - Check owner = pos_orders.waiter_id (who owns the open check financially/operationally)
 * - Waiters without edit-others only see FREE tables + their own occupied checks
 * - Managers / cashiers with pay / explicit restaurant.edit_others can open any check
 * - Line attribution (added_by) is separate from ownership — who rang the item
 */

export const RESTAURANT_EDIT_OTHERS_PERMISSION = 'restaurant.edit_others';

export type OwnershipActor = {
  userId: string;
  role?: string | null;
  /** Permission keys the actor holds (RBAC + legacy expanded). */
  permissions?: Iterable<string> | null;
};

function permissionSet(permissions?: Iterable<string> | null): Set<string> {
  if (!permissions) return new Set();
  return permissions instanceof Set ? permissions : new Set(permissions);
}

/**
 * Can this actor open / mutate checks owned by another waiter?
 * Industry: Toast "Edit Other Employees' Orders" + Change Server;
 * Aloha: Take ownership (often with manager approval).
 */
export function canEditOtherWaitersChecks(actor: OwnershipActor): boolean {
  const role = (actor.role || '').toUpperCase();
  if (role === 'ADMIN' || role === 'MANAGER') return true;

  const perms = permissionSet(actor.permissions);
  if (perms.has('*')) return true;
  if (perms.has('restaurant.manage')) return true;
  if (perms.has(RESTAURANT_EDIT_OTHERS_PERMISSION)) return true;
  // Cashiers settle the floor — they must see every open check.
  if (perms.has('restaurant.pay')) return true;
  return false;
}

/** True when the open check is owned by this user (or has no owner yet). */
export function ownsRestaurantCheck(
  checkWaiterId: string | null | undefined,
  userId: string,
): boolean {
  if (!checkWaiterId) return true; // unassigned — claimable
  return checkWaiterId === userId;
}

/**
 * Floor visibility: FREE always; occupied only if owned or actor can edit others.
 */
export function isTableVisibleToWaiter(input: {
  tableStatus: string;
  checkWaiterId?: string | null;
  /** True when any pending check on the table belongs to the actor (multi-ticket). */
  actorOwnsAnyCheckOnTable?: boolean;
  actor: OwnershipActor;
}): boolean {
  if (canEditOtherWaitersChecks(input.actor)) return true;
  if (input.tableStatus === 'FREE') return true;
  if (input.actorOwnsAnyCheckOnTable) return true;
  return ownsRestaurantCheck(input.checkWaiterId, input.actor.userId);
}

/**
 * Mutate (add/void/KOT/bill/assign) — owner or edit-others.
 */
export function canMutateRestaurantCheck(input: {
  checkWaiterId?: string | null;
  actor: OwnershipActor;
}): boolean {
  if (canEditOtherWaitersChecks(input.actor)) return true;
  return ownsRestaurantCheck(input.checkWaiterId, input.actor.userId);
}

export const RESTAURANT_CHECK_OWNED_MESSAGE =
  'This table belongs to another waiter. Ask a manager to reassign, or use a role with Edit others / Pay.';

/** First name / short label for line attribution on the ticket. */
export function shortWaiterLabel(fullName?: string | null): string {
  const n = (fullName || '').trim();
  if (!n) return 'Staff';
  const parts = n.split(/\s+/);
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}

/**
 * Toast/Aloha: one product row on the ticket; show everyone who rang units on it.
 * Same SKU from waiter + manager stays one line — "by Alice N., Pat M."
 */
export function formatOrderedByLabels(
  names: Array<string | null | undefined>,
): string | null {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of names) {
    const trimmed = (raw || '').trim();
    if (!trimmed) continue;
    const label = shortWaiterLabel(trimmed);
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels.length > 0 ? labels.join(', ') : null;
}

/**
 * Merge key for ticket display — product + price + kitchen state + notes.
 * Intentionally excludes added_by so manager/cashier adds bump the same row.
 */
export function restaurantTicketLineMergeKey(input: {
  productId?: string | null;
  productName: string;
  unitPrice: number;
  kitchenSent: boolean;
  lineNotes?: string | null;
  notesMergeKey: (notes: string) => string;
}): string {
  const notes = (input.lineNotes || '').trim();
  return `${input.productId ?? 'name:' + input.productName}|${input.unitPrice}|${
    input.kitchenSent ? 'S' : 'N'
  }|${input.notesMergeKey(notes)}`;
}
