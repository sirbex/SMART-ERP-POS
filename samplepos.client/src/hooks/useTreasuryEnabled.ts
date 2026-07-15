import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';

export const treasuryEnabledQueryKey = ['treasury', 'enabled'] as const;

/**
 * Tenant flag: treasury_document_enabled via GET /api/treasury/enabled
 */
export function useTreasuryEnabled() {
  return useQuery({
    queryKey: treasuryEnabledQueryKey,
    queryFn: async () => {
      const res = await api.treasury.getEnabled();
      return Boolean(res.data?.data?.enabled);
    },
    staleTime: 30_000,
  });
}
