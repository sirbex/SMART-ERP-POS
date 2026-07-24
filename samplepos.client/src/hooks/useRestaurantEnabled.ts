import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';

export const restaurantEnabledQueryKey = ['restaurant', 'enabled'] as const;

/**
 * Tenant flag: restaurant_mode_enabled via GET /api/restaurant/enabled
 * Default false — retail nav/UI unchanged when off or when the API/migration is unavailable.
 */
export function useRestaurantEnabled() {
  return useQuery({
    queryKey: restaurantEnabledQueryKey,
    queryFn: async () => {
      try {
        const res = await api.restaurant.getEnabled();
        return Boolean(res.data?.data?.enabled);
      } catch {
        // Pre-migration / flag-off tenants must never break Layout
        return false;
      }
    },
    staleTime: 30_000,
    retry: false,
  });
}
