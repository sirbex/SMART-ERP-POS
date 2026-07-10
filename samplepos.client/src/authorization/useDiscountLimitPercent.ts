import { useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  DISCOUNT_LIMIT_TIERS,
  DEFAULT_DISCOUNT_LIMIT_PERCENT,
} from '@shared/authorization/discountPolicy';
import { legacyRoleGrantsPermission } from '@shared/authorization/legacyRoleFallback';

/** Resolve max discount % from effective RBAC permissions (mirrors server discountPolicy). */
export function useDiscountLimitPercent(): number {
  const { user, permissions } = useAuth();

  return useMemo(() => {
    const has = (key: string) => {
      if (permissions.has(key)) return true;
      if (permissions.size === 0 && user?.role) {
        return legacyRoleGrantsPermission(user.role, key);
      }
      return false;
    };

    let max = 0;
    for (const tier of DISCOUNT_LIMIT_TIERS) {
      if (has(tier.permission)) {
        max = Math.max(max, tier.maxPercent);
      }
    }
    return max > 0 ? max : DEFAULT_DISCOUNT_LIMIT_PERCENT;
  }, [permissions, user?.role]);
}
