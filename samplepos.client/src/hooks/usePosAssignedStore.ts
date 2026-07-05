import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';
import { useMultistoreEnabled } from './useMultistore';

export interface PosAssignedStore {
  storeLocationId: string | null;
  storeName: string | null;
  multistore: boolean;
}

/**
 * Backend-resolved POS store (active selling location) — never user-selectable.
 */
export function usePosAssignedStore() {
  const { isMultistoreEnabled } = useMultistoreEnabled();

  return useQuery({
    queryKey: ['pos', 'assigned-store', isMultistoreEnabled],
    queryFn: async (): Promise<PosAssignedStore> => {
      if (!isMultistoreEnabled) {
        return { storeLocationId: null, storeName: null, multistore: false };
      }
      const res = await api.inventory.stockVisibility();
      const payload = (res.data?.data ?? res.data) as {
        multistore?: boolean;
        storeLocationId?: string | null;
        storeName?: string | null;
      };
      return {
        multistore: payload.multistore === true,
        storeLocationId: payload.storeLocationId ?? null,
        storeName: payload.storeName ?? null,
      };
    },
    staleTime: 120_000,
  });
}
