/**
 * Permission-based discount percentage limits (replaces role-name ROLE_LIMITS).
 * Highest matching tier wins.
 */

export const DISCOUNT_LIMIT_TIERS = [
  { permission: 'sales.approve', maxPercent: 100 },
  { permission: 'pos.approve', maxPercent: 50 },
  { permission: 'pos.create', maxPercent: 10 },
  { permission: 'sales.create', maxPercent: 10 },
] as const;

export const DEFAULT_DISCOUNT_LIMIT_PERCENT = 5;

export type PermissionChecker = (permissionKey: string) => boolean | Promise<boolean>;

/** Resolve max discount % from effective permissions */
export async function resolveDiscountLimitPercent(
  hasPermission: PermissionChecker
): Promise<number> {
  let max = 0;
  for (const tier of DISCOUNT_LIMIT_TIERS) {
    if (await hasPermission(tier.permission)) {
      max = Math.max(max, tier.maxPercent);
    }
  }
  return max > 0 ? max : DEFAULT_DISCOUNT_LIMIT_PERCENT;
}

export function isDiscountWithinLimit(discountPercentage: number, maxAllowedPercent: number): boolean {
  return discountPercentage <= maxAllowedPercent;
}
