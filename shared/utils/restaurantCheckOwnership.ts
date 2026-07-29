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
