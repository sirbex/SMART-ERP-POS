import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';
import { isAuthQueryEnabled } from '../lib/authQuery';
import { useAuth } from './useAuth';

export type MasterUom = {
  id: string;
  name: string;
  symbol: string | null;
  type?: string;
};

export function useMasterUoms() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['uoms', 'master'],
    queryFn: async (): Promise<MasterUom[]> => {
      const res = await api.products.getMasterUoms();
      return (res.data?.data ?? []) as MasterUom[];
    },
    enabled: isAuthQueryEnabled(isAuthenticated),
    staleTime: 5 * 60 * 1000,
  });
}
