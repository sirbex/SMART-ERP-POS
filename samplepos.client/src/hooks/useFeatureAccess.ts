/**
 * useFeatureAccess — Plan-based module access hook
 *
 * Checks whether the current tenant's plan includes a given feature.
 * Uses the `planFeatures` array from the TenantConfig (fetched once
 * on app load by TenantContext).
 *
 * This is for MODULE-LEVEL gating (pos, accounting, inventory, etc.).
 * For boolean feature FLAGS (pharmacy_mode, credit_sales), use
 * `useFeatureFlag()` from TenantContext instead.
 *
 * Usage:
 *   const hasAccounting = useFeatureAccess('accounting');
 *   {hasAccounting && <MenuItem to="/accounting">Accounting</MenuItem>}
 */

import { useTenant } from '../contexts/TenantContext';

/**
 * Returns true if the tenant's plan includes the given feature.
 * Falls back to true in single-tenant / dev mode (no plan resolved).
 */
export function useFeatureAccess(feature: string): boolean {
  const { config } = useTenant();

  // Single-tenant / dev fallback — no plan means all features enabled
  if (!config.planFeatures || config.planFeatures.length === 0) {
    return true;
  }

  return config.planFeatures.includes(feature);
}

/**
 * Returns the full list of plan features for bulk checks.
 */
export function usePlanFeatures(): string[] {
  const { config } = useTenant();
  return config.planFeatures ?? [];
}

/**
 * Returns the current tenant plan name.
 */
export function useTenantPlan(): string {
  const { config } = useTenant();
  return config.plan ?? 'FREE';
}
